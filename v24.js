/* Chroniques d'Astréa V24 — effets sonores personnalisables */
(() => {
  const originalShowGameOver = showGameOver;
  const originalAnimateCombat = animateCombat;

  const activeSfx = new Set();
  const sfxChannels = new Map();
  let lastResultGameState = null;

  document.addEventListener("DOMContentLoaded", () => {
    initializeSfxEngine();
    if (progress) {
      progress.version = Math.max(24, Number(progress.version || 0));
      saveProgress();
    }
  });

  showGameOver = function(title, text) {
    playResultSound(title);
    return originalShowGameOver(title, text);
  };

  animateCombat = async function(attacker, target) {
    const impactTimer = window.setTimeout(() => playSfx("attackHit", 0.82), 265);
    try {
      return await originalAnimateCombat(attacker, target);
    } finally {
      window.clearTimeout(impactTimer);
    }
  };

  function initializeSfxEngine() {
    ["victory", "defeat", "menuClick", "attackHit"].forEach(createSfxChannel);

    document.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || button.disabled || !isMenuButton(button)) return;
      playSfx("menuClick", 0.58);
    }, true);

    document.getElementById("volume-slider")?.addEventListener("input", applySfxVolume);
    window.addEventListener("beforeunload", stopAllSfx);
  }

  function isMenuButton(button) {
    if (!button.closest("#game-screen")) return true;
    return button.id === "open-settings-game-btn" || button.id === "leave-game-btn";
  }

  function playResultSound(title) {
    if (gameState && lastResultGameState === gameState) return;
    const normalized = normalizeText(title || "");
    if (normalized.includes("victoire")) {
      lastResultGameState = gameState || { result: "victory" };
      playSfx("victory", 1);
    } else if (normalized.includes("defaite")) {
      lastResultGameState = gameState || { result: "defeat" };
      playSfx("defeat", 1);
    }
  }

  function createSfxChannel(key) {
    if (sfxChannels.has(key)) return sfxChannels.get(key);
    const candidates = getSfxCandidates(key);
    const channel = {
      key,
      candidates,
      preferredIndex: 0,
      resolvedSource: null,
      exhausted: false
    };
    sfxChannels.set(key, channel);
    return channel;
  }

  function getSfxCandidates(key) {
    const configured = window.ASTREA_AUDIO_CONFIG?.[key];
    if (Array.isArray(configured) && configured.length) return configured.filter(Boolean);
    if (typeof configured === "string" && configured.trim()) return [configured.trim()];

    const defaults = {
      victory: ["audio/victoire.mp3", "audio/victoire.ogg", "audio/victoire.wav"],
      defeat: ["audio/defaite.mp3", "audio/defaite.ogg", "audio/defaite.wav"],
      menuClick: ["audio/clic_menu.mp3", "audio/clic_menu.ogg", "audio/clic_menu.wav"],
      attackHit: ["audio/impact_carte.mp3", "audio/impact_carte.ogg", "audio/impact_carte.wav"]
    };
    return defaults[key] || [];
  }

  function playSfx(key, gain = 1) {
    const channel = createSfxChannel(key);
    if (!channel.candidates.length || channel.exhausted || getMasterVolume() <= 0) return null;

    const orderedCandidates = channel.resolvedSource
      ? [channel.resolvedSource, ...channel.candidates.filter(source => source !== channel.resolvedSource)]
      : channel.candidates.slice(channel.preferredIndex);

    return tryPlayCandidate(channel, orderedCandidates, 0, gain);
  }

  function tryPlayCandidate(channel, candidates, index, gain) {
    if (index >= candidates.length) {
      channel.exhausted = true;
      return null;
    }

    const source = candidates[index];
    const audio = new Audio(source);
    let fallbackStarted = false;
    audio.preload = "auto";
    audio.volume = Math.max(0, Math.min(1, getMasterVolume() * gain));
    audio.muted = false;

    const fallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      activeSfx.delete(audio);
      tryPlayCandidate(channel, candidates, index + 1, gain);
    };

    audio.addEventListener("playing", () => {
      channel.resolvedSource = source;
      const sourceIndex = channel.candidates.indexOf(source);
      if (sourceIndex >= 0) channel.preferredIndex = sourceIndex;
      channel.exhausted = false;
    }, { once: true });
    audio.addEventListener("ended", () => activeSfx.delete(audio), { once: true });
    audio.addEventListener("error", fallback, { once: true });

    activeSfx.add(audio);
    const promise = audio.play();
    if (promise?.catch) {
      promise.catch(error => {
        if (error?.name === "NotSupportedError") fallback();
        else activeSfx.delete(audio);
      });
    }
    return audio;
  }

  function getMasterVolume() {
    return Math.max(0, Math.min(1, Number(progress?.settings?.volume ?? 70) / 100));
  }

  function applySfxVolume() {
    const volume = getMasterVolume();
    activeSfx.forEach(audio => {
      audio.volume = volume;
      if (volume <= 0) {
        audio.pause();
        activeSfx.delete(audio);
      }
    });
  }

  function stopAllSfx() {
    activeSfx.forEach(audio => {
      audio.pause();
      try { audio.currentTime = 0; } catch (_) {}
    });
    activeSfx.clear();
  }

  window.ASTREA_SFX = {
    play: playSfx,
    stopAll: stopAllSfx,
    reload() {
      sfxChannels.clear();
      ["victory", "defeat", "menuClick", "attackHit"].forEach(createSfxChannel);
    }
  };
})();
