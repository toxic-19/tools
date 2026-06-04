// tests/sync.test.js — coverage for shared/sync.js
// We mock chrome.storage.session in-process.

import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal jsdom-free DOM stand-in: anything that just needs .value, addEventListener, dispatchEvent.
function makeEl() {
  const listeners = {};
  return {
    value: '',
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) {
      const arr = listeners[name]; if (!arr) return;
      const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1);
    },
    dispatchEvent(ev) { (listeners[ev.type] || []).forEach((fn) => fn(ev)); },
  };
}

// Build a fresh in-memory chrome.storage.session + onChanged per test.
function installMockChrome() {
  const store = new Map();
  const listeners = [];
  const api = {
    get(keys) {
      const out = {};
      for (const k of keys) out[k] = store.get(k);
      return Promise.resolve(out);
    },
    set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        const old = store.get(k);
        if (old !== v) changes[k] = { oldValue: old, newValue: v };
        store.set(k, v);
      }
      // Fire onChanged microtask-style so callers can register listeners first.
      queueMicrotask(() => {
        for (const l of listeners.slice()) l(changes, 'session');
      });
      return Promise.resolve();
    },
    onChanged: { addListener(fn) { listeners.push(fn); }, removeListener(fn) {
      const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1);
    } },
    _store: store,
  };
  globalThis.chrome = { storage: { session: api, onChanged: api.onChanged } };
  return api;
}

test('installSync: empty storage at startup leaves elements untouched', async () => {
  installMockChrome();
  const { installSync } = await import('../src/shared/sync.js');
  const a = makeEl(), b = makeEl(), c = makeEl();
  a.value = 'init-a'; b.value = 'init-b'; c.value = 'init-c';
  installSync({ jsonInput: a, diffLeft: b, diffRight: c });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(a.value, 'init-a');
  assert.equal(b.value, 'init-b');
  assert.equal(c.value, 'init-c');
});

test('installSync: storage value at startup populates empty element', async () => {
  const api = installMockChrome();
  await api.set({ jsonInput: 'from-popup' });
  const { installSync } = await import('../src/shared/sync.js?v=2');
  const a = makeEl(), b = makeEl(), c = makeEl();
  installSync({ jsonInput: a, diffLeft: b, diffRight: c });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(a.value, 'from-popup');
  // And the input event fired, so the app re-runs validation/etc.
});

test('installSync: local input writes to storage (debounced)', async () => {
  const api = installMockChrome();
  const { installSync } = await import('../src/shared/sync.js?v=3');
  const a = makeEl(), b = makeEl(), c = makeEl();
  installSync({ jsonInput: a, diffLeft: b, diffRight: c });
  await new Promise((r) => setTimeout(r, 10));
  a.value = 'hello';
  a.dispatchEvent({ type: 'input' });
  // Flush before debounce window elapses.
  assert.equal(api._store.get('jsonInput'), undefined);
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(api._store.get('jsonInput'), 'hello');
});

test('installSync: paste event flushes immediately', async () => {
  const api = installMockChrome();
  const { installSync } = await import('../src/shared/sync.js?v=4');
  const a = makeEl(), b = makeEl(), c = makeEl();
  installSync({ jsonInput: a, diffLeft: b, diffRight: c });
  await new Promise((r) => setTimeout(r, 10));
  a.value = 'pasted';
  a.dispatchEvent({ type: 'paste' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(api._store.get('jsonInput'), 'pasted');
});

test('installSync: external write updates element + fires input event', async () => {
  const api = installMockChrome();
  const { installSync } = await import('../src/shared/sync.js?v=5');
  const a = makeEl(), b = makeEl(), c = makeEl();
  let inputCount = 0;
  a.addEventListener('input', () => { inputCount++; });
  installSync({ jsonInput: a, diffLeft: b, diffRight: c });
  await new Promise((r) => setTimeout(r, 10));
  // Simulate the popup writing to storage while fullpage is open.
  await api.set({ jsonInput: 'remote-update' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(a.value, 'remote-update');
  assert.ok(inputCount >= 1, 'input event should have fired');
});

test('installSync: writing to storage from one side does not loop into itself', async () => {
  const api = installMockChrome();
  const { installSync } = await import('../src/shared/sync.js?v=6');
  const a = makeEl(), b = makeEl(), c = makeEl();
  let inputCount = 0;
  a.addEventListener('input', () => { inputCount++; });
  installSync({ jsonInput: a, diffLeft: b, diffRight: c });
  await new Promise((r) => setTimeout(r, 10));
  // Type locally — input fires once, and we should NOT receive another
  // input event from the storage echo.
  a.value = 'local-typing';
  a.dispatchEvent({ type: 'input' });
  await new Promise((r) => setTimeout(r, 250));
  // After the debounced write fires, the changeListener runs but the
  // writingSelf guard skips the echo. So input fires exactly once.
  assert.equal(inputCount, 1);
  assert.equal(api._store.get('jsonInput'), 'local-typing');
});

test('installSync: cleanup removes listeners and timers', async () => {
  const api = installMockChrome();
  const { installSync } = await import('../src/shared/sync.js?v=7');
  const a = makeEl(), b = makeEl(), c = makeEl();
  const cleanup = installSync({ jsonInput: a, diffLeft: b, diffRight: c });
  cleanup();
  // After cleanup, local input should not write to storage.
  a.value = 'after-cleanup';
  a.dispatchEvent({ type: 'input' });
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(api._store.get('jsonInput'), undefined);
});

test('installSync: no-op in environments without chrome.storage', () => {
  delete globalThis.chrome;
  return import('../src/shared/sync.js?v=8').then(({ installSync }) => {
    const a = makeEl();
    const cleanup = installSync({ jsonInput: a, diffLeft: makeEl(), diffRight: makeEl() });
    assert.equal(typeof cleanup, 'function');
    // Should not throw even without chrome.
    a.value = 'x';
    a.dispatchEvent({ type: 'input' });
  });
});
