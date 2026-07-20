/* Chroniques d'Astréa V33 — Livre de collection interactif
   ------------------------------------------------------------
   - Remplace la grille de collection par un livre à deux pages.
   - Les cartes non possédées restent affichées mais en gris (non cliquables).
   - Glisser une carte du livre vers la liste du deck pour l'ajouter.
   - Glisser une carte de la liste du deck vers le livre pour la retirer.
   - Boutons « Page précédente / Page suivante » avec animation de
     tourne-page et un son (déposez tourne_page.mp3 / .ogg / .wav dans
     le dossier audio, voir audio/audio-config.js).
*/
(() => {
  const CARDS_PER_HALF_PAGE = 8; // 2 colonnes x 4 rangées par page
  const FLIP_DURATION = 620; // ms — doit rester proche de la transition CSS .book-flip-page

  let bookPage = 0;
  let lastFilterKey = null;
  let isFlipping = false;
  let draggedCardId = null;
  let draggedFromDeck = false;

  const originalRemoveCardFromDeck = removeCardFromDeck;
  const originalRenderDeckEditor = renderDeckEditor;
  const originalOpenCollection = openCollection;

  // Petit son de retrait quand une carte quitte le deck (ajout déjà couvert par V26).
  removeCardFromDeck = function(cardId) {
    const before = Number(progress?.deck?.length || 0);
    const result = originalRemoveCardFromDeck.apply(this, arguments);
    const after = Number(progress?.deck?.length || 0);
    if (after < before) window.ASTREA_SFX?.play?.("cardDiscard", 0.55);
    return result;
  };

  // Rouvrir le livre à la première page à chaque ouverture de l'atelier des decks.
  openCollection = function() {
    bookPage = 0;
    return originalOpenCollection.apply(this, arguments);
  };

  // Rattache le glisser-déposer aux lignes du deck après chaque rendu de la liste.
  renderDeckEditor = function() {
    const result = originalRenderDeckEditor.apply(this, arguments);
    if (dom.deckEditorSubtitle) {
      const heroName = getHeroDefinition(progress.selectedHeroId).name;
      dom.deckEditorSubtitle.textContent = `Héros : ${heroName} · Glissez une carte du livre ici pour l’ajouter, ou glissez une carte du deck vers le livre pour la retirer (clic possible aussi).`;
    }
    enableDeckRowDragAndDrop();
    return result;
  };

  // Remplace entièrement le rendu de la collection par le livre paginé.
  renderCollection = function() {
    renderDeckManager();
    const cards = getFilteredCards();
    const filterKey = `${normalizeText(dom.collectionSearch.value || "")}|${dom.collectionTypeFilter.value}|${dom.collectionCostFilter.value}`;
    if (filterKey !== lastFilterKey) bookPage = 0;
    lastFilterKey = filterKey;
    renderBookSpread(cards, countIds(progress.deck));
    renderDeckEditor();
  };

  document.addEventListener("DOMContentLoaded", () => {
    cacheBookDom();
    bindBookEvents();
    migrateV33Progress();
  });

  function migrateV33Progress() {
    if (!progress) return;
    progress.version = Math.max(33, Number(progress.version || 0));
    saveProgress();
  }

  function cacheBookDom() {
    const ids = [
      "card-book", "book-page-left", "book-page-right",
      "book-page-left-inner", "book-page-right-inner",
      "book-flip-page", "book-flip-page-inner",
      "book-prev-btn", "book-next-btn", "book-page-indicator"
    ];
    ids.forEach(id => { dom[toCamel(id)] = document.getElementById(id); });
  }

  function bindBookEvents() {
    dom.bookPrevBtn?.addEventListener("click", () => turnPage(-1));
    dom.bookNextBtn?.addEventListener("click", () => turnPage(1));

    // Le livre est une zone de dépôt pour retirer une carte glissée depuis le deck.
    [dom.bookPageLeft, dom.bookPageRight].forEach(page => {
      if (!page) return;
      page.addEventListener("dragover", event => {
        if (!draggedFromDeck || !draggedCardId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        page.classList.add("drag-over-remove");
      });
      page.addEventListener("dragleave", () => page.classList.remove("drag-over-remove"));
      page.addEventListener("drop", event => {
        page.classList.remove("drag-over-remove");
        if (!draggedFromDeck || !draggedCardId) return;
        event.preventDefault();
        removeCardFromDeck(draggedCardId);
      });
    });

    // La liste du deck est une zone de dépôt pour ajouter une carte glissée depuis le livre.
    if (dom.deckList) {
      dom.deckList.addEventListener("dragover", event => {
        if (draggedFromDeck || !draggedCardId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        dom.deckList.classList.add("drag-over-deck");
      });
      dom.deckList.addEventListener("dragleave", () => dom.deckList.classList.remove("drag-over-deck"));
      dom.deckList.addEventListener("drop", event => {
        dom.deckList.classList.remove("drag-over-deck");
        if (draggedFromDeck || !draggedCardId) return;
        event.preventDefault();
        addCardToDeck(draggedCardId);
      });
    }
  }

  function getFilteredCards() {
    const search = normalizeText(dom.collectionSearch.value || "");
    const type = dom.collectionTypeFilter.value;
    const costFilter = dom.collectionCostFilter.value;
    return COLLECTIBLE_CARDS
      .filter(card => type === "all" || card.type === type)
      .filter(card => !search || normalizeText(`${card.name} ${card.description}`).includes(search))
      .filter(card => costMatches(card.cost, costFilter))
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "fr"));
  }

  function getTotalPages(cards) {
    return Math.max(1, Math.ceil(cards.length / (CARDS_PER_HALF_PAGE * 2)));
  }

  function renderBookSpread(cardsParam, deckCountsParam) {
    if (!dom.bookPageLeftInner || !dom.bookPageRightInner) return;
    const cards = cardsParam || getFilteredCards();
    const deckCounts = deckCountsParam || countIds(progress.deck);
    const totalPages = getTotalPages(cards);
    if (bookPage >= totalPages) bookPage = totalPages - 1;
    if (bookPage < 0) bookPage = 0;

    const perSpread = CARDS_PER_HALF_PAGE * 2;
    const spreadStart = bookPage * perSpread;
    const leftCards = cards.slice(spreadStart, spreadStart + CARDS_PER_HALF_PAGE);
    const rightCards = cards.slice(spreadStart + CARDS_PER_HALF_PAGE, spreadStart + perSpread);

    fillPage(dom.bookPageLeftInner, leftCards, deckCounts);
    fillPage(dom.bookPageRightInner, rightCards, deckCounts);

    if (dom.bookPageIndicator) dom.bookPageIndicator.textContent = `Page ${bookPage + 1} / ${totalPages}`;
    if (dom.bookPrevBtn) dom.bookPrevBtn.disabled = isFlipping || bookPage <= 0;
    if (dom.bookNextBtn) dom.bookNextBtn.disabled = isFlipping || bookPage >= totalPages - 1;
  }

  function fillPage(container, cards, deckCounts) {
    container.innerHTML = "";
    if (!cards.length) {
      const empty = document.createElement("div");
      empty.className = "book-page-empty";
      empty.textContent = "— page vierge —";
      container.appendChild(empty);
      return;
    }
    cards.forEach(card => container.appendChild(buildBookCardElement(card, deckCounts)));
  }

  function buildBookCardElement(card, deckCounts) {
    const owned = progress.collection[card.id] || 0;
    const inDeck = deckCounts[card.id] || 0;
    const maxCopies = card.rarity === "legendary" ? 1 : 2;
    const canAdd = progress.deck.length < CONFIG.DECK_SIZE && inDeck < Math.min(owned, maxCopies);

    const el = document.createElement("button");
    el.type = "button";
    el.className = `book-card rarity-${card.rarity}${canAdd ? " can-add" : ""}${owned <= 0 ? " unowned" : ""}`;
    el.disabled = !canAdd;
    el.draggable = canAdd;
    el.dataset.cardId = card.id;
    el.innerHTML = `
      <span class="book-card-cost">${card.cost}</span>
      <span class="book-card-art">${getCardArtMarkup(card)}</span>
      <strong>${escapeHtml(card.name)}</strong>
      <small>${typeLabel(card.type)} · Possédées ${owned} · Deck ${inDeck}/${maxCopies}</small>`;
    bindCardImageFallback(el, card);

    el.addEventListener("click", () => { if (canAdd) addCardToDeck(card.id); });
    el.addEventListener("mouseenter", () => previewCard(card));

    el.addEventListener("dragstart", event => {
      if (!canAdd) { event.preventDefault(); return; }
      draggedCardId = card.id;
      draggedFromDeck = false;
      el.classList.add("dragging");
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", card.id);
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      draggedCardId = null;
      draggedFromDeck = false;
    });

    return el;
  }

  function enableDeckRowDragAndDrop() {
    if (!dom.deckList) return;
    Array.from(dom.deckList.children).forEach(row => {
      const cardId = row.dataset.cardId;
      if (!cardId) return;
      row.draggable = true;
      row.addEventListener("dragstart", event => {
        draggedCardId = cardId;
        draggedFromDeck = true;
        row.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", cardId);
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        draggedCardId = null;
        draggedFromDeck = false;
      });
    });
  }

  function turnPage(direction) {
    if (isFlipping) return;
    const cards = getFilteredCards();
    const totalPages = getTotalPages(cards);
    const targetPage = bookPage + direction;
    if (targetPage < 0 || targetPage >= totalPages) return;

    window.ASTREA_SFX?.play?.("pageTurn", 0.85);
    animateFlip(direction, () => {
      bookPage = targetPage;
      renderBookSpread(cards, countIds(progress.deck));
    });
  }

  function animateFlip(direction, onMidpoint) {
    if (!dom.bookFlipPage || !dom.bookFlipPageInner) { onMidpoint(); return; }

    isFlipping = true;
    if (dom.bookPrevBtn) dom.bookPrevBtn.disabled = true;
    if (dom.bookNextBtn) dom.bookNextBtn.disabled = true;

    const sourceInner = direction > 0 ? dom.bookPageRightInner : dom.bookPageLeftInner;
    dom.bookFlipPageInner.innerHTML = sourceInner ? sourceInner.innerHTML : "";

    dom.bookFlipPage.classList.remove("hidden", "flip-next", "flip-prev", "flip-animate");
    dom.bookFlipPage.classList.add(direction > 0 ? "flip-next" : "flip-prev");
    // Force un reflow pour garantir que la transition démarre bien à partir de l'état initial.
    void dom.bookFlipPage.offsetWidth;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dom.bookFlipPage?.classList.add("flip-animate");
      });
    });

    window.setTimeout(onMidpoint, FLIP_DURATION * 0.5);

    window.setTimeout(() => {
      if (!dom.bookFlipPage) return;
      dom.bookFlipPage.classList.add("hidden");
      dom.bookFlipPage.classList.remove("flip-animate", "flip-next", "flip-prev");
      isFlipping = false;
      renderBookSpread(getFilteredCards(), countIds(progress.deck));
    }, FLIP_DURATION + 40);
  }
})();
