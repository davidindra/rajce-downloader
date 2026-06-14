// background.js (module) — opens the panel UI on toolbar click, and serves
// album downloads requested by the content script on rajce album-list pages.

import { downloadAlbum } from "./src/album-download.js";

const PANEL_URL = chrome.runtime.getURL("ui/panel.html");

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: PANEL_URL });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId !== undefined) {
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url: PANEL_URL });
  }
});

// One-click album download triggered from a tile button in the content script.
// The open port keeps the service worker alive for the whole download.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "album-download") return;

  let cancelled = false;
  port.onDisconnect.addListener(() => {
    cancelled = true;
  });

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== "start" || !msg.url) return;
    const post = (m) => {
      try {
        port.postMessage(m);
      } catch {
        /* port may already be closed */
      }
    };
    try {
      const res = await downloadAlbum({
        url: msg.url,
        isCancelled: () => cancelled,
        onProgress: (p) => post({ type: "progress", ...p }),
      });
      post({ type: "done", ...res });
    } catch (e) {
      post({ type: "error", message: e.message });
    }
  });
});
