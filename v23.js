/* Chroniques d'Astréa V23 — notifications de quêtes et musiques personnalisées */
(() => {
  const QUEST_TYPE_LABELS = {
    daily: "Quête quotidienne terminée",
    monthly: "Quête mensuelle terminée",
    seasonal: "Quête saisonnière terminée",
    battle: "Quête de combat terminée"
  };

  const originalUpdateDailyQuestProgress = updateDailyQuestProgress;
  const originalCompleteAdventureEncounter = completeAdventureEncounter;
  const originalShowGameOver = showGameOver;
  const originalUpdateQuestProgress = updateQuestProgress;

  let menuMusic = null;
  let combatMusic = null;
  let audioUnlocked = false;
  let activeMusicKey = null;
  let audioStatusTimer = null;
  const audioStates = {
    menu: { index: 0, ready: false, exhausted: false },
    combat: { index: 0, ready: false, exhausted: false }
  };

  updateDailyQuestProgress = function(event, amount = 1) {
    const before = captureQuestCompletionState();
    const result = originalUpdateDailyQuestProgress(event, amount);
    notifyNewlyCompletedQuests(before);
    return result;
  };

  completeAdventureEncounter = function(encounterId) {
    const before = captureQuestCompletionState();
    const result = originalCompleteAdventureEncounter(encounterId);
    notifyNewlyCompletedQuests(before);
    return result;
  };

  showGameOver = function(title, text) {
    const before = captureQuestCompletionState();
    const result = originalShowGameOver(title, text);
    notifyNewlyCompletedQuests(before);
    return result;
  };

  updateQuestProgress = function(ownerId, event, amount = 1) {
    const before = (gameState?.[ownerId]?.quests || []).map(instance => ({
      instanceId: instance.instanceId,
      card: CARD_BY_ID[instance.cardId]
    }));
    const result = originalUpdateQuestProgress(ownerId, event, amount);
    if (ownerId === "player" && before.length) {
      const remainingIds = new Set((gameState?.[ownerId]?.quests || []).map(instance => instance.instanceId));
      before
        .filter(entry => !remainingIds.has(entry.instanceId) && entry.card?.quest)
        .forEach(entry => showBattleQuestCompletionNotification(entry.card));
    }
    return result;
  };

  document.addEventListener("DOMContentLoaded", () => {
    migrateV23Progress();
    initializeQuestNotifications();
    initializeMusicEngine();
  });

  function getQuestGroups() {
    return [
      { type: "daily", quests: progress?.dailyQuests?.quests || [] },
      { type: "monthly", quests: progress?.monthlyQuests?.quests || [] },
      { type: "seasonal", quests: progress?.seasonalQuests?.quests || [] }
    ];
  }

  function questKey(type, quest, index) {
    return `${type}:${quest?.id || index}`;
  }

  function captureQuestCompletionState() {
    const state = new Map();
    getQuestGroups().forEach(group => {
      group.quests.forEach((quest, index) => {
        state.set(questKey(group.type, quest, index), Number(quest.progress || 0) >= Number(quest.goal || 0));
      });
    });
    return state;
  }

  function migrateV23Progress() {
    if (!progress) return;
    const isFirstV23Load = Number(progress.version || 0) < 23;
    if (isFirstV23Load) {
      getQuestGroups().forEach(group => {
        group.quests.forEach(quest => {
          if (Number(quest.progress || 0) >= Number(quest.goal || 0)) quest.completionNotified = true;
        });
      });
    }
    progress.version = 23;
    saveProgress();
  }

  function initializeQuestNotifications() {
    if (!document.getElementById("quest-notification-stack")) {
      const stack = document.createElement("div");
      stack.id = "quest-notification-stack";
      stack.className = "quest-notification-stack";
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
  }

  function notifyNewlyCompletedQuests(beforeState) {
    if (!progress) return;
    const notifications = [];

    getQuestGroups().forEach(group => {
      group.quests.forEach((quest, index) => {
        const key = questKey(group.type, quest, index);
        const wasComplete = beforeState?.get(key) || false;
        const isComplete = Number(quest.progress || 0) >= Number(quest.goal || 0);
        if (!wasComplete && isComplete && !quest.completionNotified) {
          quest.completionNotified = true;
          notifications.push({ quest, type: group.type });
        }
      });
    });

    if (!notifications.length) return;
    saveProgress();
    notifications.forEach((item, index) => {
      window.setTimeout(() => showQuestCompletionNotification(item.quest, item.type), index * 260);
    });
  }

  function showQuestCompletionNotification(quest, type) {
    const stack = document.getElementById("quest-notification-stack");
    if (!stack) return;

    while (stack.children.length >= 4) stack.firstElementChild?.remove();

    const notification = document.createElement("article");
    notification.className = "quest-complete-notification";
    notification.innerHTML = `
      <div class="quest-notification-icon">${escapeHtml(quest.icon || "!")}</div>
      <div class="quest-notification-copy">
        <span class="quest-notification-kicker">${escapeHtml(QUEST_TYPE_LABELS[type] || "Quête terminée")}</span>
        <strong>${escapeHtml(quest.title || "Quête accomplie")}</strong>
        <span>La récompense est prête à être récupérée dans le menu Quêtes.</span>
        <span class="quest-notification-reward">${escapeHtml(getQuestRewardTitle(quest.reward))}</span>
      </div>
      <span class="quest-notification-progress"></span>`;

    stack.appendChild(notification);
    window.setTimeout(() => notification.classList.add("leaving"), 4700);
    window.setTimeout(() => notification.remove(), 5150);
  }

  function showBattleQuestCompletionNotification(card) {
    const stack = document.getElementById("quest-notification-stack");
    if (!stack || !card) return;
    while (stack.children.length >= 4) stack.firstElementChild?.remove();
    const notification = document.createElement("article");
    notification.className = "quest-complete-notification";
    notification.innerHTML = `
      <div class="quest-notification-icon">!</div>
      <div class="quest-notification-copy">
        <span class="quest-notification-kicker">${escapeHtml(QUEST_TYPE_LABELS.battle)}</span>
        <strong>${escapeHtml(card.name)}</strong>
        <span>La récompense de la quête vient d’être activée sur le plateau.</span>
        <span class="quest-notification-reward">Effet de quête déclenché</span>
      </div>
      <span class="quest-notification-progress"></span>`;
    stack.appendChild(notification);
    window.setTimeout(() => notification.classList.add("leaving"), 4700);
    window.setTimeout(() => notification.remove(), 5150);
  }

  function initializeMusicEngine() {
    menuMusic = document.getElementById("menu-music");
    combatMusic = document.getElementById("combat-music");
    if (!menuMusic || !combatMusic) return;

    menuMusic.dataset.musicKey = "menu";
    combatMusic.dataset.musicKey = "combat";
    menuMusic.loop = true;
    combatMusic.loop = true;

    configureAudioTrack("menu", menuMusic);
    configureAudioTrack("combat", combatMusic);
    applyMusicSettings();

    const unlock = () => {
      audioUnlocked = true;
      syncMusicWithScreen(true);
    };
    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    document.addEventListener("keydown", unlock, { once: true, capture: true });

    document.getElementById("volume-slider")?.addEventListener("input", () => {
      window.setTimeout(() => {
        applyMusicSettings();
        syncMusicWithScreen(false);
      }, 0);
    });
    document.getElementById("toggle-music-btn")?.addEventListener("click", () => {
      window.setTimeout(() => {
        applyMusicSettings();
        syncMusicWithScreen(true);
      }, 0);
    });

    const observer = new MutationObserver(() => {
      window.clearTimeout(audioStatusTimer);
      audioStatusTimer = window.setTimeout(() => syncMusicWithScreen(false), 20);
    });
    document.querySelectorAll(".screen").forEach(screen => observer.observe(screen, { attributes: true, attributeFilter: ["class"] }));

    window.addEventListener("focus", () => syncMusicWithScreen(false));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseAllMusic();
      else syncMusicWithScreen(false);
    });

    syncMusicWithScreen(false);
  }

  function getAudioCandidates(key) {
    const configured = window.ASTREA_AUDIO_CONFIG?.[key];
    if (Array.isArray(configured) && configured.length) return configured;
    if (typeof configured === "string" && configured.trim()) return [configured.trim()];
    return key === "menu"
      ? ["audio/menu.mp3", "audio/menu.ogg", "audio/menu.wav"]
      : ["audio/combat.mp3", "audio/combat.ogg", "audio/combat.wav"];
  }

  function configureAudioTrack(key, audio) {
    const state = audioStates[key];
    const candidates = getAudioCandidates(key);

    const loadCandidate = () => {
      if (state.index >= candidates.length) {
        state.exhausted = true;
        state.ready = false;
        updateMusicStatus();
        return;
      }
      state.ready = false;
      state.exhausted = false;
      audio.src = candidates[state.index];
      audio.load();
    };

    audio.addEventListener("canplay", () => {
      state.ready = true;
      state.exhausted = false;
      updateMusicStatus();
      if (activeMusicKey === key && audioUnlocked) safelyPlay(audio);
    });

    audio.addEventListener("error", () => {
      state.index += 1;
      loadCandidate();
    });

    loadCandidate();
  }

  function applyMusicSettings() {
    if (!menuMusic || !combatMusic) return;
    const volume = Math.max(0, Math.min(1, Number(progress?.settings?.volume ?? 70) / 100));
    const muted = Boolean(progress?.settings?.musicMuted);
    [menuMusic, combatMusic].forEach(audio => {
      audio.volume = volume;
      audio.muted = muted;
    });
    if (muted || volume <= 0) pauseAllMusic();
    updateMusicStatus();
  }

  function getDesiredMusicKey() {
    const gameVisible = dom.gameScreen && !dom.gameScreen.classList.contains("hidden");
    const settingsVisible = dom.settingsScreen && !dom.settingsScreen.classList.contains("hidden");
    const settingsDuringBattle = settingsVisible && gameState?.status === "playing";
    return gameVisible || settingsDuringBattle ? "combat" : "menu";
  }

  function syncMusicWithScreen(restartOnChange = false) {
    if (!menuMusic || !combatMusic) return;
    applyMusicSettings();

    if (progress?.settings?.musicMuted || Number(progress?.settings?.volume ?? 70) <= 0 || document.hidden) {
      pauseAllMusic();
      return;
    }

    const desiredKey = getDesiredMusicKey();
    const desiredAudio = desiredKey === "combat" ? combatMusic : menuMusic;
    const otherAudio = desiredKey === "combat" ? menuMusic : combatMusic;
    const changed = activeMusicKey !== desiredKey;

    if (changed) {
      otherAudio.pause();
      if (restartOnChange || desiredAudio.ended || !Number.isFinite(desiredAudio.currentTime)) {
        try { desiredAudio.currentTime = 0; } catch (_) {}
      }
      activeMusicKey = desiredKey;
    }

    if (audioUnlocked) safelyPlay(desiredAudio);
    updateMusicStatus();
  }

  function safelyPlay(audio) {
    if (!audio || audioStates[audio.dataset.musicKey]?.exhausted) return;
    const promise = audio.play();
    if (promise?.catch) promise.catch(() => {});
  }

  function pauseAllMusic() {
    menuMusic?.pause();
    combatMusic?.pause();
    updateMusicStatus();
  }

  function updateMusicStatus() {
    const status = document.getElementById("settings-audio-status");
    if (!status || !progress) return;

    const muted = Boolean(progress.settings?.musicMuted);
    const volume = Number(progress.settings?.volume ?? 70);
    if (muted || volume <= 0) {
      status.textContent = "Musique coupée";
      return;
    }

    const menuMissing = audioStates.menu.exhausted;
    const combatMissing = audioStates.combat.exhausted;
    if (menuMissing && combatMissing) {
      status.textContent = "Ajoutez menu.mp3 et combat.mp3 dans audio";
      return;
    }

    const currentLabel = getDesiredMusicKey() === "combat" ? "Combat" : "Accueil";
    status.textContent = `${currentLabel} · Volume ${volume} %`;
  }
})();
