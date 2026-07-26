/*
  Chroniques d'Astréa V44 — Modes de combat
  - Bras de fer : 10 PV.
  - Sans Répis : 20 cristaux chaque tour, sans progression des quêtes de dépense de mana.
  - Furie des decks : deux decks aléatoires uniques à chaque partie.
  - Le Tavernier : phases d'achat de 20 secondes et combats automatiques de serviteurs.
*/
(() => {
  "use strict";

  const MODE_DEFINITIONS = Object.freeze({
    standard: { id: "standard", label: "Classique" },
    bras_de_fer: { id: "bras_de_fer", label: "Bras de fer" },
    sans_repis: { id: "sans_repis", label: "Sans Répis" },
    furie_decks: { id: "furie_decks", label: "Furie des decks" },
    tavernier: { id: "tavernier", label: "Le Tavernier" }
  });
  const VALID_MODES = new Set(Object.keys(MODE_DEFINITIONS));
  const RANDOM_DECK_HISTORY_KEY = "astrea_random_deck_history_v44";
  const TAVERN_SHOP_DURATION_MS = 20_000;
  const TAVERN_OFFER_COUNT = 5;
  const TAVERN_STARTING_COINS = 3;
  const TAVERN_MAX_ATTACKS = 100;

  let selectedPlatform = null;
  let phaseTimeout = null;
  let countdownInterval = null;
  let nextRoundTimeout = null;
  let combatRunning = false;
  let lastCountdownValue = null;

  const ui = {};

  function normalizeMode(value) {
    const id = String(value || "standard").trim();
    return VALID_MODES.has(id) ? id : "standard";
  }

  function getModeLabel(value) {
    return MODE_DEFINITIONS[normalizeMode(value)]?.label || MODE_DEFINITIONS.standard.label;
  }

  function isTavernierState(state = gameState) {
    return Boolean(state && state.battleMode === "tavernier");
  }

  function isAuthoritativeTavernier() {
    if (!isTavernierState()) return false;
    if (gameState.mode !== "pvp") return true;
    return window.ASTREA_PVP_BRIDGE?.getRole?.() === "host";
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function notify(message) {
    const container = document.getElementById("toast-container");
    if (!container) {
      console.info(`[Modes V44] ${message}`);
      return;
    }
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }

  /* ------------------------------------------------------------------
     Sous-menu des modes
     ------------------------------------------------------------------ */

  function cacheUi() {
    const ids = [
      "open-battle-modes-btn", "battle-modes-modal", "battle-modes-close-btn",
      "battle-modes-description", "battle-mode-platform-step", "battle-mode-rules-step",
      "battle-modes-back-btn", "battle-mode-platform-label", "tavernier-panel",
      "tavernier-mode-kicker", "tavernier-phase-label", "tavernier-round-label",
      "tavernier-timer-label", "tavernier-coins-label", "tavernier-status-label",
      "tavernier-offers"
    ];
    ids.forEach(id => { ui[toCamelLocal(id)] = document.getElementById(id); });
  }

  function toCamelLocal(value) {
    return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function bindUi() {
    ui.openBattleModesBtn?.addEventListener("click", openModesModal);
    ui.battleModesCloseBtn?.addEventListener("click", closeModesModal);
    ui.battleModesModal?.addEventListener("click", event => {
      if (event.target === ui.battleModesModal) closeModesModal();
    });
    ui.battleModesBackBtn?.addEventListener("click", showPlatformStep);
    document.querySelectorAll("[data-battle-platform]").forEach(button => {
      button.addEventListener("click", () => showRulesStep(button.dataset.battlePlatform));
    });
    document.querySelectorAll("[data-battle-mode]").forEach(button => {
      button.addEventListener("click", () => launchSelectedMode(button.dataset.battleMode));
    });
  }

  function openModesModal() {
    showPlatformStep();
    ui.battleModesModal?.classList.remove("hidden");
  }

  function closeModesModal() {
    ui.battleModesModal?.classList.add("hidden");
  }

  function showPlatformStep() {
    selectedPlatform = null;
    ui.battleModePlatformStep?.classList.remove("hidden");
    ui.battleModeRulesStep?.classList.add("hidden");
    ui.battleModesBackBtn?.classList.add("hidden");
    if (ui.battleModesDescription) ui.battleModesDescription.textContent = "Commencez par choisir entre une partie solo et un combat multijoueur.";
    if (ui.battleModePlatformLabel) ui.battleModePlatformLabel.textContent = "Aucun type de partie sélectionné";
  }

  function showRulesStep(platform) {
    selectedPlatform = platform === "multiplayer" ? "multiplayer" : "solo";
    ui.battleModePlatformStep?.classList.add("hidden");
    ui.battleModeRulesStep?.classList.remove("hidden");
    ui.battleModesBackBtn?.classList.remove("hidden");
    const label = selectedPlatform === "multiplayer" ? "Multijoueur" : "Solo";
    if (ui.battleModesDescription) ui.battleModesDescription.textContent = `Choisissez maintenant le mode de votre partie ${label.toLowerCase()}.`;
    if (ui.battleModePlatformLabel) ui.battleModePlatformLabel.textContent = `Type sélectionné : ${label}`;
  }

  function launchSelectedMode(requestedMode) {
    const mode = normalizeMode(requestedMode);
    if (mode === "standard" || !selectedPlatform) return;
    closeModesModal();
    if (selectedPlatform === "multiplayer") {
      window.ASTREA_PENDING_BATTLE_MODE = mode;
      if (window.ASTREA_PVP_BRIDGE?.openMultiplayerFlow) {
        window.ASTREA_PVP_BRIDGE.openMultiplayerFlow();
      } else {
        notify("Le service multijoueur n'est pas encore prêt.");
      }
      return;
    }
    startSoloMode(mode);
  }

  /* ------------------------------------------------------------------
     Modes utilisant le moteur de cartes classique
     ------------------------------------------------------------------ */

  function configureNormalBattleState(state, requestedMode) {
    if (!state) return state;
    const mode = normalizeMode(requestedMode);
    state.battleMode = mode;
    if (mode === "bras_de_fer") {
      for (const ownerId of ["player", "ai"]) {
        state[ownerId].hero.maxHealth = 10;
        state[ownerId].hero.currentHealth = 10;
        state[ownerId].hero.armor = 0;
      }
    }
    if (mode === "sans_repis") {
      for (const ownerId of ["player", "ai"]) {
        state[ownerId].mana.maximum = 20;
        state[ownerId].mana.current = 20;
      }
    }
    return state;
  }

  function showGameScreen() {
    document.querySelectorAll(".screen").forEach(screen => screen.classList.add("hidden"));
    dom.gameScreen?.classList.remove("hidden");
    dom.gameOverModal?.classList.add("hidden");
    dom.choiceModal?.classList.add("hidden");
    ui.battleModesModal?.classList.add("hidden");
    if (dom.gameOverMenuBtn) dom.gameOverMenuBtn.textContent = "Menu";
  }

  function startSoloMode(requestedMode) {
    const mode = normalizeMode(requestedMode);
    clearTavernTimers();
    leaveTavernierVisualMode();
    if (mode === "tavernier") {
      startSoloTavernier();
      return;
    }
    if (mode === "furie_decks") {
      startRandomDeckSoloBattle();
      return;
    }
    startBattle({ mode: "standard" });
    if (!gameState || gameState.status !== "playing") return;
    configureNormalBattleState(gameState, mode);
    addLog(`Mode ${getModeLabel(mode)} activé.`);
    renderGame();
  }

  function readDeckHistory() {
    try {
      const parsed = JSON.parse(storageGet(RANDOM_DECK_HISTORY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean).slice(-500) : [];
    } catch (_) {
      return [];
    }
  }

  function writeDeckHistory(history) {
    try { storageSet(RANDOM_DECK_HISTORY_KEY, JSON.stringify(history.slice(-500))); } catch (_) { /* facultatif */ }
  }

  function deckFingerprint(deck) {
    return [...deck].sort().join("|");
  }

  function generateRandomDeckComposition() {
    const pool = COLLECTIBLE_CARDS.filter(card => card.collectible !== false && card.type !== "token");
    const deck = [];
    const counts = {};
    let safety = 0;
    while (deck.length < CONFIG.DECK_SIZE && safety < 4000) {
      safety += 1;
      const card = randomItem(pool);
      if (!card) break;
      const limit = card.rarity === "legendary" ? 1 : 2;
      if ((counts[card.id] || 0) >= limit) continue;
      deck.push(card.id);
      counts[card.id] = (counts[card.id] || 0) + 1;
    }
    if (deck.length < CONFIG.DECK_SIZE) {
      shuffle([...pool]).forEach(card => {
        if (deck.length >= CONFIG.DECK_SIZE) return;
        const limit = card.rarity === "legendary" ? 1 : 2;
        if ((counts[card.id] || 0) >= limit) return;
        deck.push(card.id);
        counts[card.id] = (counts[card.id] || 0) + 1;
      });
    }
    return deck.slice(0, CONFIG.DECK_SIZE);
  }

  function buildUniqueRandomDeck(scope = "random", excludedDecks = []) {
    const history = readDeckHistory();
    const excluded = new Set([
      ...history,
      ...excludedDecks.filter(Array.isArray).map(deckFingerprint)
    ]);
    let candidate = [];
    let fingerprint = "";
    for (let attempt = 0; attempt < 120; attempt += 1) {
      candidate = generateRandomDeckComposition();
      fingerprint = deckFingerprint(candidate);
      if (candidate.length === CONFIG.DECK_SIZE && !excluded.has(fingerprint)) break;
    }
    if (!fingerprint) fingerprint = deckFingerprint(candidate);
    history.push(`${scope}:${fingerprint}`);
    // Conserve également la composition seule afin d'éviter une répétition entre deux sièges.
    history.push(fingerprint);
    writeDeckHistory(history);
    return candidate;
  }

  function startRandomDeckSoloBattle() {
    resetHeroDefeatVisuals();
    draggedPayload = null;
    const playerHeroDef = getHeroDefinition(progress.selectedHeroId);
    const aiHeroDef = pickAiHeroDefinition(playerHeroDef.id);
    const firstPlayerId = Math.random() < 0.5 ? "player" : "ai";
    const secondPlayerId = getOpponentId(firstPlayerId);
    const playerDeckList = buildUniqueRandomDeck("solo_player");
    const aiDeckList = buildUniqueRandomDeck("solo_ai", [playerDeckList]);
    interactionLocked = firstPlayerId === "ai";
    gameState = {
      status: "playing", mode: "standard", battleMode: "furie_decks", adventureId: null,
      turnNumber: 1, activePlayerId: firstPlayerId, firstPlayerId,
      pendingAction: null, combatLog: [], cardsPlayedTotal: 0,
      player: createPlayerState("player", playerHeroDef),
      ai: createPlayerState("ai", aiHeroDef)
    };
    gameState.player.deck = buildDeck(playerDeckList);
    gameState.ai.deck = buildDeck(aiDeckList);
    for (let i = 0; i < CONFIG.STARTING_HAND; i += 1) {
      drawCard("player", { silent: true });
      drawCard("ai", { silent: true });
    }
    addCardToHand(secondPlayerId, "token_004");
    gameState[firstPlayerId].mana = { current: 1, maximum: 1 };
    showGameScreen();
    addLog("Furie des decks : deux nouveaux decks aléatoires ont été créés pour cette partie.");
    addLog(firstPlayerId === "player" ? "Vous jouez en premier." : `${gameState.ai.name} joue en premier. Vous recevez La pièce.`);
    renderGame();
    if (firstPlayerId === "ai") {
      window.setTimeout(async () => {
        if (gameState?.status === "playing" && gameState.activePlayerId === "ai") await playAiTurn();
      }, CONFIG.AI_ACTION_DELAY);
    }
  }

  /* ------------------------------------------------------------------
     Le Tavernier
     ------------------------------------------------------------------ */

  function getTavernMinionPool(round = 1) {
    const all = COLLECTIBLE_CARDS.filter(card => isMinionCardDefinition(card) && card.collectible !== false && card.type !== "token" && Number(card.attack) >= 0 && Number(card.health) > 0 && card.disabled !== true);
    const softMaximum = Math.min(10, 2 + Math.floor(Math.max(1, round) / 2));
    const accessible = all.filter(card => Number(card.cost || 0) <= softMaximum);
    return accessible.length >= TAVERN_OFFER_COUNT ? accessible : all;
  }

  function calculateTavernPrice(card) {
    if (!card) return 1;
    const keywordValue = (card.keywords || []).reduce((sum, keyword) => {
      const normalized = normalizeText(keyword);
      if (normalized === "taunt") return sum + 1.1;
      if (normalized === "divineshield") return sum + 1.7;
      if (normalized === "windfury") return sum + 1.8;
      if (normalized === "lifesteal") return sum + 1.5;
      return sum + 0.35;
    }, 0);
    const rarityValue = { common: 0, rare: 0.7, epic: 1.4, legendary: 2.2 }[card.rarity] || 0;
    const effectValue = Math.min(2.5, (card.effects || []).length * 0.45);
    const raw = ((Number(card.attack || 0) + Number(card.health || 0)) / 3.15) + (Number(card.cost || 0) / 5) + keywordValue + rarityValue + effectValue;
    return Math.max(1, Math.min(8, Math.round(raw)));
  }

  function buildTavernOffers(ownerId) {
    const round = Number(gameState?.tavern?.round || 1);
    const pool = getTavernMinionPool(round);
    const offers = [];
    const used = new Set();
    let guard = 0;
    while (offers.length < TAVERN_OFFER_COUNT && guard++ < 300) {
      const card = randomItem(pool);
      if (!card || used.has(card.id)) continue;
      used.add(card.id);
      offers.push({ offerId: generateId("offer"), cardId: card.id, price: calculateTavernPrice(card) });
    }
    // Au premier tour, garantit au moins une option achetable avec les 3 pièces initiales.
    if (round === 1 && !offers.some(offer => offer.price <= TAVERN_STARTING_COINS)) {
      const affordable = pool.filter(card => calculateTavernPrice(card) <= TAVERN_STARTING_COINS);
      const card = randomItem(affordable);
      if (card) offers[0] = { offerId: generateId("offer"), cardId: card.id, price: calculateTavernPrice(card) };
    }
    gameState[ownerId].tavernOffers = offers;
    return offers;
  }

  function createTavernRosterMinion(card, ownerId, price) {
    const minion = createMinionInstance(card, ownerId);
    minion.canAttack = false;
    minion.hasAttacked = false;
    minion.summonedThisTurn = false;
    minion.tavernUpgradeLevel = 0;
    minion.tavernPurchasePrice = price;
    minion.tavernPower = Math.max(1, price);
    return minion;
  }

  function initializeTavernParticipant(ownerId) {
    const participant = gameState[ownerId];
    participant.deck = [];
    participant.hand = [];
    participant.secrets = [];
    participant.quests = [];
    participant.graveyard = [];
    participant.mana = { current: 0, maximum: 0 };
    participant.tavernCoins = TAVERN_STARTING_COINS;
    participant.tavernOffers = [];
    participant.tavernRoster = [];
    participant.board = participant.tavernRoster;
  }

  function createTavernGameState({ pvp = false, opponent = null, hostUsername = null } = {}) {
    const playerHeroDef = getHeroDefinition(progress.selectedHeroId);
    const aiHeroDef = pvp ? getHeroDefinition(opponent?.heroId) : pickAiHeroDefinition(playerHeroDef.id);
    const state = {
      status: "playing",
      mode: pvp ? "pvp" : "tavernier",
      battleMode: "tavernier",
      adventureId: null,
      turnNumber: 1,
      activePlayerId: "player",
      firstPlayerId: "player",
      pendingAction: null,
      combatLog: [],
      cardsPlayedTotal: 0,
      tavern: {
        round: 1,
        phase: "shop",
        phaseEndsAt: 0,
        shopDurationMs: TAVERN_SHOP_DURATION_MS,
        lastRoundResult: null
      },
      player: createPlayerState("player", playerHeroDef),
      ai: createPlayerState("ai", aiHeroDef)
    };
    if (pvp) {
      state.player.name = hostUsername || state.player.name;
      state.ai.name = opponent?.username || state.ai.name;
    }
    return state;
  }

  function startSoloTavernier() {
    resetHeroDefeatVisuals();
    draggedPayload = null;
    interactionLocked = false;
    gameState = createTavernGameState();
    initializeTavernParticipant("player");
    initializeTavernParticipant("ai");
    showGameScreen();
    addLog("Le Tavernier ouvre ses portes. Vous commencez avec 3 pièces.");
    startTavernShopRound({ initial: true });
  }

  function startPvpTavernierHost({ opponent, hostUsername, showGameScreen: showPvpGameScreen } = {}) {
    resetHeroDefeatVisuals();
    draggedPayload = null;
    interactionLocked = false;
    gameState = createTavernGameState({ pvp: true, opponent, hostUsername });
    initializeTavernParticipant("player");
    initializeTavernParticipant("ai");
    if (typeof showPvpGameScreen === "function") showPvpGameScreen();
    else showGameScreen();
    addLog(`Le Tavernier : affrontement contre ${gameState.ai.name}. Chaque joueur commence avec 3 pièces.`);
    startTavernShopRound({ initial: true });
  }

  function restoreRosterBoards() {
    for (const ownerId of ["player", "ai"]) {
      const participant = gameState[ownerId];
      participant.tavernRoster = Array.isArray(participant.tavernRoster) ? participant.tavernRoster : [];
      participant.tavernRoster.forEach(minion => {
        minion.ownerId = ownerId;
        minion.currentHealth = minion.maxHealth;
        minion.divineShieldActive = (minion.keywords || []).includes("divineShield");
        minion.hasAttacked = false;
        minion.canAttack = false;
      });
      participant.board = participant.tavernRoster;
    }
  }

  function startTavernShopRound({ initial = false } = {}) {
    if (!isTavernierState() || gameState.status !== "playing" || !isAuthoritativeTavernier()) return;
    clearTavernPhaseTimersOnly();
    combatRunning = false;
    restoreRosterBoards();
    gameState.activePlayerId = "player";
    gameState.pendingAction = null;
    gameState.tavern.phase = "shop";
    gameState.tavern.phaseEndsAt = Date.now() + TAVERN_SHOP_DURATION_MS;
    gameState.tavern.lastRoundResult = initial ? null : gameState.tavern.lastRoundResult;
    buildTavernOffers("player");
    buildTavernOffers("ai");
    if (gameState.mode === "tavernier") {
      window.setTimeout(runSoloAiShopping, 220);
    }
    scheduleTavernCombatStart();
    ensureCountdownInterval();
    renderGame();
  }

  function scheduleTavernCombatStart() {
    if (!isAuthoritativeTavernier() || gameState?.tavern?.phase !== "shop") return;
    window.clearTimeout(phaseTimeout);
    const delay = Math.max(0, Number(gameState.tavern.phaseEndsAt || 0) - Date.now());
    phaseTimeout = window.setTimeout(() => beginTavernCombat(), delay + 25);
  }

  function clearTavernPhaseTimersOnly() {
    window.clearTimeout(phaseTimeout);
    window.clearTimeout(nextRoundTimeout);
    phaseTimeout = null;
    nextRoundTimeout = null;
  }

  function clearTavernTimers() {
    clearTavernPhaseTimersOnly();
    window.clearInterval(countdownInterval);
    countdownInterval = null;
    lastCountdownValue = null;
    combatRunning = false;
  }

  function ensureCountdownInterval() {
    if (countdownInterval) return;
    countdownInterval = window.setInterval(() => {
      if (!isTavernierState() || gameState.status !== "playing") {
        if (!isTavernierState()) clearTavernTimers();
        return;
      }
      updateTavernCountdownLabel();
      if (isAuthoritativeTavernier() && gameState.tavern.phase === "shop" && Date.now() >= Number(gameState.tavern.phaseEndsAt || 0) && !combatRunning) {
        beginTavernCombat();
      }
    }, 200);
  }

  function updateTavernCountdownLabel() {
    if (!ui.tavernierTimerLabel || !gameState?.tavern) return;
    const seconds = gameState.tavern.phase === "shop"
      ? Math.max(0, Math.ceil((Number(gameState.tavern.phaseEndsAt || 0) - Date.now()) / 1000))
      : 0;
    if (seconds === lastCountdownValue) return;
    lastCountdownValue = seconds;
    ui.tavernierTimerLabel.textContent = gameState.tavern.phase === "shop" ? String(seconds) : "⚔";
    ui.tavernierTimerLabel.classList.toggle("urgent", seconds <= 5 && gameState.tavern.phase === "shop");
  }

  function applyTavernBuy(ownerId, offerId, { shouldRender = true } = {}) {
    if (!isTavernierState() || gameState.status !== "playing" || gameState.tavern.phase !== "shop") return false;
    const participant = gameState[ownerId];
    const offers = participant?.tavernOffers || [];
    const index = offers.findIndex(offer => offer.offerId === offerId);
    if (index < 0 || participant.tavernRoster.length >= CONFIG.MAX_BOARD) return false;
    const offer = offers[index];
    if (participant.tavernCoins < offer.price) return false;
    const card = CARD_BY_ID[offer.cardId];
    if (!card || !isMinionCardDefinition(card)) return false;
    participant.tavernCoins -= offer.price;
    const minion = createTavernRosterMinion(card, ownerId, offer.price);
    participant.tavernRoster.push(minion);
    participant.board = participant.tavernRoster;
    offers.splice(index, 1);
    addLog(`${participant.name} achète ${card.name} pour ${offer.price} pièce(s).`);
    if (shouldRender) renderGame();
    return true;
  }

  function getTavernUpgradeCost(minion) {
    return Math.min(8, 2 + (Number(minion?.tavernUpgradeLevel || 0) * 2));
  }

  function applyTavernUpgrade(ownerId, instanceId, { shouldRender = true } = {}) {
    if (!isTavernierState() || gameState.status !== "playing" || gameState.tavern.phase !== "shop") return false;
    const participant = gameState[ownerId];
    const minion = participant?.tavernRoster?.find(item => item.instanceId === instanceId);
    if (!minion) return false;
    const cost = getTavernUpgradeCost(minion);
    if (participant.tavernCoins < cost) return false;
    participant.tavernCoins -= cost;
    minion.tavernUpgradeLevel = Number(minion.tavernUpgradeLevel || 0) + 1;
    minion.baseAttack += 1;
    minion.attack += 1;
    minion.baseHealth += 1;
    minion.maxHealth += 1;
    minion.currentHealth += 1;
    minion.tavernPower = Number(minion.tavernPower || 1) + 1;
    addLog(`${participant.name} améliore ${minion.name} : +1/+1.`);
    if (shouldRender) renderGame();
    return true;
  }

  function buyOfferFromUi(offerId) {
    if (window.ASTREA_PVP_BRIDGE?.getRole?.() === "guest" && gameState?.mode === "pvp") {
      window.ASTREA_PVP_BRIDGE.sendAction?.({ kind: "tavernBuy", offerId });
      if (ui.tavernierStatusLabel) ui.tavernierStatusLabel.textContent = "Achat envoyé au Tavernier…";
      return;
    }
    applyTavernBuy("player", offerId);
  }

  function upgradeMinionFromUi(instanceId) {
    if (window.ASTREA_PVP_BRIDGE?.getRole?.() === "guest" && gameState?.mode === "pvp") {
      window.ASTREA_PVP_BRIDGE.sendAction?.({ kind: "tavernUpgrade", instanceId });
      if (ui.tavernierStatusLabel) ui.tavernierStatusLabel.textContent = "Amélioration envoyée au Tavernier…";
      return;
    }
    applyTavernUpgrade("player", instanceId);
  }

  function runSoloAiShopping() {
    if (!isTavernierState() || gameState.mode !== "tavernier" || gameState.tavern.phase !== "shop") return;
    const ai = gameState.ai;
    let guard = 0;
    while (guard++ < 25) {
      const affordableOffers = (ai.tavernOffers || [])
        .filter(offer => offer.price <= ai.tavernCoins && ai.tavernRoster.length < CONFIG.MAX_BOARD)
        .map(offer => ({ offer, card: CARD_BY_ID[offer.cardId] }))
        .sort((a, b) => {
          const aValue = ((a.card?.attack || 0) + (a.card?.health || 0)) / Math.max(1, a.offer.price);
          const bValue = ((b.card?.attack || 0) + (b.card?.health || 0)) / Math.max(1, b.offer.price);
          return bValue - aValue;
        });
      if (affordableOffers.length) {
        applyTavernBuy("ai", affordableOffers[0].offer.offerId, { shouldRender: false });
        continue;
      }
      const affordableUpgrades = ai.tavernRoster
        .map(minion => ({ minion, cost: getTavernUpgradeCost(minion) }))
        .filter(entry => entry.cost <= ai.tavernCoins)
        .sort((a, b) => (b.minion.attack + b.minion.maxHealth) - (a.minion.attack + a.minion.maxHealth));
      if (affordableUpgrades.length) {
        applyTavernUpgrade("ai", affordableUpgrades[0].minion.instanceId, { shouldRender: false });
        continue;
      }
      break;
    }
    renderGame();
  }

  function cloneRosterForCombat(ownerId) {
    return (gameState[ownerId].tavernRoster || []).map(minion => {
      const clone = deepClone(minion);
      clone.ownerId = ownerId;
      clone.currentHealth = clone.maxHealth;
      clone.divineShieldActive = (clone.keywords || []).includes("divineShield");
      clone.canAttack = true;
      clone.hasAttacked = false;
      clone.summonedThisTurn = false;
      return clone;
    });
  }

  function chooseTavernTarget(ownerId) {
    const opponentId = getOpponentId(ownerId);
    const candidates = gameState[opponentId].board.filter(minion => minion.currentHealth > 0);
    if (!candidates.length) return null;
    const taunts = candidates.filter(minion => (minion.keywords || []).includes("taunt"));
    return randomItem(taunts.length ? taunts : candidates);
  }

  function chooseTavernAttacker(ownerId) {
    const attackers = gameState[ownerId].board.filter(minion => minion.currentHealth > 0 && Number(minion.attack || 0) > 0);
    return randomItem(attackers);
  }

  function applyTavernMinionDamage(minion, amount) {
    if (!minion || amount <= 0) return 0;
    if (minion.divineShieldActive) {
      minion.divineShieldActive = false;
      addLog(`Le Bouclier divin de ${minion.name} absorbe les dégâts.`);
      return 0;
    }
    const before = Math.max(0, minion.currentHealth);
    minion.currentHealth -= amount;
    return Math.min(before, amount);
  }

  function removeTavernCombatDeaths() {
    for (const ownerId of ["player", "ai"]) {
      const survivors = [];
      for (const minion of gameState[ownerId].board) {
        if (minion.currentHealth > 0) survivors.push(minion);
        else addLog(`${minion.name} tombe pendant le combat automatique.`);
      }
      gameState[ownerId].board = survivors;
    }
  }

  function calculateTavernHeroDamage(ownerId) {
    const survivors = gameState[ownerId].board || [];
    const total = survivors.reduce((sum, minion) => {
      const card = CARD_BY_ID[minion.cardId];
      return sum + Math.max(1, Math.ceil(Number(card?.cost || minion.tavernPower || 1) / 3));
    }, 1);
    return Math.max(1, Math.min(15, total));
  }

  async function beginTavernCombat() {
    if (!isAuthoritativeTavernier() || !isTavernierState() || gameState.status !== "playing" || gameState.tavern.phase !== "shop" || combatRunning) return;
    combatRunning = true;
    clearTavernPhaseTimersOnly();
    gameState.tavern.phase = "combat";
    gameState.tavern.phaseEndsAt = 0;
    gameState.player.board = cloneRosterForCombat("player");
    gameState.ai.board = cloneRosterForCombat("ai");
    gameState.activePlayerId = Math.random() < 0.5 ? "player" : "ai";
    addLog(`Manche ${gameState.tavern.round} : le combat automatique commence.`);
    renderGame();
    await sleep(650);

    let attackingOwner = gameState.activePlayerId;
    let attackCount = 0;
    while (isTavernierState() && gameState.status === "playing" && gameState.player.board.length && gameState.ai.board.length && attackCount++ < TAVERN_MAX_ATTACKS) {
      let attacker = chooseTavernAttacker(attackingOwner);
      if (!attacker) {
        const otherId = getOpponentId(attackingOwner);
        if (!chooseTavernAttacker(otherId)) break;
        attackingOwner = otherId;
        attacker = chooseTavernAttacker(attackingOwner);
      }
      const target = chooseTavernTarget(attackingOwner);
      if (!attacker || !target) break;
      gameState.activePlayerId = attackingOwner;
      const swings = (attacker.keywords || []).includes("windfury") ? 2 : 1;
      for (let swing = 0; swing < swings; swing += 1) {
        const liveAttacker = gameState[attackingOwner].board.find(minion => minion.instanceId === attacker.instanceId);
        const liveTarget = gameState[getOpponentId(attackingOwner)].board.find(minion => minion.instanceId === target.instanceId) || chooseTavernTarget(attackingOwner);
        if (!liveAttacker || !liveTarget || liveAttacker.currentHealth <= 0 || liveTarget.currentHealth <= 0) break;
        await animateCombat(
          { kind: "minion", ownerId: attackingOwner, instanceId: liveAttacker.instanceId },
          { kind: "minion", ownerId: liveTarget.ownerId, instanceId: liveTarget.instanceId }
        );
        const attackDamage = Number(liveAttacker.attack || 0);
        const retaliation = Number(liveTarget.attack || 0);
        const damageDone = applyTavernMinionDamage(liveTarget, attackDamage);
        applyTavernMinionDamage(liveAttacker, retaliation);
        if ((liveAttacker.keywords || []).includes("lifesteal") && damageDone > 0) {
          const hero = gameState[attackingOwner].hero;
          hero.currentHealth = Math.min(hero.maxHealth, hero.currentHealth + damageDone);
        }
        addLog(`${liveAttacker.name} attaque automatiquement ${liveTarget.name} (${attackDamage} ↔ ${retaliation}).`);
        removeTavernCombatDeaths();
        renderGame();
        await sleep(380);
        if (!gameState.player.board.length || !gameState.ai.board.length) break;
      }
      attackingOwner = getOpponentId(attackingOwner);
    }

    if (!isTavernierState() || gameState.status !== "playing") {
      combatRunning = false;
      return;
    }

    const playerAlive = gameState.player.board.length > 0;
    const aiAlive = gameState.ai.board.length > 0;
    let resultText = "Égalité de la manche.";
    if (playerAlive && !aiAlive) {
      const damage = calculateTavernHeroDamage("player");
      gameState.ai.hero.currentHealth -= damage;
      gameState.player.tavernCoins += 3;
      gameState.ai.tavernCoins += 1;
      resultText = `${gameState.player.name} remporte la manche, gagne 3 pièces et inflige ${damage} dégât(s).`;
    } else if (aiAlive && !playerAlive) {
      const damage = calculateTavernHeroDamage("ai");
      gameState.player.hero.currentHealth -= damage;
      gameState.ai.tavernCoins += 3;
      gameState.player.tavernCoins += 1;
      resultText = `${gameState.ai.name} remporte la manche, gagne 3 pièces et inflige ${damage} dégât(s).`;
    } else {
      gameState.player.tavernCoins += 2;
      gameState.ai.tavernCoins += 2;
      resultText = "La manche se termine sur une égalité : chaque joueur gagne 2 pièces.";
    }
    gameState.tavern.lastRoundResult = resultText;
    addLog(resultText);
    gameState.turnNumber += 1;
    renderGame();
    combatRunning = false;
    if (checkGameOver()) return;

    gameState.tavern.round += 1;
    nextRoundTimeout = window.setTimeout(() => startTavernShopRound(), 1700);
  }

  function applyPvpGuestAction(action) {
    if (!isTavernierState() || gameState.mode !== "pvp") return false;
    if (action?.kind === "tavernBuy") {
      applyTavernBuy("ai", action.offerId);
      return true;
    }
    if (action?.kind === "tavernUpgrade") {
      applyTavernUpgrade("ai", action.instanceId);
      return true;
    }
    // En mode Tavernier, aucune action du moteur classique ne doit être appliquée.
    return Boolean(action?.kind && ["playCard", "attack", "endTurn", "heroPowerArmor", "heroPowerDamage", "heroPowerV43"].includes(action.kind));
  }

  function onPvpStateReceived(state) {
    if (state?.battleMode !== "tavernier") return;
    ensureCountdownInterval();
  }

  /* ------------------------------------------------------------------
     Rendu Tavernier
     ------------------------------------------------------------------ */

  function ensureModeBadge() {
    let badge = document.getElementById("active-battle-mode-badge");
    if (badge) return badge;
    badge = document.createElement("span");
    badge.id = "active-battle-mode-badge";
    badge.className = "active-battle-mode-badge hidden";
    dom.turnIndicator?.insertAdjacentElement("afterend", badge);
    return badge;
  }

  function updateModeBadge() {
    const badge = ensureModeBadge();
    const mode = normalizeMode(gameState?.battleMode || "standard");
    badge.textContent = getModeLabel(mode);
    badge.classList.toggle("hidden", mode === "standard");
  }

  function enterTavernierVisualMode() {
    dom.gameScreen?.classList.add("tavernier-active");
    ui.tavernierPanel?.classList.remove("hidden");
  }

  function leaveTavernierVisualMode() {
    dom.gameScreen?.classList.remove("tavernier-active");
    ui.tavernierPanel?.classList.add("hidden");
  }

  function renderTavernHero(ownerId) {
    const participant = gameState[ownerId];
    const hero = participant.hero;
    const heroDefinition = participant.heroDefinition || getHeroDefinition(participant.heroId);
    const heroElement = dom[`${ownerId}Hero`];
    dom[`${ownerId}Health`].textContent = hero.currentHealth;
    dom[`${ownerId}Armor`].textContent = hero.armor || 0;
    dom[`${ownerId}Armor`].classList.toggle("hidden", !hero.armor);
    dom[`${ownerId}DeckCount`].textContent = `Pièces : ${participant.tavernCoins || 0}`;
    dom[`${ownerId}Mana`].textContent = `${participant.tavernCoins || 0} pièce(s)`;
    if (dom[`${ownerId}HeroName`]) dom[`${ownerId}HeroName`].textContent = participant.name;
    if (dom[`${ownerId}HeroAvatarImg`]) {
      dom[`${ownerId}HeroAvatarImg`].src = heroDefinition.portrait;
      dom[`${ownerId}HeroAvatarImg`].alt = participant.name;
    }
    if (heroElement) {
      heroElement.classList.remove("ready", "valid-target", "selected-attacker");
      heroElement.draggable = false;
      heroElement.ondragstart = null;
    }
    const weapon = dom[`${ownerId}Weapon`];
    const location = dom[`${ownerId}Location`];
    if (weapon) { weapon.className = "weapon-slot empty"; weapon.innerHTML = ""; }
    if (location) { location.className = "location-slot empty"; location.innerHTML = ""; }
  }

  function createTavernMinionElement(minion, ownerId) {
    const card = CARD_BY_ID[minion.cardId];
    const article = document.createElement("article");
    article.className = `minion tavern-minion rarity-${card?.rarity || "common"}`;
    article.dataset.owner = ownerId;
    article.dataset.instanceId = minion.instanceId;
    if ((minion.keywords || []).includes("taunt")) article.classList.add("taunt");
    if (minion.divineShieldActive) article.classList.add("divine-shield");
    const upgradeLevel = Number(minion.tavernUpgradeLevel || 0);
    article.innerHTML = `
      <div class="minion-art">${card ? getCardArtMarkup(card) : "✧"}</div>
      ${upgradeLevel ? `<span class="tavern-upgrade-level">+${upgradeLevel}</span>` : ""}
      <div class="minion-name">${escapeHtml(minion.name)}</div>
      <div class="minion-stats"><span class="stat-orb attack-orb">${minion.attack}</span><span class="stat-orb minion-health">${minion.currentHealth}</span></div>`;
    if (card) {
      bindCardImageFallback(article, card);
      article.addEventListener("mouseenter", () => previewCard(card, minion));
    }
    const canUpgrade = gameState.tavern.phase === "shop" && ownerId === "player" && gameState.status === "playing";
    if (canUpgrade) {
      const cost = getTavernUpgradeCost(minion);
      const button = document.createElement("button");
      button.className = "tavern-upgrade-btn";
      button.type = "button";
      button.disabled = gameState.player.tavernCoins < cost;
      button.innerHTML = `<span>+1/+1</span><strong>${cost} <img src="assets/ui/coin.png" alt="pièces" /></strong>`;
      button.addEventListener("click", event => {
        event.stopPropagation();
        upgradeMinionFromUi(minion.instanceId);
      });
      article.appendChild(button);
    }
    return article;
  }

  function renderTavernBoards() {
    dom.playerBoard.innerHTML = "";
    dom.aiBoard.innerHTML = "";
    gameState.ai.board.forEach(minion => dom.aiBoard.appendChild(createTavernMinionElement(minion, "ai")));
    gameState.player.board.forEach(minion => dom.playerBoard.appendChild(createTavernMinionElement(minion, "player")));
    if (!gameState.ai.board.length) dom.aiBoard.innerHTML = '<div class="tavern-empty-board">Aucun serviteur adverse</div>';
    if (!gameState.player.board.length) dom.playerBoard.innerHTML = '<div class="tavern-empty-board">Achetez un serviteur pour commencer</div>';
  }

  function createTavernOfferElement(offer) {
    const card = CARD_BY_ID[offer.cardId];
    const article = document.createElement("article");
    const affordable = gameState.player.tavernCoins >= offer.price && gameState.player.tavernRoster.length < CONFIG.MAX_BOARD;
    article.className = `tavern-offer-card rarity-${card?.rarity || "common"}${affordable ? " affordable" : ""}`;
    article.innerHTML = `
      <div class="tavern-offer-price"><img src="assets/ui/coin.png" alt="Pièces" /><strong>${offer.price}</strong></div>
      <div class="tavern-offer-art">${card ? getCardArtMarkup(card) : "✧"}</div>
      <div class="tavern-offer-info"><strong>${escapeHtml(card?.name || "Serviteur")}</strong><small>${escapeHtml(card?.description || "")}</small></div>
      <div class="tavern-offer-stats"><span>${card?.attack || 0} ATQ</span><span>${card?.health || 0} PV</span></div>
      <button type="button" ${affordable ? "" : "disabled"}>${gameState.player.tavernRoster.length >= CONFIG.MAX_BOARD ? "Plateau plein" : affordable ? "Acheter" : "Pièces insuffisantes"}</button>`;
    if (card) {
      bindCardImageFallback(article, card);
      article.addEventListener("mouseenter", () => previewCard(card));
    }
    article.querySelector("button")?.addEventListener("click", () => buyOfferFromUi(offer.offerId));
    return article;
  }

  function renderTavernOffers() {
    if (!ui.tavernierOffers) return;
    ui.tavernierOffers.innerHTML = "";
    if (gameState.tavern.phase !== "shop") {
      ui.tavernierOffers.innerHTML = '<div class="tavern-combat-banner"><span>⚔</span><strong>Combat automatique en cours</strong><small>Les serviteurs choisissent leurs cibles et combattent jusqu’à la fin de la manche.</small></div>';
      return;
    }
    const offers = gameState.player.tavernOffers || [];
    offers.forEach(offer => ui.tavernierOffers.appendChild(createTavernOfferElement(offer)));
    if (!offers.length) ui.tavernierOffers.innerHTML = '<div class="tavern-combat-banner"><strong>La boutique est épuisée pour cette manche.</strong></div>';
  }

  function renderTavernier() {
    if (!gameState) return;
    enterTavernierVisualMode();
    updateModeBadge();
    ensureCountdownInterval();
    renderTavernHero("player");
    renderTavernHero("ai");
    renderTavernBoards();
    renderTavernOffers();
    renderLog();

    const phaseIsShop = gameState.tavern.phase === "shop";
    if (ui.tavernierPhaseLabel) ui.tavernierPhaseLabel.textContent = phaseIsShop ? "Phase d’achat" : "Combat automatique";
    if (ui.tavernierRoundLabel) ui.tavernierRoundLabel.textContent = String(gameState.tavern.round || 1);
    if (ui.tavernierCoinsLabel) ui.tavernierCoinsLabel.textContent = String(gameState.player.tavernCoins || 0);
    if (ui.tavernierStatusLabel) {
      ui.tavernierStatusLabel.textContent = phaseIsShop
        ? "Achetez des serviteurs et améliorez ceux de votre plateau avant la fin du compte à rebours."
        : (gameState.tavern.lastRoundResult || "Les serviteurs attaquent automatiquement.");
    }
    updateTavernCountdownLabel();

    dom.endTurnBtn.disabled = true;
    dom.turnIndicator.textContent = `Manche ${gameState.tavern.round || 1}`;
    dom.turnCount.textContent = String(gameState.tavern.round || 1);
    dom.statusMessage.textContent = gameState.status === "finished"
      ? "Partie terminée"
      : phaseIsShop ? "Le Tavernier est ouvert" : "Combat automatique";
    dom.aiHandCount.textContent = "0";
    dom.playerGraveCount.textContent = "0";
    dom.aiGraveCount.textContent = "0";
    dom.aiHand.innerHTML = "";
    if (dom.aiHandVisualCount) dom.aiHandVisualCount.textContent = "Aucune main";
    dom.playerHand.innerHTML = "";
    dom.playerSecrets.innerHTML = "";
    dom.aiSecrets.innerHTML = "";
    if (dom.playerHeroPower) dom.playerHeroPower.disabled = true;
    if (dom.aiHeroPower) dom.aiHeroPower.disabled = true;

    if (gameState.mode === "pvp" && window.ASTREA_PVP_BRIDGE?.getRole?.() === "host") {
      window.ASTREA_PVP_BRIDGE.broadcastState?.();
    }
  }

  /* ------------------------------------------------------------------
     Interceptions finales du moteur
     ------------------------------------------------------------------ */

  const previousRenderGame = renderGame;
  renderGame = function () {
    if (isTavernierState()) return renderTavernier();
    leaveTavernierVisualMode();
    const result = previousRenderGame.apply(this, arguments);
    updateModeBadge();
    return result;
  };

  const previousBeginTurn = beginTurn;
  beginTurn = function (playerId) {
    if (gameState?.battleMode === "sans_repis") {
      const oldCap = CONFIG.MAX_MANA;
      CONFIG.MAX_MANA = 20;
      try {
        const result = previousBeginTurn.apply(this, arguments);
        if (gameState?.[playerId]) {
          gameState[playerId].mana.maximum = 20;
          gameState[playerId].mana.current = 20;
        }
        return result;
      } finally {
        CONFIG.MAX_MANA = oldCap;
      }
    }
    return previousBeginTurn.apply(this, arguments);
  };

  const previousQuestProgress = updateDailyQuestProgress;
  updateDailyQuestProgress = function (event, amount = 1) {
    if (event === "spendMana" && gameState?.battleMode === "sans_repis") return;
    return previousQuestProgress.apply(this, arguments);
  };

  const previousEndPlayerTurn = endPlayerTurn;
  endPlayerTurn = async function () {
    if (isTavernierState()) return;
    return previousEndPlayerTurn.apply(this, arguments);
  };

  const previousUsePlayerHeroPower = usePlayerHeroPower;
  usePlayerHeroPower = function () {
    if (isTavernierState()) return;
    return previousUsePlayerHeroPower.apply(this, arguments);
  };

  const previousReplayCurrentBattle = replayCurrentBattle;
  replayCurrentBattle = function () {
    const mode = normalizeMode(gameState?.battleMode || "standard");
    if (gameState?.mode === "pvp") {
      clearTavernTimers();
      return showMainMenu();
    }
    if (mode !== "standard") return startSoloMode(mode);
    return previousReplayCurrentBattle.apply(this, arguments);
  };

  const previousLeaveCurrentBattle = leaveCurrentBattle;
  leaveCurrentBattle = function () {
    clearTavernTimers();
    leaveTavernierVisualMode();
    return previousLeaveCurrentBattle.apply(this, arguments);
  };

  const previousReturnAfterGameOver = returnAfterGameOver;
  returnAfterGameOver = function () {
    clearTavernTimers();
    leaveTavernierVisualMode();
    return previousReturnAfterGameOver.apply(this, arguments);
  };

  const previousShowMainMenu = showMainMenu;
  showMainMenu = function () {
    clearTavernTimers();
    leaveTavernierVisualMode();
    return previousShowMainMenu.apply(this, arguments);
  };

  window.ASTREA_BATTLE_MODES_V44 = {
    modes: MODE_DEFINITIONS,
    normalizeMode,
    getModeLabel,
    startSoloMode,
    configureNormalBattleState,
    buildUniqueRandomDeck,
    startPvpTavernierHost,
    applyPvpGuestAction,
    onPvpStateReceived,
    calculateTavernPrice
  };

  document.addEventListener("DOMContentLoaded", () => {
    cacheUi();
    bindUi();
    ensureModeBadge();
  });
})();
