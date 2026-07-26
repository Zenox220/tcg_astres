"use strict";

/* Chroniques d'Astréa V42 — paquets multi-formats et déblocage des héros */
(() => {
  const DEFAULT_HERO_ID = "reine_celeste";
  const HERO_DEFAULT_PRICES = Object.freeze({
    reine_celeste: 0,
    pretresse_lunaire: 900,
    roi_solaire: 1100,
    sorceleur_du_vide: 1200,
    architecte_marees: 1300,
    chasseur_etoiles: 1300,
    grikz_bricoleur: 1400,
    thorga_appel_esprits: 1500,
    nyx_oeil_voile: 1500,
    kael_brisefer: 1600,
    xalgor_devoreur: 1800,
    ax7_oracle: 1700
  });

  function allCollectibleCardIds() {
    return (typeof COLLECTIBLE_CARDS !== "undefined" ? COLLECTIBLE_CARDS : [])
      .filter(card => card && card.collectible !== false && card.type !== "token")
      .map(card => card.id);
  }

  const universalPool = allCollectibleCardIds();
  Object.assign(PACK_DEFINITIONS, {
    basic: {
      id: "basic",
      name: "Paquet Basic",
      cost: 250,
      image: "assets/shop/pack_basic.png",
      description: "Contient 3 cartes de n’importe quel type.",
      pool: [...universalPool],
      cardCount: 3
    },
    premium: {
      id: "premium",
      name: "Paquet Premium",
      cost: 450,
      image: "assets/shop/pack_premium.png",
      description: "Contient 6 cartes de n’importe quel type.",
      pool: [...universalPool],
      cardCount: 6
    },
    elite: {
      id: "elite",
      name: "Paquet Élite",
      cost: 750,
      image: "assets/shop/pack_elite.png",
      description: "Contient 10 cartes de n’importe quel type et offre 2 % de chance de débloquer un nouveau héros.",
      pool: [...universalPool],
      cardCount: 10,
      heroUnlockChance: 0.02
    }
  });

  function knownHeroIds() {
    return Object.keys(HERO_DEFINITIONS || {});
  }

  function normalizeUnlockedHeroes(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return [DEFAULT_HERO_ID];
    const known = new Set(knownHeroIds());
    const source = Array.isArray(snapshot.unlockedHeroes) ? snapshot.unlockedHeroes : [];
    snapshot.unlockedHeroes = [...new Set([DEFAULT_HERO_ID, ...source.filter(id => known.has(id))])];

    if (!snapshot.unlockedHeroes.includes(snapshot.selectedHeroId)) snapshot.selectedHeroId = DEFAULT_HERO_ID;
    if (Array.isArray(snapshot.decks)) {
      snapshot.decks.forEach(deck => {
        if (!snapshot.unlockedHeroes.includes(deck?.heroId)) deck.heroId = DEFAULT_HERO_ID;
      });
      const active = snapshot.decks.find(deck => deck.id === snapshot.activeDeckId) || snapshot.decks[0];
      if (active) {
        if (!snapshot.unlockedHeroes.includes(active.heroId)) active.heroId = DEFAULT_HERO_ID;
        snapshot.selectedHeroId = active.heroId;
      }
    }
    return snapshot.unlockedHeroes;
  }

  function isHeroUnlocked(heroId) {
    return Boolean(progress && normalizeUnlockedHeroes(progress).includes(heroId));
  }

  function persistNormalizedHeroes() {
    if (!progress) return;
    normalizeUnlockedHeroes(progress);
    try { storageSet(getProgressStorageKey(), JSON.stringify(progress)); } catch (_) {}
  }

  function unlockHero(heroId, { save = true, announce = true } = {}) {
    if (!progress || !HERO_DEFINITIONS[heroId]) return false;
    normalizeUnlockedHeroes(progress);
    if (progress.unlockedHeroes.includes(heroId)) return false;
    progress.unlockedHeroes.push(heroId);
    if (save) saveProgress();
    renderHeroSelection();
    renderDeckManager();
    if (announce) window.astreaLiveAdmin?.toast?.(`Nouveau héros débloqué : ${HERO_DEFINITIONS[heroId].name} !`);
    return true;
  }

  window.astreaHeroUnlocks = {
    defaultHeroId: DEFAULT_HERO_ID,
    normalize: normalizeUnlockedHeroes,
    isUnlocked: isHeroUnlocked,
    unlock: unlockHero,
    list: () => progress ? [...normalizeUnlockedHeroes(progress)] : [DEFAULT_HERO_ID]
  };

  const originalLoadProgress = loadProgress;
  loadProgress = function() {
    const snapshot = originalLoadProgress.apply(this, arguments);
    normalizeUnlockedHeroes(snapshot);
    try { storageSet(getProgressStorageKey(), JSON.stringify(snapshot)); } catch (_) {}
    return snapshot;
  };

  const originalPersistActiveDeckState = persistActiveDeckState;
  persistActiveDeckState = function() {
    if (progress) normalizeUnlockedHeroes(progress);
    const result = originalPersistActiveDeckState.apply(this, arguments);
    if (progress) normalizeUnlockedHeroes(progress);
    return result;
  };

  const originalRenderHeroSelection = renderHeroSelection;
  renderHeroSelection = function() {
    if (progress) normalizeUnlockedHeroes(progress);
    const result = originalRenderHeroSelection.apply(this, arguments);
    (dom.heroChoiceButtons || []).forEach(button => {
      const heroId = button.dataset.heroChoice;
      const unlocked = isHeroUnlocked(heroId);
      button.classList.toggle("hero-locked", !unlocked);
      button.setAttribute("aria-disabled", String(!unlocked));
      let badge = button.querySelector(".hero-lock-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "hero-lock-badge";
        button.appendChild(badge);
      }
      badge.textContent = unlocked ? "" : "🔒 Bloqué";
      badge.classList.toggle("hidden", unlocked);
    });
    return result;
  };

  const originalSelectPlayerHero = selectPlayerHero;
  selectPlayerHero = function(heroId) {
    if (!isHeroUnlocked(heroId)) {
      window.astreaLiveAdmin?.toast?.("Ce héros est encore bloqué. Débloquez-le dans la boutique ou grâce à une récompense.", true);
      return;
    }
    return originalSelectPlayerHero.apply(this, arguments);
  };

  const originalRenderDeckManager = renderDeckManager;
  renderDeckManager = function() {
    if (progress) normalizeUnlockedHeroes(progress);
    const result = originalRenderDeckManager.apply(this, arguments);
    if (dom.deckHeroSelect) {
      [...dom.deckHeroSelect.options].forEach(option => {
        const unlocked = isHeroUnlocked(option.value);
        option.disabled = !unlocked;
        const hero = HERO_DEFINITIONS[option.value];
        option.textContent = `Héros : ${hero?.name || option.value}${unlocked ? "" : " — 🔒 Bloqué"}`;
      });
      const activeDeck = getActiveDeck();
      if (activeDeck && !isHeroUnlocked(activeDeck.heroId)) {
        activeDeck.heroId = DEFAULT_HERO_ID;
        progress.selectedHeroId = DEFAULT_HERO_ID;
        dom.deckHeroSelect.value = DEFAULT_HERO_ID;
        persistNormalizedHeroes();
      }
    }
    return result;
  };

  const originalSetActiveDeckHero = setActiveDeckHero;
  setActiveDeckHero = function(heroId) {
    if (!isHeroUnlocked(heroId)) {
      window.astreaLiveAdmin?.toast?.("Ce héros est bloqué.", true);
      renderDeckManager();
      return;
    }
    return originalSetActiveDeckHero.apply(this, arguments);
  };

  const originalGeneratePackRewards = generatePackRewards;
  generatePackRewards = function(packId) {
    const pack = PACK_DEFINITIONS[packId];
    if (!pack?.cardCount) return originalGeneratePackRewards.apply(this, arguments);
    const poolCards = (pack.pool || []).map(id => CARD_BY_ID[id]).filter(card => card && card.collectible !== false);
    const grouped = {
      common: poolCards.filter(card => card.rarity === "common"),
      rare: poolCards.filter(card => card.rarity === "rare"),
      epic: poolCards.filter(card => card.rarity === "epic"),
      legendary: poolCards.filter(card => card.rarity === "legendary")
    };
    const rewards = [];
    const count = Math.max(1, Number(pack.cardCount || CONFIG.PACK_SIZE || 5));
    for (let index = 0; index < count - 1; index += 1) rewards.push(pickPackCard(grouped, false));
    rewards.push(pickPackCard(grouped, true));
    return shuffle(rewards.filter(Boolean));
  };

  const originalRevealPackRewards = revealPackRewards;
  revealPackRewards = function() {
    const stateBefore = packOpeningState;
    const canRollHero = Boolean(stateBefore && !stateBefore.revealed && stateBefore.packId === "elite");
    const result = originalRevealPackRewards.apply(this, arguments);
    if (!canRollHero || Math.random() >= Number(PACK_DEFINITIONS.elite.heroUnlockChance || 0.02)) return result;

    normalizeUnlockedHeroes(progress);
    const locked = knownHeroIds().filter(id => id !== DEFAULT_HERO_ID && !progress.unlockedHeroes.includes(id));
    if (!locked.length) return result;
    const heroId = randomItem(locked);
    if (!unlockHero(heroId, { save: true, announce: false })) return result;

    const hero = HERO_DEFINITIONS[heroId];
    const reward = document.createElement("article");
    reward.className = "pack-reward-card hero-unlock-reward";
    reward.innerHTML = `
      <div class="reward-art"><img class="card-image" src="${escapeHtml(hero.portrait)}" alt="${escapeHtml(hero.name)}"></div>
      <strong>${escapeHtml(hero.name)}</strong>
      <small>Nouveau héros jouable débloqué</small>
      <b>HÉROS</b>`;
    dom.packOpeningCards.appendChild(reward);
    dom.packOpeningHint.textContent = `Chance exceptionnelle ! ${hero.name} a été débloqué.`;
    window.astreaLiveAdmin?.toast?.(`Paquet Élite : ${hero.name} est désormais débloqué !`);
    renderHeroShop();
    return result;
  };

  function heroShopSettings() {
    const remote = window.astreaLiveAdmin?.getConfig?.()?.heroShopSettings;
    const map = new Map((Array.isArray(remote) ? remote : []).map(item => [item.heroId, item]));
    return knownHeroIds().filter(id => id !== DEFAULT_HERO_ID).map(heroId => ({
      heroId,
      enabled: map.get(heroId)?.enabled !== false,
      price: Math.max(0, Number(map.get(heroId)?.price ?? HERO_DEFAULT_PRICES[heroId] ?? 1000))
    }));
  }

  async function purchaseHero(heroId) {
    if (isHeroUnlocked(heroId)) return;
    if (!window.astreaLiveAdmin) return;
    const button = document.querySelector(`[data-hero-shop-buy="${CSS.escape(heroId)}"]`);
    if (button) button.disabled = true;
    try {
      await window.astreaFlushAccountProgress?.();
      const base = String(window.ASTREA_SERVER_URL || "").replace(/\/+$/, "");
      const token = window.localStorage?.getItem?.("astrea_auth_token") || "";
      if (!token) throw new Error("Connectez-vous pour acheter un héros.");
      const response = await fetch(`${base}/api/shop/heroes/${encodeURIComponent(heroId)}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
      window.astreaApplyServerProgress?.(data.progress);
      window.astreaLiveAdmin.toast(`${HERO_DEFINITIONS[heroId]?.name || "Héros"} débloqué !`);
    } catch (error) {
      window.astreaLiveAdmin.toast(error.message, true);
    } finally {
      renderHeroShop();
    }
  }

  function renderHeroShop() {
    const library = document.querySelector("#shop-screen .collection-library");
    if (!library || typeof HERO_DEFINITIONS === "undefined") return;
    let zone = document.getElementById("hero-shop-zone");
    if (!zone) {
      zone = document.createElement("section");
      zone.id = "hero-shop-zone";
      zone.className = "hero-shop-zone";
      library.appendChild(zone);
    }
    normalizeUnlockedHeroes(progress || {});
    const settings = heroShopSettings();
    zone.innerHTML = `
      <div class="liveops-section-title"><div><p class="eyebrow">Héros jouables</p><h2>Débloquer de nouveaux héros</h2><p>Un héros reste disponible définitivement après son achat ou son obtention en récompense.</p></div></div>
      <div class="hero-shop-grid">${settings.map(setting => {
        const hero = HERO_DEFINITIONS[setting.heroId];
        const unlocked = isHeroUnlocked(setting.heroId);
        const unavailable = !setting.enabled && !unlocked;
        return `<article class="hero-shop-card ${unlocked ? "unlocked" : "locked"}">
          <div class="hero-shop-portrait"><img src="${escapeHtml(hero.portrait)}" alt="${escapeHtml(hero.name)}"><span>${unlocked ? "✓ Débloqué" : "🔒 Bloqué"}</span></div>
          <div class="hero-shop-body"><h3>${escapeHtml(hero.name)}</h3><p>${escapeHtml(hero.subtitle || "Héros jouable")}</p>
          <div class="hero-shop-price"><img class="currency-icon" src="assets/ui/coin.png" alt="Pièces"><strong>${setting.price.toLocaleString("fr-FR")}</strong></div>
          <button class="primary-btn" data-hero-shop-buy="${escapeHtml(setting.heroId)}" type="button" ${unlocked || unavailable || Number(progress?.coins || 0) < setting.price ? "disabled" : ""}>${unlocked ? "Déjà débloqué" : unavailable ? "Indisponible" : "Acheter le héros"}</button></div>
        </article>`;
      }).join("")}</div>`;
    zone.querySelectorAll("[data-hero-shop-buy]").forEach(button => button.addEventListener("click", () => purchaseHero(button.dataset.heroShopBuy)));
  }

  window.astreaHeroShopRender = renderHeroShop;

  const originalRenderShop = renderShop;
  renderShop = function() {
    const result = originalRenderShop.apply(this, arguments);
    renderHeroShop();
    return result;
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (progress) {
      normalizeUnlockedHeroes(progress);
      persistNormalizedHeroes();
      renderHeroSelection();
      renderDeckManager();
    }
  });
})();
