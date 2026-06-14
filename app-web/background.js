// background.js — minimal service worker. Clicking the toolbar icon opens the
// full-page UI in a tab. Running the UI in a tab (instead of a popup) keeps the
// page alive for the whole download, avoiding MV3 service-worker idle timeouts.

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
