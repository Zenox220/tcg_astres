/* Chroniques d'Astréa V28 — nouveaux héros et pouvoirs héroïques
   Ajoute deux héros jouables avec des pouvoirs héroïques inédits (Soin et Pioche)
   au lieu des seuls types Armure/Dégâts déjà présents. Les nouveaux héros
   apparaissent automatiquement dans le sélecteur de deck, l'écran d'accueil
   (boutons ajoutés dans index.html) et dans le pool d'adversaires IA.
*/
(() => {
  /* ---------- Nouveaux pouvoirs héroïques ---------- */
  HERO_POWER_DEFINITIONS.courant_nourricier = {
    name: "Courant nourricier",
    image: "assets/ui/hero_power_architecte_marees.png",
    description: "Un flot bienfaisant referme vos blessures. Rend 2 points de vie à votre héros.",
    cost: 2,
    effectType: "heal",
    value: 2
  };
  HERO_POWER_DEFINITIONS.piste_stellaire = {
    name: "Piste stellaire",
    image: "assets/ui/hero_power_chasseur_etoiles.png",
    description: "Suit la trace d’une étoile filante. Piochez une carte.",
    cost: 2,
    effectType: "draw"
  };

  /* ---------- Nouveaux héros ---------- */
  HERO_DEFINITIONS.architecte_marees = {
    id: "architecte_marees",
    name: "Architecte des Marées",
    subtitle: "Sculpteur des courants stellaires",
    portrait: "assets/heroes/hero_architecte_marees.png",
    powerType: "courant_nourricier"
  };
  HERO_DEFINITIONS.chasseur_etoiles = {
    id: "chasseur_etoiles",
    name: "Chasseur d’Étoiles",
    subtitle: "Traqueur des cieux nomades",
    portrait: "assets/heroes/hero_chasseur_etoiles.png",
    powerType: "piste_stellaire"
  };

  /* ---------- Support moteur des nouveaux types d'effet ---------- */
  const previousUsePlayerHeroPower = usePlayerHeroPower;
  usePlayerHeroPower = function() {
    if (!canUseHeroPower("player")) return;
    const p = gameState.player;
    const heroPowerDef = getHeroPowerDefinition(p.heroPower.type);

    if (heroPowerDef.effectType === "heal") {
      p.mana.current -= p.heroPower.cost;
      p.heroPower.usedThisTurn = true;
      const healed = healTarget({ ownerId: "player", kind: "hero", instanceId: null }, heroPowerDef.value || 2);
      addLog(`Vous utilisez ${heroPowerDef.name} et récupérez ${healed} point(s) de vie.`);
      updateDailyQuestProgress("useHeroPower", 1);
      renderGame();
      playSound("heroPowerArmor", 0.85);
      return;
    }
    if (heroPowerDef.effectType === "draw") {
      p.mana.current -= p.heroPower.cost;
      p.heroPower.usedThisTurn = true;
      drawCard("player");
      addLog(`Vous utilisez ${heroPowerDef.name} et piochez une carte.`);
      updateDailyQuestProgress("useHeroPower", 1);
      renderGame();
      return;
    }
    return previousUsePlayerHeroPower.apply(this, arguments);
  };

  const previousUseAiHeroPower = useAiHeroPower;
  useAiHeroPower = function() {
    if (!canUseHeroPower("ai")) return false;
    const p = gameState.ai;
    const heroPowerDef = getHeroPowerDefinition(p.heroPower.type);

    if (heroPowerDef.effectType === "heal") {
      p.mana.current -= p.heroPower.cost;
      p.heroPower.usedThisTurn = true;
      const healed = healTarget({ ownerId: "ai", kind: "hero", instanceId: null }, heroPowerDef.value || 2);
      addLog(`${p.name} utilise ${heroPowerDef.name} et récupère ${healed} point(s) de vie.`);
      renderGame();
      return true;
    }
    if (heroPowerDef.effectType === "draw") {
      p.mana.current -= p.heroPower.cost;
      p.heroPower.usedThisTurn = true;
      drawCard("ai");
      addLog(`${p.name} utilise ${heroPowerDef.name} et pioche une carte.`);
      renderGame();
      return true;
    }
    return previousUseAiHeroPower.apply(this, arguments);
  };

  function playSound(key, gain = 1) {
    return window.ASTREA_SFX?.play?.(key, gain) || null;
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (progress) {
      progress.version = Math.max(28, Number(progress.version || 0));
      saveProgress();
    }
  });
})();
