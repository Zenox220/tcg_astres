"use strict";

/* Chroniques d'Astréa V45
   - La sélection du héros se trouve désormais dans l'atelier Decks.
   - La Collection possède deux catégories : Cartes et Héros.
   - Les héros non débloqués restent visibles, mais sont grisés et verrouillés.
*/
(() => {
  let activeLibraryCategory = "cards";
  const ui = {};

  function cacheV45Dom() {
    [
      "card-library-screen", "card-library-title", "card-library-cards-tab",
      "card-library-heroes-tab", "card-library-cards-count", "card-library-heroes-count",
      "card-library-toolbar", "card-library-search", "card-library-type-filter",
      "card-library-cost-filter", "card-library-ownership-filter", "card-library-grid",
      "hero-library-grid", "card-library-enchant-guide", "card-library-guide-icon",
      "card-library-guide-title", "card-library-guide-text", "card-library-owned-summary",
      "card-library-enchanted-summary", "open-collection-btn"
    ].forEach(id => { ui[toCamel(id)] = document.getElementById(id); });
  }

  function normalizeV45Text(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeV45(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function allHeroes() {
    return Object.values(HERO_DEFINITIONS || {}).filter(hero => hero?.id);
  }

  function normalizeUnlockedHeroesV45() {
    if (!progress) return [];
    window.astreaHeroUnlocks?.normalize?.(progress);
    if (!Array.isArray(progress.unlockedHeroes)) {
      progress.unlockedHeroes = [window.astreaHeroUnlocks?.defaultHeroId || DEFAULT_PLAYER_HERO_ID];
    }
    return progress.unlockedHeroes;
  }

  function isHeroOwnedV45(heroId) {
    if (!progress) return heroId === DEFAULT_PLAYER_HERO_ID;
    if (window.astreaHeroUnlocks?.isUnlocked) return window.astreaHeroUnlocks.isUnlocked(heroId);
    return normalizeUnlockedHeroesV45().includes(heroId);
  }

  function updateCategoryCounts() {
    const heroes = allHeroes();
    const cardsOwned = COLLECTIBLE_CARDS.filter(card => Number(progress?.collection?.[card.id] || 0) > 0).length;
    const heroesOwned = heroes.filter(hero => isHeroOwnedV45(hero.id)).length;
    if (ui.cardLibraryCardsCount) ui.cardLibraryCardsCount.textContent = String(cardsOwned);
    if (ui.cardLibraryHeroesCount) ui.cardLibraryHeroesCount.textContent = String(heroesOwned);
  }

  function setOwnershipLabels(category) {
    const select = ui.cardLibraryOwnershipFilter;
    if (!select) return;
    const options = [...select.options];
    const all = options.find(option => option.value === "all");
    const owned = options.find(option => option.value === "owned");
    const unowned = options.find(option => option.value === "unowned");
    const enchanted = options.find(option => option.value === "enchanted");

    if (category === "heroes") {
      if (select.value === "enchanted") select.value = "all";
      if (all) all.textContent = "Tous les héros";
      if (owned) owned.textContent = "Héros possédés";
      if (unowned) unowned.textContent = "Héros non possédés";
      if (enchanted) enchanted.hidden = true;
    } else {
      if (all) all.textContent = "Toutes les cartes";
      if (owned) owned.textContent = "Possédées";
      if (unowned) unowned.textContent = "Non possédées";
      if (enchanted) enchanted.hidden = false;
    }
  }

  function setLibraryCategory(category, { refresh = true } = {}) {
    activeLibraryCategory = category === "heroes" ? "heroes" : "cards";
    const showHeroes = activeLibraryCategory === "heroes";

    ui.cardLibraryCardsTab?.classList.toggle("active", !showHeroes);
    ui.cardLibraryHeroesTab?.classList.toggle("active", showHeroes);
    ui.cardLibraryCardsTab?.setAttribute("aria-selected", String(!showHeroes));
    ui.cardLibraryHeroesTab?.setAttribute("aria-selected", String(showHeroes));
    ui.cardLibraryToolbar?.classList.toggle("showing-heroes", showHeroes);
    ui.cardLibraryGrid?.classList.toggle("hidden", showHeroes);
    ui.heroLibraryGrid?.classList.toggle("hidden", !showHeroes);
    ui.cardLibraryTypeFilter?.classList.toggle("hidden", showHeroes);
    ui.cardLibraryCostFilter?.classList.toggle("hidden", showHeroes);
    setOwnershipLabels(activeLibraryCategory);

    if (ui.cardLibrarySearch) {
      ui.cardLibrarySearch.placeholder = showHeroes
        ? "Rechercher un héros ou un pouvoir héroïque…"
        : "Rechercher une carte ou un effet…";
    }

    if (showHeroes) {
      if (ui.cardLibraryTitle) ui.cardLibraryTitle.textContent = "Galerie des héros";
      if (ui.cardLibraryGuideIcon) ui.cardLibraryGuideIcon.textContent = "♛";
      if (ui.cardLibraryGuideTitle) ui.cardLibraryGuideTitle.textContent = "Héros possédés et verrouillés";
      if (ui.cardLibraryGuideText) ui.cardLibraryGuideText.textContent = "Tous les héros du jeu sont visibles ici. Les héros non possédés apparaissent grisés et peuvent être obtenus dans la boutique, les paquets Élite ou grâce aux récompenses.";
      if (refresh) renderHeroLibrary();
    } else {
      if (ui.cardLibraryTitle) ui.cardLibraryTitle.textContent = "Galerie des cartes";
      if (ui.cardLibraryGuideIcon) ui.cardLibraryGuideIcon.textContent = "✦";
      if (ui.cardLibraryGuideTitle) ui.cardLibraryGuideTitle.textContent = "Enchantement doré";
      if (ui.cardLibraryGuideText) ui.cardLibraryGuideText.textContent = "Utilisez un doublon disponible pour enchanter définitivement une carte. La carte conserve alors une aura dorée dans la collection, les decks et pendant les combats.";
      if (refresh && ui.cardLibrarySearch) {
        // La galerie de cartes V37 est privée à son module. Son écouteur
        // d'origine se charge de la régénérer lorsque cet événement est émis.
        ui.cardLibrarySearch.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    updateCategoryCounts();
  }

  function renderHeroLibrary() {
    if (!progress || !ui.heroLibraryGrid) return;
    normalizeUnlockedHeroesV45();

    const search = normalizeV45Text(ui.cardLibrarySearch?.value || "");
    const ownership = ui.cardLibraryOwnershipFilter?.value || "all";
    const heroes = allHeroes()
      .filter(hero => {
        const power = getHeroPowerDefinition(hero.powerType);
        return !search || normalizeV45Text(`${hero.name} ${hero.subtitle || ""} ${power?.name || ""} ${power?.description || ""}`).includes(search);
      })
      .filter(hero => {
        const owned = isHeroOwnedV45(hero.id);
        if (ownership === "owned") return owned;
        if (ownership === "unowned") return !owned;
        return true;
      })
      .sort((a, b) => {
        const ownershipDifference = Number(isHeroOwnedV45(b.id)) - Number(isHeroOwnedV45(a.id));
        return ownershipDifference || a.name.localeCompare(b.name, "fr");
      });

    ui.heroLibraryGrid.innerHTML = "";
    if (!heroes.length) {
      const empty = document.createElement("div");
      empty.className = "library-empty-state";
      empty.textContent = "Aucun héros ne correspond à ces filtres.";
      ui.heroLibraryGrid.appendChild(empty);
    } else {
      heroes.forEach(hero => ui.heroLibraryGrid.appendChild(buildHeroLibraryCard(hero)));
    }

    const total = allHeroes().length;
    const owned = allHeroes().filter(hero => isHeroOwnedV45(hero.id)).length;
    const locked = Math.max(0, total - owned);
    if (ui.cardLibraryOwnedSummary) ui.cardLibraryOwnedSummary.textContent = `${owned} / ${total}`;
    if (ui.cardLibraryEnchantedSummary) ui.cardLibraryEnchantedSummary.textContent = `${locked} héros verrouillé${locked > 1 ? "s" : ""}`;
    updateCategoryCounts();
  }

  function buildHeroLibraryCard(hero) {
    const owned = isHeroOwnedV45(hero.id);
    const power = getHeroPowerDefinition(hero.powerType);
    const card = document.createElement("article");
    card.className = `hero-library-card ${owned ? "owned" : "unowned"}`;
    card.dataset.heroId = hero.id;
    card.innerHTML = `
      <div class="hero-library-portrait">
        <img src="${escapeV45(hero.portrait)}" alt="${escapeV45(hero.name)}" loading="lazy" />
        <span class="hero-library-status">${owned ? "✓ Possédé" : "🔒 Non possédé"}</span>
      </div>
      <div class="hero-library-body">
        <div class="hero-library-title"><div><strong>${escapeV45(hero.name)}</strong><span>${escapeV45(hero.subtitle || "Héros jouable")}</span></div><b>${Number(power?.cost || 0)} ◈</b></div>
        <div class="hero-library-power">
          <img src="${escapeV45(power?.image || "assets/ui/hero_power_eclat_astral.png")}" alt="${escapeV45(power?.name || "Pouvoir héroïque")}" loading="lazy" />
          <div><strong>${escapeV45(power?.name || "Pouvoir héroïque")}</strong><p>${escapeV45(power?.description || "Pouvoir héroïque unique.")}</p></div>
        </div>
        <p class="hero-library-source">${owned ? "Ce héros est disponible pour vos decks." : "À débloquer dans la boutique, un Paquet Élite ou une récompense."}</p>
      </div>`;

    card.querySelectorAll("img").forEach((image, index) => {
      image.addEventListener("error", () => {
        image.src = index === 0
          ? "assets/heroes/hero_reine_celeste.png"
          : "assets/ui/hero_power_eclat_astral.png";
      }, { once: true });
    });
    return card;
  }

  function bindV45Events() {
    ui.cardLibraryCardsTab?.addEventListener("click", () => setLibraryCategory("cards"));
    ui.cardLibraryHeroesTab?.addEventListener("click", () => setLibraryCategory("heroes"));
    ui.cardLibrarySearch?.addEventListener("input", () => {
      if (activeLibraryCategory === "heroes") renderHeroLibrary();
    });
    ui.cardLibraryOwnershipFilter?.addEventListener("change", () => {
      if (activeLibraryCategory === "heroes") renderHeroLibrary();
    });
    ui.openCollectionBtn?.addEventListener("click", () => setLibraryCategory("cards"));
  }

  // V42 normalise le héros depuis le deck actif avant la persistance. Pour le
  // sélecteur visuel déplacé dans Decks, on écrit donc d’abord le héros sur le
  // deck actif, puis on sauvegarde. Cela maintient le portrait, la liste
  // déroulante et les prochains combats parfaitement synchronisés.
  function selectActiveDeckHeroV45(heroId) {
    if (!progress || !HERO_DEFINITIONS[heroId]) return false;
    const unlocked = window.astreaHeroUnlocks?.isUnlocked
      ? window.astreaHeroUnlocks.isUnlocked(heroId)
      : normalizeUnlockedHeroesV45().includes(heroId);
    if (!unlocked) {
      window.astreaLiveAdmin?.toast?.("Ce héros est encore bloqué. Débloquez-le dans la boutique ou grâce à une récompense.", true);
      renderHeroSelection();
      renderDeckManager();
      return false;
    }

    const activeDeck = getActiveDeck();
    if (!activeDeck) return false;
    activeDeck.heroId = heroId;
    progress.selectedHeroId = heroId;
    progress.deck = [...activeDeck.cards];
    saveProgress();
    renderHeroSelection();
    renderDeckManager();
    if (dom.collectionScreen && !dom.collectionScreen.classList.contains("hidden")) renderDeckEditor();
    return true;
  }

  selectPlayerHero = function (heroId) {
    return selectActiveDeckHeroV45(heroId);
  };
  setActiveDeckHero = function (heroId) {
    return selectActiveDeckHeroV45(heroId);
  };

  // Toute sauvegarde ou récompense de héros actualise immédiatement la vue.
  const previousRenderMenuSummaryV45 = renderMenuSummary;
  renderMenuSummary = function () {
    const result = previousRenderMenuSummaryV45.apply(this, arguments);
    updateCategoryCounts();
    if (activeLibraryCategory === "heroes" && ui.cardLibraryScreen && !ui.cardLibraryScreen.classList.contains("hidden")) {
      renderHeroLibrary();
    }
    return result;
  };

  document.addEventListener("DOMContentLoaded", () => {
    cacheV45Dom();
    bindV45Events();
    setLibraryCategory("cards", { refresh: false });
    updateCategoryCounts();
  });

  window.ASTREA_COLLECTION_HEROES_V45 = {
    showCards: () => setLibraryCategory("cards"),
    showHeroes: () => setLibraryCategory("heroes"),
    renderHeroes: renderHeroLibrary
  };
})();
