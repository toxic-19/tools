"""Python 受限子进程沙箱(父进程侧)。

用法:
    sb = Sandbox()
    result = sb.run_python("1 + 2 * 3")
    # result.ok, result.stdout, result.error, result.elapsed_ms

实现要点:
  1. 启动 `python -m agent.sandbox_preamble` 子进程,通过 stdin/stdout JSON 协议通信
  2. 等子进程发出 {"type":"ready"} 后才发任务
  3. wall-clock 超时由子进程自己管(SIGALRM),但我们额外加一个父进程侧超时
     —— 用 Popen.kill() 在超时后强制结束
  4. 文件/网络访问通过白名单 + 受限 sys.modules 限制
  5. 单实例串行执行 —— 每次 run_python 阻塞等结果
     (高并发场景可用进程池,演示场景不需要)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import threading
import queue
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

# 默认 stdlib 白名单 —— 与 sandbox_preamble.py 保持一致
DEFAULT_STDLIB_ALLOWLIST = (
    "math,cmath,statistics,random,fractions,decimal,"
    "json,re,string,datetime,calendar,collections,"
    "itertools,functools,operator,typing,copy,"
    "bisect,heapq,enum,dataclasses,abc,"
    "pprint,textwrap,difflib,unicodedata,"
    "numbers,array,queue,types,weakref,time"
)


@dataclass
class SandboxResult:
    ok: bool
    stdout: str = ""             # 子进程内 print 捕获到的内容
    value: Optional[str] = None  # 任务中最后一个赋值的 repr
    error: Optional[str] = None  # 异常消息(若有)
    elapsed_ms: float = 0.0
    timed_out: bool = False
    exit_code: Optional[int] = None


class Sandbox:
    """Python 受限子进程沙箱。

    配置从 .env 读:
      SANDBOX_TIMEOUT_MS         (默认 10000)
      SANDBOX_MAX_OUTPUT_BYTES   (默认 65536)
      SANDBOX_STDLIB_ALLOWLIST   (逗号分隔,空则用默认)
      SANDBOX_FILE_ALLOWLIST     (仅记录,不强制 —— 沙箱本身不开文件,这里只用于审计/告警)
      SANDBOX_NET_ALLOWLIST      (同上)

    Note:子进程被允许使用 print/基本数据结构,不允许 import 白名单外的模块。
         不允许文件 I/O(builtins.open 不在白名单内),不允许网络(socket/urllib 同理)。
    """

    def __init__(
        self,
        timeout_ms: Optional[int] = None,
        max_output_bytes: Optional[int] = None,
        stdlib_allowlist: Optional[str] = None,
        file_allowlist: Optional[str] = None,
        net_allowlist: Optional[str] = None,
    ):
        self.timeout_ms = int(
            timeout_ms if timeout_ms is not None
            else os.environ.get("SANDBOX_TIMEOUT_MS", "10000")
        )
        self.max_output_bytes = int(
            max_output_bytes if max_output_bytes is not None
            else os.environ.get("SANDBOX_MAX_OUTPUT_BYTES", "65536")
        )
        self.stdlib_allowlist = (
            stdlib_allowlist
            if stdlib_allowlist is not None
            else os.environ.get("SANDBOX_STDLIB_ALLOWLIST", "") or DEFAULT_STDLIB_ALLOWLIST
        )
        self.file_allowlist = (
            file_allowlist
            if file_allowlist is not None
            else os.environ.get("SANDBOX_FILE_ALLOWLIST", "")
        )
        self.net_allowlist = (
            net_allowlist
            if net_allowlist is not None
            else os.environ.get("SANDBOX_NET_ALLOWLIST", "")
        )

        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()

    # ============================================================
    # 子进程生命周期
    # ============================================================

    def _start(self):
        """启动沙箱子进程,等 ready 信号。"""
        env = os.environ.copy()
        env["SANDBOX_STDLIB"] = self.stdlib_allowlist
        # 只透传白名单环境变量
        env_allow = {"PATH", "PYTHONPATH", "HOME", "TMP", "TEMP", "LANG", "LC_ALL",
                     "SYSTEMROOT", "HOMEPATH", "USERPROFILE"}
        env = {k: v for k, v in env.items() if k in env_allow}

        # 把 PYTHONPATH 指向项目根,这样子进程能 import 到 agent.sandbox_preamble
        project_root = str(Path(__file__).parent.parent.resolve())
        env["PYTHONPATH"] = project_root + os.pathsep + env.get("PYTHONPATH", "")

        # Windows 下 CREATE_NEW_PROCESS_GROUP 避免 Ctrl-C 串到子进程
        kwargs = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        proc = subprocess.Popen(
            [sys.executable, "-m", "agent.sandbox_preamble"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=project_root,
            bufsize=0,
            text=True,
            **kwargs,
        )
        # 等 ready(带超时,防止子进程起不来)
        ready_deadline = time.time() + 10
        first_line = ""
        while time.time() < ready_deadline:
            line = proc.stdout.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "ready":
                first_line = ""
                break
            # 跳过其他预备消息
            first_line = line
        else:
            proc.kill()
            raise RuntimeError("sandbox subprocess did not become ready within 10s")

        self._proc = proc

    def _ensure_started(self):
        if self._proc is None or self._proc.poll() is not None:
            self._start()

    def close(self):
        with self._lock:
            if self._proc is None:
                return
            try:
                if self._proc.poll() is None:
                    self._proc.stdin.write(json.dumps({"type": "shutdown"}) + "\n")
                    self._proc.stdin.flush()
                    self._proc.stdin.close()
                    self._proc.wait(timeout=2)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            finally:
                self._proc = None

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    # ============================================================
    # 任务执行
    # ============================================================

    def run_python(self, code: str) -> SandboxResult:
        """在沙箱内执行 Python 源码。串行阻塞。"""
        t0 = time.perf_counter()
        with self._lock:
            self._ensure_started()
            proc = self._proc

            if proc.poll() is not None:
                return SandboxResult(
                    ok=False,
                    error=f"sandbox subprocess exited unexpectedly (code={proc.returncode})",
                    elapsed_ms=(time.perf_counter() - t0) * 1000,
                    exit_code=proc.returncode,
                )

            # 发任务
            try:
                proc.stdin.write(json.dumps({"type": "run_python", "code": code}) + "\n")
                proc.stdin.flush()
            except (BrokenPipeError, OSError) as e:
                return SandboxResult(
                    ok=False,
                    error=f"sandbox stdin broken: {e}",
                    elapsed_ms=(time.perf_counter() - t0) * 1000,
                )

            # 等结果(带超时)
            try:
                line = self._readline_with_timeout(proc.stdout, self.timeout_ms / 1000.0)
            except TimeoutError:
                self._kill_after_timeout(proc)
                return SandboxResult(
                    ok=False,
                    error=f"sandbox timed out after {self.timeout_ms}ms",
                    elapsed_ms=(time.perf_counter() - t0) * 1000,
                    timed_out=True,
                )

            if line is None:
                return SandboxResult(
                    ok=False,
                    error="sandbox subprocess closed stdout unexpectedly",
                    elapsed_ms=(time.perf_counter() - t0) * 1000,
                )

            elapsed = (time.perf_counter() - t0) * 1000
            try:
                msg = json.loads(line)
            except json.JSONDecodeError as e:
                return SandboxResult(
                    ok=False,
                    error=f"sandbox returned non-JSON: {e}; line={line[:200]!r}",
                    elapsed_ms=elapsed,
                )

            if msg.get("type") == "error":
                return SandboxResult(
                    ok=False,
                    error=msg.get("message", "unknown error"),
                    elapsed_ms=elapsed,
                )
            elif msg.get("type") == "result":
                # 子进程返回 {"type": "result", "value": ..., "stdout": ..., "error": ...}
                # error 字段非空时也是失败(子进程内部把异常包成 error 字段)
                sub_error = msg.get("error")
                if sub_error:
                    return SandboxResult(
                        ok=False,
                        error=str(sub_error),
                        stdout=msg.get("stdout", ""),
                        elapsed_ms=elapsed,
                    )
                stdout = msg.get("stdout", "")
                if len(stdout) > self.max_output_bytes:
                    stdout = stdout[: self.max_output_bytes] + "\n... <truncated>"
                return SandboxResult(
                    ok=True,
                    stdout=stdout,
                    value=msg.get("value"),
                    elapsed_ms=elapsed,
                )
            else:
                return SandboxResult(
                    ok=False,
                    error=f"unexpected sandbox response type: {msg.get('type')!r}",
                    elapsed_ms=elapsed,
                )

    def _readline_with_timeout(self, stream, timeout_s: float) -> Optional[str]:
        """从子进程 stdout 读一行,带超时。"""
        result: queue.Queue = queue.Queue(maxsize=1)

        def _reader():
            try:
                line = stream.readline()
                result.put(line)
            except Exception as e:
                result.put(e)

        t = threading.Thread(target=_reader, daemon=True)
        t.start()
        try:
            item = result.get(timeout=timeout_s)
        except queue.Empty:
            raise TimeoutError()
        if isinstance(item, Exception):
            raise item
        if not item:
            return None
        return item

    def _kill_after_timeout(self, proc: subprocess.Popen):
        """超时后强制结束子进程,下次 run_python 会重启。"""
        try:
            proc.kill()
        except Exception:
            pass
        # 等退出,避免僵尸进程
        try:
            proc.wait(timeout=2)
        except Exception:
            pass
        self._proc = None


# ============================================================
# 便捷工具
# ============================================================

_default_sandbox: Optional[Sandbox] = None


def get_default_sandbox() -> Sandbox:
    global _default_sandbox
    if _default_sandbox is None:
        _default_sandbox = Sandbox()
    return _default_sandbox


if __name__ == "__main__":
    # 简单自检
    sb = Sandbox(timeout_ms=5000)
    print("Test 1: 1 + 1")
    r = sb.run_python("x = 1 + 1\nx")
    print(f"  ok={r.ok} value={r.value} elapsed={r.elapsed_ms:.1f}ms")

    print("Test 2: import os (应被拒)")
    r = sb.run_python("import os")
    print(f"  ok={r.ok} error={r.error}")

    print("Test 3: time.sleep(2) (应超时)")
    r = sb.run_python("import time; time.sleep(5)")
    print(f"  ok={r.ok} timed_out={r.timed_out} error={r.error}")

    print("Test 4: open file (应被拒,builtins.open 不在白名单)")
    r = sb.run_python("open('/etc/passwd')")
    print(f"  ok={r.ok} error={r.error}")

    sb.close()
