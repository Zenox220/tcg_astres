/* Chroniques d'Astréa V40 — LiveOps pilotés depuis le panel administrateur */
(() => {
  "use strict";

  const RAW_SERVER_URL = String(window.ASTREA_SERVER_URL || "").trim().replace(/\/+$/, "");
  const API_BASE = RAW_SERVER_URL && !RAW_SERVER_URL.includes("REMPLACEZ-MOI") ? RAW_SERVER_URL : "";
  const AUTH_KEY = "astrea_auth_token";
  const REFRESH_MS = 60000;
  const state = { config: null, originalCards: new Map(), moderation: null, timer: null, pendingPacks: new Set(), pendingCards: new Set() };

  const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const token = () => { try { return String(localStorage.getItem(AUTH_KEY) || ""); } catch (_) { return ""; } };
  const fmtDate = value => value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";

  function toast(message, isError = false) {
    const old = document.querySelector(".liveops-toast");
    old?.remove();
    const el = document.createElement("div");
    el.className = "liveops-toast";
    el.setAttribute("role", "status");
    el.style.cssText = `position:fixed;right:18px;bottom:18px;z-index:11000;max-width:min(430px,calc(100% - 36px));padding:12px 15px;border-radius:12px;border:1px solid ${isError ? "rgba(232,128,86,.65)" : "rgba(221,178,90,.5)"};background:${isError ? "rgba(64,25,28,.97)" : "rgba(20,23,34,.97)"};color:#fff;box-shadow:0 15px 45px rgba(0,0,0,.4)`;
    el.textContent = String(message || (isError ? "Une erreur est survenue." : "Opération effectuée."));
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 5200);
  }

  async function api(path, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    const auth = token();
    if (auth) headers.Authorization = `Bearer ${auth}`;
    if (options.body !== undefined && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : (options.body instanceof FormData ? options.body : JSON.stringify(options.body)),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
    return data;
  }

  function applyServerProgress(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    try {
      storeProgressForCurrentProfile(snapshot);
      reloadProgressForCurrentProfile();
    } catch (_) { /* le WebSocket synchronisera également le compte */ }
  }
  window.astreaApplyServerProgress = applyServerProgress;

  function rewardText(rewards) {
    const list = Array.isArray(rewards) ? rewards : (rewards ? [rewards] : []);
    return list.map(item => {
      if (item.type === "coins") return `${Number(item.amount || 1).toLocaleString("fr-FR")} pièces`;
      if (item.type === "pack") return `${item.amount || 1} paquet(s) ${item.packId || ""}`.trim();
      if (item.type === "card") return `${item.amount || 1} × ${CARD_BY_ID?.[item.cardId]?.name || item.cardId || "carte"}`;
      return "";
    }).filter(Boolean).join(" · ") || "Aucune récompense";
  }

  function rememberOriginalCards() {
    if (typeof CARDS === "undefined") return;
    CARDS.forEach(card => {
      if (!state.originalCards.has(card.id)) state.originalCards.set(card.id, structuredClone(card));
    });
  }

  function applyCardOverrides(overrides = []) {
    if (typeof CARDS === "undefined") return;
    rememberOriginalCards();
    for (const card of CARDS) {
      const original = state.originalCards.get(card.id);
      if (!original) continue;
      Object.keys(card).forEach(key => delete card[key]);
      Object.assign(card, structuredClone(original));
      delete card.liveopsDisabled;
    }
    const now = Date.now();
    overrides.forEach(override => {
      const card = CARD_BY_ID?.[override.cardId];
      if (!card) return;
      if (Number.isInteger(override.cost)) card.cost = Math.max(0, override.cost);
      if (Number.isInteger(override.damage)) {
        if (Object.hasOwn(card, "attack")) card.attack = Math.max(0, override.damage);
        else {
          const damageEffect = Array.isArray(card.effects) ? card.effects.find(effect => ["damage", "areaDamage", "randomDamage"].includes(effect?.effect)) : null;
          if (damageEffect) damageEffect.value = Math.max(0, override.damage);
        }
      }
      if (["common", "rare", "epic", "legendary"].includes(override.rarity)) card.rarity = override.rarity;
      if (typeof override.description === "string" && override.description.trim()) card.description = override.description.trim();
      const disabled = override.disabled === true && (!override.disabledUntil || Number(override.disabledUntil) > now);
      if (disabled) {
        card.collectible = false;
        card.liveopsDisabled = true;
      }
    });
    try {
      if (typeof renderMenuSummary === "function" && progress) renderMenuSummary();
      if (document.getElementById("collection-screen") && !document.getElementById("collection-screen").classList.contains("hidden")) renderCollection();
    } catch (_) {}
  }

  function ensureMaintenanceUi() {
    let overlay = document.getElementById("liveops-maintenance-overlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "liveops-maintenance-overlay";
    overlay.className = "liveops-maintenance-overlay hidden";
    overlay.innerHTML = `<article class="liveops-maintenance-card"><div class="sigil">✦</div><p class="eyebrow">Chroniques d’Astréa</p><h2>Maintenance en cours</h2><p data-maintenance-message></p><span class="liveops-maintenance-time hidden" data-maintenance-time></span></article>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderMaintenance(config) {
    const overlay = ensureMaintenanceUi();
    const active = config?.enabled === true && !state.config?.isAdminPlayer;
    overlay.classList.toggle("hidden", !active);
    overlay.querySelector("[data-maintenance-message]").textContent = config?.message || "Le jeu est temporairement en maintenance.";
    const time = overlay.querySelector("[data-maintenance-time]");
    time.classList.toggle("hidden", !config?.estimatedEndAt);
    if (config?.estimatedEndAt) time.textContent = `Réouverture estimée : ${fmtDate(config.estimatedEndAt)}`;
  }

  function ensureMuteBanner() {
    let banner = document.getElementById("liveops-mute-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "liveops-mute-banner";
      banner.className = "liveops-mute-banner hidden";
      document.body.appendChild(banner);
    }
    return banner;
  }

  function renderMute(mute) {
    const banner = ensureMuteBanner();
    banner.classList.toggle("hidden", !mute);
    if (mute) banner.textContent = `Messagerie désactivée jusqu’au ${fmtDate(mute.expiresAt)} — ${mute.reason || "Sanction temporaire"}`;
  }

  function showWarning(warning) {
    if (!warning || warning.acknowledgedAt) return;
    document.querySelector(".liveops-warning-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "liveops-warning-overlay";
    overlay.innerHTML = `<article class="liveops-warning-card"><p class="eyebrow">Avertissement administratif</p><h2>Un administrateur vous a averti</h2><p class="liveops-warning-message">${esc(warning.message)}</p><small>Émis par ${esc(warning.adminName || "l’administration")} · ${fmtDate(warning.createdAt)}</small><div style="margin-top:18px"><button class="primary-btn" type="button">J’ai compris</button></div></article>`;
    overlay.querySelector("button").addEventListener("click", async () => {
      try { await api(`/api/account/warnings/${encodeURIComponent(warning.id)}/acknowledge`, { method: "POST" }); } catch (_) {}
      overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  async function loadModeration() {
    if (!token()) { renderMute(null); return; }
    try {
      state.moderation = await api("/api/account/moderation");
      renderMute(state.moderation.activeMute);
      const pending = (state.moderation.warnings || []).find(item => !item.acknowledgedAt);
      if (pending) showWarning(pending);
    } catch (_) {}
  }

  function periodStateFor(quest) {
    progress.liveQuests = progress.liveQuests && typeof progress.liveQuests === "object" ? progress.liveQuests : {};
    const key = String(quest.id);
    const current = progress.liveQuests[key];
    if (!current || current.periodKey !== quest.periodKey) progress.liveQuests[key] = { periodKey: quest.periodKey, progress: 0, claimed: false };
    return progress.liveQuests[key];
  }

  function eventQuestState(eventId, questId) {
    progress.liveEventQuests = progress.liveEventQuests && typeof progress.liveEventQuests === "object" ? progress.liveEventQuests : {};
    const key = `${eventId}:${questId}`;
    progress.liveEventQuests[key] = progress.liveEventQuests[key] || { progress: 0, claimed: false };
    return progress.liveEventQuests[key];
  }

  function createQuestCard({ title, description, icon = "✦", eventKey, goal, rewards, liveState, claim }) {
    const current = Math.min(Number(goal || 1), Number(liveState?.progress || 0));
    const ready = current >= Number(goal || 1) && !liveState?.claimed;
    const ratio = Math.max(0, Math.min(100, Math.round((current / Math.max(1, goal)) * 100)));
    const article = document.createElement("article");
    article.className = `quest-card liveops-admin-quest${ready ? " completed" : ""}${liveState?.claimed ? " claimed" : ""}`;
    article.innerHTML = `<div class="quest-topline"><div class="quest-badge">${esc(icon)}</div><span class="quest-status-pill ${liveState?.claimed ? "claimed" : ready ? "ready" : ""}">${liveState?.claimed ? "Réclamée" : ready ? "Prête" : "En cours"}</span></div><div><h3>${esc(title)}</h3><p>${esc(description || `Objectif : ${eventKey}`)}</p></div><div class="quest-progress-text"><span>Progression</span><strong>${current} / ${goal}</strong></div><div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${ratio}%"></div></div><div class="quest-reward-box"><div class="quest-reward-icon">★</div><div><strong>${esc(rewardText(rewards))}</strong><small>Récompense administrée à distance.</small></div></div><button class="${ready ? "primary-btn" : "secondary-btn"}" type="button" ${ready ? "" : "disabled"}>${liveState?.claimed ? "Déjà récupérée" : ready ? "Récupérer" : "Quête en cours"}</button>`;
    article.querySelector("button").addEventListener("click", claim);
    return article;
  }

  async function claimQuest(path, liveState) {
    try {
      await window.astreaFlushAccountProgress?.();
      const data = await api(path, { method: "POST" });
      liveState.claimed = true;
      applyServerProgress(data.progress);
      toast(`Récompense obtenue : ${rewardText(data.rewards)}`);
      renderQuests();
    } catch (error) { toast(error.message, true); }
  }

  function appendLiveQuests() {
    if (!state.config || !progress || !document.getElementById("quests-grid")) return;
    const grid = document.getElementById("quests-grid");
    (state.config.quests || []).forEach(quest => {
      const live = periodStateFor(quest);
      grid.appendChild(createQuestCard({
        title: quest.title, description: quest.description, icon: quest.icon, eventKey: quest.eventKey,
        goal: quest.goal, rewards: quest.rewards, liveState: live,
        claim: () => claimQuest(`/api/quests/${encodeURIComponent(quest.id)}/claim`, live)
      }));
    });
    (state.config.events || []).forEach(event => {
      (event.quests || []).forEach((quest, index) => {
        const questId = String(quest.id || `event_quest_${index + 1}`);
        const live = eventQuestState(event.id, questId);
        grid.appendChild(createQuestCard({
          title: `${event.title} — ${quest.title || "Quête"}`, description: quest.description || `Quête limitée jusqu’au ${fmtDate(event.endsAt)}`,
          icon: "◆", eventKey: quest.eventKey, goal: Number(quest.goal || 1), rewards: quest.rewards || quest.reward, liveState: live,
          claim: () => claimQuest(`/api/events/${encodeURIComponent(event.id)}/quests/${encodeURIComponent(questId)}/claim`, live)
        }));
      });
    });
  }

  function renderEvents() {
    const shopLibrary = document.querySelector("#shop-screen .collection-library");
    if (!shopLibrary) return;
    let zone = document.getElementById("liveops-event-zone");
    if (!zone) {
      zone = document.createElement("section");
      zone.id = "liveops-event-zone";
      zone.className = "liveops-event-zone";
      shopLibrary.appendChild(zone);
    }
    const events = state.config?.events || [];
    zone.classList.toggle("hidden", events.length === 0);
    zone.innerHTML = events.length ? `<div class="liveops-section-title"><div><p class="eyebrow">Événements en cours</p><h2>Contenu limité</h2></div></div><div class="liveops-event-grid">${events.map(event => {
      const claimed = Boolean(progress?.liveEventClaims?.[String(event.id)]);
      const claimable = (event.rewards || []).length > 0 || (event.exclusiveCards || []).length > 0;
      return `<article class="liveops-event-card">${event.imageUrl ? `<img src="${esc(event.imageUrl)}" alt="${esc(event.title)}">` : ""}<div class="liveops-event-card-body"><h3>${esc(event.title)}</h3><p>${esc(event.description)}</p><div class="liveops-chip-row"><span class="liveops-chip">Jusqu’au ${fmtDate(event.endsAt)}</span><span class="liveops-chip">${event.quests?.length || 0} quête(s)</span>${(event.exclusiveCards || []).slice(0,3).map(id => `<span class="liveops-chip">Carte exclusive : ${esc(CARD_BY_ID?.[id]?.name || id)}</span>`).join("")}</div><strong>${esc(rewardText(event.rewards))}${event.exclusiveCards?.length ? ` · ${event.exclusiveCards.length} carte(s) exclusive(s)` : ""}</strong><button class="${claimed ? "secondary-btn" : "primary-btn"}" data-event-claim="${esc(event.id)}" type="button" ${claimed || !claimable ? "disabled" : ""}>${claimed ? "Récompense récupérée" : claimable ? "Récupérer la récompense" : "Quêtes disponibles"}</button></div></article>`;
    }).join("")}</div>` : "";
    zone.querySelectorAll("[data-event-claim]").forEach(button => button.addEventListener("click", async () => {
      try {
        const data = await api(`/api/events/${encodeURIComponent(button.dataset.eventClaim)}/claim`, { method: "POST" });
        applyServerProgress(data.progress);
        toast(`Récompense d’événement obtenue : ${rewardText(data.rewards)}`);
        renderEvents();
      } catch (error) { toast(error.message, true); }
    }));
  }

  function renderManagedPacks() {
    if (typeof PACK_DEFINITIONS === "undefined") return;
    const settings = new Map((state.config?.packShopSettings || []).map(item => [item.packId, item]));
    Object.values(PACK_DEFINITIONS).forEach(pack => {
      const card = document.querySelector(`#shop-pack-grid [data-pack-id="${pack.id}"]`);
      if (!card) return;
      const setting = settings.get(pack.id) || { enabled: true, price: pack.cost };
      const price = Math.max(0, Number(setting.price ?? pack.cost));
      const enabled = setting.enabled !== false;
      const buttons = card.querySelectorAll("button");
      const buyButton = buttons[0];
      const priceNode = card.querySelector(".shop-pack-meta strong");
      if (priceNode) priceNode.innerHTML = `<img class="currency-icon" src="assets/ui/coin.png" alt="Pièces" /> ${price.toLocaleString("fr-FR")}`;
      card.classList.toggle("liveops-pack-disabled", !enabled);
      let status = card.querySelector(".liveops-pack-status");
      if (!status) {
        status = document.createElement("span");
        status.className = "liveops-pack-status";
        card.insertBefore(status, card.querySelector(".shop-pack-actions"));
      }
      status.classList.toggle("hidden", enabled);
      status.textContent = enabled ? "" : "Achat temporairement désactivé";
      if (buyButton) {
        buyButton.textContent = state.pendingPacks.has(pack.id) ? "Achat…" : enabled ? "Acheter" : "Indisponible";
        buyButton.disabled = !enabled || state.pendingPacks.has(pack.id) || Number(progress?.coins || 0) < price;
      }
    });
  }

  function renderCardShop() {
    const shopLibrary = document.querySelector("#shop-screen .collection-library");
    if (!shopLibrary) return;
    let zone = document.getElementById("liveops-card-shop-zone");
    if (!zone) {
      zone = document.createElement("section");
      zone.id = "liveops-card-shop-zone";
      zone.className = "liveops-card-shop-zone";
      shopLibrary.appendChild(zone);
    }
    const listings = state.config?.cardShopListings || [];
    zone.classList.toggle("hidden", listings.length === 0);
    zone.innerHTML = listings.length ? `<div class="liveops-section-title"><div><p class="eyebrow">Cartes à l’unité</p><h2>Cartes disponibles temporairement</h2></div></div><div class="liveops-card-shop-grid">${listings.map(listing => {
      const card = CARD_BY_ID?.[listing.cardId];
      const pending = state.pendingCards.has(String(listing.id));
      const unavailable = card?.liveopsDisabled === true;
      return `<article class="liveops-card-shop-card rarity-${esc(card?.rarity || "common")}">
        <div class="liveops-card-shop-art">${card?.image ? `<img src="${esc(card.image)}" alt="${esc(card.name || listing.cardId)}">` : `<span>✦</span>`}</div>
        <div class="liveops-card-shop-body">
          <div class="liveops-chip-row"><span class="liveops-chip">${esc(card?.rarity || "Carte")}</span><span class="liveops-chip">Fin : ${fmtDate(listing.endsAt)}</span>${listing.purchaseLimit ? `<span class="liveops-chip">Limite ${listing.purchaseLimit}</span>` : ""}${unavailable ? '<span class="liveops-chip">Temporairement désactivée</span>' : ""}</div>
          <h3>${esc(card?.name || listing.cardId)}</h3>
          <p>${esc(card?.description || "Carte disponible dans la boutique temporaire.")}</p>
          <strong>${Number(listing.quantity || 1)} copie(s) par achat</strong>
          <div class="liveops-price"><img class="currency-icon" src="assets/ui/coin.png" alt="Pièces"><span>${Number(listing.price || 0).toLocaleString("fr-FR")}</span>${listing.originalPrice && listing.originalPrice > listing.price ? `<span class="liveops-old-price">${Number(listing.originalPrice).toLocaleString("fr-FR")}</span>` : ""}</div>
          <button class="primary-btn" data-card-shop-buy="${esc(listing.id)}" type="button" ${pending || unavailable || Number(progress?.coins || 0) < Number(listing.price || 0) ? "disabled" : ""}>${pending ? "Achat…" : unavailable ? "Carte indisponible" : "Acheter la carte"}</button>
        </div>
      </article>`;
    }).join("")}</div>` : "";
    zone.querySelectorAll("[data-card-shop-buy]").forEach(button => button.addEventListener("click", async () => {
      const listingId = String(button.dataset.cardShopBuy);
      if (state.pendingCards.has(listingId)) return;
      state.pendingCards.add(listingId);
      renderCardShop();
      try {
        await window.astreaFlushAccountProgress?.();
        const data = await api(`/api/shop/cards/${encodeURIComponent(listingId)}/purchase`, { method: "POST" });
        applyServerProgress(data.progress);
        toast(`${data.quantity || 1} × ${CARD_BY_ID?.[data.cardId]?.name || data.cardId} ajouté(e) à votre collection.`);
      } catch (error) { toast(error.message, true); }
      finally {
        state.pendingCards.delete(listingId);
        if (typeof renderShop === "function") renderShop();
      }
    }));
  }

  function renderRemoteShop() {
    const shopLibrary = document.querySelector("#shop-screen .collection-library");
    if (!shopLibrary) return;
    let zone = document.getElementById("liveops-shop-zone");
    if (!zone) { zone = document.createElement("section"); zone.id = "liveops-shop-zone"; zone.className = "liveops-shop-zone"; shopLibrary.appendChild(zone); }
    const offers = state.config?.shopOffers || [];
    zone.classList.toggle("hidden", offers.length === 0);
    zone.innerHTML = offers.length ? `<div class="liveops-section-title"><div><p class="eyebrow">Offres administrées</p><h2>Promotions temporaires</h2></div></div><div class="liveops-offer-grid">${offers.map(offer => `<article class="liveops-offer-card">${offer.imageUrl ? `<img src="${esc(offer.imageUrl)}" alt="${esc(offer.title)}">` : ""}<div class="liveops-offer-card-body"><h3>${esc(offer.title)}</h3><p>${esc(offer.description)}</p><div class="liveops-chip-row"><span class="liveops-chip">Fin : ${fmtDate(offer.endsAt)}</span>${offer.purchaseLimit ? `<span class="liveops-chip">Limite ${offer.purchaseLimit}</span>` : ""}</div><strong>${esc(rewardText(offer.rewards))}</strong><div class="liveops-price"><img class="currency-icon" src="assets/ui/coin.png" alt="Pièces"><span>${Number(offer.price || 0).toLocaleString("fr-FR")}</span>${offer.originalPrice && offer.originalPrice > offer.price ? `<span class="liveops-old-price">${Number(offer.originalPrice).toLocaleString("fr-FR")}</span>` : ""}</div><button class="primary-btn" data-offer-buy="${esc(offer.id)}" type="button">Acheter</button></div></article>`).join("")}</div>` : "";
    zone.querySelectorAll("[data-offer-buy]").forEach(button => button.addEventListener("click", async () => {
      try {
        const data = await api(`/api/shop/offers/${encodeURIComponent(button.dataset.offerBuy)}/purchase`, { method: "POST" });
        applyServerProgress(data.progress);
        toast(`Achat effectué : ${rewardText(data.rewards)}`);
        logClient("purchase", { offerId: button.dataset.offerBuy, price: data.price });
        renderRemoteShop();
      } catch (error) { toast(error.message, true); }
    }));
  }

  function renderGiftCode() {
    const shopLibrary = document.querySelector("#shop-screen .collection-library");
    if (!shopLibrary) return;
    let zone = document.getElementById("liveops-code-zone");
    if (!zone) { zone = document.createElement("section"); zone.id = "liveops-code-zone"; zone.className = "liveops-code-zone"; shopLibrary.appendChild(zone); }
    zone.innerHTML = `<div class="liveops-section-title"><div><p class="eyebrow">Code cadeau</p><h2>Récupérer une récompense</h2></div></div><div class="liveops-gift-form"><label class="sr-only" for="liveops-gift-input">Code cadeau</label><input id="liveops-gift-input" maxlength="40" placeholder="ENTREZ VOTRE CODE"><button class="primary-btn" type="button">Valider</button></div>`;
    const input = zone.querySelector("input");
    const submit = async () => {
      const code = input.value.trim().toUpperCase();
      if (!code) return;
      try {
        const data = await api("/api/gift-codes/redeem", { method: "POST", body: { code } });
        applyServerProgress(data.progress);
        input.value = "";
        toast(`Code validé : ${rewardText(data.rewards)}`);
      } catch (error) { toast(error.message, true); }
    };
    zone.querySelector("button").addEventListener("click", submit);
    input.addEventListener("keydown", event => { if (event.key === "Enter") submit(); });
  }

  function renderShopLiveOps() { renderManagedPacks(); renderCardShop(); renderEvents(); renderRemoteShop(); renderGiftCode(); }

  function updateLiveQuestProgress(eventKey, amount = 1) {
    if (!state.config || !progress || amount <= 0) return;
    let changed = false;
    (state.config.quests || []).forEach(quest => {
      if (quest.eventKey !== eventKey) return;
      const live = periodStateFor(quest);
      if (live.claimed) return;
      const next = Math.min(Number(quest.goal || 1), Number(live.progress || 0) + Number(amount || 1));
      if (next !== live.progress) { live.progress = next; changed = true; }
    });
    (state.config.events || []).forEach(event => (event.quests || []).forEach((quest, index) => {
      if (quest.eventKey !== eventKey) return;
      const questId = String(quest.id || `event_quest_${index + 1}`);
      const live = eventQuestState(event.id, questId);
      if (live.claimed) return;
      const next = Math.min(Number(quest.goal || 1), Number(live.progress || 0) + Number(amount || 1));
      if (next !== live.progress) { live.progress = next; changed = true; }
    }));
    if (changed) {
      try { saveProgress(); } catch (_) {}
      const screen = document.getElementById("quests-screen");
      if (screen && !screen.classList.contains("hidden")) renderQuests();
    }
  }

  function installHooks() {
    if (typeof updateDailyQuestProgress === "function" && !updateDailyQuestProgress.__liveopsWrapped) {
      const original = updateDailyQuestProgress;
      const wrapped = function(eventKey, amount = 1) { const result = original.apply(this, arguments); updateLiveQuestProgress(eventKey, amount); return result; };
      wrapped.__liveopsWrapped = true;
      updateDailyQuestProgress = wrapped;
    }
    if (typeof renderQuests === "function" && !renderQuests.__liveopsWrapped) {
      const original = renderQuests;
      const wrapped = function() { const result = original.apply(this, arguments); appendLiveQuests(); return result; };
      wrapped.__liveopsWrapped = true;
      renderQuests = wrapped;
    }
    if (typeof renderShop === "function" && !renderShop.__liveopsWrapped) {
      const original = renderShop;
      const wrapped = function() { const result = original.apply(this, arguments); renderShopLiveOps(); return result; };
      wrapped.__liveopsWrapped = true;
      renderShop = wrapped;
    }
    if (typeof addCardToDeck === "function" && !addCardToDeck.__liveopsWrapped) {
      const original = addCardToDeck;
      const wrapped = function(cardId) {
        if (CARD_BY_ID?.[cardId]?.liveopsDisabled) { toast("Cette carte est temporairement désactivée.", true); return; }
        return original.apply(this, arguments);
      };
      wrapped.__liveopsWrapped = true;
      addCardToDeck = wrapped;
    }
    if (typeof buyPack === "function" && !buyPack.__liveopsWrapped) {
      const wrapped = async function(packId) {
        if (state.pendingPacks.has(packId)) return;
        const setting = (state.config?.packShopSettings || []).find(item => item.packId === packId);
        if (setting?.enabled === false) return toast("L’achat de ce paquet est temporairement désactivé.", true);
        if (!token()) return toast("Connectez-vous pour acheter un paquet.", true);
        state.pendingPacks.add(packId);
        renderManagedPacks();
        try {
          await window.astreaFlushAccountProgress?.();
          const data = await api(`/api/shop/packs/${encodeURIComponent(packId)}/purchase`, { method: "POST" });
          applyServerProgress(data.progress);
          toast(`${PACK_DEFINITIONS?.[packId]?.name || "Paquet"} acheté.`);
        } catch (error) { toast(error.message, true); }
        finally {
          state.pendingPacks.delete(packId);
          if (typeof renderShop === "function") renderShop();
        }
      };
      wrapped.__liveopsWrapped = true;
      buyPack = wrapped;
    }
    if (typeof checkGameOver === "function" && !checkGameOver.__liveopsWrapped) {
      const original = checkGameOver;
      const wrapped = function() {
        const wasPlaying = gameState?.status === "playing";
        const result = original.apply(this, arguments);
        if (wasPlaying && gameState?.status === "finished") {
          logClient("match_finished", {
            mode: gameState.mode || "standard",
            result: gameState.ai?.hero?.currentHealth <= 0 ? (gameState.player?.hero?.currentHealth <= 0 ? "draw" : "win") : "loss",
            turns: gameState.turnNumber || 0
          });
        }
        return result;
      };
      wrapped.__liveopsWrapped = true;
      checkGameOver = wrapped;
    }
    if (typeof revealPackRewards === "function" && !revealPackRewards.__liveopsWrapped) {
      const original = revealPackRewards;
      const wrapped = function() {
        const packId = typeof packOpeningState === "object" ? packOpeningState?.packId : null;
        const result = original.apply(this, arguments);
        try { updateDailyQuestProgress("openPack", 1); } catch (_) {}
        logClient("pack_open", { packId });
        return result;
      };
      wrapped.__liveopsWrapped = true;
      revealPackRewards = wrapped;
    }
  }

  function logClient(event, details = {}) {
    if (!token()) return;
    api("/api/logs/client", { method: "POST", body: { event, details } }).catch(() => {});
  }

  async function refreshConfig() {
    if (!API_BASE && location.hostname.endsWith("github.io")) return;
    try {
      const config = await api("/api/game/config");
      state.config = config;
      applyCardOverrides(config.cardOverrides || []);
      renderMaintenance(config.maintenance);
      const shop = document.getElementById("shop-screen");
      if (shop && !shop.classList.contains("hidden")) renderShopLiveOps();
      const quests = document.getElementById("quests-screen");
      if (quests && !quests.classList.contains("hidden")) renderQuests();
    } catch (_) { /* le jeu continue avec la dernière configuration connue */ }
  }

  function receive(message) {
    if (!message) return;
    if (message.type === "game_config_changed") refreshConfig();
    if (message.type === "account_warning") showWarning(message.warning);
    if (message.type === "account_muted") renderMute(message.mute);
    if (message.type === "account_unmuted") { renderMute(null); toast(message.message || "Votre mute a été levé."); }
  }

  window.astreaLiveAdmin = { receive, refresh: refreshConfig, toast };

  document.addEventListener("DOMContentLoaded", () => {
    installHooks();
    ensureMaintenanceUi();
    ensureMuteBanner();
    refreshConfig();
    loadModeration();
    state.timer = window.setInterval(refreshConfig, REFRESH_MS);
    window.addEventListener("storage", event => { if (event.key === AUTH_KEY) { refreshConfig(); loadModeration(); window.astreaPopupManager?.refresh?.(); } });
    window.addEventListener("beforeunload", () => window.clearInterval(state.timer), { once: true });
  });
})();
