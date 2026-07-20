/* Chroniques d'Astréa V27 — nouveaux effets sonores de combat et de pouvoir héroïque
   Fatigue, gain de mana, Ruée, Silence, Charge, dégât subit, Râle d'agonie,
   secret déclenché, arme équipée/détruite, Bouclier divin, mort d'un serviteur,
   gel, choix de cible d'attaque, attaque au pouvoir héroïque, pouvoir héroïque
   (Armure/soin) et soins de carte.
*/
(() => {
  const originalDrawCard = drawCard;
  const originalBeginTurn = beginTurn;
  const originalResolveEffect = resolveEffect;
  const originalHealTarget = healTarget;
  const originalSilenceMinion = silenceMinion;
  const originalFreezeMinion = freezeMinion;
  const originalEquipWeapon = equipWeapon;
  const originalPerformAttack = performAttack;
  const originalDealDamageToHero = dealDamageToHero;
  const originalDealDamageToMinion = dealDamageToMinion;
  const originalApplyDamageToTarget = applyDamageToTarget;
  const originalResolveSecrets = resolveSecrets;
  const originalSpawnDestroyedCardEffect = spawnDestroyedCardEffect;
  const originalPlayCardFromHand = playCardFromHand;
  const originalUsePlayerHeroPower = usePlayerHeroPower;
  const originalExecutePendingAction = executePendingAction;

  const MANA_GAIN_EFFECTS = new Set([
    "gainEmptyManaCrystal",
    "gainManaCrystalIfEmpty",
    "gainTemporaryMana",
    "refreshMana",
    "gainEmptyManaIfCardsPlayed"
  ]);

  document.addEventListener("DOMContentLoaded", () => {
    if (progress) {
      progress.version = Math.max(27, Number(progress.version || 0));
      saveProgress();
    }
  });

  /* ---------- Fatigue ---------- */
  drawCard = function(playerId, options = {}) {
    const player = gameState?.[playerId];
    const willFatigue = Boolean(player) && !player.deck.length;
    const result = originalDrawCard.apply(this, arguments);
    if (willFatigue && !options?.silent) playSound("fatigue", 0.85);
    return result;
  };

  /* ---------- Gain de mana (cristal de début de tour) ---------- */
  beginTurn = function(playerId) {
    const beforeMax = Number(gameState?.[playerId]?.mana?.maximum || 0);
    const result = originalBeginTurn.apply(this, arguments);
    if (playerId === "player") {
      const afterMax = Number(gameState?.player?.mana?.maximum || 0);
      if (afterMax > beforeMax) window.setTimeout(() => playSound("manaGain", 0.7), 240);
    }
    return result;
  };

  /* ---------- Râle d'agonie + gains de mana déclenchés par une carte ---------- */
  resolveEffect = function(effect, context = {}) {
    const result = originalResolveEffect.apply(this, arguments);
    if (effect?.trigger === "deathrattle") playSound("deathrattle", 0.85);
    if (effect?.effect && MANA_GAIN_EFFECTS.has(effect.effect)) {
      window.setTimeout(() => playSound("manaGain", 0.7), 80);
    }
    return result;
  };

  /* ---------- Soin (carte, sort, arme à vol de vie, etc.) ---------- */
  healTarget = function(target, amount) {
    const result = originalHealTarget.apply(this, arguments);
    if (result > 0) playSound("heal", 0.8);
    return result;
  };

  /* ---------- Silence ---------- */
  silenceMinion = function(m) {
    const result = originalSilenceMinion.apply(this, arguments);
    playSound("silence", 0.85);
    return result;
  };

  /* ---------- Gel (un serviteur, généralement adverse, est gelé) ---------- */
  freezeMinion = function(minion) {
    const wasFrozen = Boolean(minion?.frozen);
    const result = originalFreezeMinion.apply(this, arguments);
    if (!wasFrozen && minion?.frozen) playSound("freeze", 0.85);
    return result;
  };

  /* ---------- Arme équipée ---------- */
  equipWeapon = function(ownerId, card, instance) {
    const result = originalEquipWeapon.apply(this, arguments);
    playSound("weaponEquip", 0.85);
    return result;
  };

  /* ---------- Choix de la cible d'attaque (flèche verte) + Arme détruite ---------- */
  performAttack = async function(attackerRef, target) {
    if (attackerRef?.ownerId === "player") {
      try {
        if (getValidAttackTargets("player", attackerRef).some(t => sameTarget(t, target))) {
          playSound("attackTargetSelect", 0.8);
        }
      } catch (_) {}
    }
    const ownerId = attackerRef?.ownerId;
    const weaponBefore = attackerRef?.kind === "hero" ? gameState?.[ownerId]?.hero?.weapon : null;
    const result = await originalPerformAttack.apply(this, arguments);
    if (result && weaponBefore && !gameState?.[ownerId]?.hero?.weapon) {
      window.setTimeout(() => playSound("weaponDestroyed", 0.85), 200);
    }
    return result;
  };

  /* ---------- Bouclier divin (dégâts absorbés) ---------- */
  dealDamageToHero = function(ownerId, amount) {
    const shieldBefore = Boolean(gameState?.[ownerId]?.hero?.weapon?.divineShieldActive);
    const result = originalDealDamageToHero.apply(this, arguments);
    if (shieldBefore && !gameState?.[ownerId]?.hero?.weapon?.divineShieldActive) {
      playSound("divineShield", 0.85);
    }
    return result;
  };

  dealDamageToMinion = function(m, amount) {
    const shieldBefore = Boolean(m?.divineShieldActive);
    const result = originalDealDamageToMinion.apply(this, arguments);
    if (shieldBefore && !m?.divineShieldActive) playSound("divineShield", 0.85);
    return result;
  };

  /* ---------- Dégât subit (sorts, pouvoirs héroïques, dégâts de zone…) ---------- */
  applyDamageToTarget = function(target, amount) {
    if (!target) return originalApplyDamageToTarget.apply(this, arguments);
    const before = readTargetHealth(target);
    const result = originalApplyDamageToTarget.apply(this, arguments);
    const after = readTargetHealth(target);
    if (typeof before === "number" && typeof after === "number" && after < before) {
      playSound("damageTaken", 0.75);
    }
    return result;
  };

  function readTargetHealth(target) {
    if (target.kind === "hero") return gameState?.[target.ownerId]?.hero?.currentHealth ?? null;
    const m = findMinionById(target.instanceId);
    return m ? m.currentHealth : null;
  }

  /* ---------- Secret déclenché ---------- */
  resolveSecrets = function(ownerId, trigger, secretContext) {
    const before = gameState?.[ownerId]?.secrets?.length || 0;
    const result = originalResolveSecrets.apply(this, arguments);
    const after = gameState?.[ownerId]?.secrets?.length || 0;
    if (after < before) playSound("secretTriggered", 0.9);
    return result;
  };

  /* ---------- Mort d'un serviteur ---------- */
  spawnDestroyedCardEffect = function(instanceId) {
    const result = originalSpawnDestroyedCardEffect.apply(this, arguments);
    playSound("minionDeath", 0.85);
    return result;
  };

  /* ---------- Ruée / Charge (au moment où le serviteur est joué) ---------- */
  playCardFromHand = async function(playerId, handIndex, target = null) {
    const instance = gameState?.[playerId]?.hand?.[handIndex];
    const card = instance ? CARD_BY_ID?.[instance.cardId] : null;
    const result = await originalPlayCardFromHand.apply(this, arguments);
    if (result && card?.type === "creature") {
      if (hasChargeKeyword(card)) window.setTimeout(() => playSound("chargePlayed", 0.85), 160);
      else if (hasRushKeyword(card)) window.setTimeout(() => playSound("rushPlayed", 0.85), 160);
    }
    return result;
  };

  /* ---------- Pouvoir héroïque : gain d'Armure (et soin) ---------- */
  usePlayerHeroPower = function() {
    const canUse = canUseHeroPower("player");
    const heroPowerDef = canUse ? getHeroPowerDefinition(gameState?.player?.heroPower?.type) : null;
    const isArmorPower = heroPowerDef?.effectType === "armor";
    const result = originalUsePlayerHeroPower.apply(this, arguments);
    if (canUse && isArmorPower) playSound("heroPowerArmor", 0.85);
    return result;
  };

  /* ---------- Pouvoir héroïque : attaque (dégâts) sur cible choisie ---------- */
  executePendingAction = async function(target) {
    const pending = gameState?.pendingAction;
    const result = await originalExecutePendingAction.apply(this, arguments);
    if (pending && pending.type === "heroPower" && pending.playerId === "player" && !gameState?.pendingAction) {
      playSound("heroPowerAttack", 0.85);
    }
    return result;
  };

  function playSound(key, gain = 1) {
    return window.ASTREA_SFX?.play?.(key, gain) || null;
  }

  window.ASTREA_AUDIO_EVENTS = {
    ...(window.ASTREA_AUDIO_EVENTS || {}),
    fatigue: () => playSound("fatigue", 0.85),
    manaGain: () => playSound("manaGain", 0.7),
    rushPlayed: () => playSound("rushPlayed", 0.85),
    chargePlayed: () => playSound("chargePlayed", 0.85),
    silence: () => playSound("silence", 0.85),
    freeze: () => playSound("freeze", 0.85),
    damageTaken: () => playSound("damageTaken", 0.75),
    deathrattle: () => playSound("deathrattle", 0.85),
    secretTriggered: () => playSound("secretTriggered", 0.9),
    weaponEquip: () => playSound("weaponEquip", 0.85),
    weaponDestroyed: () => playSound("weaponDestroyed", 0.85),
    divineShield: () => playSound("divineShield", 0.85),
    minionDeath: () => playSound("minionDeath", 0.85),
    attackTargetSelect: () => playSound("attackTargetSelect", 0.8),
    heroPowerAttack: () => playSound("heroPowerAttack", 0.85),
    heroPowerArmor: () => playSound("heroPowerArmor", 0.85),
    heal: () => playSound("heal", 0.8)
  };
})();
