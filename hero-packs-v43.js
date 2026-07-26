"use strict";

/* Chroniques d'Astréa V43 — six nouveaux héros et pouvoirs héroïques avancés */
(() => {
  const NEW_HEROES = Object.freeze([
    {
      id: "grikz_bricoleur",
      name: "Grikz le Bricoleur",
      subtitle: "Gobelin maître des améliorations instables",
      portrait: "assets/heroes/hero_grikz_bricoleur.png",
      powerType: "injection_instable",
      icon: "⚙",
      price: 1400
    },
    {
      id: "thorga_appel_esprits",
      name: "Thorga l’Appel-esprits",
      subtitle: "Chamane des combattants éphémères",
      portrait: "assets/heroes/hero_thorga_appel_esprits.png",
      powerType: "appel_ephemere",
      icon: "✦",
      price: 1500
    },
    {
      id: "nyx_oeil_voile",
      name: "Nyx l’Œil voilé",
      subtitle: "Espionne des pensées interdites",
      portrait: "assets/heroes/hero_nyx_oeil_voile.png",
      powerType: "oeil_indiscret",
      icon: "◉",
      price: 1500
    },
    {
      id: "kael_brisefer",
      name: "Kael Brisefer",
      subtitle: "Guerrier et maître du rempart",
      portrait: "assets/heroes/hero_kael_brisefer.png",
      powerType: "ordre_du_bastion",
      icon: "⚔",
      price: 1600
    },
    {
      id: "xalgor_devoreur",
      name: "Xal’gor le Dévoreur",
      subtitle: "Démon nourri par les sacrifices",
      portrait: "assets/heroes/hero_xalgor_devoreur.png",
      powerType: "pacte_devorant",
      icon: "☠",
      price: 1800
    },
    {
      id: "ax7_oracle",
      name: "AX-7, Oracle mécanique",
      subtitle: "Robot calculateur des futurs possibles",
      portrait: "assets/heroes/hero_ax7_oracle.png",
      powerType: "calcul_predictif",
      icon: "◇",
      price: 1700
    }
  ]);

  const POWER_TYPES = new Set(NEW_HEROES.map(hero => hero.powerType));
  const TARGET_POWER_TYPES = new Set(["injection_instable", "ordre_du_bastion"]);

  Object.assign(HERO_POWER_DEFINITIONS, {
    injection_instable: {
      name: "Injection instable",
      image: "assets/ui/hero_power_injection_instable.png",
      description: "Donne +1/+1 à un serviteur allié durant ce tour.",
      cost: 1,
      effectType: "temporaryBuff"
    },
    appel_ephemere: {
      name: "Appel éphémère",
      image: "assets/ui/hero_power_appel_ephemere.png",
      description: "Invoque un serviteur aléatoire coûtant 2 cristaux ou moins. Il meurt à la fin du tour.",
      cost: 1,
      effectType: "summonEphemeral"
    },
    oeil_indiscret: {
      name: "Œil indiscret",
      image: "assets/ui/hero_power_oeil_indiscret.png",
      description: "Révèle une carte aléatoire de la main adverse.",
      cost: 2,
      effectType: "peekEnemyHand"
    },
    ordre_du_bastion: {
      name: "Ordre du bastion",
      image: "assets/ui/hero_power_ordre_bastion.png",
      description: "Donne définitivement +1/+1 à un serviteur allié.",
      cost: 2,
      effectType: "permanentBuff"
    },
    pacte_devorant: {
      name: "Pacte dévorant",
      image: "assets/ui/hero_power_pacte_devorant.png",
      description: "Détruit un serviteur allié aléatoire. Votre héros gagne autant de PV maximum que les PV du serviteur détruit.",
      cost: 2,
      effectType: "sacrificeHealth"
    },
    calcul_predictif: {
      name: "Calcul prédictif",
      image: "assets/ui/hero_power_calcul_predictif.png",
      description: "Regardez les 3 cartes du dessus de votre deck. Choisissez celle à replacer au-dessus.",
      cost: 1,
      effectType: "chooseDeckTop"
    }
  });

  NEW_HEROES.forEach(hero => {
    HERO_DEFINITIONS[hero.id] = {
      id: hero.id,
      name: hero.name,
      subtitle: hero.subtitle,
      portrait: hero.portrait,
      powerType: hero.powerType
    };
  });

  function appendHeroButtons() {
    const grid = document.querySelector(".hero-selection-grid");
    if (!grid) return;
    NEW_HEROES.forEach(hero => {
      if (grid.querySelector(`[data-hero-choice="${hero.id}"]`)) return;
      const power = HERO_POWER_DEFINITIONS[hero.powerType];
      const button = document.createElement("button");
      button.className = "hero-choice-card";
      button.type = "button";
      button.dataset.heroChoice = hero.id;
      button.title = `${power.name} — ${power.description}`;
      button.innerHTML = `
        <span class="hero-power-badge power-v43" aria-hidden="true">${hero.icon}</span>
        <img src="${hero.portrait}" alt="${escapeHtml(hero.name)}" />
        <strong>${escapeHtml(hero.name)}</strong>
        <span>${escapeHtml(power.name)}</span>`;
      grid.appendChild(button);
    });
  }

  // Le script est chargé en bas de page, avant DOMContentLoaded : les boutons
  // sont donc présents lorsque game.js construit sa liste d'événements.
  appendHeroButtons();

  function supportsPowerType(powerType) {
    return POWER_TYPES.has(powerType);
  }

  function powerTargetEffect(powerType) {
    if (!TARGET_POWER_TYPES.has(powerType)) return null;
    return { effect: "heroPowerV43", target: "friendlyCreature", value: 1 };
  }

  function heroPowerPrerequisitesMet(ownerId, powerType) {
    const player = gameState?.[ownerId];
    if (!player) return false;
    if (powerType === "injection_instable" || powerType === "ordre_du_bastion" || powerType === "pacte_devorant") {
      return player.board.some(minion => !minion.dormantTurns);
    }
    if (powerType === "appel_ephemere") {
      return player.board.length < CONFIG.MAX_BOARD && getEphemeralPool().length > 0;
    }
    if (powerType === "oeil_indiscret") return gameState[getOpponentId(ownerId)]?.hand?.length > 0;
    if (powerType === "calcul_predictif") return player.deck.length > 0;
    return true;
  }

  const previousCanUseHeroPower = canUseHeroPower;
  canUseHeroPower = function(ownerId) {
    if (!previousCanUseHeroPower.apply(this, arguments)) return false;
    const powerType = gameState?.[ownerId]?.heroPower?.type;
    if (!supportsPowerType(powerType)) return true;
    if (ownerId === "player" && gameState?.pendingAction?.type === "heroPowerV43") return false;
    return heroPowerPrerequisitesMet(ownerId, powerType);
  };

  function consumePower(ownerId) {
    const player = gameState?.[ownerId];
    if (!player) return false;
    const definition = getHeroPowerDefinition(player.heroPower.type);
    if (player.heroPower.usedThisTurn || player.mana.current < definition.cost) return false;
    player.mana.current -= definition.cost;
    player.heroPower.usedThisTurn = true;
    return true;
  }

  function finishPower(ownerId, text, { resolve = true } = {}) {
    if (text) addLog(text);
    if (ownerId === "player") updateDailyQuestProgress("useHeroPower", 1);
    if (resolve) {
      resolveDeaths();
      checkGameOver();
    }
    renderGame();
  }

  function getEphemeralPool() {
    return COLLECTIBLE_CARDS.filter(card => isMinionCardDefinition(card) && card.cost <= 2 && card.collectible !== false);
  }

  function applyTemporaryBuff(minion, turnOwnerId) {
    if (!minion) return false;
    minion.attack += 1;
    minion.maxHealth += 1;
    minion.currentHealth += 1;
    minion.temporaryHeroPowerAttackBonus = (minion.temporaryHeroPowerAttackBonus || 0) + 1;
    minion.temporaryHeroPowerHealthBonus = (minion.temporaryHeroPowerHealthBonus || 0) + 1;
    minion.temporaryHeroPowerExpiresTurnOwnerId = turnOwnerId;
    return true;
  }

  function clearTemporaryHeroPowerBuffs(turnOwnerId) {
    for (const minion of [...(gameState?.player?.board || []), ...(gameState?.ai?.board || [])]) {
      if (minion.temporaryHeroPowerExpiresTurnOwnerId !== turnOwnerId) continue;
      const attackBonus = Number(minion.temporaryHeroPowerAttackBonus || 0);
      const healthBonus = Number(minion.temporaryHeroPowerHealthBonus || 0);
      minion.attack = Math.max(0, minion.attack - attackBonus);
      minion.maxHealth = Math.max(1, minion.maxHealth - healthBonus);
      minion.currentHealth -= healthBonus;
      minion.temporaryHeroPowerAttackBonus = 0;
      minion.temporaryHeroPowerHealthBonus = 0;
      minion.temporaryHeroPowerExpiresTurnOwnerId = null;
    }
  }

  function destroyEphemeralMinions(turnOwnerId) {
    const player = gameState?.[turnOwnerId];
    if (!player) return;
    player.board.forEach(minion => {
      if (minion.heroPowerEphemeralExpiresTurnOwnerId !== turnOwnerId) return;
      minion.currentHealth = 0;
      addLog(`${minion.name} disparaît à la fin du tour.`);
    });
  }

  const previousEndTurnCleanup = endTurnCleanup;
  endTurnCleanup = function(ownerId) {
    clearTemporaryHeroPowerBuffs(ownerId);
    destroyEphemeralMinions(ownerId);
    resolveDeaths();
    return previousEndTurnCleanup.apply(this, arguments);
  };

  const previousSilenceMinion = silenceMinion;
  silenceMinion = function(minion) {
    if (minion) {
      minion.temporaryHeroPowerAttackBonus = 0;
      minion.temporaryHeroPowerHealthBonus = 0;
      minion.temporaryHeroPowerExpiresTurnOwnerId = null;
    }
    return previousSilenceMinion.apply(this, arguments);
  };

  function targetMinion(ownerId, target) {
    if (!target || target.kind !== "minion" || target.ownerId !== ownerId) return null;
    const minion = findMinionById(target.instanceId);
    if (!minion || minion.ownerId !== ownerId || minion.dormantTurns > 0) return null;
    return minion;
  }

  function chooseRandomEnemyHandInstance(ownerId, requestedInstanceId = null) {
    const hand = gameState?.[getOpponentId(ownerId)]?.hand || [];
    if (!hand.length) return null;
    return hand.find(instance => instance.instanceId === requestedInstanceId) || randomItem(hand);
  }

  function getTopDeckCandidates(ownerId) {
    const deck = gameState?.[ownerId]?.deck || [];
    return deck.slice(Math.max(0, deck.length - 3));
  }

  function placeChosenCardOnTop(ownerId, chosenInstanceId) {
    const player = gameState?.[ownerId];
    if (!player?.deck?.length) return null;
    const amount = Math.min(3, player.deck.length);
    const candidates = player.deck.splice(player.deck.length - amount, amount);
    const chosen = candidates.find(instance => instance.instanceId === chosenInstanceId) || candidates[candidates.length - 1];
    const others = candidates.filter(instance => instance !== chosen);
    shuffle(others).forEach(instance => player.deck.push(instance));
    player.deck.push(chosen);
    return chosen;
  }

  function choiceCardMarkup(instance) {
    const card = CARD_BY_ID[instance.cardId];
    return `<span class="v43-choice-art">${getCardArtMarkup(card)}</span><strong>${escapeHtml(card.name)}</strong><small>Coût ${card.cost} · ${escapeHtml(typeLabel(card.type))}</small>`;
  }

  function chooseTopDeckCard(ownerId, candidates) {
    if (!candidates.length) return Promise.resolve(null);
    if (ownerId === "ai") {
      const best = [...candidates].sort((a, b) => (CARD_BY_ID[b.cardId]?.cost || 0) - (CARD_BY_ID[a.cardId]?.cost || 0))[0];
      return Promise.resolve(best?.instanceId || candidates[candidates.length - 1].instanceId);
    }
    interactionLocked = true;
    dom.choiceTitle.textContent = "Calcul prédictif — choisissez la carte du dessus";
    dom.choiceOptions.innerHTML = "";
    dom.choiceModal.classList.remove("hidden");
    return new Promise(resolve => {
      candidates.forEach(instance => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice-option v43-deck-choice";
        button.innerHTML = choiceCardMarkup(instance);
        button.addEventListener("click", () => {
          dom.choiceModal.classList.add("hidden");
          dom.choiceOptions.innerHTML = "";
          interactionLocked = false;
          resolve(instance.instanceId);
        }, { once: true });
        dom.choiceOptions.appendChild(button);
      });
    });
  }

  function revealEnemyCard(ownerId, instance) {
    if (ownerId !== "player" || !instance) return Promise.resolve();
    const card = CARD_BY_ID[instance.cardId];
    if (!card) return Promise.resolve();
    interactionLocked = true;
    dom.choiceTitle.textContent = "Œil indiscret — carte révélée";
    dom.choiceOptions.innerHTML = "";
    dom.choiceModal.classList.remove("hidden");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-option v43-revealed-card";
    button.innerHTML = `${choiceCardMarkup(instance)}<span>Fermer</span>`;
    dom.choiceOptions.appendChild(button);
    return new Promise(resolve => {
      button.addEventListener("click", () => {
        dom.choiceModal.classList.add("hidden");
        dom.choiceOptions.innerHTML = "";
        interactionLocked = false;
        resolve();
      }, { once: true });
    });
  }

  function applyTargetPower(ownerId, powerType, target) {
    const player = gameState?.[ownerId];
    if (!player || player.heroPower.type !== powerType) return false;
    const minion = targetMinion(ownerId, target);
    if (!minion || !consumePower(ownerId)) return false;
    if (powerType === "injection_instable") {
      applyTemporaryBuff(minion, ownerId);
      finishPower(ownerId, `${player.name} utilise Injection instable : ${minion.name} gagne +1/+1 durant ce tour.`);
      return true;
    }
    if (powerType === "ordre_du_bastion") {
      buffMinion(minion, 1, 1);
      finishPower(ownerId, `${player.name} utilise Ordre du bastion sur ${minion.name}.`);
      return true;
    }
    return false;
  }

  function applyImmediatePower(ownerId, payload = {}) {
    const player = gameState?.[ownerId];
    if (!player) return false;
    const powerType = payload.powerType || player.heroPower.type;
    if (player.heroPower.type !== powerType || !supportsPowerType(powerType)) return false;
    if (TARGET_POWER_TYPES.has(powerType)) return applyTargetPower(ownerId, powerType, payload.target);
    if (!heroPowerPrerequisitesMet(ownerId, powerType) || !consumePower(ownerId)) return false;
    const power = getHeroPowerDefinition(powerType);

    if (powerType === "appel_ephemere") {
      const card = randomItem(getEphemeralPool());
      const minion = card ? summonCard(ownerId, card.id) : null;
      if (minion) minion.heroPowerEphemeralExpiresTurnOwnerId = ownerId;
      finishPower(ownerId, minion ? `${player.name} utilise ${power.name} et invoque ${minion.name} jusqu’à la fin du tour.` : `${power.name} échoue.`);
      return Boolean(minion);
    }

    if (powerType === "oeil_indiscret") {
      const revealed = chooseRandomEnemyHandInstance(ownerId, payload.revealedInstanceId);
      finishPower(ownerId, `${player.name} utilise ${power.name} et observe une carte de la main adverse.`, { resolve: false });
      if (ownerId === "player") revealEnemyCard(ownerId, revealed).then(() => renderGame());
      return Boolean(revealed);
    }

    if (powerType === "pacte_devorant") {
      const candidates = player.board.filter(minion => !minion.dormantTurns);
      const victim = randomItem(candidates);
      if (!victim) return false;
      const gainedHealth = Math.max(1, Number(victim.currentHealth || 1));
      player.hero.maxHealth += gainedHealth;
      player.hero.currentHealth += gainedHealth;
      victim.currentHealth = 0;
      finishPower(ownerId, `${player.name} sacrifie ${victim.name} et gagne ${gainedHealth} PV maximum.`);
      return true;
    }

    if (powerType === "calcul_predictif") {
      const candidates = getTopDeckCandidates(ownerId);
      const chosen = placeChosenCardOnTop(ownerId, payload.chosenInstanceId);
      finishPower(ownerId, chosen ? `${player.name} utilise ${power.name} et prépare sa prochaine pioche.` : `${power.name} ne trouve aucune carte.`, { resolve: false });
      return Boolean(chosen || candidates.length);
    }

    return false;
  }

  async function useLocalPower(ownerId = "player") {
    const player = gameState?.[ownerId];
    if (!player || !canUseHeroPower(ownerId)) return false;
    const powerType = player.heroPower.type;
    if (!supportsPowerType(powerType)) return false;

    if (TARGET_POWER_TYPES.has(powerType)) {
      gameState.pendingAction = {
        type: "heroPowerV43",
        playerId: ownerId,
        powerType,
        effect: powerTargetEffect(powerType)
      };
      renderGame();
      return true;
    }

    if (powerType === "calcul_predictif" && ownerId === "player") {
      const candidates = getTopDeckCandidates(ownerId);
      if (!candidates.length || !consumePower(ownerId)) return false;
      renderGame();
      const chosenInstanceId = await chooseTopDeckCard(ownerId, candidates);
      const chosen = placeChosenCardOnTop(ownerId, chosenInstanceId);
      finishPower(ownerId, chosen ? `${player.name} utilise Calcul prédictif et prépare sa prochaine pioche.` : "Aucune carte n’a été choisie.", { resolve: false });
      return true;
    }

    if (powerType === "oeil_indiscret" && ownerId === "player") {
      const revealed = chooseRandomEnemyHandInstance(ownerId);
      if (!revealed || !consumePower(ownerId)) return false;
      addLog(`${player.name} utilise Œil indiscret et observe une carte de la main adverse.`);
      updateDailyQuestProgress("useHeroPower", 1);
      renderGame();
      await revealEnemyCard(ownerId, revealed);
      renderGame();
      return true;
    }

    return applyImmediatePower(ownerId, { powerType });
  }

  function completeLocalTarget(ownerId, target) {
    const pending = gameState?.pendingAction;
    if (!pending || pending.type !== "heroPowerV43" || pending.playerId !== ownerId) return false;
    if (!isTargetValidForEffect(ownerId, pending.effect, target)) return false;
    gameState.pendingAction = null;
    return applyTargetPower(ownerId, pending.powerType, target);
  }

  const previousUsePlayerHeroPower = usePlayerHeroPower;
  usePlayerHeroPower = function() {
    const powerType = gameState?.player?.heroPower?.type;
    if (!supportsPowerType(powerType)) return previousUsePlayerHeroPower.apply(this, arguments);
    // Le module multijoueur de versions.js intercepte ce cas et utilise l'API
    // ASTREA_HERO_POWERS_V43 afin de synchroniser l'action avec l'hôte.
    if (gameState?.mode === "pvp") return previousUsePlayerHeroPower.apply(this, arguments);
    return useLocalPower("player");
  };

  const previousUseAiHeroPower = useAiHeroPower;
  useAiHeroPower = function() {
    const powerType = gameState?.ai?.heroPower?.type;
    if (!supportsPowerType(powerType)) return previousUseAiHeroPower.apply(this, arguments);
    if (!canUseHeroPower("ai")) return false;
    if (TARGET_POWER_TYPES.has(powerType)) {
      const targetMinions = gameState.ai.board.filter(minion => !minion.dormantTurns);
      const minion = powerType === "ordre_du_bastion"
        ? [...targetMinions].sort((a, b) => b.attack + b.currentHealth - a.attack - a.currentHealth)[0]
        : randomItem(targetMinions);
      return minion ? applyTargetPower("ai", powerType, { ownerId: "ai", kind: "minion", instanceId: minion.instanceId }) : false;
    }
    if (powerType === "calcul_predictif") {
      const candidates = getTopDeckCandidates("ai");
      const chosen = [...candidates].sort((a, b) => (CARD_BY_ID[b.cardId]?.cost || 0) - (CARD_BY_ID[a.cardId]?.cost || 0))[0];
      return applyImmediatePower("ai", { powerType, chosenInstanceId: chosen?.instanceId });
    }
    return applyImmediatePower("ai", { powerType });
  };

  const previousExecutePendingAction = executePendingAction;
  executePendingAction = async function(target) {
    if (gameState?.pendingAction?.type !== "heroPowerV43") return previousExecutePendingAction.apply(this, arguments);
    if (gameState?.mode === "pvp") return previousExecutePendingAction.apply(this, arguments);
    return completeLocalTarget("player", target);
  };

  const previousRenderHighlights = renderHighlights;
  renderHighlights = function() {
    const result = previousRenderHighlights.apply(this, arguments);
    const pending = gameState?.pendingAction;
    if (pending?.type !== "heroPowerV43") return result;
    const targets = getValidTargetsForEffect(pending.playerId || "player", pending.effect);
    document.querySelectorAll(".minion,.hero").forEach(element => {
      const target = {
        ownerId: element.dataset.owner,
        kind: element.dataset.targetKind,
        instanceId: element.dataset.instanceId || null
      };
      element.classList.remove("valid-target", "invalid-target");
      element.classList.add(targets.some(candidate => sameTarget(candidate, target)) ? "valid-target" : "invalid-target");
    });
    return result;
  };

  async function beginGuestPower({ sendAction }) {
    const player = gameState?.player;
    if (!player || !canUseHeroPower("player")) return false;
    const powerType = player.heroPower.type;
    if (!supportsPowerType(powerType)) return false;

    if (TARGET_POWER_TYPES.has(powerType)) {
      gameState.pendingAction = { type: "heroPowerV43", playerId: "player", powerType, effect: powerTargetEffect(powerType) };
      renderGame();
      return true;
    }

    interactionLocked = true;
    if (powerType === "calcul_predictif") {
      const candidates = getTopDeckCandidates("player");
      const chosenInstanceId = await chooseTopDeckCard("player", candidates);
      interactionLocked = true;
      renderGame();
      sendAction({ kind: "heroPowerV43", payload: { powerType, chosenInstanceId } });
      return true;
    }
    if (powerType === "oeil_indiscret") {
      const revealed = chooseRandomEnemyHandInstance("player");
      await revealEnemyCard("player", revealed);
      interactionLocked = true;
      renderGame();
      sendAction({ kind: "heroPowerV43", payload: { powerType, revealedInstanceId: revealed?.instanceId || null } });
      return true;
    }
    renderGame();
    sendAction({ kind: "heroPowerV43", payload: { powerType } });
    return true;
  }

  function completeGuestTarget({ target, sendAction, flipTargetSeat }) {
    const pending = gameState?.pendingAction;
    if (!pending || pending.type !== "heroPowerV43" || !isTargetValidForEffect("player", pending.effect, target)) return false;
    gameState.pendingAction = null;
    interactionLocked = true;
    renderGame();
    sendAction({ kind: "heroPowerV43", payload: { powerType: pending.powerType, target: flipTargetSeat(target) } });
    return true;
  }

  window.ASTREA_HERO_POWERS_V43 = {
    supportsPowerType,
    useLocalPower,
    completeLocalTarget,
    beginGuestPower,
    completeGuestTarget,
    applySeatPower: (ownerId, payload) => applyImmediatePower(ownerId, payload),
    heroes: NEW_HEROES.map(hero => ({ ...hero }))
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (progress) {
      progress.version = Math.max(43, Number(progress.version || 0));
      window.astreaHeroUnlocks?.normalize?.(progress);
      saveProgress();
      renderHeroSelection();
      renderDeckManager();
      window.astreaHeroShopRender?.();
    }
  });
})();
