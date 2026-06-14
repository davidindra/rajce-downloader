// panel.js — wires the UI to settings + the Downloader (ports the Rajce ctor,
// EnableElements, ToggleAuthorization, ToggleDownload, InitText, ToggleLang).

import { t, setLang, getLang } from "../src/i18n.js";
import { loadSettings, saveSettings } from "../src/settings.js";
import { Downloader, AppError } from "../src/downloader.js";

const $ = (id) => document.getElementById(id);

const els = {
  appTitle: $("appTitle"),
  langBtn: $("langBtn"),
  lblAlbum: $("lblAlbum"),
  lblAlbumUrl: $("lblAlbumUrl"),
  lblAlbumUser: $("lblAlbumUser"),
  lblAlbumPass: $("lblAlbumPass"),
  lblSettings: $("lblSettings"),
  lblEnableAuth: $("lblEnableAuth"),
  lblAppendUser: $("lblAppendUser"),
  lblAppendAlbum: $("lblAppendAlbum"),
  lblNewOnly: $("lblNewOnly"),
  lblVideo: $("lblVideo"),
  lblContinue: $("lblContinue"),
  lblSaveMode: $("lblSaveMode"),
  lblSaveDownloads: $("lblSaveDownloads"),
  lblSaveZip: $("lblSaveZip"),
  lblSubfolder: $("lblSubfolder"),
  subfolderHint: $("subfolderHint"),
  lblProgress: $("lblProgress"),
  homepage: $("homepage"),

  albumUrl: $("albumUrl"),
  albumUrlList: $("albumUrlList"),
  albumUser: $("albumUser"),
  albumPass: $("albumPass"),
  enableAuth: $("enableAuth"),
  appendUserName: $("appendUserName"),
  appendAlbumName: $("appendAlbumName"),
  downloadNewOnly: $("downloadNewOnly"),
  downloadVideo: $("downloadVideo"),
  downloadContinue: $("downloadContinue"),
  subfolder: $("subfolder"),
  saveMode: () => document.querySelector('input[name="saveMode"]:checked'),

  statusText: $("statusText"),
  fileProgress: $("fileProgress"),
  fileName: $("fileName"),
  abortBtn: $("abortBtn"),
  downloadBtn: $("downloadBtn"),
};

let settings;
let downloader = null;

function applyTexts() {
  document.documentElement.lang = getLang();
  els.appTitle.textContent = t("appTitle");
  els.langBtn.textContent = getLang() === "cs" ? "🇬🇧" : "🇨🇿";
  els.langBtn.title = t("switchLang");
  els.lblAlbum.textContent = t("album");
  els.lblAlbumUrl.textContent = t("albumUrl");
  els.lblAlbumUser.textContent = t("albumUser");
  els.lblAlbumPass.textContent = t("albumPass");
  els.lblSettings.textContent = t("settings");
  els.lblEnableAuth.textContent = t("enableAuth");
  els.lblAppendUser.textContent = t("appendUser");
  els.lblAppendAlbum.textContent = t("appendAlbum");
  els.lblNewOnly.textContent = t("newOnly");
  els.lblVideo.textContent = t("video");
  els.lblContinue.textContent = t("continue404");
  els.lblSaveMode.textContent = t("saveMode");
  els.lblSaveDownloads.textContent = t("saveModeDownloads");
  els.lblSaveZip.textContent = t("saveModeZip");
  els.lblSubfolder.textContent = t("subfolder");
  els.subfolderHint.textContent = t("subfolderHint");
  els.lblProgress.textContent = t("progress");
  els.homepage.textContent = t("homepage");
  els.abortBtn.textContent = t("abort");
  els.downloadBtn.textContent = t("download");
  if (!downloader) els.statusText.textContent = t("ready");
}

// Port of ToggleAuthorization(): auth fields follow the authorization checkbox.
function toggleAuthorization() {
  const on = els.enableAuth.checked;
  els.albumUser.disabled = !on;
  els.albumPass.disabled = !on;
  els.appendUserName.disabled = !on;
}

function readSettings() {
  return {
    ...settings,
    lang: getLang(),
    albumUrl: els.albumUrl.value.trim(),
    albumUser: els.albumUser.value,
    albumPass: els.albumPass.value,
    enableAuth: els.enableAuth.checked,
    appendUserName: els.appendUserName.checked,
    appendAlbumName: els.appendAlbumName.checked,
    downloadNewOnly: els.downloadNewOnly.checked,
    downloadVideo: els.downloadVideo.checked,
    downloadContinue: els.downloadContinue.checked,
    saveMode: els.saveMode()?.value || "downloads",
    subfolder: els.subfolder.value.trim(),
  };
}

function writeSettings(s) {
  els.albumUrl.value = s.albumUrl || "";
  els.albumUser.value = s.albumUser || "";
  els.enableAuth.checked = !!s.enableAuth;
  els.appendUserName.checked = !!s.appendUserName;
  els.appendAlbumName.checked = !!s.appendAlbumName;
  els.downloadNewOnly.checked = !!s.downloadNewOnly;
  els.downloadVideo.checked = !!s.downloadVideo;
  els.downloadContinue.checked = !!s.downloadContinue;
  els.subfolder.value = s.subfolder || "";
  const radio = document.querySelector(`input[name="saveMode"][value="${s.saveMode}"]`);
  if (radio) radio.checked = true;
  else document.querySelector('input[name="saveMode"][value="downloads"]').checked = true;
}

// Port of EnableElements(): lock inputs while a download runs.
function setRunning(running) {
  const inputs = document.querySelectorAll(
    'input, button:not(#abortBtn), [name="saveMode"]'
  );
  inputs.forEach((el) => {
    if (el === els.langBtn) return;
    el.disabled = running;
  });
  if (!running) toggleAuthorization();
  els.abortBtn.hidden = !running;
  els.abortBtn.disabled = !running;
  els.downloadBtn.hidden = running;
}

async function persist() {
  settings = readSettings();
  await saveSettings(settings);
}

async function onDownload() {
  await persist();
  if (!els.albumUrl.value.trim()) {
    els.albumUrl.focus();
    els.statusText.textContent = t("errInvalidUrl");
    return;
  }

  setRunning(true);
  els.fileProgress.value = 0;
  els.fileName.textContent = "";

  downloader = new Downloader({
    onStatus: (txt) => (els.statusText.textContent = txt),
    onOverall: (i, total, name) => (els.fileName.textContent = name),
    onFileProgress: (loaded, total) => {
      els.fileProgress.max = total || 1;
      els.fileProgress.value = loaded;
    },
  });

  try {
    const result = await downloader.run(readSettings());
    // remember album URL in the datalist
    refreshUrlList();
    if (result.total > 0) {
      els.statusText.textContent = `${t("completeTitle")} ${t("completeFiles")} ${result.total}/${
        result.downloaded
      }`;
    }
  } catch (e) {
    els.statusText.textContent = e instanceof AppError ? e.message : `${t("errDownloadFailed")} ${e.message}`;
  } finally {
    downloader = null;
    setRunning(false);
    els.fileProgress.value = 0;
    els.fileName.textContent = "";
  }
}

function onAbort() {
  downloader?.abort();
  els.statusText.textContent = t("aborted");
}

function refreshUrlList() {
  // keep a small history of used URLs in the datalist
  chrome.storage.local.get("urlHistory").then((d) => {
    const hist = new Set(d.urlHistory || []);
    const cur = els.albumUrl.value.trim();
    if (cur) hist.add(cur);
    const arr = [...hist].slice(-20);
    chrome.storage.local.set({ urlHistory: arr });
    els.albumUrlList.innerHTML = "";
    for (const u of arr) {
      const opt = document.createElement("option");
      opt.value = u;
      els.albumUrlList.appendChild(opt);
    }
  });
}

async function init() {
  settings = await loadSettings();
  setLang(settings.lang || "cs");
  writeSettings(settings);
  applyTexts();
  toggleAuthorization();
  refreshUrlList();
  setRunning(false);

  els.langBtn.addEventListener("click", async () => {
    setLang(getLang() === "cs" ? "en" : "cs");
    applyTexts();
    await persist();
  });

  els.enableAuth.addEventListener("change", () => {
    toggleAuthorization();
    persist();
  });

  // persist on any change
  [
    els.albumUrl, els.albumUser, els.appendUserName, els.appendAlbumName,
    els.downloadNewOnly, els.downloadVideo, els.downloadContinue, els.subfolder,
  ].forEach((el) => el.addEventListener("change", persist));
  document.querySelectorAll('input[name="saveMode"]').forEach((r) =>
    r.addEventListener("change", persist)
  );

  els.downloadBtn.addEventListener("click", onDownload);
  els.abortBtn.addEventListener("click", onAbort);
}

init();
