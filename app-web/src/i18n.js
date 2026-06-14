// i18n.js — EN/CZ strings ported from Rajce.t, plus a few web-specific ones.

const STRINGS = {
  en: {
    appTitle: "Rajce album downloader",
    album: "Album",
    albumUrl: "Album URL:",
    albumUser: "Album user:",
    albumPass: "Album password:",
    enableAuth: "Enable album authorization",
    settings: "Settings",
    newOnly: "Download new files only",
    video: "Download video files",
    continue404: "Continue with download in case of error 404 Not Found",
    appendUser: "Append user name to download directory",
    appendAlbum: "Append album name to download directory",
    saveMode: "Save mode:",
    saveModeDownloads: "Save files into the Downloads folder",
    saveModeZip: "Pack everything into a single ZIP",
    subfolder: "Sub-folder name:",
    subfolderHint: "Optional folder created under your Downloads (or ZIP root).",
    download: "Download",
    abort: "Abort",
    progress: "Download progress",
    homepage: "Rajce album downloader homepage",
    switchLang: "Switch language",
    ready: "Ready.",
    fetching: "Fetching album page…",
    parsing: "Parsing album…",
    building: "Building ZIP…",
    downloadingN: "Download progress {0}/{1}",
    completeTitle: "Download complete!",
    completeFiles: "Files total/downloaded:",
    nothingToDownload: "Nothing to download in this album.",
    // errors
    errInvalidUrl: "Album URL is not valid!",
    errParse: "Http parse error! Files can't be downloaded!",
    errTooManyAttempts: "Too many unsuccessful attempts - try this in a moment!",
    errAuthFill: "Authorization is required! Fill the album authorization data.",
    errAuthWrong: "Authorization is required! Wrong album authorization.",
    errAuthEnable: "Authorization is required! Enable album authorization.",
    errDownloadFailed: "Download has failed.",
    aborted: "Aborted.",
  },
  cs: {
    appTitle: "Rajče album downloader",
    album: "Album",
    albumUrl: "Adresa alba:",
    albumUser: "Uživatelské jméno:",
    albumPass: "Uživatelské heslo:",
    enableAuth: "Povolit uživatelskou autorizaci",
    settings: "Nastavení",
    newOnly: "Stahovat pouze nové soubory",
    video: "Stahovat video soubory",
    continue404: "Pokračovat ve stahování v případě chyby 404 Not Found",
    appendUser: "Připojit uživatelské jméno k adresáři pro uložení",
    appendAlbum: "Připojit jméno alba k adresáři pro uložení",
    saveMode: "Způsob uložení:",
    saveModeDownloads: "Ukládat soubory do složky Stažené",
    saveModeZip: "Zabalit vše do jednoho ZIP archivu",
    subfolder: "Název podsložky:",
    subfolderHint: "Volitelná složka vytvořená ve Stažených (nebo v kořeni ZIPu).",
    download: "Stáhnout",
    abort: "Přerušit",
    progress: "Status stahování",
    homepage: "Domácí stránka Rajče album downloader",
    switchLang: "Změnit jazyk",
    ready: "Připraveno.",
    fetching: "Načítám stránku alba…",
    parsing: "Zpracovávám album…",
    building: "Vytvářím ZIP…",
    downloadingN: "Status stahování {0}/{1}",
    completeTitle: "Stahování dokončeno!",
    completeFiles: "Souborů celkem/staženo:",
    nothingToDownload: "V tomto albu není co stahovat.",
    // errors
    errInvalidUrl: "Adresa alba je špatně!",
    errParse: "Chyba při zpracování HTTP požadavku! Soubory nelze stáhnout!",
    errTooManyAttempts: "Příliš mnoho neúspěšných pokusů - zkuste to za chvíli!",
    errAuthFill: "Je vyžadována autorizace! Vyplňte autorizační data pro vybrané album.",
    errAuthWrong: "Je vyžadována autorizace! Špatná autorizační data pro vybrané album.",
    errAuthEnable: "Je vyžadována autorizace! Povolte uživatelskou autorizaci.",
    errDownloadFailed: "Stahování selhalo.",
    aborted: "Přerušeno.",
  },
};

let current = "cs";

export function setLang(lang) {
  if (STRINGS[lang]) current = lang;
}

export function getLang() {
  return current;
}

export function t(key, ...args) {
  let s = (STRINGS[current] && STRINGS[current][key]) ?? STRINGS.en[key] ?? key;
  args.forEach((a, i) => {
    s = s.replace(`{${i}}`, a);
  });
  return s;
}
