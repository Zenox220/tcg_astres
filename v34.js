/* Chroniques d'Astréa V34 — Comptes, amis, duels et multijoueur réel
   ------------------------------------------------------------------
   Nécessite le petit serveur Node fourni dans /server (voir server/README ou
   le README principal). Sans serveur en ligne, tout le reste du jeu (solo,
   collection, boutique, quêtes, aventure, league) continue de fonctionner
   normalement : les boutons Connexion/Amis/Multijoueur préviennent juste
   que le serveur n'est pas joignable.

   Architecture du multijoueur : le joueur qui lance/accueille la partie
   ("hôte") fait autorité sur l'état de jeu réel (il réutilise le moteur de
   jeu existant tel quel). L'« invité » envoie ses actions au serveur qui les
   relaie à l'hôte ; l'hôte les applique et renvoie l'état complet après
   chaque action, que l'invité affiche (après avoir permuté les points de vue
   "player"/"ai" pour se voir en bas de l'écran comme d'habitude).
*/
(() => {
  const AUTH_TOKEN_KEY = "astrea_auth_token";
  const AUTH_USERNAME_KEY = "astrea_auth_username";

  let authToken = null;
  let username = null;
  let ws = null;
  let wsReconnectTimer = null;

  let pvpRole = null; // "host" | "guest" | null
  let pvpRoomId = null;
  let pvpOpponentName = null;

  let friendsCache = { friends: [], incoming: [], outgoing: [] };
  let pendingDuelChallenger = null;
  let activeFriendActionTarget = null;
  let authMode = "login";

  // -------------------------------------------------------------------
  // Utilitaires réseau
  // -------------------------------------------------------------------
  async function apiFetch(path, { method = "GET", body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (_) {
      throw new Error("Serveur multijoueur injoignable. Veuillez contacter le support si le problème persiste.");
    }
    let data = {};
    try { data = await res.json(); } catch (_) { /* réponse vide */ }
    if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }

  function flipSeat(id) { return id === "player" ? "ai" : (id === "ai" ? "player" : id); }

  function deepFlipOwnerIds(node) {
    if (Array.isArray(node)) { node.forEach(deepFlipOwnerIds); return; }
    if (node && typeof node === "object") {
      Object.keys(node).forEach(key => {
        const val = node[key];
        if (typeof val === "string" && (val === "player" || val === "ai") &&
          (key === "ownerId" || key === "activePlayerId" || key === "firstPlayerId" || key === "playerId" || key === "id")) {
          node[key] = flipSeat(val);
        } else {
          deepFlipOwnerIds(val);
        }
      });
    }
  }

  function swapPerspective(rawState) {
    const clone = JSON.parse(JSON.stringify(rawState));
    const temp = clone.player;
    clone.player = clone.ai;
    clone.ai = temp;
    clone.pendingAction = null;
    deepFlipOwnerIds(clone);
    return clone;
  }

  function flipTargetSeat(ref) {
    if (!ref) return ref;
    return { ...ref, ownerId: flipSeat(ref.ownerId) };
  }

  // -------------------------------------------------------------------
  // Notifications (toasts)
  // -------------------------------------------------------------------
  function showToast(html, duration = 4200, onClick = null) {
    if (!dom.toastContainer) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = html;
    if (onClick) {
      el.style.cursor = "pointer";
      el.addEventListener("click", () => { onClick(); el.remove(); });
    }
    dom.toastContainer.appendChild(el);
    window.setTimeout(() => el.remove(), duration);
  }

  // -------------------------------------------------------------------
  // Session : connexion / inscription / déconnexion
  // -------------------------------------------------------------------
  function setSession(token, name) {
    authToken = token;
    username = name;
    if (token) {
      window.localStorage?.setItem?.(AUTH_TOKEN_KEY, token);
      window.localStorage?.setItem?.(AUTH_USERNAME_KEY, name);
    } else {
      window.localStorage?.removeItem?.(AUTH_TOKEN_KEY);
      window.localStorage?.removeItem?.(AUTH_USERNAME_KEY);
    }
    renderAuthUi();
  }

  function renderAuthUi() {
    if (!dom.authBtn) return;
    if (username) {
      dom.authBtn.textContent = `${username} ▾`;
      dom.friendsBtn?.classList.remove("hidden");
    } else {
      dom.authBtn.textContent = "Connexion";
      dom.friendsBtn?.classList.add("hidden");
      dom.accountMenu?.classList.add("hidden");
    }
  }

  async function tryRestoreSession() {
    const savedToken = window.localStorage?.getItem?.(AUTH_TOKEN_KEY);
    if (!savedToken) return;
    authToken = savedToken;
    try {
      const me = await apiFetch("/api/me");
      setSession(savedToken, me.username);
      connectWebSocket();
      refreshFriends();
    } catch (_) {
      setSession(null, null);
    }
  }

  function openAuthModal(mode = "login") {
    authMode = mode;
    dom.authModal?.classList.remove("hidden");
    setAuthTab(mode);
    dom.authError?.classList.add("hidden");
    window.setTimeout(() => dom.authUsername?.focus(), 30);
  }
  function closeAuthModal() { dom.authModal?.classList.add("hidden"); }

  function setAuthTab(mode) {
    authMode = mode;
    dom.authTabLogin?.classList.toggle("active", mode === "login");
    dom.authTabRegister?.classList.toggle("active", mode === "register");
    if (dom.authSubmitBtn) dom.authSubmitBtn.textContent = mode === "login" ? "Se connecter" : "Créer le compte";
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const rawUsername = dom.authUsername.value.trim();
    const password = dom.authPassword.value;
    dom.authError?.classList.add("hidden");
    try {
      const data = await apiFetch(authMode === "login" ? "/api/login" : "/api/register", {
        method: "POST", body: { username: rawUsername, password }
      });
      setSession(data.token, data.username);
      connectWebSocket();
      refreshFriends();
      closeAuthModal();
      showToast(`Bienvenue, <strong>${escapeHtml(data.username)}</strong> !`);
    } catch (err) {
      if (dom.authError) { dom.authError.textContent = err.message; dom.authError.classList.remove("hidden"); }
    }
  }

  async function logout() {
    try { await apiFetch("/api/logout", { method: "POST" }); } catch (_) { /* ignore */ }
    ws?.close();
    setSession(null, null);
    dom.accountMenu?.classList.add("hidden");
  }

  // -------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------
  function connectWebSocket() {
    if (!authToken) return;
    window.clearTimeout(wsReconnectTimer);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    try {
      ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(authToken)}`);
    } catch (_) { return; }
    ws.addEventListener("message", event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      handleWsMessage(msg);
    });
    ws.addEventListener("close", () => {
      if (authToken) wsReconnectTimer = window.setTimeout(connectWebSocket, 3000);
    });
  }

  function wsSend(payload) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
  }

  function handleWsMessage(msg) {
    switch (msg.type) {
      case "friend_request":
        showToast(`Nouvelle demande d’ami de <strong>${escapeHtml(msg.from)}</strong>.`);
        refreshFriends();
        break;
      case "friend_accept":
        showToast(`<strong>${escapeHtml(msg.from)}</strong> a accepté votre demande d’ami.`);
        refreshFriends();
        break;
      case "friend_declined":
        refreshFriends();
        break;
      case "friend_removed":
        showToast(`<strong>${escapeHtml(msg.from)}</strong> vous a retiré de ses amis.`);
        refreshFriends();
        break;
      case "friend_online":
      case "friend_offline":
        if (!dom.friendsModal?.classList.contains("hidden")) refreshFriends();
        break;
      case "message":
        showToast(`Nouveau message de <strong>${escapeHtml(msg.from)}</strong>.`, 4200, () => openConversation(msg.from));
        if (conversationPartner === msg.from && !dom.conversationModal?.classList.contains("hidden")) {
          apiFetch(`/api/messages/${encodeURIComponent(msg.from)}`).then(({ messages }) => renderConversationMessages(messages)).catch(() => {});
        }
        break;
      case "duel_challenge":
        pendingDuelChallenger = msg.from;
        if (dom.duelChallengeText) dom.duelChallengeText.textContent = `${msg.from} vous provoque en duel !`;
        dom.duelChallengeModal?.classList.remove("hidden");
        break;
      case "duel_declined":
        showToast(`<strong>${escapeHtml(msg.from)}</strong> a décliné votre défi.`);
        break;
      case "duel_unavailable":
        showToast(`<strong>${escapeHtml(msg.username)}</strong> n’est pas disponible pour un duel.`);
        closeMatchmakingModal();
        break;
      case "queue_waiting":
        break;
      case "duel_start":
      case "match_found":
        closeMatchmakingModal();
        dom.duelChallengeModal?.classList.add("hidden");
        if (msg.role === "host") startPvpBattleAsHost(msg.opponent, msg.roomId);
        else startPvpBattleAsGuest(msg.opponent, msg.roomId);
        break;
      case "pvp_state":
        handlePvpState(msg);
        break;
      case "pvp_action":
        handlePvpAction(msg);
        break;
      case "pvp_opponent_left":
        if (msg.roomId === pvpRoomId) {
          showToast("Votre adversaire a quitté la partie.");
          endPvpSession();
          if (typeof leaveCurrentBattle === "function") leaveCurrentBattle();
        }
        break;
      case "trade_offer":
        handleIncomingTradeOffer(msg);
        break;
      case "trade_declined":
        showToast(`<strong>${escapeHtml(msg.from)}</strong> a décliné l’échange.`);
        break;
      case "trade_unavailable":
        showToast(`<strong>${escapeHtml(msg.username)}</strong> n’est pas disponible pour un échange.`);
        break;
      case "trade_cancelled":
        showToast("L’échange a été annulé.");
        dom.tradeOfferModal?.classList.add("hidden");
        dom.tradePickerModal?.classList.add("hidden");
        tradeIncoming = null; tradeMode = null; tradePartner = null;
        break;
      case "trade_completed":
        applyTradeResult(msg);
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------
  // Amis
  // -------------------------------------------------------------------
  async function refreshFriends() {
    if (!authToken) return;
    try {
      friendsCache = await apiFetch("/api/friends");
    } catch (_) { return; }
    const badgeCount = friendsCache.incoming.length;
    if (dom.friendsBadge) {
      dom.friendsBadge.textContent = String(badgeCount);
      dom.friendsBadge.classList.toggle("hidden", badgeCount === 0);
    }
    if (!dom.friendsModal?.classList.contains("hidden")) renderFriendsModal();
  }

  function renderFriendsModal() {
    if (dom.friendsIncomingSection) {
      dom.friendsIncomingSection.classList.toggle("hidden", friendsCache.incoming.length === 0);
      dom.friendsIncomingList.innerHTML = friendsCache.incoming.map(f => `
        <div class="friend-row">
          <span class="friend-row-name-btn">${escapeHtml(f.username)}</span>
          <div class="friend-row-actions">
            <button class="accept-btn" data-accept="${escapeHtml(f.username)}" type="button">Accepter</button>
            <button class="decline-btn" data-decline="${escapeHtml(f.username)}" type="button">Décliner</button>
          </div>
        </div>`).join("");
    }
    if (dom.friendsOutgoingSection) {
      dom.friendsOutgoingSection.classList.toggle("hidden", friendsCache.outgoing.length === 0);
      dom.friendsOutgoingList.innerHTML = friendsCache.outgoing.map(f => `
        <div class="friend-row"><span class="friend-row-name-btn">${escapeHtml(f.username)}</span><small style="color:#a99476;">En attente…</small></div>`).join("");
    }
    if (dom.friendsList) {
      dom.friendsList.innerHTML = friendsCache.friends.map(f => `
        <div class="friend-row">
          <button class="friend-row-name-btn" data-open-friend="${escapeHtml(f.username)}" type="button">
            <span class="friend-online-dot ${f.online ? "online" : ""}"></span>${escapeHtml(f.username)}
          </button>
        </div>`).join("");
      dom.friendsEmptyLabel?.classList.toggle("hidden", friendsCache.friends.length !== 0);
    }

    dom.friendsIncomingList?.querySelectorAll("[data-accept]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await apiFetch("/api/friends/accept", { method: "POST", body: { username: btn.dataset.accept } }).catch(err => showToast(err.message));
        refreshFriends();
      });
    });
    dom.friendsIncomingList?.querySelectorAll("[data-decline]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await apiFetch("/api/friends/decline", { method: "POST", body: { username: btn.dataset.decline } }).catch(err => showToast(err.message));
        refreshFriends();
      });
    });
    dom.friendsList?.querySelectorAll("[data-open-friend]").forEach(btn => {
      btn.addEventListener("click", () => openFriendActionModal(btn.dataset.openFriend));
    });
  }

  function openFriendsModal() {
    if (!username) { openAuthModal("login"); showToast("Connectez-vous pour gérer vos amis."); return; }
    dom.friendsModal?.classList.remove("hidden");
    if (dom.friendsSearchInput) dom.friendsSearchInput.value = "";
    if (dom.friendsSearchResults) dom.friendsSearchResults.innerHTML = "";
    refreshFriends();
  }
  function closeFriendsModal() { dom.friendsModal?.classList.add("hidden"); }

  let searchDebounce = null;
  function onFriendsSearchInput() {
    window.clearTimeout(searchDebounce);
    const q = dom.friendsSearchInput.value.trim();
    if (q.length < 2) { dom.friendsSearchResults.innerHTML = ""; return; }
    searchDebounce = window.setTimeout(async () => {
      let results = [];
      try { ({ results } = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`)); } catch (_) { return; }
      dom.friendsSearchResults.innerHTML = results.map(r => {
        const label = r.status === "friend" ? "Déjà ami"
          : r.status === "pending_out" ? "Demande envoyée"
          : r.status === "pending_in" ? "Accepter"
          : "Ajouter";
        const disabled = r.status === "friend" || r.status === "pending_out" ? "disabled" : "";
        return `<div class="friend-row">
          <span class="friend-row-name-btn">${escapeHtml(r.username)}</span>
          <div class="friend-row-actions"><button data-search-action="${escapeHtml(r.username)}" data-status="${r.status}" ${disabled} type="button">${label}</button></div>
        </div>`;
      }).join("") || `<p class="friends-empty-label">Aucun joueur trouvé.</p>`;

      dom.friendsSearchResults.querySelectorAll("[data-search-action]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const target = btn.dataset.searchAction;
          try {
            if (btn.dataset.status === "pending_in") await apiFetch("/api/friends/accept", { method: "POST", body: { username: target } });
            else await apiFetch("/api/friends/request", { method: "POST", body: { username: target } });
            showToast(`Demande envoyée à <strong>${escapeHtml(target)}</strong>.`);
          } catch (err) { showToast(err.message); }
          onFriendsSearchInput();
          refreshFriends();
        });
      });
    }, 260);
  }

  function openFriendActionModal(friendUsername) {
    activeFriendActionTarget = friendUsername;
    if (dom.friendActionTitle) dom.friendActionTitle.textContent = friendUsername;
    dom.friendReportPanel?.classList.add("hidden");
    if (dom.friendReportText) dom.friendReportText.value = "";
    dom.friendActionModal?.classList.remove("hidden");
  }
  function closeFriendActionModal() { dom.friendActionModal?.classList.add("hidden"); activeFriendActionTarget = null; }

  async function sendFriendReport() {
    const reason = dom.friendReportText.value.trim();
    if (!activeFriendActionTarget) return;
    try {
      await apiFetch("/api/report", { method: "POST", body: { username: activeFriendActionTarget, reason } });
      showToast(`Signalement envoyé pour <strong>${escapeHtml(activeFriendActionTarget)}</strong>.`);
      closeFriendActionModal();
    } catch (err) { showToast(err.message); }
  }

  async function removeFriend() {
    if (!activeFriendActionTarget) return;
    try {
      await apiFetch("/api/friends/remove", { method: "POST", body: { username: activeFriendActionTarget } });
      showToast(`<strong>${escapeHtml(activeFriendActionTarget)}</strong> retiré de vos amis.`);
      closeFriendActionModal();
      refreshFriends();
    } catch (err) { showToast(err.message); }
  }

  function challengeFriendToDuel() {
    if (!activeFriendActionTarget) return;
    wsSend({ type: "duel_challenge", to: activeFriendActionTarget });
    showToast(`Défi envoyé à <strong>${escapeHtml(activeFriendActionTarget)}</strong>…`);
    closeFriendActionModal();
  }

  // -------------------------------------------------------------------
  // Conversations (historique complet des messages avec un ami)
  // -------------------------------------------------------------------
  let conversationPartner = null;

  function formatMessageTime(ts) {
    try { return new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch (_) { return ""; }
  }

  function renderConversationMessages(messages) {
    if (!dom.conversationMessages) return;
    if (!messages.length) {
      dom.conversationMessages.innerHTML = `<p class="conversation-empty">Aucun message pour l’instant. Dites bonjour !</p>`;
      return;
    }
    dom.conversationMessages.innerHTML = messages.map(m => {
      const own = m.from === username;
      return `<div class="conversation-bubble ${own ? "own" : "theirs"}">${escapeHtml(m.text)}<time>${own ? "Vous" : escapeHtml(m.from)} · ${formatMessageTime(m.createdAt)}</time></div>`;
    }).join("");
    dom.conversationMessages.scrollTop = dom.conversationMessages.scrollHeight;
  }

  async function openConversation(friendUsername) {
    conversationPartner = friendUsername;
    closeFriendActionModal();
    if (dom.conversationTitle) dom.conversationTitle.textContent = friendUsername;
    if (dom.conversationInput) dom.conversationInput.value = "";
    dom.conversationMessages.innerHTML = `<p class="conversation-empty">Chargement…</p>`;
    dom.conversationModal?.classList.remove("hidden");
    try {
      const { messages } = await apiFetch(`/api/messages/${encodeURIComponent(friendUsername)}`);
      if (conversationPartner === friendUsername) renderConversationMessages(messages);
    } catch (err) {
      dom.conversationMessages.innerHTML = `<p class="conversation-empty">${escapeHtml(err.message)}</p>`;
    }
  }
  function closeConversation() { dom.conversationModal?.classList.add("hidden"); conversationPartner = null; }

  async function sendConversationMessage() {
    const text = dom.conversationInput.value.trim();
    if (!text || !conversationPartner) return;
    dom.conversationInput.value = "";
    try {
      await apiFetch("/api/messages", { method: "POST", body: { username: conversationPartner, text } });
      const { messages } = await apiFetch(`/api/messages/${encodeURIComponent(conversationPartner)}`);
      if (conversationPartner) renderConversationMessages(messages);
    } catch (err) { showToast(err.message); }
  }

  // -------------------------------------------------------------------
  // Échange de cartes entre amis
  // -------------------------------------------------------------------
  let tradeMode = null; // "offer" (je propose) | "accept" (je choisis ma carte en retour)
  let tradePartner = null;
  let tradeIncoming = null; // { tradeId, from, cardId } offre reçue en attente
  let tradeSelectedCardId = null;

  function tradeCardArtMarkup(card) {
    return `<span class="trade-card-art">${getCardArtMarkup(card)}</span>`;
  }

  function buildTradeCardPreview(card) {
    return `
      <div class="trade-card-art">${getCardArtMarkup(card)}</div>
      <div class="trade-card-details">
        <strong>${escapeHtml(card.name)}</strong>
        <span>${typeLabel(card.type)} · ${rarityLabel(card.rarity)} · Coût ${card.cost}</span>
        <p>${escapeHtml(card.description || "")}</p>
      </div>`;
  }

  function openTradeFlow(friendUsername) {
    tradeMode = "offer";
    tradePartner = friendUsername;
    tradeSelectedCardId = null;
    closeFriendActionModal();
    if (dom.tradePickerTitle) dom.tradePickerTitle.textContent = "Choisissez une carte à échanger";
    if (dom.tradePickerSubtitle) dom.tradePickerSubtitle.textContent = `Cette carte sera proposée à ${friendUsername}.`;
    renderTradePickerGrid(COLLECTIBLE_CARDS.filter(c => (progress.collection[c.id] || 0) > 0));
    dom.tradePickerReview?.classList.add("hidden");
    dom.tradePickerFooter?.classList.remove("hidden");
    dom.tradePickerModal?.classList.remove("hidden");
  }

  function renderTradePickerGrid(cards) {
    tradeSelectedCardId = null;
    if (dom.tradePickerConfirmBtn) dom.tradePickerConfirmBtn.disabled = true;
    if (!dom.tradePickerGrid) return;
    dom.tradePickerEmpty?.classList.toggle("hidden", cards.length !== 0);
    dom.tradePickerGrid.classList.toggle("hidden", cards.length === 0);
    dom.tradePickerGrid.innerHTML = cards.map(card => `
      <button type="button" class="trade-card rarity-${card.rarity}" data-trade-card="${card.id}">
        ${tradeCardArtMarkup(card)}
        <strong>${escapeHtml(card.name)}</strong>
        <small>${rarityLabel(card.rarity)} · Coût ${card.cost}</small>
        <p>${escapeHtml(card.description || "")}</p>
      </button>`).join("");
    dom.tradePickerGrid.querySelectorAll("[data-trade-card]").forEach(el => {
      bindCardImageFallback(el, CARD_BY_ID[el.dataset.tradeCard]);
      el.addEventListener("click", () => {
        tradeSelectedCardId = el.dataset.tradeCard;
        dom.tradePickerGrid.querySelectorAll(".trade-card").forEach(c => c.classList.toggle("selected", c === el));
        if (dom.tradePickerConfirmBtn) dom.tradePickerConfirmBtn.disabled = false;
      });
    });
  }

  function closeTradePickerModal() {
    // Si on était en train de choisir la carte à donner suite à une offre acceptée
    // sans avoir finalisé, on décline proprement pour ne pas laisser l'autre joueur en attente.
    if (tradeMode === "accept" && tradeIncoming) {
      wsSend({ type: "trade_decline", tradeId: tradeIncoming.tradeId });
      tradeIncoming = null;
    }
    dom.tradePickerModal?.classList.add("hidden");
    tradeMode = null; tradePartner = null; tradeSelectedCardId = null;
  }

  function confirmTradePickerSelection() {
    if (!tradeSelectedCardId) return;
    if (tradeMode === "offer") {
      wsSend({ type: "trade_offer", to: tradePartner, cardId: tradeSelectedCardId });
      showToast(`Offre d’échange envoyée à <strong>${escapeHtml(tradePartner)}</strong>…`);
      dom.tradePickerModal?.classList.add("hidden");
      tradeMode = null; tradePartner = null; tradeSelectedCardId = null;
      return;
    }
    // mode "accept" : on passe à l'étape de revue avant la finalisation.
    const card = CARD_BY_ID[tradeSelectedCardId];
    if (dom.tradePickerReviewCard) { dom.tradePickerReviewCard.innerHTML = buildTradeCardPreview(card); bindCardImageFallback(dom.tradePickerReviewCard, card); }
    dom.tradePickerFooter?.classList.add("hidden");
    dom.tradePickerGrid?.classList.add("hidden");
    dom.tradePickerReview?.classList.remove("hidden");
  }

  function backToTradeGridFromReview() {
    dom.tradePickerReview?.classList.add("hidden");
    dom.tradePickerFooter?.classList.remove("hidden");
    dom.tradePickerGrid?.classList.remove("hidden");
  }

  function finalizeTradeAsAccepter() {
    if (!tradeIncoming || !tradeSelectedCardId) return;
    wsSend({ type: "trade_finalize", tradeId: tradeIncoming.tradeId, cardId: tradeSelectedCardId });
    dom.tradePickerModal?.classList.add("hidden");
    tradeIncoming = null; tradeMode = null; tradePartner = null; tradeSelectedCardId = null;
  }

  function handleIncomingTradeOffer(msg) {
    tradeIncoming = { tradeId: msg.tradeId, from: msg.from, cardId: msg.cardId };
    const card = CARD_BY_ID[msg.cardId];
    if (dom.tradeOfferText) dom.tradeOfferText.textContent = `${msg.from} vous propose :`;
    if (dom.tradeOfferCard && card) { dom.tradeOfferCard.innerHTML = buildTradeCardPreview(card); bindCardImageFallback(dom.tradeOfferCard, card); }
    dom.tradeOfferModal?.classList.remove("hidden");
  }

  function declineIncomingTrade() {
    dom.tradeOfferModal?.classList.add("hidden");
    if (tradeIncoming) wsSend({ type: "trade_decline", tradeId: tradeIncoming.tradeId });
    tradeIncoming = null;
  }

  function acceptIncomingTrade() {
    dom.tradeOfferModal?.classList.add("hidden");
    if (!tradeIncoming) return;
    const offeredCard = CARD_BY_ID[tradeIncoming.cardId];
    tradeMode = "accept";
    tradePartner = tradeIncoming.from;
    if (dom.tradePickerTitle) dom.tradePickerTitle.textContent = "Choisissez la carte à donner en échange";
    if (dom.tradePickerSubtitle) dom.tradePickerSubtitle.textContent = `Elle doit être de la même rareté : ${rarityLabel(offeredCard.rarity)}.`;
    renderTradePickerGrid(COLLECTIBLE_CARDS.filter(c => (progress.collection[c.id] || 0) > 0 && c.rarity === offeredCard.rarity));
    dom.tradePickerReview?.classList.add("hidden");
    dom.tradePickerFooter?.classList.remove("hidden");
    dom.tradePickerGrid?.classList.remove("hidden");
    dom.tradePickerModal?.classList.remove("hidden");
  }

  function playTradeSwapAnimation(cardGiven, cardReceived, otherUsername, onDone) {
    if (!dom.tradeSwapOverlay) { onDone(); return; }
    if (dom.tradeSwapCardLeft) { dom.tradeSwapCardLeft.innerHTML = `<span class="trade-card-art">${getCardArtMarkup(cardGiven)}</span>`; bindCardImageFallback(dom.tradeSwapCardLeft, cardGiven); }
    if (dom.tradeSwapCardRight) { dom.tradeSwapCardRight.innerHTML = `<span class="trade-card-art">${getCardArtMarkup(cardReceived)}</span>`; bindCardImageFallback(dom.tradeSwapCardRight, cardReceived); }
    dom.tradeSwapCardLeft?.classList.remove("swap-animate");
    dom.tradeSwapCardRight?.classList.remove("swap-animate");
    dom.tradeSwapCardLeft?.classList.add("from-left");
    dom.tradeSwapCardRight?.classList.add("from-right");
    if (dom.tradeSwapCaption) dom.tradeSwapCaption.textContent = `Échange avec ${otherUsername} : vous recevez ${cardReceived.name} !`;
    dom.tradeSwapOverlay.classList.remove("hidden");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      dom.tradeSwapCardLeft?.classList.add("swap-animate");
      dom.tradeSwapCardRight?.classList.add("swap-animate");
    }));
    window.setTimeout(() => {
      dom.tradeSwapOverlay.classList.add("hidden");
      onDone();
    }, 2000);
  }

  function applyTradeResult(msg) {
    const cardGiven = CARD_BY_ID[msg.cardGiven];
    const cardReceived = CARD_BY_ID[msg.cardReceived];
    if (!cardGiven || !cardReceived) return;
    playTradeSwapAnimation(cardGiven, cardReceived, msg.otherUsername, () => {
      progress.collection[msg.cardGiven] = Math.max(0, (progress.collection[msg.cardGiven] || 0) - 1);
      progress.collection[msg.cardReceived] = (progress.collection[msg.cardReceived] || 0) + 1;
      saveProgress();
      if (typeof renderCollection === "function" && dom.collectionScreen && !dom.collectionScreen.classList.contains("hidden")) renderCollection();
      showToast(`Échange conclu avec <strong>${escapeHtml(msg.otherUsername)}</strong> : vous recevez <strong>${escapeHtml(cardReceived.name)}</strong>.`);
    });
  }



  function acceptIncomingDuel() {
    dom.duelChallengeModal?.classList.add("hidden");
    if (!pendingDuelChallenger) return;
    if (!isDeckStructurallyValid(progress.deck, progress.collection)) {
      showToast("Votre deck doit contenir 30 cartes valides pour accepter un duel.");
      wsSend({ type: "duel_decline", to: pendingDuelChallenger });
      pendingDuelChallenger = null;
      return;
    }
    wsSend({ type: "duel_accept", to: pendingDuelChallenger, deck: progress.deck, heroId: progress.selectedHeroId });
    pendingDuelChallenger = null;
  }
  function declineIncomingDuel() {
    dom.duelChallengeModal?.classList.add("hidden");
    if (pendingDuelChallenger) wsSend({ type: "duel_decline", to: pendingDuelChallenger });
    pendingDuelChallenger = null;
  }

  // -------------------------------------------------------------------
  // Matchmaking multijoueur
  // -------------------------------------------------------------------
  function openMultiplayerFlow() {
    if (!username) { openAuthModal("login"); showToast("Connectez-vous pour affronter de vrais joueurs."); return; }
    if (!isDeckStructurallyValid(progress.deck, progress.collection)) {
      showToast("Votre deck doit contenir 30 cartes valides avant de jouer en multijoueur.");
      openCollection();
      return;
    }
    dom.matchmakingModal?.classList.remove("hidden");
    wsSend({ type: "queue_join", deck: progress.deck, heroId: progress.selectedHeroId });
  }
  function closeMatchmakingModal() { dom.matchmakingModal?.classList.add("hidden"); }
  function cancelMatchmaking() { wsSend({ type: "queue_leave" }); closeMatchmakingModal(); }

  // -------------------------------------------------------------------
  // Pont multijoueur <-> moteur de jeu
  // -------------------------------------------------------------------
  function showGameScreenForBattle() {
    [dom.startScreen, dom.collectionScreen, dom.shopScreen, dom.questsScreen, dom.adventureScreen, dom.settingsScreen, dom.leagueScreen]
      .forEach(el => el?.classList.add("hidden"));
    dom.gameScreen.classList.remove("hidden");
    dom.gameOverModal.classList.add("hidden");
    dom.choiceModal.classList.add("hidden");
    if (dom.gameOverMenuBtn) dom.gameOverMenuBtn.textContent = "Menu";
  }

  function showPvpWaitingOverlay(text) {
    if (dom.pvpWaitingText) dom.pvpWaitingText.textContent = text;
    dom.pvpWaitingOverlay?.classList.remove("hidden");
  }
  function hidePvpWaitingOverlay() { dom.pvpWaitingOverlay?.classList.add("hidden"); }

  function endPvpSession() {
    pvpRole = null;
    pvpRoomId = null;
    pvpOpponentName = null;
    hidePvpWaitingOverlay();
  }

  function startPvpBattleAsHost(opponent, roomId) {
    resetHeroDefeatVisuals();
    if (!isDeckStructurallyValid(progress.deck, progress.collection)) {
      showToast("Votre deck n’est pas valide pour ce duel.");
      return;
    }
    draggedPayload = null;
    const playerHeroDef = getHeroDefinition(progress.selectedHeroId);
    const opponentDeckList = Array.isArray(opponent.deck) && opponent.deck.length === CONFIG.DECK_SIZE ? opponent.deck : AI_DECK_LIST;
    const opponentHeroDef = getHeroDefinition(opponent.heroId);
    const firstPlayerId = Math.random() < 0.5 ? "player" : "ai";
    interactionLocked = firstPlayerId === "ai";

    pvpRole = "host";
    pvpRoomId = roomId;
    pvpOpponentName = opponent.username;

    gameState = {
      status: "playing", mode: "pvp", adventureId: null, turnNumber: 1, activePlayerId: firstPlayerId, firstPlayerId,
      pendingAction: null, combatLog: [], cardsPlayedTotal: 0,
      player: createPlayerState("player", playerHeroDef),
      ai: createPlayerState("ai", opponentHeroDef)
    };
    gameState.player.name = username || gameState.player.name;
    gameState.ai.name = opponent.username;
    gameState.player.deck = buildDeck(progress.deck);
    gameState.ai.deck = buildDeck(opponentDeckList);
    for (let i = 0; i < CONFIG.STARTING_HAND; i += 1) { drawCard("player", { silent: true }); drawCard("ai", { silent: true }); }
    addCardToHand(getOpponentId(firstPlayerId), "token_004");
    gameState[firstPlayerId].mana = { current: 1, maximum: 1 };

    showGameScreenForBattle();
    addLog(firstPlayerId === "player"
      ? `Duel contre ${opponent.username}. Vous jouez en premier.`
      : `Duel contre ${opponent.username}. ${opponent.username} joue en premier. Vous recevez La pièce.`);
    renderGame();
  }

  function startPvpBattleAsGuest(opponent, roomId) {
    pvpRole = "guest";
    pvpRoomId = roomId;
    pvpOpponentName = opponent.username;
    gameState = null;
    showGameScreenForBattle();
    showPvpWaitingOverlay(`Connexion au duel contre ${opponent.username}…`);
  }

  function broadcastPvpState() {
    if (pvpRole !== "host" || !pvpRoomId) return;
    wsSend({ type: "pvp_state", roomId: pvpRoomId, state: gameState });
  }

  function sendPvpAction(action) {
    if (pvpRole !== "guest" || !pvpRoomId) return;
    wsSend({ type: "pvp_action", roomId: pvpRoomId, action });
  }

  function handlePvpState(msg) {
    if (pvpRole !== "guest" || msg.roomId !== pvpRoomId) return;
    gameState = swapPerspective(msg.state);
    hidePvpWaitingOverlay();
    renderGame();
  }

  function handlePvpAction(msg) {
    if (msg.roomId !== pvpRoomId) return;
    if (msg.action?.kind === "matchResult") {
      if (pvpRole === "guest" && msg.action.result === "guest_win") {
        updateDailyQuestProgress("winMatch", 1);
      }
      return;
    }
    if (pvpRole === "host") applyGuestAction(msg.action);
  }

  function applyGuestAction(action) {
    if (pvpRole !== "host" || !gameState || gameState.status !== "playing") return;
    if (action.kind === "playCard") {
      const idx = gameState.ai.hand.findIndex(c => c.instanceId === action.instanceId);
      if (idx >= 0) playCardFromHand("ai", idx, action.target || null);
    } else if (action.kind === "attack") {
      performAttack(action.attacker, action.target);
    } else if (action.kind === "heroPowerArmor") {
      applySeatHeroPowerArmor("ai");
    } else if (action.kind === "heroPowerDamage") {
      applySeatHeroPowerDamage("ai", action.target);
    } else if (action.kind === "endTurn") {
      hostFinishGuestTurn();
    }
  }

  function applySeatHeroPowerArmor(seatId) {
    const p = gameState[seatId];
    if (!canUseHeroPower(seatId)) return;
    const heroPowerDef = getHeroPowerDefinition(p.heroPower.type);
    p.mana.current -= p.heroPower.cost;
    p.heroPower.usedThisTurn = true;
    p.hero.armor += 2;
    addLog(`${p.name} utilise ${heroPowerDef.name} et gagne 2 Armure.`);
    renderGame();
  }

  function applySeatHeroPowerDamage(seatId, target) {
    const p = gameState[seatId];
    if (!canUseHeroPower(seatId)) return;
    if (!isTargetValidForEffect(seatId, { effect: "damage", target: "enemyCharacter", value: 1 }, target)) return;
    const heroPowerDef = getHeroPowerDefinition(p.heroPower.type);
    p.mana.current -= p.heroPower.cost;
    p.heroPower.usedThisTurn = true;
    applyDamageToTarget(target, 1);
    addLog(`${p.name} utilise ${heroPowerDef.name}.`);
    gameState.pendingAction = null;
    resolveDeaths();
    checkGameOver();
    renderGame();
  }

  function hostFinishGuestTurn() {
    if (!gameState || gameState.status !== "playing") return;
    resolveTriggeredEffects("ai", "endOfTurn");
    resolveDeaths();
    endTurnCleanup("ai");
    if (checkGameOver()) { renderGame(); return; }
    gameState.turnNumber += 1;
    beginTurn("player");
    addLog(`Tour ${gameState.turnNumber} : à vous de jouer.`);
    interactionLocked = false;
    renderGame();
  }

  // -------------------------------------------------------------------
  // Interception du moteur de jeu (voir commentaire d'en-tête)
  // -------------------------------------------------------------------
  const original_renderGame = renderGame;
  renderGame = function () {
    const result = original_renderGame.apply(this, arguments);
    if (pvpRole === "host" && gameState?.mode === "pvp") broadcastPvpState();
    return result;
  };

  const original_playCardFromHand = playCardFromHand;
  playCardFromHand = async function (playerId, handIndex, target = null) {
    if (pvpRole === "guest" && playerId === "player") {
      const instance = gameState.player.hand[handIndex];
      if (!instance) return;
      sendPvpAction({ kind: "playCard", instanceId: instance.instanceId, target: target ? flipTargetSeat(target) : null });
      gameState.pendingAction = null;
      renderGame();
      return;
    }
    return original_playCardFromHand.apply(this, arguments);
  };

  const original_performAttack = performAttack;
  performAttack = async function (attackerRef, target) {
    if (pvpRole === "guest") {
      sendPvpAction({ kind: "attack", attacker: flipTargetSeat(attackerRef), target: flipTargetSeat(target) });
      gameState.pendingAction = null;
      renderGame();
      return;
    }
    return original_performAttack.apply(this, arguments);
  };

  const original_usePlayerHeroPower = usePlayerHeroPower;
  usePlayerHeroPower = function () {
    if (pvpRole === "guest") {
      if (!canUseHeroPower("player")) return;
      const heroPowerDef = getHeroPowerDefinition(gameState.player.heroPower.type);
      if (heroPowerDef.effectType === "damage") return original_usePlayerHeroPower.apply(this, arguments);
      sendPvpAction({ kind: "heroPowerArmor" });
      return;
    }
    return original_usePlayerHeroPower.apply(this, arguments);
  };

  const original_executePendingAction = executePendingAction;
  executePendingAction = async function (target) {
    const pending = gameState?.pendingAction;
    if (pvpRole === "guest" && pending?.type === "heroPower") {
      if (!isTargetValidForEffect("player", pending.effect, target)) return;
      gameState.pendingAction = null;
      renderGame();
      sendPvpAction({ kind: "heroPowerDamage", target: flipTargetSeat(target) });
      return;
    }
    return original_executePendingAction.apply(this, arguments);
  };

  const original_endPlayerTurn = endPlayerTurn;
  endPlayerTurn = async function () {
    if (pvpRole === "guest") {
      if (!canPlayerInteract()) return;
      interactionLocked = true;
      renderGame();
      sendPvpAction({ kind: "endTurn" });
      return;
    }
    return original_endPlayerTurn.apply(this, arguments);
  };

  const original_playAiTurn = playAiTurn;
  playAiTurn = async function () {
    if (pvpRole === "host" && gameState?.mode === "pvp") return;
    return original_playAiTurn.apply(this, arguments);
  };

  const original_checkGameOver = checkGameOver;
  checkGameOver = function () {
    const wasPlaying = gameState?.status === "playing";
    const result = original_checkGameOver.apply(this, arguments);
    if (pvpRole === "host" && wasPlaying && gameState?.status === "finished" && gameState.mode === "pvp") {
      const playerDefeated = gameState.player.hero.currentHealth <= 0;
      const aiDefeated = gameState.ai.hero.currentHealth <= 0;
      let outcome = "draw";
      if (aiDefeated && !playerDefeated) outcome = "host_win";
      else if (playerDefeated && !aiDefeated) outcome = "guest_win";
      sendPvpMatchResult(outcome);
    }
    return result;
  };
  function sendPvpMatchResult(outcome) {
    if (!pvpRoomId) return;
    wsSend({ type: "pvp_action", roomId: pvpRoomId, action: { kind: "matchResult", result: outcome } });
  }

  const original_leaveCurrentBattle = leaveCurrentBattle;
  leaveCurrentBattle = function () {
    if (pvpRoomId) {
      wsSend({ type: "pvp_leave", roomId: pvpRoomId });
      endPvpSession();
    }
    return original_leaveCurrentBattle.apply(this, arguments);
  };
  const original_returnAfterGameOver = returnAfterGameOver;
  returnAfterGameOver = function () {
    if (gameState?.mode === "pvp") endPvpSession();
    return original_returnAfterGameOver.apply(this, arguments);
  };

  // -------------------------------------------------------------------
  // Initialisation UI
  // -------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    cacheV34Dom();
    bindV34Events();
    tryRestoreSession();
  });

  function cacheV34Dom() {
    const ids = [
      "auth-btn", "account-menu", "account-logout-btn", "friends-btn", "friends-badge",
      "auth-modal", "auth-modal-close-btn", "auth-tab-login", "auth-tab-register", "auth-form",
      "auth-username", "auth-password", "auth-error", "auth-submit-btn",
      "friends-modal", "friends-modal-close-btn", "friends-search-input", "friends-search-results",
      "friends-incoming-section", "friends-incoming-list", "friends-outgoing-section", "friends-outgoing-list",
      "friends-list", "friends-empty-label",
      "friend-action-modal", "friend-action-close-btn", "friend-action-title",
      "friend-action-duel-btn", "friend-action-message-btn", "friend-action-trade-btn",
      "friend-action-report-btn", "friend-action-remove-btn",
      "friend-report-panel", "friend-report-text", "friend-report-send-btn",
      "duel-challenge-modal", "duel-challenge-text", "duel-accept-btn", "duel-decline-btn",
      "open-multiplayer-btn", "matchmaking-modal", "matchmaking-cancel-btn",
      "pvp-waiting-overlay", "pvp-waiting-text", "toast-container",
      "conversation-modal", "conversation-close-btn", "conversation-title", "conversation-messages",
      "conversation-input", "conversation-send-btn",
      "trade-picker-modal", "trade-picker-close-btn", "trade-picker-title", "trade-picker-subtitle",
      "trade-picker-grid", "trade-picker-empty", "trade-picker-review", "trade-picker-review-card",
      "trade-picker-change-btn", "trade-picker-finalize-btn", "trade-picker-footer", "trade-picker-confirm-btn",
      "trade-offer-modal", "trade-offer-text", "trade-offer-card", "trade-offer-accept-btn", "trade-offer-decline-btn",
      "trade-swap-overlay", "trade-swap-card-left", "trade-swap-card-right", "trade-swap-caption"
    ];
    ids.forEach(id => { dom[toCamel(id)] = document.getElementById(id); });
  }

  function bindV34Events() {
    dom.authBtn?.addEventListener("click", () => {
      if (username) { dom.accountMenu?.classList.toggle("hidden"); return; }
      openAuthModal("login");
    });
    dom.accountLogoutBtn?.addEventListener("click", logout);
    document.addEventListener("click", event => {
      if (dom.accountMenu && !dom.accountMenu.classList.contains("hidden") &&
        !dom.accountMenu.contains(event.target) && event.target !== dom.authBtn) {
        dom.accountMenu.classList.add("hidden");
      }
    });

    dom.authModalCloseBtn?.addEventListener("click", closeAuthModal);
    dom.authModal?.addEventListener("click", event => { if (event.target === dom.authModal) closeAuthModal(); });
    dom.authTabLogin?.addEventListener("click", () => setAuthTab("login"));
    dom.authTabRegister?.addEventListener("click", () => setAuthTab("register"));
    dom.authForm?.addEventListener("submit", handleAuthSubmit);

    dom.friendsBtn?.addEventListener("click", openFriendsModal);
    dom.friendsModalCloseBtn?.addEventListener("click", closeFriendsModal);
    dom.friendsModal?.addEventListener("click", event => { if (event.target === dom.friendsModal) closeFriendsModal(); });
    dom.friendsSearchInput?.addEventListener("input", onFriendsSearchInput);

    dom.friendActionCloseBtn?.addEventListener("click", closeFriendActionModal);
    dom.friendActionModal?.addEventListener("click", event => { if (event.target === dom.friendActionModal) closeFriendActionModal(); });
    dom.friendActionDuelBtn?.addEventListener("click", challengeFriendToDuel);
    dom.friendActionMessageBtn?.addEventListener("click", () => { if (activeFriendActionTarget) openConversation(activeFriendActionTarget); });
    dom.friendActionTradeBtn?.addEventListener("click", () => { if (activeFriendActionTarget) openTradeFlow(activeFriendActionTarget); });
    dom.friendActionReportBtn?.addEventListener("click", () => {
      dom.friendReportPanel?.classList.toggle("hidden");
    });
    dom.friendReportSendBtn?.addEventListener("click", sendFriendReport);
    dom.friendActionRemoveBtn?.addEventListener("click", removeFriend);

    dom.conversationCloseBtn?.addEventListener("click", closeConversation);
    dom.conversationModal?.addEventListener("click", event => { if (event.target === dom.conversationModal) closeConversation(); });
    dom.conversationSendBtn?.addEventListener("click", sendConversationMessage);
    dom.conversationInput?.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendConversationMessage(); }
    });

    dom.tradePickerCloseBtn?.addEventListener("click", closeTradePickerModal);
    dom.tradePickerModal?.addEventListener("click", event => { if (event.target === dom.tradePickerModal) closeTradePickerModal(); });
    dom.tradePickerConfirmBtn?.addEventListener("click", confirmTradePickerSelection);
    dom.tradePickerChangeBtn?.addEventListener("click", backToTradeGridFromReview);
    dom.tradePickerFinalizeBtn?.addEventListener("click", finalizeTradeAsAccepter);
    dom.tradeOfferAcceptBtn?.addEventListener("click", acceptIncomingTrade);
    dom.tradeOfferDeclineBtn?.addEventListener("click", declineIncomingTrade);

    dom.duelAcceptBtn?.addEventListener("click", acceptIncomingDuel);
    dom.duelDeclineBtn?.addEventListener("click", declineIncomingDuel);

    dom.openMultiplayerBtn?.addEventListener("click", openMultiplayerFlow);
    dom.matchmakingCancelBtn?.addEventListener("click", cancelMatchmaking);
  }
})();
