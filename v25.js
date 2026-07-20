/* Chroniques d'Astréa V25 — son de fin de tour et sons d'invocation par carte */
(() => {
  const originalEndPlayerTurn = endPlayerTurn;
  const configuredKeys = new Set();

  endPlayerTurn = async function(...args) {
    if (typeof canPlayerInteract === "function" && !canPlayerInteract()) {
      return originalEndPlayerTurn.apply(this, args);
    }
    window.ASTREA_SFX?.play("endTurn", 0.82);
    return originalEndPlayerTurn.apply(this, args);
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (progress) {
      progress.version = Math.max(25, Number(progress.version || 0));
      saveProgress();
    }
  });

  function normalizeCardFilename(value) {
    return String(value || "carte")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "carte";
  }

  function asCandidateList(value) {
    if (Array.isArray(value)) return value.filter(item => typeof item === "string" && item.trim());
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }

  function getCardSoundCandidates(card) {
    const slug = normalizeCardFilename(card?.name || card?.id);
    const overrides = window.ASTREA_AUDIO_CONFIG?.cardSummons || {};
    const custom = asCandidateList(overrides[card?.id] ?? overrides[card?.name] ?? overrides[slug]);
    if (custom.length) return custom;

    const exactName = String(card?.name || "").trim();
    const id = String(card?.id || "").trim();
    const extensions = ["mp3", "ogg", "wav"];
    const candidates = [];

    for (const extension of extensions) candidates.push(`audio/cartes/${slug}.${extension}`);
    for (const extension of extensions) candidates.push(`audio/${slug}.${extension}`);
    if (id) for (const extension of extensions) candidates.push(`audio/cartes/${id}.${extension}`);
    if (exactName) for (const extension of extensions) candidates.push(`audio/cartes/${exactName}.${extension}`);

    return [...new Set(candidates)];
  }

  function playCardSummonSound(cardOrId, gain = 0.9) {
    const card = typeof cardOrId === "string" ? CARD_BY_ID?.[cardOrId] : cardOrId;
    if (!card || !["creature", "token"].includes(card.type)) return null;

    const slug = normalizeCardFilename(card.name || card.id);
    const channelKey = `cardSummon_${card.id || slug}`;
    if (!configuredKeys.has(channelKey)) {
      window.ASTREA_AUDIO_CONFIG = window.ASTREA_AUDIO_CONFIG || {};
      window.ASTREA_AUDIO_CONFIG[channelKey] = getCardSoundCandidates(card);
      configuredKeys.add(channelKey);
    }
    return window.ASTREA_SFX?.play(channelKey, gain) || null;
  }

  window.ASTREA_CARD_AUDIO = {
    play: playCardSummonSound,
    filenameFor(cardOrId) {
      const card = typeof cardOrId === "string" ? CARD_BY_ID?.[cardOrId] : cardOrId;
      return card ? `${normalizeCardFilename(card.name || card.id)}.mp3` : "carte.mp3";
    },
    reload() {
      configuredKeys.forEach(key => {
        if (window.ASTREA_AUDIO_CONFIG) delete window.ASTREA_AUDIO_CONFIG[key];
      });
      configuredKeys.clear();
      window.ASTREA_SFX?.reload?.();
    }
  };
})();
