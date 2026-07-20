/* Chroniques d'Astréa V30 — Statistiques dans les Paramètres
   Ajoute une catégorie « Statistiques » à l'écran Paramètres avec :
   nombre de victoires total, nombre de combats joués, nombre de défaites,
   nombre de victoires/défaites par héros joué, nombre de cartes possédées,
   nombre de paquets ouverts, nombre de pièces actuelles, meilleur rang de
   League atteint et deck préféré (le plus joué).
*/
(() => {
  const originalShowGameOver = showGameOver;
  const originalRevealPackRewards = revealPackRewards;
  const originalSaveProgress = saveProgress;

  // Copie locale des paliers de League (mêmes noms que dans v22.js) pour
  // afficher le libellé du meilleur rang atteint sans dépendre de v22.js.
  const LEAGUES = ["Bronze III","Bronze II","Bronze I","Argent III","Argent II","Argent I","Or III","Or II","Or I","Platine III","Platine II","Platine I","Diamant III","Diamant II","Diamant I","Maître"];

  document.addEventListener("DOMContentLoaded", () => {
    migrateV30Progress();
    cacheV30Dom();
    bindV30Events();
  });

  function migrateV30Progress() {
    if (!progress) return;
    progress.stats = {
      totalMatches: 0,
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
      packsOpened: 0,
      bestLeagueTier: 0,
      heroRecords: {},
      deckStats: {},
      ...(progress.stats || {})
    };
    progress.stats.heroRecords = progress.stats.heroRecords || {};
    progress.stats.deckStats = progress.stats.deckStats || {};
    if (progress.league) {
      progress.stats.bestLeagueTier = Math.max(progress.stats.bestLeagueTier || 0, progress.league.tier || 0);
    }
    progress.version = Math.max(30, Number(progress.version || 0));
    originalSaveProgress?.();
  }

  function cacheV30Dom() {
    const ids = ["stats-summary-grid", "stats-hero-list", "stats-favorite-deck"];
    ids.forEach(id => dom[toCamel(id)] = document.getElementById(id));
  }

  function bindV30Events() {
    document.getElementById("open-settings-btn")?.addEventListener("click", renderStats);
    document.getElementById("open-settings-game-btn")?.addEventListener("click", renderStats);
  }

  // On laisse d'abord s'exécuter la chaîne existante (quêtes, League, sons…)
  // afin que progress.league soit déjà à jour avant d'enregistrer les stats.
  showGameOver = function(title, text) {
    const result = originalShowGameOver.apply(this, arguments);
    recordMatchResult(title);
    return result;
  };

  revealPackRewards = function() {
    const wasRevealed = Boolean(packOpeningState?.revealed);
    const result = originalRevealPackRewards.apply(this, arguments);
    if (!wasRevealed && packOpeningState?.revealed && progress?.stats) {
      progress.stats.packsOpened += 1;
      originalSaveProgress?.();
    }
    return result;
  };

  function recordMatchResult(title) {
    if (!progress?.stats || !gameState) return;
    const label = String(title || "");
    const isVictory = label.includes("Victoire");
    const isDefeat = label.includes("Défaite");
    const heroId = gameState.player?.heroId;
    const deckId = progress.activeDeckId;

    progress.stats.totalMatches += 1;

    if (heroId) {
      if (!progress.stats.heroRecords[heroId]) progress.stats.heroRecords[heroId] = { wins: 0, losses: 0 };
    }
    if (deckId) {
      if (!progress.stats.deckStats[deckId]) progress.stats.deckStats[deckId] = { matches: 0, wins: 0 };
      progress.stats.deckStats[deckId].matches += 1;
    }

    if (isVictory) {
      progress.stats.totalWins += 1;
      if (heroId) progress.stats.heroRecords[heroId].wins += 1;
      if (deckId) progress.stats.deckStats[deckId].wins += 1;
    } else if (isDefeat) {
      progress.stats.totalLosses += 1;
      if (heroId) progress.stats.heroRecords[heroId].losses += 1;
    } else {
      progress.stats.totalDraws += 1;
    }

    if (progress.league) {
      progress.stats.bestLeagueTier = Math.max(progress.stats.bestLeagueTier || 0, progress.league.tier || 0);
    }

    originalSaveProgress?.();
  }

  function bestLeagueRankLabel() {
    const tier = Math.max(0, Math.min(LEAGUES.length - 1, progress?.stats?.bestLeagueTier || 0));
    const hasPlayed = Boolean(progress?.league && (progress.league.wins || progress.league.losses || progress.stats.bestLeagueTier));
    return hasPlayed ? LEAGUES[tier] : "Aucun combat League";
  }

  function findFavoriteDeck() {
    const entries = Object.entries(progress?.stats?.deckStats || {});
    if (!entries.length) return null;
    entries.sort((a, b) => (b[1].matches - a[1].matches) || (b[1].wins - a[1].wins));
    const [deckId, stats] = entries[0];
    const deck = progress.decks?.find(d => d.id === deckId);
    return { name: deck?.name || "Deck supprimé", matches: stats.matches, wins: stats.wins };
  }

  function renderStats() {
    if (!progress?.stats || !dom.statsSummaryGrid) return;

    const stats = progress.stats;
    const ownedCards = typeof getOwnedCardTotal === "function" ? getOwnedCardTotal() : 0;

    const tiles = [
      { label: "Victoires totales", value: stats.totalWins },
      { label: "Combats joués", value: stats.totalMatches },
      { label: "Défaites", value: stats.totalLosses },
      { label: "Cartes possédées", value: ownedCards },
      { label: "Paquets ouverts", value: stats.packsOpened },
      { label: "Pièces actuelles", value: progress.coins },
      { label: "Meilleur rang League", value: bestLeagueRankLabel() }
    ];
    dom.statsSummaryGrid.innerHTML = tiles.map(t => `<div class="stats-stat-tile"><span>${escapeHtml(t.label)}</span><strong>${escapeHtml(String(t.value))}</strong></div>`).join("");

    if (dom.statsHeroList) {
      const heroIds = Object.keys(stats.heroRecords);
      if (!heroIds.length) {
        dom.statsHeroList.innerHTML = '<p class="stats-hero-empty">Aucun combat joué pour le moment.</p>';
      } else {
        dom.statsHeroList.innerHTML = heroIds.map(heroId => {
          const hero = getHeroDefinition(heroId);
          const record = stats.heroRecords[heroId];
          return `<div class="stats-hero-row"><img src="${hero.portrait}" alt="${escapeHtml(hero.name)}"><span class="stats-hero-name">${escapeHtml(hero.name)}</span><span class="stats-hero-record"><b>${record.wins} victoire${record.wins > 1 ? "s" : ""}</b><em>${record.losses} défaite${record.losses > 1 ? "s" : ""}</em></span></div>`;
        }).join("");
      }
    }

    if (dom.statsFavoriteDeck) {
      const favorite = findFavoriteDeck();
      dom.statsFavoriteDeck.innerHTML = favorite
        ? `<span>Deck le plus joué</span><strong>${escapeHtml(favorite.name)} · ${favorite.matches} combat${favorite.matches > 1 ? "s" : ""} (${favorite.wins} victoire${favorite.wins > 1 ? "s" : ""})</strong>`
        : `<span>Deck le plus joué</span><strong>Aucun combat joué pour le moment</strong>`;
    }
  }
})();