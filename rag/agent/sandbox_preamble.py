"""沙箱子进程启动 preamble。

作为独立脚本被沙箱父进程用 `python -m agent.sandbox_preamble` 启动。
启动后:
  1. 清空 sys.modules 中非白名单的模块
  2. 清空 os.environ 中非白名单的环境变量
  3. 进入 REPL 模式:从 stdin 读取 JSON 任务,执行后把 JSON 结果写回 stdout
  4. 每次任务可重新定义白名单,通过 stdin 的 task.message 传递

通信协议(JSON Lines):
  输入(stdin)  : {"type": "run_python", "code": "1+1"} 或 {"type": "shutdown"}
  输出(stdout) : {"type": "result", "value": 2, "stdout": ""} 或 {"type": "error", "message": "..."}

任何写往 stdout 的非协议内容都会破坏协议,所以除了 json.dumps,什么都不能 print。
"""
from __future__ import annotations

import sys
import os
import json
import io
import contextlib
import signal
import builtins
import importlib

# ============================================================
# 1. 协议常量
# ============================================================

# 默认 stdlib 白名单 —— 演示场景下允许的计算/数据处理
DEFAULT_STDLIB_ALLOWLIST = frozenset({
    "math", "cmath", "statistics", "random", "fractions", "decimal",
    "json", "re", "string", "datetime", "calendar", "collections",
    "itertools", "functools", "operator", "typing", "copy",
    "bisect", "heapq", "enum", "dataclasses", "abc",
    "pprint", "textwrap", "difflib", "unicodedata",
    "numbers", "array", "queue", "types", "weakref",
    "time",   # time.sleep / time.time 演示用;无文件/网络,安全
})

# 默认环境变量白名单(防止泄漏 LLM API Key 等敏感信息给沙箱)
DEFAULT_ENV_ALLOWLIST = frozenset({
    "PATH", "PYTHONPATH", "HOME", "TMP", "TEMP", "LANG", "LC_ALL",
})


def _apply_whitelist(stdlib_allowlist, env_allowlist):
    """清空 sys.modules / os.environ 中非白名单项。"""
    # 1. sys.modules:只保留白名单 + 内置
    safe = set(stdlib_allowlist) | {
        "builtins", "sys", "os", "posixpath", "ntpath", "genericpath",
        "io", "_io", "codecs", "encodings", "linecache", "traceback",
        "site", "stat", "importlib", "importlib._bootstrap",
        "importlib._bootstrap_external",
    }
    for mod in list(sys.modules.keys()):
        if mod not in safe:
            # 不 del sys 自身等关键模块
            if mod in ("sys", "builtins", "io", "os", "posixpath", "ntpath",
                       "genericpath", "codecs", "encodings", "importlib",
                       "linecache", "traceback", "stat", "site", "_io",
                       "_signal", "signal", "atexit", "_thread",
                       "importlib._bootstrap", "importlib._bootstrap_external",
                       "json"):
                continue
            del sys.modules[mod]

    # 2. os.environ:只保留白名单
    for k in list(os.environ.keys()):
        if k not in env_allowlist:
            del os.environ[k]

    # 3. 禁用 __import__ 的部分危险属性(builtins.__import__ 是引用,改它会影响整个进程)
    #    实际安全由 sys.modules 限制保证 —— 不在白名单的模块 import 会失败

    # 4. 设置一个 __SANDBOX__ 标记,方便任务代码自检
    builtins.__SANDBOX__ = True


def _safe_exec(code: str, stdlib_allowlist) -> dict:
    """在受限环境里执行 Python 源码。返回 dict {value, stdout, error}。"""
    # 捕获 stdout
    buf = io.StringIO()

    # 构造受限 globals
    safe_builtins = {name: getattr(builtins, name) for name in [
        # 允许基础内建
        "abs", "all", "any", "ascii", "bin", "bool", "bytearray",
        "bytes", "callable", "chr", "classmethod", "compile",
        "complex", "delattr", "dict", "dir", "divmod", "enumerate",
        "filter", "float", "format", "frozenset", "getattr", "globals",
        "hasattr", "hash", "hex", "id", "int", "isinstance",
        "issubclass", "iter", "len", "list", "locals", "map", "max",
        "memoryview", "min", "next", "object", "oct", "ord", "pow",
        "print", "property", "range", "repr", "reversed", "round",
        "set", "setattr", "slice", "sorted", "staticmethod", "str",
        "sum", "super", "tuple", "type", "vars", "zip",
        "True", "False", "None",
        "Exception", "ValueError", "TypeError", "KeyError", "IndexError",
        "RuntimeError", "StopIteration", "ZeroDivisionError",
    ] if hasattr(builtins, name)}

    safe_globals = {
        "__builtins__": safe_builtins,
        "__name__": "__sandbox__",
        "__doc__": None,
        "__SANDBOX__": True,
    }

    # 把白名单 stdlib 的 import 能力放出来(用受限 __import__)
    def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name.split(".")[0] not in stdlib_allowlist and name not in stdlib_allowlist:
            raise ImportError(f"module {name!r} is not in sandbox allowlist")
        return importlib.import_module(name)

    safe_builtins["__import__"] = _safe_import

    # 编译代码,禁止表达式语句之外的顶层 await/yield
    try:
        compiled = compile(code, "<sandbox>", "exec")
    except SyntaxError as e:
        return {"error": f"SyntaxError: {e}"}

    local_ns: dict = {}
    try:
        with contextlib.redirect_stdout(buf):
            exec(compiled, safe_globals, local_ns)
    except SystemExit as e:
        return {"error": f"SystemExit: {e}"}
    except BaseException as e:
        # 包含 SystemExit/KeyboardInterrupt 之外的所有异常
        return {"error": f"{type(e).__name__}: {e}"}

    # 提取 last_expr(取 local_ns 里最后一个被赋值的名字,简单启发式)
    last_value = None
    if local_ns:
        # 取最后插入的 key
        last_key = list(local_ns.keys())[-1]
        try:
            last_value = repr(local_ns[last_key])
        except Exception:
            last_value = "<unrepr>"

    captured_stdout = buf.getvalue()
    # 截断过长的输出
    if len(captured_stdout) > 2000:
        captured_stdout = captured_stdout[:2000] + "\n... <truncated>"

    return {
        "value": last_value,
        "stdout": captured_stdout,
    }


def main():
    """主循环:从 stdin 读 JSON,执行,写回 JSON。"""
    # 接收白名单(由父进程通过环境变量传入)
    import json as _json
    try:
        stdlib_allowlist = frozenset(
            os.environ.get("SANDBOX_STDLIB", "").split(",")
        ) - {""}
    except Exception:
        stdlib_allowlist = DEFAULT_STDLIB_ALLOWLIST
    if not stdlib_allowlist:
        stdlib_allowlist = DEFAULT_STDLIB_ALLOWLIST

    try:
        env_allowlist = frozenset(
            os.environ.get("SANDBOX_ENV", "").split(",")
        ) - {""}
    except Exception:
        env_allowlist = DEFAULT_ENV_ALLOWLIST
    if not env_allowlist:
        env_allowlist = DEFAULT_ENV_ALLOWLIST

    _apply_whitelist(stdlib_allowlist, env_allowlist)

    # 屏蔽 SIGTERM 的优雅处理 —— 让父进程 SIGKILL 负责终止
    signal.signal(signal.SIGTERM, signal.SIG_DFL)

    # 写一个 ready 标记,父进程收到后才认为子进程就绪
    sys.stdout.write(json.dumps({"type": "ready"}) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            task = json.loads(line)
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({
                "type": "error", "message": f"bad json: {e}"
            }) + "\n")
            sys.stdout.flush()
            continue

        t = task.get("type")
        if t == "shutdown":
            break
        elif t == "run_python":
            code = task.get("code", "")
            result = _safe_exec(code, stdlib_allowlist)
            sys.stdout.write(json.dumps({"type": "result", **result}) + "\n")
            sys.stdout.flush()
        else:
            sys.stdout.write(json.dumps({
                "type": "error", "message": f"unknown task type: {t!r}"
            }) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
