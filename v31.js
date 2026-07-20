/* Chroniques d'Astréa V31 — Écran de chargement
   Précharge les images et les sons du jeu (liste définie dans assets-manifest.js),
   affiche une barre de progression, puis remplace celle-ci par un bouton
   « Entrer dans la taverne » une fois le chargement terminé à 100 %.

   Sons personnalisables (à déposer dans le dossier audio/) :
   - loading_screen.mp3 / .ogg / .wav : joué en boucle pendant le chargement.
   - enter_game_button.mp3 / .ogg / .wav : joué lors du clic sur le bouton.
*/
(() => {
  const MIN_VISIBLE_DURATION_MS = 900; // évite un simple "flash" si tout charge instantanément
  const ASSET_TIMEOUT_MS = 12000; // un fichier trop lent n'empêche pas le jeu de démarrer

  let loadingAmbientAudio = null;
  let loadingAmbientCandidates = [];
  let loadingAmbientIndex = 0;
  let loadingAmbientUnlocked = false;

  document.addEventListener("DOMContentLoaded", () => {
    const dom = cacheLoadingDom();
    if (!dom.screen) return;

    startLoadingAmbient(dom);
    bindEnterButton(dom);
    runPreload(dom);
  });

  function cacheLoadingDom() {
    return {
      screen: document.getElementById("loading-screen"),
      progressWrap: document.getElementById("loading-progress-wrap"),
      progressFill: document.getElementById("loading-progress-fill"),
      progressLabel: document.getElementById("loading-progress-label"),
      progressPercent: document.getElementById("loading-progress-percent"),
      enterBtn: document.getElementById("enter-tavern-btn")
    };
  }

  /* ---------- Préchargement des assets ---------- */

  function runPreload(dom) {
    const manifest = window.ASTREA_ASSET_MANIFEST || { images: [], audio: [] };
    const images = Array.isArray(manifest.images) ? manifest.images : [];
    const audios = Array.isArray(manifest.audio) ? manifest.audio : [];
    const total = images.length + audios.length;
    const startedAt = Date.now();

    if (!total) {
      finishLoading(dom, startedAt);
      return;
    }

    let loaded = 0;
    const onOneDone = () => {
      loaded += 1;
      updateProgress(dom, loaded, total);
      if (loaded >= total) finishLoading(dom, startedAt);
    };

    images.forEach(src => preloadImage(src, onOneDone));
    audios.forEach(src => preloadAudio(src, onOneDone));

    updateProgress(dom, 0, total);
  }

  function preloadImage(src, done) {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; done(); };
    const img = new Image();
    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, ASSET_TIMEOUT_MS);
    img.src = src;
  }

  function preloadAudio(src, done) {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; done(); };
    const audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("canplaythrough", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, ASSET_TIMEOUT_MS);
    audio.src = src;
    try { audio.load(); } catch (_) {}
  }

  function updateProgress(dom, loaded, total) {
    const percent = total ? Math.min(100, Math.round((loaded / total) * 100)) : 100;
    if (dom.progressFill) dom.progressFill.style.width = `${percent}%`;
    if (dom.progressPercent) dom.progressPercent.textContent = `${percent} %`;
  }

  function finishLoading(dom, startedAt) {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, MIN_VISIBLE_DURATION_MS - elapsed);
    window.setTimeout(() => revealEnterButton(dom), remaining);
  }

  function revealEnterButton(dom) {
    updateProgress(dom, 1, 1);
    if (dom.progressLabel) dom.progressLabel.textContent = "Chargement terminé";
    if (dom.progressWrap) dom.progressWrap.classList.add("hidden");
    if (dom.enterBtn) dom.enterBtn.classList.remove("hidden");
    dom.enterBtn?.focus();
  }

  /* ---------- Bouton "Entrer dans la taverne" ---------- */

  function bindEnterButton(dom) {
    dom.enterBtn?.addEventListener("click", () => {
      if (dom.enterBtn.disabled) return;
      dom.enterBtn.disabled = true;
      playOneShot(getAudioCandidates("enterGameButton", [
        "audio/enter_game_button.mp3", "audio/enter_game_button.ogg", "audio/enter_game_button.wav"
      ]));
      stopLoadingAmbient();
      enterGame(dom);
    });
  }

  function enterGame(dom) {
    dom.screen.classList.add("loading-screen-leaving");
    window.setTimeout(() => {
      dom.screen.classList.add("hidden");
      if (typeof showMainMenu === "function") showMainMenu();
    }, 520);
  }

  /* ---------- Ambiance sonore de l'écran de chargement ---------- */

  function startLoadingAmbient(dom) {
    loadingAmbientCandidates = getAudioCandidates("loadingScreen", [
      "audio/loading_screen.mp3", "audio/loading_screen.ogg", "audio/loading_screen.wav"
    ]);
    if (!loadingAmbientCandidates.length) return;

    loadingAmbientAudio = new Audio();
    loadingAmbientAudio.loop = true;
    loadingAmbientAudio.volume = getMasterVolume();
    loadingAmbientIndex = 0;

    loadingAmbientAudio.addEventListener("error", () => {
      loadingAmbientIndex += 1;
      if (loadingAmbientIndex < loadingAmbientCandidates.length) {
        loadingAmbientAudio.src = loadingAmbientCandidates[loadingAmbientIndex];
        loadingAmbientAudio.load();
      }
    });

    loadingAmbientAudio.src = loadingAmbientCandidates[loadingAmbientIndex];
    attemptAmbientPlay();

    const unlock = () => {
      if (loadingAmbientUnlocked) return;
      loadingAmbientUnlocked = true;
      attemptAmbientPlay();
    };
    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    document.addEventListener("keydown", unlock, { once: true, capture: true });
  }

  function attemptAmbientPlay() {
    if (!loadingAmbientAudio) return;
    const promise = loadingAmbientAudio.play();
    if (promise?.catch) promise.catch(() => {});
  }

  function stopLoadingAmbient() {
    if (!loadingAmbientAudio) return;
    const audio = loadingAmbientAudio;
    const fadeSteps = 8;
    const startVolume = audio.volume;
    let step = 0;
    const fade = window.setInterval(() => {
      step += 1;
      audio.volume = Math.max(0, startVolume * (1 - step / fadeSteps));
      if (step >= fadeSteps) {
        window.clearInterval(fade);
        audio.pause();
      }
    }, 35);
  }

  /* ---------- Utilitaires audio partagés avec le reste du jeu ---------- */

  function getAudioCandidates(key, fallback) {
    const configured = window.ASTREA_AUDIO_CONFIG?.[key];
    if (Array.isArray(configured) && configured.length) return configured.filter(Boolean);
    if (typeof configured === "string" && configured.trim()) return [configured.trim()];
    return fallback;
  }

  function getMasterVolume() {
    const value = (typeof progress !== "undefined" && progress) ? progress.settings?.volume : undefined;
    return Math.max(0, Math.min(1, Number(value ?? 70) / 100));
  }

  function playOneShot(candidates, index = 0) {
    if (!candidates || index >= candidates.length) return null;
    if (getMasterVolume() <= 0) return null;
    const audio = new Audio(candidates[index]);
    audio.volume = getMasterVolume();
    audio.addEventListener("error", () => playOneShot(candidates, index + 1), { once: true });
    const promise = audio.play();
    if (promise?.catch) promise.catch(() => {});
    return audio;
  }
})();
