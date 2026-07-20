/* Chroniques d'Astréa V26 — sons d'interface, de deck, de pioche, de quêtes et pouvoir héroïque */
(() => {
  const originalAddCardToDeck = addCardToDeck;
  const originalDrawCard = drawCard;
  const originalBeginTurn = beginTurn;
  const originalRenderGame = renderGame;
  const originalRenderHeroesAndCounters = renderHeroesAndCounters;
  const originalPlayCardFromHand = playCardFromHand;
  const originalOpenShop = openShop;
  const originalUpdateDailyQuestProgress = updateDailyQuestProgress;
  const originalUpdateQuestProgress = updateQuestProgress;
  const originalCompleteAdventureEncounter = completeAdventureEncounter;
  const originalRenderQuests = renderQuests;

  let beginTurnOwnerId = null;
  let lastTurnAlertGame = null;
  let lastTurnAlertKey = "";
  let heroPowerGame = null;
  let previousPlayerPowerUsed = null;
  let userHasInteracted = false;
  let pendingNewQuestTypes = [];
  let lastHoverButton = null;

  document.addEventListener("DOMContentLoaded", () => {
    migrateV26Progress();
    bindV26InterfaceSounds();
    applyHeroPowerVisualState(false);
    syncQuestCycleNotifications({ allowNotification: false });
  });

  addCardToDeck = function(cardId) {
    const beforeLength = Number(progress?.deck?.length || 0);
    const result = originalAddCardToDeck.apply(this, arguments);
    const afterLength = Number(progress?.deck?.length || 0);

    if (afterLength > beforeLength) {
      playSound("deckAdd", 0.78);
      if (afterLength >= Number(CONFIG?.DECK_SIZE || 30)) {
        window.setTimeout(() => playSound("deckFull", 0.92), 170);
      }
    } else if (beforeLength >= Number(CONFIG?.DECK_SIZE || 30)) {
      playSound("deckFull", 0.92);
    }
    return result;
  };

  drawCard = function(playerId, options = {}) {
    const player = gameState?.[playerId];
    const beforeHand = Number(player?.hand?.length || 0);
    const beforeGrave = Number(player?.graveyard?.length || 0);
    const result = originalDrawCard.apply(this, arguments);

    if (playerId === "player" && !options?.silent && player) {
      const afterHand = Number(player.hand?.length || 0);
      const afterGrave = Number(player.graveyard?.length || 0);
      if (afterGrave > beforeGrave && afterHand <= beforeHand) {
        playSound("cardDiscard", 0.9);
      } else if (afterHand > beforeHand) {
        const delay = beginTurnOwnerId === "player" ? 260 : 0;
        window.setTimeout(() => playSound("cardDraw", 0.78), delay);
      }
    }
    return result;
  };

  beginTurn = function(playerId) {
    beginTurnOwnerId = playerId;
    if (playerId === "player") announcePlayerTurn();
    try {
      return originalBeginTurn.apply(this, arguments);
    } finally {
      beginTurnOwnerId = null;
    }
  };

  renderGame = function() {
    const result = originalRenderGame.apply(this, arguments);
    if (gameState?.status === "playing" && gameState.activePlayerId === "player") {
      announcePlayerTurn();
    }
    return result;
  };

  renderHeroesAndCounters = function() {
    const result = originalRenderHeroesAndCounters.apply(this, arguments);
    applyHeroPowerVisualState(true);
    return result;
  };

  playCardFromHand = async function(playerId, handIndex, target = null) {
    const instance = gameState?.[playerId]?.hand?.[handIndex];
    const card = instance ? CARD_BY_ID?.[instance.cardId] : null;
    const result = await originalPlayCardFromHand.apply(this, arguments);
    if (result && card?.type === "creature" && (card.keywords || []).includes("taunt")) {
      window.setTimeout(() => playSound("tauntPlayed", 0.9), 120);
    }
    return result;
  };

  openShop = function() {
    const result = originalOpenShop.apply(this, arguments);
    window.setTimeout(() => playSound("shopOpen", 0.9), 70);
    return result;
  };

  updateDailyQuestProgress = function(event, amount = 1) {
    const before = captureQuestCompletionState();
    const result = originalUpdateDailyQuestProgress.apply(this, arguments);
    playQuestCompletionIfNeeded(before);
    return result;
  };

  updateQuestProgress = function(ownerId, event, amount = 1) {
    const beforeIds = ownerId === "player"
      ? new Set((gameState?.player?.quests || []).map(quest => quest.instanceId))
      : null;
    const result = originalUpdateQuestProgress.apply(this, arguments);
    if (beforeIds) {
      const afterIds = new Set((gameState?.player?.quests || []).map(quest => quest.instanceId));
      if ([...beforeIds].some(id => !afterIds.has(id))) playSound("questComplete", 0.92);
    }
    return result;
  };

  completeAdventureEncounter = function(encounterId) {
    const before = captureQuestCompletionState();
    const result = originalCompleteAdventureEncounter.apply(this, arguments);
    playQuestCompletionIfNeeded(before);
    return result;
  };

  renderQuests = function() {
    const result = originalRenderQuests.apply(this, arguments);
    syncQuestCycleNotifications({ allowNotification: true });
    return result;
  };

  function migrateV26Progress() {
    if (!progress) return;
    progress.audioQuestCycles = progress.audioQuestCycles || {};
    progress.version = Math.max(26, Number(progress.version || 0));
    saveProgress();
  }

  function bindV26InterfaceSounds() {
    const markInteraction = () => {
      userHasInteracted = true;
      flushPendingNewQuestNotification();
    };
    document.addEventListener("pointerdown", markInteraction, { once: true, capture: true });
    document.addEventListener("keydown", markInteraction, { once: true, capture: true });

    document.addEventListener("mouseover", event => {
      const button = event.target.closest("button");
      if (!button || button.disabled || !isMenuHoverButton(button)) return;
      if (event.relatedTarget && button.contains(event.relatedTarget)) return;
      if (lastHoverButton === button) return;
      lastHoverButton = button;
      playSound("menuHover", 0.45);
    }, true);

    document.addEventListener("mouseout", event => {
      const button = event.target.closest("button");
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return;
      if (lastHoverButton === button) lastHoverButton = null;
    }, true);

    document.addEventListener("pointerdown", event => {
      const cardButton = event.target.closest(".collection-card");
      if (!cardButton?.disabled) return;
      playSound("deckFull", 0.82);
    }, true);
  }

  function isMenuHoverButton(button) {
    if (button.closest("#game-screen")) {
      return button.id === "open-settings-game-btn" || button.id === "leave-game-btn";
    }
    return !button.matches(".collection-card, .deck-row, .pack-reward-card, .secret-token, .quest-token");
  }

  function announcePlayerTurn() {
    if (!gameState || gameState.status !== "playing" || gameState.activePlayerId !== "player") return;
    const key = `${gameState.turnNumber}:${gameState.firstPlayerId || ""}`;
    if (lastTurnAlertGame === gameState && lastTurnAlertKey === key) return;
    lastTurnAlertGame = gameState;
    lastTurnAlertKey = key;
    playSound("turnAlert", 0.95);
  }

  function applyHeroPowerVisualState(withSound) {
    const button = document.getElementById("player-hero-power");
    const used = Boolean(gameState?.player?.heroPower?.usedThisTurn);
    if (!button) return;

    if (heroPowerGame !== gameState) {
      heroPowerGame = gameState;
      previousPlayerPowerUsed = gameState ? used : null;
      button.classList.toggle("power-concealed", used);
      button.classList.remove("power-reactivating");
      return;
    }

    button.classList.toggle("power-concealed", used);
    if (previousPlayerPowerUsed !== null && previousPlayerPowerUsed !== used && withSound) {
      if (used) {
        button.classList.remove("power-reactivating");
        playSound("heroPowerFlip", 0.88);
      } else if (gameState?.status === "playing") {
        button.classList.add("power-reactivating");
        window.setTimeout(() => button.classList.remove("power-reactivating"), 700);
        window.setTimeout(() => playSound("heroPowerReady", 0.88), 120);
      }
    }
    previousPlayerPowerUsed = used;
  }

  function captureQuestCompletionState() {
    const state = new Map();
    getQuestGroups().forEach(group => {
      group.quests.forEach((quest, index) => {
        const key = `${group.type}:${quest?.id || index}`;
        state.set(key, Number(quest?.progress || 0) >= Number(quest?.goal || 0));
      });
    });
    return state;
  }

  function playQuestCompletionIfNeeded(beforeState) {
    const completedNow = getQuestGroups().some(group => group.quests.some((quest, index) => {
      const key = `${group.type}:${quest?.id || index}`;
      const wasComplete = beforeState?.get(key) || false;
      const isComplete = Number(quest?.progress || 0) >= Number(quest?.goal || 0);
      return !wasComplete && isComplete;
    }));
    if (completedNow) playSound("questComplete", 0.92);
  }

  function getQuestGroups() {
    return [
      { type: "daily", quests: progress?.dailyQuests?.quests || [] },
      { type: "monthly", quests: progress?.monthlyQuests?.quests || [] },
      { type: "seasonal", quests: progress?.seasonalQuests?.quests || [] }
    ];
  }

  function currentQuestCycles() {
    return {
      daily: progress?.dailyQuests?.date || "",
      monthly: progress?.monthlyQuests?.key || "",
      seasonal: progress?.seasonalQuests?.key || ""
    };
  }

  function syncQuestCycleNotifications({ allowNotification }) {
    if (!progress) return;
    const previous = { ...(progress.audioQuestCycles || {}) };
    const current = currentQuestCycles();
    const hadPreviousCycle = Boolean(previous.daily || previous.monthly || previous.seasonal);
    const changedTypes = Object.keys(current).filter(type => previous[type] && current[type] && previous[type] !== current[type]);

    progress.audioQuestCycles = current;
    saveProgress();

    if (!hadPreviousCycle || !changedTypes.length) return;
    pendingNewQuestTypes = [...new Set([...pendingNewQuestTypes, ...changedTypes])];
    if (allowNotification && userHasInteracted) flushPendingNewQuestNotification();
  }

  function flushPendingNewQuestNotification() {
    if (!pendingNewQuestTypes.length) return;
    const types = pendingNewQuestTypes.splice(0);
    showNewQuestNotification(types);
    playSound("questNew", 0.92);
  }

  function showNewQuestNotification(types) {
    const stack = document.getElementById("quest-notification-stack");
    if (!stack) return;
    while (stack.children.length >= 4) stack.firstElementChild?.remove();

    const labels = {
      daily: "quotidiennes",
      monthly: "mensuelles",
      seasonal: "saisonnières"
    };
    const text = types.map(type => labels[type] || type).join(", ");
    const notification = document.createElement("article");
    notification.className = "quest-complete-notification quest-new-notification";
    notification.innerHTML = `
      <div class="quest-notification-icon">✦</div>
      <div class="quest-notification-copy">
        <span class="quest-notification-kicker">Nouvelles quêtes disponibles</span>
        <strong>Le tableau des quêtes a été renouvelé</strong>
        <span>De nouvelles quêtes ${escapeHtml(text)} vous attendent.</span>
        <span class="quest-notification-reward">Ouvrez le menu Quêtes pour les découvrir.</span>
      </div>
      <span class="quest-notification-progress"></span>`;
    stack.appendChild(notification);
    window.setTimeout(() => notification.classList.add("leaving"), 4700);
    window.setTimeout(() => notification.remove(), 5150);
  }

  function playSound(key, gain = 1) {
    return window.ASTREA_SFX?.play?.(key, gain) || null;
  }

  window.ASTREA_AUDIO_EVENTS = {
    ...(window.ASTREA_AUDIO_EVENTS || {}),
    playerTurn: () => playSound("turnAlert", 0.95),
    deckFull: () => playSound("deckFull", 0.92),
    deckAdd: () => playSound("deckAdd", 0.78),
    draw: () => playSound("cardDraw", 0.78),
    discard: () => playSound("cardDiscard", 0.9),
    heroPowerFlip: () => playSound("heroPowerFlip", 0.88),
    heroPowerReady: () => playSound("heroPowerReady", 0.88),
    menuHover: () => playSound("menuHover", 0.45),
    questNew: () => playSound("questNew", 0.92),
    questComplete: () => playSound("questComplete", 0.92),
    taunt: () => playSound("tauntPlayed", 0.9),
    shop: () => playSound("shopOpen", 0.9)
  };
})();
