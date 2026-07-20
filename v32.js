/* Chroniques d'Astréa V32 — Résolution d'écran
   Ajoute, dans les Paramètres, un sélecteur de résolution d'affichage pour le jeu
   ainsi qu'un bouton « Adaptation automatique » qui détecte la résolution de
   l'écran sur lequel le jeu est lancé et y adapte l'affichage.

   Remarque technique : une page web ne peut pas changer la résolution réelle du
   moniteur (restriction de sécurité des navigateurs). Ce réglage émule donc la
   résolution choisie en ajustant l'échelle d'affichage du jeu, comme si la
   fenêtre du navigateur faisait cette taille. L'option « Adaptation automatique »
   détecte la résolution réelle de l'écran (window.screen) et laisse le jeu
   occuper naturellement tout l'espace disponible, quelle que soit la machine.
*/
(() => {
  const RESOLUTION_PRESETS = {
    "1920x1080": "1920 × 1080 (Full HD)",
    "1366x768": "1366 × 768",
    "1536x864": "1536 × 864",
    "1280x720": "1280 × 720 (HD)",
    "1440x900": "1440 × 900",
    "1600x900": "1600 × 900",
    "1920x1200": "1920 × 1200",
    "1280x800": "1280 × 800",
    "1024x768": "1024 × 768",
    "2560x1440": "2560 × 1440 (QHD)",
    "3840x2160": "3840 × 2160 (4K UHD)"
  };
  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 2.2;

  let resizeTimer = null;

  document.addEventListener("DOMContentLoaded", () => {
    migrateV32Progress();
    cacheV32Dom();
    bindV32Events();
    renderResolutionSettings();
    applyStoredResolution();

    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(applyStoredResolution, 120);
    });
  });

  function migrateV32Progress() {
    if (!progress) return;
    progress.settings = { resolution: "auto", ...(progress.settings || {}) };
    if (!progress.settings.resolution) progress.settings.resolution = "auto";
    progress.version = Math.max(32, Number(progress.version || 0));
    saveProgress?.();
  }

  function cacheV32Dom() {
    const ids = ["resolution-select", "auto-resolution-btn", "resolution-status"];
    ids.forEach(id => { dom[toCamel(id)] = document.getElementById(id); });
  }

  function bindV32Events() {
    dom.resolutionSelect?.addEventListener("change", event => {
      setResolution(event.target.value);
    });
    dom.autoResolutionBtn?.addEventListener("click", () => {
      setResolution("auto");
      if (dom.resolutionSelect) dom.resolutionSelect.value = "auto";
    });
  }

  function setResolution(value) {
    if (!progress) return;
    progress.settings.resolution = value;
    saveProgress?.();
    applyStoredResolution();
  }

  function renderResolutionSettings() {
    if (!progress || !dom.resolutionSelect) return;
    dom.resolutionSelect.value = RESOLUTION_PRESETS[progress.settings.resolution]
      ? progress.settings.resolution
      : "auto";
  }

  /* ---------- Application de la résolution ---------- */

  function applyStoredResolution() {
    const value = progress?.settings?.resolution || "auto";
    const detected = getDetectedScreenResolution();

    if (value === "auto" || !RESOLUTION_PRESETS[value]) {
      resetToAutoAdaptation();
      updateStatus(`Adaptation automatique · Écran détecté : ${detected.width} × ${detected.height}`);
      return;
    }

    const [targetWidth, targetHeight] = value.split("x").map(Number);
    const zoom = computeZoom(targetWidth);
    applyZoom(zoom);
    updateStatus(`Résolution : ${RESOLUTION_PRESETS[value]} · Mise à l’échelle ${Math.round(zoom * 100)} % · Écran détecté : ${detected.width} × ${detected.height}`);
  }

  function resetToAutoAdaptation() {
    applyZoom(1, true);
  }

  function computeZoom(targetWidth) {
    if (!targetWidth) return 1;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || targetWidth;
    const zoom = viewportWidth / targetWidth;
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  }

  function applyZoom(zoom, isReset = false) {
    const html = document.documentElement;
    if (isReset) {
      html.style.zoom = "";
      html.style.removeProperty("zoom");
    } else {
      html.style.zoom = String(zoom);
    }
  }

  function getDetectedScreenResolution() {
    return {
      width: window.screen?.width || window.innerWidth || 0,
      height: window.screen?.height || window.innerHeight || 0
    };
  }

  function updateStatus(text) {
    if (dom.resolutionStatus) dom.resolutionStatus.textContent = text;
  }
})();
