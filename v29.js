/* Chroniques d'Astréa V29 — améliorations de l'interface de combat
   - Rangée de cristaux de mana visuels (façon gemmes) sous chaque compteur de mana
   - Infobulle détaillée au survol des boutons de pouvoir héroïque
   - Indicateur de tour actif et bouton "Fin du tour" qui pulse quand vous pouvez agir
*/
(() => {
  const previousRenderHeroesAndCounters = renderHeroesAndCounters;
  renderHeroesAndCounters = function() {
    const result = previousRenderHeroesAndCounters.apply(this, arguments);
    renderManaCrystals("player");
    renderManaCrystals("ai");
    return result;
  };

  function renderManaCrystals(ownerId) {
    const container = document.getElementById(`${ownerId}-mana-crystals`);
    if (!container) return;
    const p = gameState?.[ownerId];
    if (!p) { container.innerHTML = ""; return; }
    const maximum = Math.max(0, Math.min(CONFIG.MAX_MANA, Number(p.mana.maximum || 0)));
    const current = Math.max(0, Number(p.mana.current || 0));
    const overflow = Math.max(0, current - maximum);
    let html = "";
    for (let i = 0; i < maximum; i += 1) {
      html += `<span class="mana-crystal ${i < current ? "filled" : "empty"}"></span>`;
    }
    for (let i = 0; i < overflow; i += 1) {
      html += `<span class="mana-crystal temp"></span>`;
    }
    container.innerHTML = html;
  }

  const previousRenderGame = renderGame;
  renderGame = function() {
    const result = previousRenderGame.apply(this, arguments);
    if (!gameState) return result;
    const playersTurn = gameState.activePlayerId === "player" && gameState.status === "playing";
    dom.turnIndicator?.classList.toggle("active-turn", playersTurn);
    dom.turnIndicator?.classList.toggle("opponent-turn", !playersTurn && gameState.status === "playing");
    const canEndNow = playersTurn && canPlayerInteract() && !gameState.pendingAction;
    dom.endTurnBtn?.classList.toggle("pulse-ready", Boolean(canEndNow));
    return result;
  };

  document.addEventListener("DOMContentLoaded", () => {
    const playerPower = document.getElementById("player-hero-power");
    const aiPower = document.getElementById("ai-hero-power");
    if (playerPower) playerPower.addEventListener("mouseenter", () => previewHero("player"));
    if (aiPower) aiPower.addEventListener("mouseenter", () => previewHero("ai"));

    if (progress) {
      progress.version = Math.max(29, Number(progress.version || 0));
      saveProgress();
    }
  });
})();
