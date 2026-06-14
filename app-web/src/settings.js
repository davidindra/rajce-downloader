// settings.js — persistence in chrome.storage.local (replaces the .ini file).
// Also stores the per-album record of already-downloaded files used by the
// "Download new files only" option (browsers cannot inspect the real disk, so
// this is based on what this extension downloaded before).

const DEFAULTS = {
  lang: "cs",
  albumUrl: "",
  albumUser: "",
  enableAuth: false,
  downloadNewOnly: true,
  downloadVideo: true,
  downloadContinue: false,
  appendUserName: true,
  appendAlbumName: true,
  saveMode: "downloads", // "downloads" | "zip"
  subfolder: "",
};

const KEY = "settings";
const SEEN_KEY = "seenFiles"; // { [albumUrl]: { [relPath]: true } }

export async function loadSettings() {
  const data = await chrome.storage.local.get(KEY);
  return { ...DEFAULTS, ...(data[KEY] || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [KEY]: settings });
}

export async function getSeen(albumUrl) {
  const data = await chrome.storage.local.get(SEEN_KEY);
  return (data[SEEN_KEY] || {})[albumUrl] || {};
}

export async function addSeen(albumUrl, relPaths) {
  const data = await chrome.storage.local.get(SEEN_KEY);
  const all = data[SEEN_KEY] || {};
  const album = all[albumUrl] || {};
  for (const p of relPaths) album[p] = true;
  all[albumUrl] = album;
  await chrome.storage.local.set({ [SEEN_KEY]: all });
}
