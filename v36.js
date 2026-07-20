/* Chroniques d'Astréa V36 — Pioches visuelles et animation de pioche
   -------------------------------------------------------------------
   - Ajoute une pioche face cachée sur le plateau, à côté de chaque héros,
     avec le nombre de cartes restantes.
   - Quand une carte est piochée (pioche de début de tour, effet de pioche…),
     une carte face cachée s'envole visuellement de la pioche vers la main.
   - Le dos des cartes peut être personnalisé : déposez une image nommée
     "cards_back_cover" (.png, .jpg, .jpeg ou .gif) dans le dossier
     assets/ui. Sans image fournie, un dos par défaut est utilisé.
*/
(() => {
  const CARD_BACK_EXTENSIONS = ["png", "jpg", "jpeg", "gif"];
  const DRAW_FLIGHT_MS = 480;

  function resolveCardBackImage() {
    let index = 0;
    const tryNext = () => {
      if (index >= CARD_BACK_EXTENSIONS.length) return;
      const src = `assets/ui/cards_back_cover.${CARD_BACK_EXTENSIONS[index++]}`;
      const probe = new Image();
      probe.onload = () => {
        document.documentElement.style.setProperty("--card-back-image", `url("${src}")`);
        document.body.classList.add("has-card-back-image");
      };
      probe.onerror = tryNext;
      probe.src = src;
    };
    tryNext();
  }

  function cacheDeckPileDom() {
    ["ai-deck-pile", "ai-deck-pile-count", "player-deck-pile", "player-deck-pile-count"]
      .forEach(id => { dom[toCamel(id)] = document.getElementById(id); });
  }

  function updateDeckPiles() {
    if (!gameState) return;
    [["player", dom.playerDeckPile, dom.playerDeckPileCount], ["ai", dom.aiDeckPile, dom.aiDeckPileCount]]
      .forEach(([seatId, pileEl, countEl]) => {
        const count = gameState[seatId]?.deck?.length || 0;
        if (countEl) countEl.textContent = String(count);
        if (pileEl) pileEl.classList.toggle("deck-pile-empty", count === 0);
      });
  }

  const original_renderGame = renderGame;
  renderGame = function () {
    const result = original_renderGame.apply(this, arguments);
    updateDeckPiles();
    return result;
  };

  function flyCardFromDeckToHand(seatId) {
    const pileEl = seatId === "player" ? dom.playerDeckPile : dom.aiDeckPile;
    const handEl = seatId === "player" ? dom.playerHand : dom.aiHand;
    if (!pileEl || !handEl) return;
    const from = pileEl.getBoundingClientRect();
    const to = handEl.getBoundingClientRect();
    if (!from.width || !to.width) return;

    const width = seatId === "player" ? 70 : 58;
    const height = seatId === "player" ? 98 : 80;
    const startX = from.left + from.width / 2 - width / 2;
    const startY = from.top + from.height / 2 - height / 2;
    const endX = to.left + to.width / 2 - width / 2;
    const endY = to.top + to.height / 2 - height / 2;

    const flight = document.createElement("div");
    flight.className = "draw-flight-card";
    flight.style.width = `${width}px`;
    flight.style.height = `${height}px`;
    flight.style.left = `${startX}px`;
    flight.style.top = `${startY}px`;
    flight.style.transform = "translate(0, 0) rotate(-6deg) scale(1)";
    flight.style.opacity = "1";
    document.body.appendChild(flight);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flight.style.transform = `translate(${endX - startX}px, ${endY - startY}px) rotate(8deg) scale(.9)`;
        flight.style.opacity = "0.15";
      });
    });

    window.setTimeout(() => flight.remove(), DRAW_FLIGHT_MS + 120);
  }

  const original_drawCard = drawCard;
  drawCard = function (playerId, options = {}) {
    const before = gameState?.[playerId]?.hand?.length ?? 0;
    const result = original_drawCard.apply(this, arguments);
    const after = gameState?.[playerId]?.hand?.length ?? 0;
    if (result && !options.silent && after > before) {
      flyCardFromDeckToHand(playerId);
    }
    return result;
  };

  document.addEventListener("DOMContentLoaded", () => {
    resolveCardBackImage();
    cacheDeckPileDom();
    updateDeckPiles();
  });
})();
