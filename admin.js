"use strict";

(() => {
  const TOKEN_KEY = "astrea_admin_token";
  const RAW_SERVER_URL = String(window.ASTREA_SERVER_URL || "").trim().replace(/\/+$/, "");
  const API_BASE_URL = RAW_SERVER_URL && !RAW_SERVER_URL.includes("REMPLACEZ-MOI") ? RAW_SERVER_URL : "";
  const query = new URLSearchParams(window.location.search);
  const deepLink = {
    reportId: query.get("report"),
    userId: query.get("user"),
    action: query.get("action")
  };

  const state = {
    token: null,
    admin: null,
    reports: [],
    currentReport: null,
    currentUser: null,
    popups: [],
    editingPopupId: null,
    currentView: "dashboard",
    playerTab: "overview"
  };

  const dom = {};
  const ids = [
    "admin-login-view", "admin-login-form", "admin-login-username", "admin-login-password", "admin-login-error", "admin-login-submit",
    "admin-app", "admin-session-name", "admin-logout-btn", "admin-open-reports-badge", "admin-view-kicker", "admin-view-title",
    "admin-global-message", "admin-dashboard-view", "admin-reports-view", "admin-players-view", "admin-popups-view",
    "admin-stat-open", "admin-stat-reviewing", "admin-stat-resolved", "admin-stat-webhook-errors", "admin-dashboard-reports",
    "admin-report-status-filter", "admin-reports-list", "admin-report-detail",
    "admin-player-search-form", "admin-player-search-input", "admin-player-search-results", "admin-player-detail",
    "admin-player-name", "admin-player-meta", "admin-player-online", "admin-player-ban-state", "admin-player-stats", "admin-player-reports", "admin-player-actions",
    "admin-ban-form", "admin-ban-reason", "admin-ban-duration", "admin-ban-custom-wrap", "admin-ban-custom-minutes", "admin-active-ban", "admin-unban-btn",
    "admin-coins-form", "admin-coins-mode", "admin-coins-amount", "admin-card-form", "admin-card-id", "admin-card-mode", "admin-card-amount",
    "admin-pack-form", "admin-pack-id", "admin-pack-mode", "admin-pack-amount", "admin-identity-form", "admin-identity-username", "admin-identity-password",
    "admin-invalidate-sessions-btn", "admin-reset-progress-btn", "admin-delete-account-btn", "admin-progress-json", "admin-json-format-btn", "admin-progress-save-btn",
    "admin-popup-form", "admin-popup-form-title", "admin-popup-id", "admin-popup-title", "admin-popup-description", "admin-popup-footer",
    "admin-popup-images-list", "admin-popup-buttons-list", "admin-popup-add-image-btn", "admin-popup-add-button-btn",
    "admin-popup-starts-at", "admin-popup-duration", "admin-popup-custom-duration-wrap", "admin-popup-custom-duration", "admin-popup-custom-unit",
    "admin-popup-enabled", "admin-popup-submit-btn", "admin-popup-cancel-btn", "admin-popup-preview", "admin-popup-list", "admin-popup-refresh-btn",
    "admin-popup-reward-enabled", "admin-popup-reward-fields", "admin-popup-reward-type", "admin-popup-reward-amount", "admin-popup-reward-pack-wrap", "admin-popup-reward-pack-id", "admin-popup-reward-card-wrap", "admin-popup-reward-card-id", "admin-popup-reward-hero-wrap", "admin-popup-reward-hero-id",
    "admin-popup-target-type", "admin-popup-target-new", "admin-popup-target-age-days", "admin-popup-target-max-matches", "admin-popup-target-rank", "admin-popup-target-rank-tier", "admin-popup-target-inactive", "admin-popup-target-inactive-days", "admin-popup-target-usernames", "admin-popup-target-usernames-input",
    "admin-toast-container"
  ];

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    ids.forEach(id => { dom[toCamel(id)] = document.getElementById(id); });
    bindEvents();
    populateCardCatalog();
    restoreAdminSession();
  }

  function toCamel(value) { return value.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function formatDate(timestamp) {
    if (!timestamp) return "—";
    try { return new Date(timestamp).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); }
    catch (_) { return "—"; }
  }
  function formatActionType(type) {
    return ({
      report_status_changed: "Statut du signalement modifié",
      identity_updated: "Identité ou mot de passe modifié",
      progress_replaced: "Progression JSON remplacée",
      coins_updated: "Solde de pièces modifié",
      cards_updated: "Collection de cartes modifiée",
      packs_updated: "Inventaire de paquets modifié",
      progress_reset: "Progression réinitialisée",
      sessions_invalidated: "Sessions fermées",
      user_banned: "Joueur banni",
      user_unbanned: "Joueur débanni",
      hero_unlocked: "Héros débloqué",
      hero_locked: "Héros verrouillé",
      hero_shop_updated: "Boutique de héros modifiée"
    })[type] || type;
  }
  function statusLabel(status) {
    return ({ open: "Ouvert", reviewing: "En cours", resolved: "Résolu", dismissed: "Classé" })[status] || status;
  }

  async function apiFetch(path, { method = "GET", body, token = state.token } = {}) {
    if (!API_BASE_URL && window.location.hostname.endsWith("github.io")) {
      throw new Error("Backend Render non configuré dans server-url.js.");
    }
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (_) {
      throw new Error("Serveur d’administration injoignable.");
    }
    let data = {};
    try { data = await response.json(); } catch (_) { /* réponse vide */ }
    if (!response.ok) {
      const error = new Error(data.error || "Une erreur est survenue.");
      error.code = data.code || null;
      error.data = data;
      if (response.status === 401 && token) endSession(false);
      throw error;
    }
    return data;
  }

  function bindEvents() {
    dom.adminLoginForm?.addEventListener("submit", login);
    dom.adminLogoutBtn?.addEventListener("click", logout);
    document.querySelectorAll(".admin-nav-btn").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
    document.querySelectorAll("[data-open-view]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.openView)));
    dom.adminReportStatusFilter?.addEventListener("change", loadReports);
    dom.adminPlayerSearchForm?.addEventListener("submit", event => { event.preventDefault(); searchPlayers(); });
    document.querySelectorAll("[data-player-tab]").forEach(button => button.addEventListener("click", () => selectPlayerTab(button.dataset.playerTab)));
    dom.adminBanDuration?.addEventListener("change", () => dom.adminBanCustomWrap?.classList.toggle("hidden", dom.adminBanDuration.value !== "custom"));
    dom.adminBanForm?.addEventListener("submit", banCurrentUser);
    dom.adminUnbanBtn?.addEventListener("click", unbanCurrentUser);
    dom.adminCoinsForm?.addEventListener("submit", updateCoins);
    dom.adminCardForm?.addEventListener("submit", updateCard);
    dom.adminPackForm?.addEventListener("submit", updatePack);
    dom.adminIdentityForm?.addEventListener("submit", updateIdentity);
    dom.adminInvalidateSessionsBtn?.addEventListener("click", invalidateSessions);
    dom.adminResetProgressBtn?.addEventListener("click", resetProgress);
    dom.adminDeleteAccountBtn?.addEventListener("click", deleteAccount);
    dom.adminJsonFormatBtn?.addEventListener("click", formatProgressJson);
    dom.adminProgressSaveBtn?.addEventListener("click", saveProgressJson);
    dom.adminPopupForm?.addEventListener("submit", savePopup);
    dom.adminPopupAddImageBtn?.addEventListener("click", () => addPopupImageField());
    dom.adminPopupAddButtonBtn?.addEventListener("click", () => addPopupButtonField());
    dom.adminPopupDuration?.addEventListener("change", () => {
      dom.adminPopupCustomDurationWrap?.classList.toggle("hidden", dom.adminPopupDuration.value !== "custom");
      renderPopupPreview();
    });
    dom.adminPopupRewardEnabled?.addEventListener("change", () => { updatePopupRewardFields(); renderPopupPreview(); });
    dom.adminPopupRewardType?.addEventListener("change", () => { updatePopupRewardFields(); renderPopupPreview(); });
    dom.adminPopupTargetType?.addEventListener("change", () => { updatePopupTargetFields(); renderPopupPreview(); });
    dom.adminPopupCancelBtn?.addEventListener("click", resetPopupForm);
    dom.adminPopupRefreshBtn?.addEventListener("click", loadPopups);
    [dom.adminPopupTitle, dom.adminPopupDescription, dom.adminPopupFooter, dom.adminPopupStartsAt,
      dom.adminPopupCustomDuration, dom.adminPopupCustomUnit, dom.adminPopupEnabled,
      dom.adminPopupRewardAmount, dom.adminPopupRewardPackId, dom.adminPopupRewardCardId,
      dom.adminPopupTargetAgeDays, dom.adminPopupTargetMaxMatches, dom.adminPopupTargetRankTier,
      dom.adminPopupTargetInactiveDays, dom.adminPopupTargetUsernamesInput]
      .forEach(element => element?.addEventListener("input", renderPopupPreview));
  }

  async function restoreAdminSession() {
    const token = window.localStorage?.getItem?.(TOKEN_KEY);
    if (!token) return showLogin();
    state.token = token;
    try {
      const admin = await apiFetch("/api/admin/me");
      startSession(token, admin);
      await loadInitialView();
    } catch (_) {
      endSession(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    const username = dom.adminLoginUsername.value.trim();
    const password = dom.adminLoginPassword.value;
    dom.adminLoginError?.classList.add("hidden");
    dom.adminLoginSubmit.disabled = true;
    try {
      const result = await apiFetch("/api/admin/login", { method: "POST", body: { username, password }, token: null });
      startSession(result.token, result);
      dom.adminLoginPassword.value = "";
      await loadInitialView();
    } catch (error) {
      dom.adminLoginError.textContent = error.message;
      dom.adminLoginError.classList.remove("hidden");
    } finally {
      dom.adminLoginSubmit.disabled = false;
    }
  }

  function startSession(token, admin) {
    state.token = token;
    state.admin = admin;
    window.localStorage?.setItem?.(TOKEN_KEY, token);
    dom.adminSessionName.textContent = admin.displayName || admin.username || "Administrateur";
    dom.adminLoginView.classList.add("hidden");
    dom.adminApp.classList.remove("hidden");
    document.dispatchEvent(new CustomEvent("astrea:admin-session", { detail: { active: true, admin } }));
  }

  function showLogin() {
    dom.adminApp?.classList.add("hidden");
    dom.adminLoginView?.classList.remove("hidden");
    window.setTimeout(() => dom.adminLoginUsername?.focus(), 30);
  }

  function endSession(showMessage = true) {
    state.token = null;
    state.admin = null;
    window.localStorage?.removeItem?.(TOKEN_KEY);
    document.dispatchEvent(new CustomEvent("astrea:admin-session", { detail: { active: false } }));
    showLogin();
    if (showMessage) toast("Session administrateur fermée.");
  }

  async function logout() {
    try { await apiFetch("/api/admin/logout", { method: "POST" }); } catch (_) { /* ignore */ }
    endSession();
  }

  async function loadInitialView() {
    await loadReports();
    if (deepLink.reportId) {
      navigate("reports");
      await selectReport(deepLink.reportId);
      return;
    }
    if (deepLink.userId) {
      navigate("players");
      await loadPlayer(deepLink.userId);
      if (deepLink.action === "unban") {
        selectPlayerTab("sanctions");
        showGlobalMessage("Ce lien Discord ouvre la fiche de sanction. Vérifiez le compte puis utilisez « Débannir le joueur ».");
      }
      return;
    }
    navigate("dashboard");
  }

  function navigate(view) {
    state.currentView = view;
    document.querySelectorAll(".admin-nav-btn").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    document.querySelectorAll(".admin-view").forEach(section => section.classList.toggle("hidden", section.id !== `admin-${view}-view`));
    const meta = {
      dashboard: ["Vue d’ensemble", "Tableau de bord"],
      reports: ["Modération", "Signalements"],
      players: ["Gestion des comptes", "Joueurs"],
      popups: ["Communication", "Pop-up du jeu"],
      cards: ["Équilibrage", "Gestion des cartes"],
      events: ["Live Ops", "Événements"],
      quests: ["Progression", "Quêtes administrables"],
      shop: ["Économie", "Boutique à distance"],
      maintenance: ["Exploitation", "Mode maintenance"],
      codes: ["Communauté", "Codes cadeaux"],
      logs: ["Sécurité", "Logs complets"]
    }[view] || ["Administration", view];
    dom.adminViewKicker.textContent = meta[0];
    dom.adminViewTitle.textContent = meta[1];
    if (view === "reports") loadReports();
    if (view === "popups") loadPopups();
    window.astreaAdminExtensions?.onNavigate?.(view);
  }

  window.astreaAdminNavigate = navigate;
  window.astreaAdminApiFetch = apiFetch;
  window.astreaAdminToast = toast;

  async function loadReports() {
    if (!state.token) return;
    const status = dom.adminReportStatusFilter?.value || "";
    try {
      const data = await apiFetch(`/api/admin/reports${status ? `?status=${encodeURIComponent(status)}` : ""}`);
      state.reports = data.reports || [];
      renderReports();
      renderDashboard();
    } catch (error) { toast(error.message, true); }
  }

  function renderReports() {
    const markup = state.reports.length ? state.reports.map(report => reportItemMarkup(report)).join("") : `<div class="admin-empty-state compact"><p>Aucun signalement dans cette catégorie.</p></div>`;
    dom.adminReportsList.innerHTML = markup;
    dom.adminReportsList.querySelectorAll("[data-report-id]").forEach(button => button.addEventListener("click", () => selectReport(button.dataset.reportId)));
  }

  function reportItemMarkup(report) {
    return `<button class="admin-report-item ${state.currentReport?.id === report.id ? "active" : ""}" data-report-id="${escapeHtml(report.id)}" type="button">
      <span class="admin-report-dot ${escapeHtml(report.status)}"></span>
      <span class="admin-report-copy"><strong>${escapeHtml(report.targetUsername)} · ${escapeHtml(report.category)}</strong><span>${escapeHtml(report.reason)}</span><small>Par ${escapeHtml(report.reporterUsername)} · ${escapeHtml(statusLabel(report.status))}</small></span>
      <time>${escapeHtml(formatDate(report.createdAt))}</time>
    </button>`;
  }

  function renderDashboard() {
    const all = state.reports;
    const open = all.filter(report => report.status === "open");
    const reviewing = all.filter(report => report.status === "reviewing");
    const resolved = all.filter(report => report.status === "resolved");
    const webhookErrors = all.filter(report => !report.discordDelivered);
    dom.adminStatOpen.textContent = String(open.length);
    dom.adminStatReviewing.textContent = String(reviewing.length);
    dom.adminStatResolved.textContent = String(resolved.length);
    dom.adminStatWebhookErrors.textContent = String(webhookErrors.length);
    dom.adminOpenReportsBadge.textContent = String(open.length);
    dom.adminDashboardReports.innerHTML = open.length ? open.slice(0, 8).map(reportItemMarkup).join("") : `<div class="admin-empty-state compact"><p>Aucun signalement ouvert.</p></div>`;
    dom.adminDashboardReports.querySelectorAll("[data-report-id]").forEach(button => button.addEventListener("click", async () => { navigate("reports"); await selectReport(button.dataset.reportId); }));
  }

  async function selectReport(reportId) {
    try {
      const data = await apiFetch(`/api/admin/reports/${encodeURIComponent(reportId)}`);
      state.currentReport = data.report;
      renderReports();
      renderReportDetail();
    } catch (error) { toast(error.message, true); }
  }

  function renderReportDetail() {
    const report = state.currentReport;
    if (!report) return;
    dom.adminReportDetail.innerHTML = `
      <div class="admin-report-detail-header">
        <div><p class="admin-kicker">Signalement #${escapeHtml(report.id)}</p><h2>${escapeHtml(report.targetUsername)}</h2><p class="admin-muted">Reçu le ${escapeHtml(formatDate(report.createdAt))}</p></div>
        <span class="admin-status-pill ${escapeHtml(report.status)}">${escapeHtml(statusLabel(report.status))}</span>
      </div>
      <div class="admin-report-field"><span>Joueur ayant signalé</span><p>${escapeHtml(report.reporterUsername)} (ID ${escapeHtml(report.reporterUserId)})</p></div>
      <div class="admin-report-field"><span>Catégorie</span><p>${escapeHtml(report.category)}</p></div>
      <div class="admin-report-field"><span>Raison</span><p>${escapeHtml(report.reason)}</p></div>
      <div class="admin-report-field"><span>Envoi Discord</span><p>${report.webhookDelivered ? "Webhook livré correctement" : `Échec : ${escapeHtml(report.webhookError || "cause inconnue")}`}</p></div>
      ${report.resolutionNote ? `<div class="admin-report-field"><span>Note de résolution</span><p>${escapeHtml(report.resolutionNote)}</p></div>` : ""}
      <div class="admin-action-row">
        <button class="admin-btn admin-btn-primary" data-report-player type="button">Gérer le compte du joueur</button>
        <button class="admin-btn admin-btn-secondary" data-report-status="reviewing" type="button">Passer en cours</button>
        <button class="admin-btn admin-btn-success" data-report-status="resolved" type="button">Marquer résolu</button>
        <button class="admin-btn admin-btn-secondary" data-report-status="dismissed" type="button">Classer sans suite</button>
      </div>`;
    dom.adminReportDetail.querySelector("[data-report-player]")?.addEventListener("click", async () => {
      navigate("players");
      await loadPlayer(report.targetUserId);
    });
    dom.adminReportDetail.querySelectorAll("[data-report-status]").forEach(button => button.addEventListener("click", () => updateReportStatus(button.dataset.reportStatus)));
  }

  async function updateReportStatus(status) {
    if (!state.currentReport) return;
    let note = "";
    if (status === "resolved" || status === "dismissed") {
      note = window.prompt("Note de résolution (facultatif) :", state.currentReport.resolutionNote || "") || "";
    }
    try {
      await apiFetch(`/api/admin/reports/${state.currentReport.id}/status`, { method: "PUT", body: { status, note } });
      toast("Statut du signalement mis à jour.");
      await loadReports();
      await selectReport(state.currentReport.id);
    } catch (error) { toast(error.message, true); }
  }

  async function searchPlayers() {
    const q = dom.adminPlayerSearchInput.value.trim();
    if (!q) return;
    dom.adminPlayerSearchResults.innerHTML = `<div class="admin-empty-state compact"><p>Recherche…</p></div>`;
    try {
      const data = await apiFetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
      renderPlayerSearchResults(data.users || []);
    } catch (error) { toast(error.message, true); }
  }

  function renderPlayerSearchResults(users) {
    dom.adminPlayerSearchResults.innerHTML = users.length ? users.map(user => `
      <article class="admin-player-result" data-user-id="${escapeHtml(user.id)}">
        <strong>${escapeHtml(user.username)}</strong><small>ID ${escapeHtml(user.id)} · ${user.online ? "En ligne" : "Hors ligne"}${user.banned ? " · Banni" : ""}</small>
        <footer><span>${Number(user.coins || 0)} pièces</span><span>${Number(user.reportCount || 0)} signalement(s)</span></footer>
      </article>`).join("") : `<div class="admin-empty-state compact"><p>Aucun joueur trouvé.</p></div>`;
    dom.adminPlayerSearchResults.querySelectorAll("[data-user-id]").forEach(card => card.addEventListener("click", () => loadPlayer(card.dataset.userId)));
  }

  async function loadPlayer(userId) {
    try {
      const data = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`);
      state.currentUser = data.user;
      dom.adminPlayerDetail.classList.remove("hidden");
      renderCurrentUser();
      document.dispatchEvent(new CustomEvent("astrea:admin-user-loaded", { detail: { user: data.user } }));
      if (state.currentReport?.targetUserId !== data.user.id) state.currentReport = null;
      if (deepLink.action === "unban" && deepLink.userId === data.user.id) selectPlayerTab("sanctions");
    } catch (error) { toast(error.message, true); }
  }

  function renderCurrentUser() {
    const user = state.currentUser;
    if (!user) return;
    const progress = user.progress || {};
    const collection = progress.collection && typeof progress.collection === "object" ? progress.collection : {};
    const ownedCards = Object.values(collection).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
    const packs = progress.packs && typeof progress.packs === "object" ? Object.values(progress.packs).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0) : 0;

    dom.adminPlayerName.textContent = user.username;
    dom.adminPlayerMeta.textContent = `ID ${user.id} · Compte créé le ${formatDate(user.createdAt)} · Révision ${user.progressRevision}`;
    dom.adminPlayerOnline.textContent = user.online ? "En ligne" : "Hors ligne";
    dom.adminPlayerOnline.className = `admin-status-pill ${user.online ? "online" : ""}`;
    dom.adminPlayerBanState.classList.toggle("hidden", !user.activeBan);
    dom.adminPlayerBanState.className = `admin-status-pill banned${user.activeBan ? "" : " hidden"}`;

    const stats = [
      ["Pièces", Number(progress.coins || 0)], ["Cartes", ownedCards], ["Paquets", packs], ["Amis", user.friendCount], ["Sessions", user.sessionCount],
      ["Messages", user.messageCount], ["Signalements reçus", user.reportsReceived], ["Signalements envoyés", user.reportsSent], ["Version progression", progress.version || "—"], ["Dernière sauvegarde", formatDate(user.progressUpdatedAt)]
    ];
    dom.adminPlayerStats.innerHTML = stats.map(([label, value]) => `<article class="admin-stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

    dom.adminPlayerReports.innerHTML = user.reports.length ? user.reports.map(report => `<div class="admin-timeline-item" data-player-report-id="${escapeHtml(report.id)}"><strong>${escapeHtml(report.category)} · ${escapeHtml(statusLabel(report.status))}</strong><p>${escapeHtml(report.reason)}</p><time>Par ${escapeHtml(report.reporterUsername)} · ${escapeHtml(formatDate(report.createdAt))}</time></div>`).join("") : `<div class="admin-empty-state compact"><p>Aucun signalement reçu.</p></div>`;
    dom.adminPlayerReports.querySelectorAll("[data-player-report-id]").forEach(item => item.addEventListener("click", async () => { navigate("reports"); await selectReport(item.dataset.playerReportId); }));

    dom.adminPlayerActions.innerHTML = user.actions.length ? user.actions.map(action => `<div class="admin-timeline-item"><strong>${escapeHtml(formatActionType(action.type))}</strong><p>${escapeHtml(formatActionDetails(action.details))}</p><time>${escapeHtml(action.adminName)} · ${escapeHtml(formatDate(action.createdAt))}</time></div>`).join("") : `<div class="admin-empty-state compact"><p>Aucune action administrateur.</p></div>`;

    renderActiveBan(user.activeBan);
    dom.adminIdentityUsername.value = user.username;
    dom.adminIdentityPassword.value = "";
    dom.adminProgressJson.value = JSON.stringify(user.progress || {}, null, 2);
    selectPlayerTab(state.playerTab || "overview");
  }

  function formatActionDetails(details) {
    if (!details || typeof details !== "object" || !Object.keys(details).length) return "Aucun détail supplémentaire.";
    return Object.entries(details).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join(" · ");
  }

  function renderActiveBan(ban) {
    if (!ban) {
      dom.adminActiveBan.innerHTML = `<div class="admin-empty-state compact"><p>Aucun bannissement actif.</p></div>`;
      dom.adminUnbanBtn.classList.add("hidden");
      return;
    }
    dom.adminActiveBan.innerHTML = `<div class="admin-active-ban-card"><strong>${ban.permanent ? "Bannissement permanent" : `Banni jusqu’au ${escapeHtml(formatDate(ban.expiresAt))}`}</strong><p>${escapeHtml(ban.reason)}</p><small>Appliqué le ${escapeHtml(formatDate(ban.startsAt))} par ${escapeHtml(ban.adminName || "un administrateur")}</small></div>`;
    dom.adminUnbanBtn.classList.remove("hidden");
  }

  function selectPlayerTab(tab) {
    state.playerTab = tab;
    document.querySelectorAll("[data-player-tab]").forEach(button => button.classList.toggle("active", button.dataset.playerTab === tab));
    document.querySelectorAll(".admin-player-tab-content").forEach(section => section.classList.add("hidden"));
    document.getElementById(`admin-player-tab-${tab}`)?.classList.remove("hidden");
  }

  async function banCurrentUser(event) {
    event.preventDefault();
    const user = state.currentUser;
    if (!user) return;
    const reason = dom.adminBanReason.value.trim();
    const durationChoice = dom.adminBanDuration.value;
    const durationMinutes = durationChoice === "permanent" ? null : Number(durationChoice === "custom" ? dom.adminBanCustomMinutes.value : durationChoice);
    if (!window.confirm(`Confirmer le bannissement de ${user.username} ?`)) return;
    try {
      const result = await apiFetch(`/api/admin/users/${user.id}/ban`, {
        method: "POST",
        body: { reason, durationMinutes, reportId: state.currentReport?.targetUserId === user.id ? state.currentReport.id : null, sourceUrl: window.location.href }
      });
      toast(result.warning ? `Joueur banni. Discord : ${result.warning}` : "Joueur banni et notification Discord envoyée.");
      dom.adminBanReason.value = "";
      await loadPlayer(user.id);
      await loadReports();
    } catch (error) { toast(error.message, true); }
  }

  async function unbanCurrentUser() {
    const user = state.currentUser;
    if (!user || !window.confirm(`Débannir ${user.username} ?`)) return;
    const reason = window.prompt("Motif du débannissement :", "Sanction levée par un administrateur") || "Sanction levée par un administrateur";
    try {
      await apiFetch(`/api/admin/users/${user.id}/unban`, { method: "POST", body: { reason } });
      toast("Le joueur a été débanni.");
      await loadPlayer(user.id);
    } catch (error) { toast(error.message, true); }
  }

  async function updateCoins(event) {
    event.preventDefault();
    await runUserMutation("coins", { mode: dom.adminCoinsMode.value, amount: Number(dom.adminCoinsAmount.value) }, "Solde de pièces modifié.");
  }
  async function updateCard(event) {
    event.preventDefault();
    await runUserMutation("cards", { cardId: dom.adminCardId.value, mode: dom.adminCardMode.value, amount: Number(dom.adminCardAmount.value) }, "Collection de cartes modifiée.");
  }
  async function updatePack(event) {
    event.preventDefault();
    await runUserMutation("packs", { packId: dom.adminPackId.value, mode: dom.adminPackMode.value, amount: Number(dom.adminPackAmount.value) }, "Inventaire de paquets modifié.");
  }
  async function runUserMutation(endpoint, body, successMessage) {
    const user = state.currentUser;
    if (!user) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}/${endpoint}`, { method: "POST", body });
      toast(successMessage);
      await loadPlayer(user.id);
    } catch (error) { toast(error.message, true); }
  }

  async function updateIdentity(event) {
    event.preventDefault();
    const user = state.currentUser;
    if (!user) return;
    const username = dom.adminIdentityUsername.value.trim();
    const newPassword = dom.adminIdentityPassword.value;
    const body = {};
    if (username && username !== user.username) body.username = username;
    if (newPassword) body.newPassword = newPassword;
    if (!Object.keys(body).length) return toast("Aucune modification à enregistrer.", true);
    try {
      await apiFetch(`/api/admin/users/${user.id}/identity`, { method: "PUT", body });
      toast("Identité du compte mise à jour.");
      await loadPlayer(user.id);
    } catch (error) { toast(error.message, true); }
  }

  async function invalidateSessions() {
    const user = state.currentUser;
    if (!user || !window.confirm(`Fermer toutes les sessions de ${user.username} ?`)) return;
    try {
      const result = await apiFetch(`/api/admin/users/${user.id}/invalidate-sessions`, { method: "POST", body: {} });
      toast(`${result.invalidatedSessions} session(s) fermée(s).`);
      await loadPlayer(user.id);
    } catch (error) { toast(error.message, true); }
  }

  async function resetProgress() {
    const user = state.currentUser;
    if (!user) return;
    const confirmation = window.prompt(`Cette action remettra entièrement à zéro la progression de ${user.username}. Tapez RESET pour confirmer.`);
    if (confirmation !== "RESET") return;
    try {
      await apiFetch(`/api/admin/users/${user.id}/reset-progress`, { method: "POST", body: { confirmation } });
      toast("Progression réinitialisée.");
      await loadPlayer(user.id);
    } catch (error) { toast(error.message, true); }
  }

  async function deleteAccount() {
    const user = state.currentUser;
    if (!user) return;
    const confirmation = window.prompt(`Suppression irréversible de ${user.username}. Tapez DELETE pour confirmer.`);
    if (confirmation !== "DELETE") return;
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE", body: { confirmation } });
      toast("Compte supprimé définitivement.");
      state.currentUser = null;
      dom.adminPlayerDetail.classList.add("hidden");
      dom.adminPlayerSearchResults.innerHTML = "";
    } catch (error) { toast(error.message, true); }
  }

  function formatProgressJson() {
    try {
      dom.adminProgressJson.value = JSON.stringify(JSON.parse(dom.adminProgressJson.value || "{}"), null, 2);
      toast("JSON reformaté.");
    } catch (error) { toast(`JSON invalide : ${error.message}`, true); }
  }

  async function saveProgressJson() {
    const user = state.currentUser;
    if (!user) return;
    let progress;
    try { progress = JSON.parse(dom.adminProgressJson.value || "{}"); }
    catch (error) { return toast(`JSON invalide : ${error.message}`, true); }
    if (!window.confirm("Enregistrer cette progression complète sur le compte joueur ?")) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}/progress`, { method: "PUT", body: { progress } });
      toast("Progression JSON enregistrée.");
      await loadPlayer(user.id);
    } catch (error) { toast(error.message, true); }
  }



  const POPUP_LEAGUES = ["Bronze III","Bronze II","Bronze I","Argent III","Argent II","Argent I","Or III","Or II","Or I","Platine III","Platine II","Platine I","Diamant III","Diamant II","Diamant I","Maître"];

  function updatePopupRewardFields() {
    const enabled = Boolean(dom.adminPopupRewardEnabled?.checked);
    dom.adminPopupRewardFields?.classList.toggle("hidden", !enabled);
    const type = dom.adminPopupRewardType?.value || "coins";
    dom.adminPopupRewardPackWrap?.classList.toggle("hidden", !enabled || type !== "pack");
    dom.adminPopupRewardCardWrap?.classList.toggle("hidden", !enabled || type !== "card");
    dom.adminPopupRewardHeroWrap?.classList.toggle("hidden", !enabled || type !== "hero");
    if (dom.adminPopupRewardAmount) dom.adminPopupRewardAmount.closest("label")?.classList.toggle("hidden", enabled && type === "hero");
  }

  function updatePopupTargetFields() {
    const type = dom.adminPopupTargetType?.value || "all";
    dom.adminPopupTargetNew?.classList.toggle("hidden", type !== "new");
    dom.adminPopupTargetRank?.classList.toggle("hidden", type !== "rank");
    dom.adminPopupTargetInactive?.classList.toggle("hidden", type !== "inactive");
    dom.adminPopupTargetUsernames?.classList.toggle("hidden", type !== "usernames");
  }

  function readPopupReward() {
    if (!dom.adminPopupRewardEnabled?.checked) return [];
    const type = dom.adminPopupRewardType.value;
    const amount = Math.max(1, Number(dom.adminPopupRewardAmount.value || 1));
    if (type === "coins") return [{ type, amount }];
    if (type === "pack") return [{ type, packId: dom.adminPopupRewardPackId.value, amount }];
    if (type === "card") return [{ type, cardId: dom.adminPopupRewardCardId.value, amount }];
    return [{ type: "hero", heroId: dom.adminPopupRewardHeroId.value, amount: 1 }];
  }

  function readPopupTargeting() {
    const type = dom.adminPopupTargetType?.value || "all";
    if (type === "new") return { type, accountAgeDays: Number(dom.adminPopupTargetAgeDays.value || 7), maxMatches: Number(dom.adminPopupTargetMaxMatches.value || 5) };
    if (type === "rank") return { type, rankTier: Number(dom.adminPopupTargetRankTier.value || 0) };
    if (type === "inactive") return { type, inactiveDays: Number(dom.adminPopupTargetInactiveDays.value || 30) };
    if (type === "usernames") return { type, usernames: String(dom.adminPopupTargetUsernamesInput.value || "").split(/[\s,;]+/).filter(Boolean) };
    return { type };
  }

  function popupTargetLabel(targeting = {}) {
    const type = targeting.type || "all";
    if (type === "new") return `Nouveaux joueurs ≤ ${targeting.accountAgeDays || 7} j / ${targeting.maxMatches ?? 5} combats`;
    if (type === "rank") return `Rang ${POPUP_LEAGUES[Number(targeting.rankTier || 0)] || targeting.rankTier}`;
    if (type === "inactive") return `Inactifs depuis ${targeting.inactiveDays || 30} j`;
    if (type === "admins") return "Administrateurs";
    if (type === "usernames") return `${targeting.usernames?.length || 0} pseudo(s) ciblé(s)`;
    return "Tous les joueurs";
  }

  function popupRewardLabel(reward = []) {
    const item = Array.isArray(reward) ? reward[0] : null;
    if (!item) return "";
    if (item.type === "coins") return `${item.amount} pièces`;
    if (item.type === "pack") return `${item.amount} paquet(s) ${item.packId}`;
    if (item.type === "card") return `${item.amount} carte(s) ${item.cardId}`;
    if (item.type === "hero") return `Héros ${item.heroId}`;
    return "Récompense";
  }

  function toLocalDateTimeInput(value = Date.now()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 16);
  }

  function popupDurationMinutes() {
    if (dom.adminPopupDuration.value !== "custom") return Number(dom.adminPopupDuration.value || 1440);
    const amount = Math.max(1, Number(dom.adminPopupCustomDuration.value || 1));
    const unit = dom.adminPopupCustomUnit.value;
    const multiplier = unit === "weeks" ? 10080 : unit === "days" ? 1440 : 60;
    return Math.min(527040, amount * multiplier);
  }

  function popupStatus(popup) {
    const now = Date.now();
    if (!popup.enabled) return { key: "disabled", label: "Désactivée" };
    if (Number(popup.startsAt) > now) return { key: "scheduled", label: "Programmée" };
    if (Number(popup.expiresAt) <= now) return { key: "expired", label: "Expirée" };
    return { key: "active", label: "Active" };
  }

  function ensurePopupRepeaterEmptyStates() {
    const imageRows = dom.adminPopupImagesList?.querySelectorAll(".admin-popup-image-row").length || 0;
    const buttonRows = dom.adminPopupButtonsList?.querySelectorAll(".admin-popup-button-row").length || 0;
    dom.adminPopupImagesList?.querySelector(".admin-popup-repeater-empty")?.remove();
    dom.adminPopupButtonsList?.querySelector(".admin-popup-repeater-empty")?.remove();
    if (!imageRows && dom.adminPopupImagesList) {
      dom.adminPopupImagesList.insertAdjacentHTML("beforeend", '<div class="admin-popup-repeater-empty">Aucune image : la pop-up affichera uniquement le texte.</div>');
    }
    if (!buttonRows && dom.adminPopupButtonsList) {
      dom.adminPopupButtonsList.insertAdjacentHTML("beforeend", '<div class="admin-popup-repeater-empty">Aucun bouton : les joueurs pourront simplement fermer la pop-up.</div>');
    }
  }

  function addPopupImageField(value = "") {
    if (!dom.adminPopupImagesList) return;
    if (dom.adminPopupImagesList.querySelectorAll(".admin-popup-image-row").length >= 8) return toast("Maximum 8 images.", true);
    dom.adminPopupImagesList.querySelector(".admin-popup-repeater-empty")?.remove();
    const row = document.createElement("div");
    row.className = "admin-popup-repeater-row admin-popup-image-row";
    row.innerHTML = `
      <label><span>URL de l’image</span><input class="admin-popup-image-input" type="url" maxlength="2000" placeholder="https://…" value="${escapeHtml(value)}" /></label>
      <button class="admin-btn admin-btn-danger admin-popup-remove-btn" type="button">Retirer</button>`;
    row.querySelector("button")?.addEventListener("click", () => { row.remove(); ensurePopupRepeaterEmptyStates(); renderPopupPreview(); });
    row.querySelector("input")?.addEventListener("input", renderPopupPreview);
    dom.adminPopupImagesList.appendChild(row);
    renderPopupPreview();
  }

  function addPopupButtonField(button = {}) {
    if (!dom.adminPopupButtonsList) return;
    if (dom.adminPopupButtonsList.querySelectorAll(".admin-popup-button-row").length >= 4) return toast("Maximum 4 boutons.", true);
    dom.adminPopupButtonsList.querySelector(".admin-popup-repeater-empty")?.remove();
    const row = document.createElement("div");
    row.className = "admin-popup-repeater-row admin-popup-button-row";
    row.innerHTML = `
      <label><span>Texte</span><input class="admin-popup-button-label" type="text" maxlength="60" placeholder="En savoir plus" value="${escapeHtml(button.label || "")}" /></label>
      <label><span>Lien</span><input class="admin-popup-button-url" type="url" maxlength="2000" placeholder="https://…" value="${escapeHtml(button.url || "")}" /></label>
      <label><span>Style</span><select class="admin-popup-button-style"><option value="primary">Principal</option><option value="secondary">Secondaire</option><option value="danger">Attention</option></select></label>
      <button class="admin-btn admin-btn-danger admin-popup-remove-btn" type="button">Retirer</button>`;
    row.querySelector(".admin-popup-button-style").value = ["primary", "secondary", "danger"].includes(button.style) ? button.style : "primary";
    row.querySelector("button")?.addEventListener("click", () => { row.remove(); ensurePopupRepeaterEmptyStates(); renderPopupPreview(); });
    row.querySelectorAll("input, select").forEach(element => element.addEventListener("input", renderPopupPreview));
    dom.adminPopupButtonsList.appendChild(row);
    renderPopupPreview();
  }

  function readPopupImages() {
    return Array.from(dom.adminPopupImagesList?.querySelectorAll(".admin-popup-image-input") || [])
      .map(input => input.value.trim()).filter(Boolean).slice(0, 8);
  }

  function readPopupButtons() {
    return Array.from(dom.adminPopupButtonsList?.querySelectorAll(".admin-popup-button-row") || [])
      .map(row => ({
        label: row.querySelector(".admin-popup-button-label")?.value.trim() || "",
        url: row.querySelector(".admin-popup-button-url")?.value.trim() || "",
        style: row.querySelector(".admin-popup-button-style")?.value || "primary"
      }))
      .filter(button => button.label && button.url).slice(0, 4);
  }

  function readPopupForm() {
    const startsAt = new Date(dom.adminPopupStartsAt.value || Date.now());
    const expiresAt = new Date(startsAt.getTime() + popupDurationMinutes() * 60000);
    return {
      title: dom.adminPopupTitle.value.trim(),
      description: dom.adminPopupDescription.value.trim(),
      footer: dom.adminPopupFooter.value.trim(),
      images: readPopupImages(),
      buttons: readPopupButtons(),
      reward: readPopupReward(),
      targeting: readPopupTargeting(),
      enabled: dom.adminPopupEnabled.checked,
      startsAt: startsAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  }

  function renderPopupPreview() {
    if (!dom.adminPopupPreview) return;
    let popup;
    try { popup = readPopupForm(); }
    catch (_) { popup = { title: "Titre de votre annonce", description: "La description apparaîtra ici.", footer: "", images: [], buttons: [] }; }
    const image = popup.images[0];
    dom.adminPopupPreview.innerHTML = `
      <article class="admin-popup-preview-card">
        <div class="admin-popup-preview-image">${image ? `<img src="${escapeHtml(image)}" alt="Aperçu de l’image" />` : "Aucune image"}</div>
        <div class="admin-popup-preview-copy">
          <h3>${escapeHtml(popup.title || "Titre de votre annonce")}</h3>
          <p>${escapeHtml(popup.description || "La description apparaîtra ici.")}</p>
          ${(popup.buttons.length || popup.reward?.length) ? `<div class="admin-popup-preview-buttons">${popup.buttons.map(button => `<span class="${escapeHtml(button.style)}">${escapeHtml(button.label)}</span>`).join("")}${popup.reward?.length ? `<span class="primary">Récupérer · ${escapeHtml(popupRewardLabel(popup.reward))}</span>` : ""}</div>` : ""}
          <small>${escapeHtml(popupTargetLabel(popup.targeting))}</small>
        </div>
        ${popup.footer ? `<footer class="admin-popup-preview-footer">${escapeHtml(popup.footer)}</footer>` : ""}
      </article>`;
  }

  function resetPopupForm() {
    state.editingPopupId = null;
    dom.adminPopupForm?.reset();
    dom.adminPopupId.value = "";
    dom.adminPopupFormTitle.textContent = "Créer une pop-up";
    dom.adminPopupSubmitBtn.textContent = "Publier dans le jeu";
    dom.adminPopupCancelBtn.classList.add("hidden");
    dom.adminPopupStartsAt.value = toLocalDateTimeInput(Date.now());
    dom.adminPopupDuration.value = "1440";
    dom.adminPopupCustomDurationWrap.classList.add("hidden");
    dom.adminPopupEnabled.checked = true;
    dom.adminPopupRewardEnabled.checked = false;
    dom.adminPopupRewardType.value = "coins";
    dom.adminPopupRewardAmount.value = "100";
    dom.adminPopupTargetType.value = "all";
    dom.adminPopupTargetAgeDays.value = "7";
    dom.adminPopupTargetMaxMatches.value = "5";
    dom.adminPopupTargetRankTier.value = "0";
    dom.adminPopupTargetInactiveDays.value = "30";
    dom.adminPopupTargetUsernamesInput.value = "";
    updatePopupRewardFields();
    updatePopupTargetFields();
    dom.adminPopupImagesList.innerHTML = "";
    dom.adminPopupButtonsList.innerHTML = "";
    ensurePopupRepeaterEmptyStates();
    renderPopupPreview();
  }

  function editPopup(popupId) {
    const popup = state.popups.find(item => item.id === String(popupId));
    if (!popup) return;
    state.editingPopupId = popup.id;
    dom.adminPopupId.value = popup.id;
    dom.adminPopupTitle.value = popup.title || "";
    dom.adminPopupDescription.value = popup.description || "";
    dom.adminPopupFooter.value = popup.footer || "";
    dom.adminPopupStartsAt.value = toLocalDateTimeInput(popup.startsAt);
    const minutes = Math.max(1, Math.round((Number(popup.expiresAt) - Number(popup.startsAt)) / 60000));
    const knownDurations = [60, 1440, 4320, 10080, 20160, 43200];
    if (knownDurations.includes(minutes)) {
      dom.adminPopupDuration.value = String(minutes);
      dom.adminPopupCustomDurationWrap.classList.add("hidden");
    } else {
      dom.adminPopupDuration.value = "custom";
      dom.adminPopupCustomDurationWrap.classList.remove("hidden");
      if (minutes % 10080 === 0) { dom.adminPopupCustomDuration.value = minutes / 10080; dom.adminPopupCustomUnit.value = "weeks"; }
      else if (minutes % 1440 === 0) { dom.adminPopupCustomDuration.value = minutes / 1440; dom.adminPopupCustomUnit.value = "days"; }
      else { dom.adminPopupCustomDuration.value = Math.max(1, Math.round(minutes / 60)); dom.adminPopupCustomUnit.value = "hours"; }
    }
    dom.adminPopupEnabled.checked = popup.enabled !== false;
    const reward = Array.isArray(popup.reward) ? popup.reward[0] : null;
    dom.adminPopupRewardEnabled.checked = Boolean(reward);
    dom.adminPopupRewardType.value = reward?.type || "coins";
    dom.adminPopupRewardAmount.value = String(reward?.amount || 100);
    if (reward?.packId) dom.adminPopupRewardPackId.value = reward.packId;
    if (reward?.cardId) dom.adminPopupRewardCardId.value = reward.cardId;
    if (reward?.heroId) dom.adminPopupRewardHeroId.value = reward.heroId;
    const targeting = popup.targeting || { type: "all" };
    dom.adminPopupTargetType.value = targeting.type || "all";
    dom.adminPopupTargetAgeDays.value = String(targeting.accountAgeDays || 7);
    dom.adminPopupTargetMaxMatches.value = String(targeting.maxMatches ?? 5);
    dom.adminPopupTargetRankTier.value = String(targeting.rankTier || 0);
    dom.adminPopupTargetInactiveDays.value = String(targeting.inactiveDays || 30);
    dom.adminPopupTargetUsernamesInput.value = (targeting.usernames || []).join("\n");
    updatePopupRewardFields();
    updatePopupTargetFields();
    dom.adminPopupImagesList.innerHTML = "";
    dom.adminPopupButtonsList.innerHTML = "";
    (popup.images || []).forEach(addPopupImageField);
    (popup.buttons || []).forEach(addPopupButtonField);
    ensurePopupRepeaterEmptyStates();
    dom.adminPopupFormTitle.textContent = "Modifier la pop-up";
    dom.adminPopupSubmitBtn.textContent = "Enregistrer les modifications";
    dom.adminPopupCancelBtn.classList.remove("hidden");
    renderPopupPreview();
    dom.adminPopupForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadPopups() {
    if (!state.token || !dom.adminPopupList) return;
    try {
      const data = await apiFetch("/api/admin/popups");
      state.popups = data.popups || [];
      renderPopupList();
      if (!dom.adminPopupStartsAt.value) resetPopupForm();
    } catch (error) { toast(error.message, true); }
  }

  function renderPopupList() {
    if (!dom.adminPopupList) return;
    if (!state.popups.length) {
      dom.adminPopupList.innerHTML = '<div class="admin-empty-state compact"><p>Aucune pop-up créée pour le moment.</p></div>';
      return;
    }
    dom.adminPopupList.innerHTML = state.popups.map(popup => {
      const status = popupStatus(popup);
      const description = String(popup.description || "").slice(0, 180);
      return `<article class="admin-popup-list-item">
        <div class="admin-popup-list-main">
          <div class="admin-popup-list-title-row"><strong>${escapeHtml(popup.title)}</strong><span class="admin-popup-status ${status.key}">${status.label}</span></div>
          <p>${escapeHtml(description || "Annonce composée uniquement d’images.")}${String(popup.description || "").length > 180 ? "…" : ""}</p>
          <div class="admin-popup-list-meta">
            <span>Début : ${escapeHtml(formatDate(popup.startsAt))}</span>
            <span>Fin : ${escapeHtml(formatDate(popup.expiresAt))}</span>
            <span>${popup.images?.length || 0} image(s)</span>
            <span>${popup.buttons?.length || 0} bouton(s)</span>
            <span>${escapeHtml(popupTargetLabel(popup.targeting))}</span>
            ${popup.reward?.length ? `<span>🎁 ${escapeHtml(popupRewardLabel(popup.reward))}</span>` : ""}
          </div>
        </div>
        <div class="admin-popup-list-actions">
          <button class="admin-btn admin-btn-secondary" data-popup-edit="${escapeHtml(popup.id)}" type="button">Modifier</button>
          <button class="admin-btn ${popup.enabled ? "admin-btn-warning" : "admin-btn-success"}" data-popup-toggle="${escapeHtml(popup.id)}" type="button">${popup.enabled ? "Désactiver" : "Activer"}</button>
          <button class="admin-btn admin-btn-danger" data-popup-delete="${escapeHtml(popup.id)}" type="button">Supprimer</button>
        </div>
      </article>`;
    }).join("");
    dom.adminPopupList.querySelectorAll("[data-popup-edit]").forEach(button => button.addEventListener("click", () => editPopup(button.dataset.popupEdit)));
    dom.adminPopupList.querySelectorAll("[data-popup-toggle]").forEach(button => button.addEventListener("click", () => togglePopup(button.dataset.popupToggle)));
    dom.adminPopupList.querySelectorAll("[data-popup-delete]").forEach(button => button.addEventListener("click", () => deletePopup(button.dataset.popupDelete)));
  }

  async function savePopup(event) {
    event.preventDefault();
    let body;
    try { body = readPopupForm(); }
    catch (_) { return toast("Vérifiez la date et la durée de la publication.", true); }
    if (!body.title) return toast("Le titre est obligatoire.", true);
    if (!body.description && !body.images.length) return toast("Ajoutez une description ou au moins une image.", true);
    const editingId = state.editingPopupId;
    dom.adminPopupSubmitBtn.disabled = true;
    try {
      await apiFetch(editingId ? `/api/admin/popups/${editingId}` : "/api/admin/popups", {
        method: editingId ? "PUT" : "POST",
        body
      });
      toast(editingId ? "Pop-up mise à jour dans le jeu." : "Pop-up publiée dans le jeu.");
      resetPopupForm();
      await loadPopups();
    } catch (error) { toast(error.message, true); }
    finally { dom.adminPopupSubmitBtn.disabled = false; }
  }

  async function togglePopup(popupId) {
    const popup = state.popups.find(item => item.id === String(popupId));
    if (!popup) return;
    try {
      await apiFetch(`/api/admin/popups/${popup.id}`, {
        method: "PUT",
        body: {
          title: popup.title, description: popup.description, footer: popup.footer,
          images: popup.images || [], buttons: popup.buttons || [], reward: popup.reward || [], targeting: popup.targeting || { type: "all" }, enabled: !popup.enabled,
          startsAt: new Date(popup.startsAt).toISOString(), expiresAt: new Date(popup.expiresAt).toISOString()
        }
      });
      toast(popup.enabled ? "Pop-up désactivée." : "Pop-up activée.");
      await loadPopups();
    } catch (error) { toast(error.message, true); }
  }

  async function deletePopup(popupId) {
    const popup = state.popups.find(item => item.id === String(popupId));
    if (!popup || !window.confirm(`Supprimer définitivement la pop-up « ${popup.title} » ?`)) return;
    try {
      await apiFetch(`/api/admin/popups/${popup.id}`, { method: "DELETE" });
      if (state.editingPopupId === popup.id) resetPopupForm();
      toast("Pop-up supprimée.");
      await loadPopups();
    } catch (error) { toast(error.message, true); }
  }

  function populateCardCatalog() {
    let cards = [];
    try {
      if (typeof CARDS !== "undefined" && Array.isArray(CARDS)) cards = CARDS.filter(card => card?.id && card.collectible !== false);
    } catch (_) { cards = []; }
    cards.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "fr"));
    const cardOptions = cards.length
      ? cards.map(card => `<option value="${escapeHtml(card.id)}">${escapeHtml(card.name || card.id)} · ${escapeHtml(card.id)}</option>`).join("")
      : `<option value="">Catalogue indisponible</option>`;
    dom.adminCardId.innerHTML = cardOptions;
    if (dom.adminPopupRewardCardId) dom.adminPopupRewardCardId.innerHTML = cardOptions;
    const heroes = [
      ["reine_celeste", "Reine céleste"], ["pretresse_lunaire", "Prêtresse lunaire"], ["roi_solaire", "Roi solaire"],
      ["sorceleur_du_vide", "Sorceleur du vide"], ["architecte_marees", "Architecte des Marées"], ["chasseur_etoiles", "Chasseur d’Étoiles"],
      ["grikz_bricoleur", "Grikz le Bricoleur"], ["thorga_appel_esprits", "Thorga l’Appel-esprits"], ["nyx_oeil_voile", "Nyx l’Œil voilé"],
      ["kael_brisefer", "Kael Brisefer"], ["xalgor_devoreur", "Xal’gor le Dévoreur"], ["ax7_oracle", "AX-7, Oracle mécanique"]
    ];
    const heroOptions = heroes.map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join("");
    if (dom.adminPopupRewardHeroId) dom.adminPopupRewardHeroId.innerHTML = heroOptions;
    if (dom.adminPopupTargetRankTier) dom.adminPopupTargetRankTier.innerHTML = POPUP_LEAGUES.map((rank, index) => `<option value="${index}">${escapeHtml(rank)}</option>`).join("");
  }

  function showGlobalMessage(message) {
    dom.adminGlobalMessage.textContent = message;
    dom.adminGlobalMessage.classList.remove("hidden");
  }

  function toast(message, isError = false) {
    const element = document.createElement("div");
    element.className = `admin-toast${isError ? " error" : ""}`;
    element.textContent = message;
    dom.adminToastContainer.appendChild(element);
    window.setTimeout(() => element.remove(), 5200);
  }
})();
