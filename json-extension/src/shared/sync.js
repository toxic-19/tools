// shared/sync.js — popup ↔ fullpage bidirectional sync via chrome.storage.session.
//
// Why session storage: the data is large JSON we don't want lingering after
// the browser closes. session storage is per-extension-per-session, doesn't
// require user opt-in, and is wiped when Chrome closes.
//
// Why not chrome.runtime.sendMessage: it works only between extension
// contexts that are alive at the same time. The popup often closes
// immediately after the user clicks the expand button, before the fullpage
// finishes loading. storage.onChanged fires when storage mutates, so the
// newly-opened fullpage picks up the popup's last write at startup.
//
// Caveat: if both sides are edited simultaneously, the last writer wins.
// That's an acceptable trade-off for this use case (one tab at a time).
//
// For tests, we treat chrome as an optional global and no-op if absent.

const KEYS = ['jsonInput', 'diffLeft', 'diffRight'];
const DEBOUNCE_MS = 200;
const FLUSH_NOW = 0; // paste/format: flush immediately

function hasChrome() {
  return typeof globalThis.chrome !== 'undefined' && chrome.storage && chrome.storage.session;
}

/**
 * Install two-way sync for the given elements.
 * @param {Record<string, HTMLElement>} elements - map of key → textarea-like element
 * @returns {() => void} cleanup function (removes listeners, clears pending timers)
 */
export function installSync(elements) {
  if (!hasChrome()) return () => {}; // tests / non-extension env

  const api = chrome.storage.session;
  const timers = {};
  const writingSelf = new Set();

  // Pull initial state from storage at startup. This is what makes the
  // popup → fullpage handoff work: the new page reads what the popup
  // wrote before it closed.
  api.get(KEYS).then((got) => {
    for (const key of KEYS) {
      const el = elements[key];
      if (!el) continue;
      if (typeof got[key] === 'string' && el.value !== got[key]) {
        writingSelf.add(key);
        el.value = got[key];
        // Fire input event so listeners (line numbers, validation) re-run.
        el.dispatchEvent(new Event('input', { bubbles: true }));
        writingSelf.delete(key);
      }
    }
  });

  // React to changes from other extension pages.
  const changeListener = (changes, area) => {
    if (area !== 'session') return;
    for (const key of KEYS) {
      if (!(key in changes)) continue;
      if (writingSelf.has(key)) continue;
      const el = elements[key];
      if (!el) continue;
      const next = changes[key].newValue;
      if (typeof next === 'string' && el.value !== next) {
        writingSelf.add(key);
        el.value = next;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        writingSelf.delete(key);
      }
    }
  };
  chrome.storage.onChanged.addListener(changeListener);

  // Push local changes to storage (debounced; immediate for paste/format).
  const schedule = (key, value, delay) => {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => {
      api.set({ [key]: value });
    }, delay);
  };

  const cleanups = [];
  for (const key of KEYS) {
    const el = elements[key];
    if (!el) continue;
    const onChange = (immediate) => (e) => {
      // Ignore the synthetic input event we dispatch when applying remote changes.
      if (writingSelf.has(key)) return;
      schedule(key, el.value, immediate ? FLUSH_NOW : DEBOUNCE_MS);
    };
    const handler = onChange(false);
    el.addEventListener('input', handler);

    // Paste and explicit programmatic writes (format/compact/repair/sample)
    // bypass the debounce so the other side sees them instantly.
    el.addEventListener('paste', onChange(true));

    cleanups.push(() => el.removeEventListener('input', handler));
    cleanups.push(() => el.removeEventListener('paste', onChange(true)));
  }

  return () => {
    for (const t of Object.values(timers)) clearTimeout(t);
    chrome.storage.onChanged.removeListener(changeListener);
    cleanups.forEach((fn) => fn());
  };
}

// Programmatic writes (format / sample / clear buttons) call this so the
// other side sees them without waiting for the debounce.
export function flushKey(key, value) {
  if (!hasChrome()) return;
  clearTimeout(pendingFlushes[key]);
  pendingFlushes[key] = setTimeout(() => {
    chrome.storage.session.set({ [key]: value });
  }, FLUSH_NOW);
}
const pendingFlushes = {};
