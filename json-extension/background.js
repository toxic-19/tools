// background.js — kept as a minimal MV3 service worker.
// NOTE: We intentionally do NOT listen to chrome.action.onClicked because
// manifest.json declares `action.default_popup` — when both are set, the
// popup always wins and the onClicked listener never fires. The "expand to
// fullscreen" action is handled by the popup's own #btn-expand button.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.info('[JSON Toolkit Pro] installed');
  }
});
