"use strict";

(() => {
  const TOKEN_KEY = "astrea_admin_token";
  const state = {
    currentUser: null,
    moderation: null,
    cardOverrides: [],
    events: [],
    quests: [],
    offers: [],
    codes: [],
    loadedViews: new Set()
  };

  const LEAGUES = ["Bronze III","Bronze II","Bronze I","Argent III","Argent II","Argent I","Or III","Or II","Or I","Platine III","Platine II","Platine I","Diamant III","Diamant II","Diamant I","Maître"];
  const PACKS = [
    ["astral", "Pack Astral"], ["zenith", "Pack du Zénith"], ["neant", "Pack du Néant"], ["quetes", "Pack des Quêtes"]
  ];

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function toast(message, error = false) {
    if (window.astreaAdminToast) return window.astreaAdminToast(message, error);
    console[error ? "error" : "log"](message);
  }
  async function api(path, options = {}) {
    if (window.astreaAdminApiFetch) return window.astreaAdminApiFetch(path, options);
    const token = window.localStorage?.getItem?.(TOKEN_KEY);
    const response = await fetch(`${String(window.ASTREA_SERVER_URL || "").replace(/\/+$/, "")}${path}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Erreur serveur.");
    return data;
  }
  function dateText(value) {
    if (!value) return "—";
    try { return new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); }
    catch (_) { return "—"; }
  }
  function toInput(value = Date.now()) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function iso(id) {
    const value = $(id)?.value;
    return value ? new Date(value).toISOString() : null;
  }
  function cardsCatalog() {
    try { return Array.isArray(CARDS) ? CARDS.filter(card => card?.id).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "fr")) : []; }
    catch (_) { return []; }
  }
  function cardOptions(selected = "") {
    return cardsCatalog().map(card => `<option value="${esc(card.id)}" ${card.id === selected ? "selected" : ""}>${esc(card.name || card.id)} · ${esc(card.id)}</option>`).join("");
  }
  function packOptions(selected = "astral") {
    return PACKS.map(([id, name]) => `<option value="${id}" ${id === selected ? "selected" : ""}>${name}</option>`).join("");
  }
  function rewardLabel(rewards = []) {
    return rewards.map(reward => {
      if (reward.type === "coins") return `${reward.amount} pièces`;
      if (reward.type === "pack") return `${reward.amount} ${PACKS.find(([id]) => id === reward.packId)?.[1] || reward.packId}`;
      const card = cardsCatalog().find(item => item.id === reward.cardId);
      return `${reward.amount} × ${card?.name || reward.cardId}`;
    }).join(" · ") || "Aucune récompense";
  }
  function statusBadge(enabled, start, end) {
    const now = Date.now();
    if (!enabled) return '<span class="admin-popup-status disabled">Désactivé</span>';
    if (Number(start) > now) return '<span class="admin-popup-status scheduled">Programmé</span>';
    if (Number(end) <= now) return '<span class="admin-popup-status expired">Terminé</span>';
    return '<span class="admin-popup-status active">Actif</span>';
  }

  function addRewardRow(containerId, reward = { type: "coins", amount: 100 }) {
    const container = $(containerId);
    if (!container || container.children.length >= 8) return;
    const row = document.createElement("div");
    row.className = "admin-reward-row";
    row.innerHTML = `
      <label><span>Type</span><select data-reward-type><option value="coins">Pièces</option><option value="pack">Paquet</option><option value="card">Carte</option></select></label>
      <label><span>Quantité</span><input data-reward-amount type="number" min="1" max="10000000" value="${Math.max(1, Number(reward.amount || 1))}" /></label>
      <label data-reward-id-wrap><span>Élément</span><select data-reward-id></select></label>
      <button class="admin-repeater-remove" data-remove-reward type="button" aria-label="Supprimer">×</button>`;
    const type = row.querySelector("[data-reward-type]");
    type.value = reward.type || "coins";
    const update = () => {
      const wrap = row.querySelector("[data-reward-id-wrap]");
      const id = row.querySelector("[data-reward-id]");
      wrap.classList.toggle("hidden", type.value === "coins");
      if (type.value === "pack") id.innerHTML = packOptions(reward.packId || id.value || "astral");
      if (type.value === "card") id.innerHTML = cardOptions(reward.cardId || id.value || "");
    };
    type.addEventListener("change", update);
    row.querySelector("[data-remove-reward]").addEventListener("click", () => row.remove());
    container.appendChild(row);
    update();
  }

  function readRewards(containerId) {
    return [...($(containerId)?.querySelectorAll(".admin-reward-row") || [])].map(row => {
      const type = row.querySelector("[data-reward-type]").value;
      const amount = Math.max(1, Number(row.querySelector("[data-reward-amount]").value || 1));
      const id = row.querySelector("[data-reward-id]").value;
      if (type === "coins") return { type, amount };
      if (type === "pack") return { type, amount, packId: id };
      return { type, amount, cardId: id };
    });
  }

  function setRewards(containerId, rewards = []) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = "";
    (rewards.length ? rewards : [{ type: "coins", amount: 100 }]).forEach(reward => addRewardRow(containerId, reward));
  }

  function addEventQuestRow(quest = {}) {
    const container = $("admin-event-quests");
    if (!container || container.children.length >= 20) return;
    const row = document.createElement("div");
    row.className = "admin-event-quest-row";
    row.innerHTML = `
      <label><span>Titre</span><input data-event-quest-title maxlength="140" value="${esc(quest.title || "")}" placeholder="Ex. Gagner 3 combats" /></label>
      <label><span>Action</span><select data-event-quest-key>${questEventOptions(quest.eventKey)}</select></label>
      <label><span>Objectif</span><input data-event-quest-goal type="number" min="1" value="${Math.max(1, Number(quest.goal || 3))}" /></label>
      <label><span>Récompense</span><select data-event-quest-reward-type><option value="coins">Pièces</option><option value="pack">Paquet</option><option value="card">Carte</option></select></label>
      <label><span>Quantité</span><input data-event-quest-reward-amount type="number" min="1" value="${Math.max(1, Number(quest.reward?.amount || 100))}" /></label>
      <label data-event-quest-reward-id-wrap><span>Élément</span><select data-event-quest-reward-id></select></label>
      <button class="admin-repeater-remove" type="button">×</button>`;
    const rewardType = row.querySelector("[data-event-quest-reward-type]");
    rewardType.value = quest.reward?.type || "coins";
    const update = () => {
      const wrap = row.querySelector("[data-event-quest-reward-id-wrap]");
      const select = row.querySelector("[data-event-quest-reward-id]");
      wrap.classList.toggle("hidden", rewardType.value === "coins");
      if (rewardType.value === "pack") select.innerHTML = packOptions(quest.reward?.packId || select.value || "astral");
      if (rewardType.value === "card") select.innerHTML = cardOptions(quest.reward?.cardId || select.value || "");
    };
    rewardType.addEventListener("change", update);
    row.querySelector("button").addEventListener("click", () => row.remove());
    container.appendChild(row);
    update();
  }
  function questEventOptions(selected = "winMatch") {
    const options = [
      ["winMatch","Gagner un combat"],["playCard","Jouer une carte"],["spellPlayed","Lancer un sort"],
      ["creatureSummoned","Invoquer une créature"],["openPack","Ouvrir un paquet"],["spendMana","Dépenser du mana"],
      ["adventureWin","Victoire aventure"],["leagueWin","Victoire League"]
    ];
    return options.map(([id, label]) => `<option value="${id}" ${id === selected ? "selected" : ""}>${label}</option>`).join("");
  }
  function readEventQuests() {
    return [...($("admin-event-quests")?.querySelectorAll(".admin-event-quest-row") || [])].map((row, index) => {
      const type = row.querySelector("[data-event-quest-reward-type]").value;
      const amount = Math.max(1, Number(row.querySelector("[data-event-quest-reward-amount]").value || 1));
      const id = row.querySelector("[data-event-quest-reward-id]").value;
      const reward = type === "coins" ? { type, amount } : type === "pack" ? { type, amount, packId: id } : { type, amount, cardId: id };
      return {
        id: `event_quest_${index + 1}`,
        title: row.querySelector("[data-event-quest-title]").value.trim(),
        eventKey: row.querySelector("[data-event-quest-key]").value,
        goal: Math.max(1, Number(row.querySelector("[data-event-quest-goal]").value || 1)),
        reward
      };
    }).filter(quest => quest.title);
  }
  function setEventQuests(quests = []) {
    $("admin-event-quests").innerHTML = "";
    quests.forEach(addEventQuestRow);
  }

  function init() {
    bindRewardButtons();
    bindSanctions();
    bindCards();
    bindEventsManager();
    bindQuests();
    bindShop();
    bindMaintenance();
    bindCodes();
    bindLogs();
    populateCatalogs();
    setDefaultDates();
  }

  function bindRewardButtons() {
    document.querySelectorAll("[data-add-reward]").forEach(button => button.addEventListener("click", () => addRewardRow(button.dataset.addReward)));
    ["admin-event-rewards", "admin-quest-rewards", "admin-offer-rewards", "admin-code-rewards"].forEach(id => setRewards(id));
  }

  function populateCatalogs() {
    const cardSelect = $("admin-card-management-id");
    if (cardSelect) cardSelect.innerHTML = cardOptions();
    const eventSelect = $("admin-quest-event-id");
    if (eventSelect) eventSelect.innerHTML = '<option value="">Aucun</option>';
  }

  function setDefaultDates() {
    const now = Date.now();
    const defaults = {
      "admin-event-start": now, "admin-event-end": now + 7 * 86400000,
      "admin-quest-start": now, "admin-quest-end": now + 30 * 86400000,
      "admin-offer-start": now, "admin-offer-end": now + 7 * 86400000,
      "admin-code-start": now
    };
    Object.entries(defaults).forEach(([id, value]) => { if ($(id) && !$(id).value) $(id).value = toInput(value); });
  }

  // ---------------- Sanctions ----------------
  function bindSanctions() {
    document.addEventListener("astrea:admin-user-loaded", event => {
      state.currentUser = event.detail?.user || null;
      if (state.currentUser) loadModeration(state.currentUser.id);
    });
    $("admin-mute-duration")?.addEventListener("change", () => $("admin-mute-custom-wrap")?.classList.toggle("hidden", $("admin-mute-duration").value !== "custom"));
    $("admin-warning-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      if (!state.currentUser) return toast("Sélectionnez d’abord un joueur.", true);
      try {
        await api(`/api/admin/users/${state.currentUser.id}/warnings`, { method: "POST", body: { message: $("admin-warning-message").value.trim() } });
        $("admin-warning-message").value = "";
        toast("Avertissement envoyé au joueur.");
        await loadModeration(state.currentUser.id);
      } catch (error) { toast(error.message, true); }
    });
    $("admin-mute-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      if (!state.currentUser) return toast("Sélectionnez d’abord un joueur.", true);
      const choice = $("admin-mute-duration").value;
      const durationMinutes = Number(choice === "custom" ? $("admin-mute-custom-minutes").value : choice);
      try {
        await api(`/api/admin/users/${state.currentUser.id}/mute`, { method: "POST", body: { reason: $("admin-mute-reason").value.trim(), durationMinutes } });
        $("admin-mute-reason").value = "";
        toast("Le joueur a été rendu muet.");
        await loadModeration(state.currentUser.id);
      } catch (error) { toast(error.message, true); }
    });
    $("admin-unmute-btn")?.addEventListener("click", async () => {
      if (!state.currentUser) return;
      try {
        await api(`/api/admin/users/${state.currentUser.id}/unmute`, { method: "POST", body: { reason: "Mute levé depuis le panel administrateur" } });
        toast("Mute levé.");
        await loadModeration(state.currentUser.id);
      } catch (error) { toast(error.message, true); }
    });
  }
  async function loadModeration(userId) {
    try {
      state.moderation = await api(`/api/admin/users/${userId}/moderation`);
      renderModeration();
    } catch (error) { toast(error.message, true); }
  }
  function renderModeration() {
    const warnings = state.moderation?.warnings || [];
    $("admin-warning-history").innerHTML = warnings.length ? warnings.map(item => `
      <div class="admin-timeline-item"><strong>Avertissement${item.acknowledgedAt ? " lu" : " non lu"}</strong><p>${esc(item.message)}</p><time>${esc(item.adminName || "Admin")} · ${dateText(item.createdAt)}</time></div>`).join("") : '<div class="admin-empty-state compact"><p>Aucun avertissement.</p></div>';
    const mute = state.moderation?.activeMute;
    $("admin-active-mute").innerHTML = mute ? `<div class="admin-active-ban-card"><strong>Muet jusqu’au ${dateText(mute.expiresAt)}</strong><p>${esc(mute.reason)}</p><small>Par ${esc(mute.adminName || "un administrateur")}</small></div>` : '<div class="admin-empty-state compact"><p>Aucun mute actif.</p></div>';
    $("admin-unmute-btn").classList.toggle("hidden", !mute);
  }

  // ---------------- Cartes ----------------
  function bindCards() {
    $("admin-card-management-id")?.addEventListener("change", fillCardEditor);
    $("admin-card-management-form")?.addEventListener("submit", saveCardOverride);
    $("admin-card-management-reset")?.addEventListener("click", resetCurrentCardOverride);
    $("admin-cards-refresh")?.addEventListener("click", loadCards);
  }
  async function loadCards() {
    try { const data = await api("/api/admin/cards"); state.cardOverrides = data.overrides || []; renderCardOverrides(); fillCardEditor(); }
    catch (error) { toast(error.message, true); }
  }
  function fillCardEditor() {
    const cardId = $("admin-card-management-id")?.value;
    const original = cardsCatalog().find(card => card.id === cardId) || {};
    const override = state.cardOverrides.find(item => item.cardId === cardId) || {};
    $("admin-card-management-cost").value = override.cost ?? "";
    $("admin-card-management-cost").placeholder = original.cost ?? "Valeur d’origine";
    $("admin-card-management-damage").value = override.damage ?? "";
    $("admin-card-management-damage").placeholder = original.attack ?? "Valeur d’origine";
    $("admin-card-management-rarity").value = override.rarity || "";
    $("admin-card-management-description").value = override.description ?? "";
    $("admin-card-management-description").placeholder = original.description || "Description d’origine";
    $("admin-card-management-disabled").checked = override.disabled === true;
    $("admin-card-management-disabled-until").value = override.disabledUntil ? toInput(override.disabledUntil) : "";
  }
  async function saveCardOverride(event) {
    event.preventDefault();
    const cardId = $("admin-card-management-id").value;
    try {
      await api(`/api/admin/cards/${encodeURIComponent(cardId)}`, { method: "PUT", body: {
        cost: $("admin-card-management-cost").value,
        damage: $("admin-card-management-damage").value,
        rarity: $("admin-card-management-rarity").value,
        description: $("admin-card-management-description").value || null,
        disabled: $("admin-card-management-disabled").checked,
        disabledUntil: iso("admin-card-management-disabled-until")
      } });
      toast("Carte mise à jour dans le jeu.");
      await loadCards();
    } catch (error) { toast(error.message, true); }
  }
  async function resetCurrentCardOverride() {
    const cardId = $("admin-card-management-id").value;
    if (!cardId || !confirm(`Supprimer toutes les modifications de ${cardId} ?`)) return;
    try { await api(`/api/admin/cards/${encodeURIComponent(cardId)}`, { method: "DELETE" }); toast("Carte rétablie à sa version d’origine."); await loadCards(); }
    catch (error) { toast(error.message, true); }
  }
  function renderCardOverrides() {
    const root = $("admin-card-overrides-list");
    if (!state.cardOverrides.length) { root.innerHTML = '<div class="admin-empty-state compact"><p>Aucune carte modifiée.</p></div>'; return; }
    root.innerHTML = state.cardOverrides.map(item => {
      const card = cardsCatalog().find(entry => entry.id === item.cardId);
      const changes = [item.cost !== null ? `Mana ${item.cost}` : "", item.damage !== null ? `Dégâts ${item.damage}` : "", item.rarity || "", item.disabled ? "Désactivée" : ""].filter(Boolean).join(" · ");
      return `<article class="admin-live-item"><div><strong>${esc(card?.name || item.cardId)}</strong><p>${esc(changes || "Description modifiée")}</p><small>${item.disabledUntil ? `Réactivation : ${dateText(item.disabledUntil)}` : `Mise à jour : ${dateText(item.updatedAt)}`}</small></div><div class="admin-popup-list-actions"><button class="admin-btn admin-btn-secondary" data-edit-card="${esc(item.cardId)}" type="button">Modifier</button><button class="admin-btn admin-btn-danger" data-delete-card="${esc(item.cardId)}" type="button">Réinitialiser</button></div></article>`;
    }).join("");
    root.querySelectorAll("[data-edit-card]").forEach(button => button.addEventListener("click", () => { $("admin-card-management-id").value = button.dataset.editCard; fillCardEditor(); $("admin-card-management-form").scrollIntoView({ behavior: "smooth" }); }));
    root.querySelectorAll("[data-delete-card]").forEach(button => button.addEventListener("click", async () => { $("admin-card-management-id").value = button.dataset.deleteCard; await resetCurrentCardOverride(); }));
  }

  // ---------------- Événements ----------------
  function bindEventsManager() {
    $("admin-event-form")?.addEventListener("submit", saveEvent);
    $("admin-event-cancel")?.addEventListener("click", resetEventForm);
    $("admin-events-refresh")?.addEventListener("click", loadEvents);
    $("admin-event-add-quest")?.addEventListener("click", () => addEventQuestRow());
  }
  async function loadEvents() {
    try {
      const data = await api("/api/admin/events");
      state.events = data.events || [];
      renderEvents();
      const select = $("admin-quest-event-id");
      if (select) select.innerHTML = '<option value="">Aucun</option>' + state.events.map(event => `<option value="${event.id}">${esc(event.title)}</option>`).join("");
    } catch (error) { toast(error.message, true); }
  }
  async function saveEvent(event) {
    event.preventDefault();
    const id = $("admin-event-id").value;
    const body = {
      title: $("admin-event-title").value.trim(), description: $("admin-event-description").value.trim(), imageUrl: $("admin-event-image").value.trim(),
      startsAt: iso("admin-event-start"), endsAt: iso("admin-event-end"), rewards: readRewards("admin-event-rewards"), quests: readEventQuests(),
      exclusiveCards: $("admin-event-exclusive-cards").value.split(/[\s,;]+/).filter(Boolean), enabled: $("admin-event-enabled").checked
    };
    try { await api(id ? `/api/admin/events/${id}` : "/api/admin/events", { method: id ? "PUT" : "POST", body }); toast(id ? "Événement modifié." : "Événement créé."); resetEventForm(); await loadEvents(); }
    catch (error) { toast(error.message, true); }
  }
  function editEvent(id) {
    const item = state.events.find(event => event.id === String(id)); if (!item) return;
    $("admin-event-id").value = item.id; $("admin-event-title").value = item.title; $("admin-event-description").value = item.description || ""; $("admin-event-image").value = item.imageUrl || "";
    $("admin-event-start").value = toInput(item.startsAt); $("admin-event-end").value = toInput(item.endsAt); $("admin-event-exclusive-cards").value = (item.exclusiveCards || []).join("\n"); $("admin-event-enabled").checked = item.enabled !== false;
    setRewards("admin-event-rewards", item.rewards || []); setEventQuests(item.quests || []); $("admin-event-form-title").textContent = "Modifier l’événement"; $("admin-event-cancel").classList.remove("hidden"); $("admin-event-form").scrollIntoView({ behavior: "smooth" });
  }
  function resetEventForm() {
    $("admin-event-form").reset(); $("admin-event-id").value = ""; $("admin-event-form-title").textContent = "Créer un événement"; $("admin-event-cancel").classList.add("hidden"); $("admin-event-enabled").checked = true;
    $("admin-event-start").value = toInput(Date.now()); $("admin-event-end").value = toInput(Date.now() + 7 * 86400000); setRewards("admin-event-rewards"); setEventQuests([]);
  }
  function renderEvents() {
    const root = $("admin-events-list"); if (!state.events.length) { root.innerHTML = '<div class="admin-empty-state compact"><p>Aucun événement.</p></div>'; return; }
    root.innerHTML = state.events.map(item => `<article class="admin-live-item"><div><div class="admin-popup-list-title-row"><strong>${esc(item.title)}</strong>${statusBadge(item.enabled,item.startsAt,item.endsAt)}</div><p>${esc(item.description || "Sans description")}</p><small>${dateText(item.startsAt)} → ${dateText(item.endsAt)} · ${item.quests?.length || 0} quête(s) · ${item.exclusiveCards?.length || 0} carte(s) exclusive(s) · ${esc(rewardLabel(item.rewards))}</small></div><div class="admin-popup-list-actions"><button class="admin-btn admin-btn-secondary" data-edit-event="${item.id}" type="button">Modifier</button><button class="admin-btn admin-btn-danger" data-delete-event="${item.id}" type="button">Supprimer</button></div></article>`).join("");
    root.querySelectorAll("[data-edit-event]").forEach(button => button.addEventListener("click", () => editEvent(button.dataset.editEvent)));
    root.querySelectorAll("[data-delete-event]").forEach(button => button.addEventListener("click", async () => { const item=state.events.find(e=>e.id===button.dataset.deleteEvent); if(!confirm(`Supprimer « ${item?.title} » ?`))return; try{await api(`/api/admin/events/${button.dataset.deleteEvent}`,{method:"DELETE"});toast("Événement supprimé.");await loadEvents();}catch(error){toast(error.message,true);} }));
  }

  // ---------------- Quêtes ----------------
  function bindQuests() {
    $("admin-quest-form")?.addEventListener("submit", saveQuest);
    $("admin-quest-cancel")?.addEventListener("click", resetQuestForm);
    $("admin-quests-refresh")?.addEventListener("click", loadQuests);
  }
  async function loadQuests() { try { const data=await api("/api/admin/quests");state.quests=data.quests||[];renderQuests(); } catch(error){toast(error.message,true);} }
  async function saveQuest(event){event.preventDefault();const id=$("admin-quest-id").value;const body={title:$("admin-quest-title").value.trim(),description:$("admin-quest-description").value.trim(),icon:$("admin-quest-icon").value||"✦",questType:$("admin-quest-type").value,eventKey:$("admin-quest-event-key").value,goal:Number($("admin-quest-goal").value),eventId:$("admin-quest-event-id").value||null,startsAt:iso("admin-quest-start"),endsAt:iso("admin-quest-end"),rewards:readRewards("admin-quest-rewards"),enabled:$("admin-quest-enabled").checked};try{await api(id?`/api/admin/quests/${id}`:"/api/admin/quests",{method:id?"PUT":"POST",body});toast(id?"Quête modifiée.":"Quête créée.");resetQuestForm();await loadQuests();}catch(error){toast(error.message,true);}}
  function editQuest(id){const item=state.quests.find(q=>q.id===String(id));if(!item)return;$("admin-quest-id").value=item.id;$("admin-quest-title").value=item.title;$("admin-quest-description").value=item.description||"";$("admin-quest-icon").value=item.icon||"✦";$("admin-quest-type").value=item.questType;$("admin-quest-event-key").value=item.eventKey;$("admin-quest-goal").value=item.goal;$("admin-quest-event-id").value=item.eventId||"";$("admin-quest-start").value=toInput(item.startsAt);$("admin-quest-end").value=toInput(item.endsAt);$("admin-quest-enabled").checked=item.enabled!==false;setRewards("admin-quest-rewards",item.rewards||[]);$("admin-quest-form-title").textContent="Modifier la quête";$("admin-quest-cancel").classList.remove("hidden");$("admin-quest-form").scrollIntoView({behavior:"smooth"});}
  function resetQuestForm(){$("admin-quest-form").reset();$("admin-quest-id").value="";$("admin-quest-form-title").textContent="Créer une quête";$("admin-quest-cancel").classList.add("hidden");$("admin-quest-enabled").checked=true;$("admin-quest-icon").value="✦";$("admin-quest-start").value=toInput(Date.now());$("admin-quest-end").value=toInput(Date.now()+30*86400000);setRewards("admin-quest-rewards");}
  function renderQuests(){const root=$("admin-quests-list");if(!state.quests.length){root.innerHTML='<div class="admin-empty-state compact"><p>Aucune quête administrable.</p></div>';return;}root.innerHTML=state.quests.map(item=>`<article class="admin-live-item"><div><div class="admin-popup-list-title-row"><strong>${esc(item.icon)} ${esc(item.title)}</strong>${statusBadge(item.enabled,item.startsAt,item.endsAt)}</div><p>${esc(item.description||"")}</p><small>${esc(item.questType)} · ${esc(item.eventKey)} ${item.goal} fois · ${esc(rewardLabel(item.rewards))}</small></div><div class="admin-popup-list-actions"><button class="admin-btn admin-btn-secondary" data-edit-quest="${item.id}" type="button">Modifier</button><button class="admin-btn admin-btn-danger" data-delete-quest="${item.id}" type="button">Supprimer</button></div></article>`).join("");root.querySelectorAll("[data-edit-quest]").forEach(button=>button.addEventListener("click",()=>editQuest(button.dataset.editQuest)));root.querySelectorAll("[data-delete-quest]").forEach(button=>button.addEventListener("click",async()=>{if(!confirm("Supprimer cette quête ?"))return;try{await api(`/api/admin/quests/${button.dataset.deleteQuest}`,{method:"DELETE"});toast("Quête supprimée.");await loadQuests();}catch(error){toast(error.message,true);}}));}

  // ---------------- Boutique ----------------
  function bindShop(){$("admin-offer-form")?.addEventListener("submit",saveOffer);$("admin-offer-cancel")?.addEventListener("click",resetOfferForm);$("admin-offers-refresh")?.addEventListener("click",loadOffers);}
  async function loadOffers(){try{const data=await api("/api/admin/shop-offers");state.offers=data.offers||[];renderOffers();}catch(error){toast(error.message,true);}}
  async function saveOffer(event){event.preventDefault();const id=$("admin-offer-id").value;const body={title:$("admin-offer-title").value.trim(),description:$("admin-offer-description").value.trim(),imageUrl:$("admin-offer-image").value.trim(),price:Number($("admin-offer-price").value),originalPrice:$("admin-offer-original-price").value===""?null:Number($("admin-offer-original-price").value),purchaseLimit:Number($("admin-offer-limit").value||0),startsAt:iso("admin-offer-start"),endsAt:iso("admin-offer-end"),rewards:readRewards("admin-offer-rewards"),enabled:$("admin-offer-enabled").checked};try{await api(id?`/api/admin/shop-offers/${id}`:"/api/admin/shop-offers",{method:id?"PUT":"POST",body});toast(id?"Offre modifiée.":"Offre publiée.");resetOfferForm();await loadOffers();}catch(error){toast(error.message,true);}}
  function editOffer(id){const item=state.offers.find(o=>o.id===String(id));if(!item)return;$("admin-offer-id").value=item.id;$("admin-offer-title").value=item.title;$("admin-offer-description").value=item.description||"";$("admin-offer-image").value=item.imageUrl||"";$("admin-offer-price").value=item.price;$("admin-offer-original-price").value=item.originalPrice??"";$("admin-offer-limit").value=item.purchaseLimit||0;$("admin-offer-start").value=toInput(item.startsAt);$("admin-offer-end").value=toInput(item.endsAt);$("admin-offer-enabled").checked=item.enabled!==false;setRewards("admin-offer-rewards",item.rewards||[]);$("admin-offer-form-title").textContent="Modifier l’offre";$("admin-offer-cancel").classList.remove("hidden");$("admin-offer-form").scrollIntoView({behavior:"smooth"});}
  function resetOfferForm(){$("admin-offer-form").reset();$("admin-offer-id").value="";$("admin-offer-form-title").textContent="Créer une offre";$("admin-offer-cancel").classList.add("hidden");$("admin-offer-enabled").checked=true;$("admin-offer-price").value=500;$("admin-offer-limit").value=0;$("admin-offer-start").value=toInput(Date.now());$("admin-offer-end").value=toInput(Date.now()+7*86400000);setRewards("admin-offer-rewards");}
  function renderOffers(){const root=$("admin-offers-list");if(!state.offers.length){root.innerHTML='<div class="admin-empty-state compact"><p>Aucune offre programmée.</p></div>';return;}root.innerHTML=state.offers.map(item=>`<article class="admin-live-item"><div><div class="admin-popup-list-title-row"><strong>${esc(item.title)}</strong>${statusBadge(item.enabled,item.startsAt,item.endsAt)}</div><p>${esc(item.description||"")}</p><small>${item.originalPrice?`<s>${item.originalPrice}</s> `:""}${item.price} pièces · ${esc(rewardLabel(item.rewards))} · limite ${item.purchaseLimit||"∞"}</small></div><div class="admin-popup-list-actions"><button class="admin-btn admin-btn-secondary" data-edit-offer="${item.id}" type="button">Modifier</button><button class="admin-btn admin-btn-danger" data-delete-offer="${item.id}" type="button">Supprimer</button></div></article>`).join("");root.querySelectorAll("[data-edit-offer]").forEach(button=>button.addEventListener("click",()=>editOffer(button.dataset.editOffer)));root.querySelectorAll("[data-delete-offer]").forEach(button=>button.addEventListener("click",async()=>{if(!confirm("Supprimer cette offre ?"))return;try{await api(`/api/admin/shop-offers/${button.dataset.deleteOffer}`,{method:"DELETE"});toast("Offre supprimée.");await loadOffers();}catch(error){toast(error.message,true);}}));}

  // ---------------- Maintenance ----------------
  function bindMaintenance(){$("admin-maintenance-form")?.addEventListener("submit",saveMaintenance);}
  async function loadMaintenance(){try{const data=await api("/api/admin/maintenance");const item=data.maintenance||{};$("admin-maintenance-enabled").checked=item.enabled===true;$("admin-maintenance-message").value=item.message||"";$("admin-maintenance-end").value=item.estimatedEndAt?toInput(item.estimatedEndAt):"";renderMaintenanceState(item.enabled);}catch(error){toast(error.message,true);}}
  async function saveMaintenance(event){event.preventDefault();try{const data=await api("/api/admin/maintenance",{method:"PUT",body:{enabled:$("admin-maintenance-enabled").checked,message:$("admin-maintenance-message").value.trim(),estimatedEndAt:iso("admin-maintenance-end")}});renderMaintenanceState(data.maintenance?.enabled);toast(data.maintenance?.enabled?"Mode maintenance activé.":"Mode maintenance désactivé.");}catch(error){toast(error.message,true);}}
  function renderMaintenanceState(enabled){const el=$("admin-maintenance-state");el.textContent=enabled?"Activé":"Désactivé";el.className=`admin-status-pill ${enabled?"banned":"online"}`;}

  // ---------------- Codes ----------------
  function bindCodes(){$("admin-code-form")?.addEventListener("submit",saveCode);$("admin-code-cancel")?.addEventListener("click",resetCodeForm);$("admin-codes-refresh")?.addEventListener("click",loadCodes);}
  async function loadCodes(){try{const data=await api("/api/admin/gift-codes");state.codes=data.codes||[];renderCodes();}catch(error){toast(error.message,true);}}
  async function saveCode(event){event.preventDefault();const id=$("admin-code-id").value;const body={code:$("admin-code-value").value.trim().toUpperCase(),maxUses:Number($("admin-code-max-uses").value||0),startsAt:iso("admin-code-start"),expiresAt:iso("admin-code-expiry"),rewards:readRewards("admin-code-rewards"),enabled:$("admin-code-enabled").checked};try{await api(id?`/api/admin/gift-codes/${id}`:"/api/admin/gift-codes",{method:id?"PUT":"POST",body});toast(id?"Code modifié.":"Code cadeau créé.");resetCodeForm();await loadCodes();}catch(error){toast(error.message,true);}}
  function editCode(id){const item=state.codes.find(c=>c.id===String(id));if(!item)return;$("admin-code-id").value=item.id;$("admin-code-value").value=item.code;$("admin-code-value").disabled=true;$("admin-code-max-uses").value=item.maxUses;$("admin-code-start").value=toInput(item.startsAt);$("admin-code-expiry").value=item.expiresAt?toInput(item.expiresAt):"";$("admin-code-enabled").checked=item.enabled!==false;setRewards("admin-code-rewards",item.rewards||[]);$("admin-code-form-title").textContent="Modifier le code";$("admin-code-cancel").classList.remove("hidden");$("admin-code-form").scrollIntoView({behavior:"smooth"});}
  function resetCodeForm(){$("admin-code-form").reset();$("admin-code-id").value="";$("admin-code-value").disabled=false;$("admin-code-form-title").textContent="Créer un code cadeau";$("admin-code-cancel").classList.add("hidden");$("admin-code-enabled").checked=true;$("admin-code-max-uses").value=0;$("admin-code-start").value=toInput(Date.now());$("admin-code-expiry").value="";setRewards("admin-code-rewards");}
  function renderCodes(){const root=$("admin-codes-list");if(!state.codes.length){root.innerHTML='<div class="admin-empty-state compact"><p>Aucun code cadeau.</p></div>';return;}root.innerHTML=state.codes.map(item=>`<article class="admin-live-item"><div><div class="admin-popup-list-title-row"><strong class="admin-code-value">${esc(item.code)}</strong>${item.enabled?'<span class="admin-popup-status active">Actif</span>':'<span class="admin-popup-status disabled">Désactivé</span>'}</div><p>${esc(rewardLabel(item.rewards))}</p><small>${item.usesCount}/${item.maxUses||"∞"} utilisation(s) · expiration ${dateText(item.expiresAt)}</small></div><div class="admin-popup-list-actions"><button class="admin-btn admin-btn-secondary" data-edit-code="${item.id}" type="button">Modifier</button><button class="admin-btn admin-btn-danger" data-delete-code="${item.id}" type="button">Supprimer</button></div></article>`).join("");root.querySelectorAll("[data-edit-code]").forEach(button=>button.addEventListener("click",()=>editCode(button.dataset.editCode)));root.querySelectorAll("[data-delete-code]").forEach(button=>button.addEventListener("click",async()=>{if(!confirm("Supprimer définitivement ce code ?"))return;try{await api(`/api/admin/gift-codes/${button.dataset.deleteCode}`,{method:"DELETE"});toast("Code supprimé.");await loadCodes();}catch(error){toast(error.message,true);}}));}

  // ---------------- Logs ----------------
  function bindLogs(){$("admin-logs-filter")?.addEventListener("submit",event=>{event.preventDefault();loadLogs();});$("admin-logs-refresh")?.addEventListener("click",loadLogs);}
  async function loadLogs(){try{const params=new URLSearchParams();if($("admin-logs-category").value)params.set("category",$("admin-logs-category").value);if($("admin-logs-query").value.trim())params.set("q",$("admin-logs-query").value.trim());params.set("limit","300");const data=await api(`/api/admin/logs?${params}`);renderLogs(data.logs||[]);}catch(error){toast(error.message,true);}}
  function renderLogs(logs){const body=$("admin-logs-body");body.innerHTML=logs.length?logs.map(item=>`<tr><td>${dateText(item.createdAt)}</td><td><span class="admin-log-category">${esc(item.category)}</span></td><td>${esc(item.action)}</td><td>${esc(item.username||item.userId||"—")}</td><td>${esc(item.adminName||"—")}</td><td><code>${esc(JSON.stringify(item.details||{}))}</code></td></tr>`).join(""):'<tr><td colspan="6">Aucun log trouvé.</td></tr>';}

  const loaders = { cards: loadCards, events: async()=>{await loadEvents();}, quests: async()=>{if(!state.events.length)await loadEvents();await loadQuests();}, shop: loadOffers, maintenance: loadMaintenance, codes: loadCodes, logs: loadLogs };
  window.astreaAdminExtensions = {
    onNavigate(view) {
      const loader = loaders[view];
      if (loader) loader();
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();
