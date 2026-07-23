/*
  Chroniques d’Astera — fichier des versions fusionnées
  Généré automatiquement à partir de v22.js à v36.js.
  Ordre d’exécution conservé : v22, v23, v24, v25, v26, v27, v28,
  v29, v30, v31, v32, v33, v34, v36.
*/

/* ==========================================================================
   DÉBUT DE LA VERSION V22
   ========================================================================== */
/* Chroniques d'Astréa V22 — Difficulté, récompenses, quêtes, paramètres et League */
(() => {
  const V22_MONTHLY_TEMPLATES = [
    { id:"monthly_wins", icon:"♛", title:"Conquérante du mois", description:"Gagnez 12 combats.", event:"winMatch", goal:12, reward:{type:"pack",packId:"zenith",amount:3} },
    { id:"monthly_cards", icon:"✦", title:"Marathon astral", description:"Jouez 180 cartes.", event:"playCard", goal:180, reward:{type:"coins",amount:900} },
    { id:"monthly_spells", icon:"☄", title:"Archives magiques", description:"Lancez 60 sorts.", event:"spellPlayed", goal:60, reward:{type:"randomCard",rarity:"epic",amount:2} },
    { id:"monthly_mana", icon:"⬢", title:"Océan de mana", description:"Dépensez 500 cristaux de mana.", event:"spendMana", goal:500, reward:{type:"pack",packId:"astral",amount:4} }
  ];
  const V22_SEASONAL_TEMPLATES = [
    { id:"season_wins", icon:"🏆", title:"Championne de la saison", description:"Gagnez 35 combats pendant la saison.", event:"winMatch", goal:35, reward:{type:"randomCard",rarity:"legendary",amount:1} },
    { id:"season_adventure", icon:"⌁", title:"Exploratrice d’Astréa", description:"Remportez 20 combats d’aventure.", event:"adventureWin", goal:20, reward:{type:"pack",packId:"quetes",amount:6} },
    { id:"season_league", icon:"♛", title:"Ascension League", description:"Gagnez 15 combats League.", event:"leagueWin", goal:15, reward:{type:"coins",amount:2200} },
    { id:"season_collection", icon:"◈", title:"Trésor du firmament", description:"Ouvrez 25 paquets.", event:"openPack", goal:25, reward:{type:"randomCard",rarity:"epic",amount:3} }
  ];
  const LEAGUES = ["Bronze III","Bronze II","Bronze I","Argent III","Argent II","Argent I","Or III","Or II","Or I","Platine III","Platine II","Platine I","Diamant III","Diamant II","Diamant I","Maître"];
  let questTab = "daily";
  let adventureDifficulty = "normal";
  let settingsReturnTarget = "menu";
  let rewardQueue = [];
  let leagueProcessing = false;

  const original = {};
  const remember = name => { original[name] = eval(name); };
  ["renderMenuSummary","showMainMenu","openAdventure","renderAdventure","startAdventureBattle","startBattle","completeAdventureEncounter","renderQuests","updateDailyQuestProgress","claimDailyQuest","revealPackRewards","showGameOver","saveProgress"].forEach(name => {
    try { remember(name); } catch (_) {}
  });

  document.addEventListener("DOMContentLoaded", () => {
    migrateV22Progress();
    cacheV22Dom();
    bindV22Events();
    applyAudioSettings();
    renderV22Menu();
  });

  function cacheV22Dom(){
    const ids=["open-settings-btn","open-settings-game-btn","settings-screen","settings-back-btn","volume-slider","volume-value","toggle-music-btn","settings-audio-status","concede-btn","open-league-btn","league-screen","league-back-btn","start-league-btn","league-rank-label","league-stars-label","league-title","league-star-track","league-description","league-record-label","league-ladder","reward-showcase-modal","reward-showcase-title","reward-showcase-visual","reward-showcase-text","reward-showcase-close-btn","adventure-difficulty-description"];
    ids.forEach(id=>dom[toCamel(id)]=document.getElementById(id));
    dom.questTabs=[...document.querySelectorAll("[data-quest-tab]")];
    dom.difficultyButtons=[...document.querySelectorAll("[data-adventure-difficulty]")];
  }

  function migrateV22Progress(){
    if(!progress) return;
    progress.settings={ volume:70, musicMuted:false, ...(progress.settings||{}) };
    progress.monthlyQuests=normalizeQuestSet(progress.monthlyQuests,getMonthKey(),generateQuestSet(V22_MONTHLY_TEMPLATES,getMonthKey(),3));
    progress.seasonalQuests=normalizeQuestSet(progress.seasonalQuests,getSeasonKey(),generateQuestSet(V22_SEASONAL_TEMPLATES,getSeasonKey(),4));
    progress.adventureHard=progress.adventureHard||{completed:[],claimed:[],stars:{}};
    progress.league={tier:0,stars:0,wins:0,losses:0,...(progress.league||{})};
    progress.version=22;
    original.saveProgress?.();
  }

  function normalizeQuestSet(current,key,fallback){
    if(!current||current.key!==key||!Array.isArray(current.quests)) return fallback;
    return {key,quests:current.quests.map(q=>({...q,progress:Number(q.progress||0),claimed:Boolean(q.claimed)}))};
  }
  function generateQuestSet(templates,key,count){
    return {key,quests:shuffle(templates.map(q=>({...q,reward:{...q.reward}}))).slice(0,count).map(q=>({...q,progress:0,claimed:false}))};
  }
  function getMonthKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
  function getSeasonKey(){const d=new Date();return `${d.getFullYear()}-S${Math.floor(d.getMonth()/3)+1}`;}

  function bindV22Events(){
    dom.openSettingsBtn?.addEventListener("click",()=>openSettings("menu"));
    dom.openSettingsGameBtn?.addEventListener("click",()=>openSettings("game"));
    dom.settingsBackBtn?.addEventListener("click",closeSettings);
    dom.volumeSlider?.addEventListener("input",e=>{progress.settings.volume=Number(e.target.value);saveAndApplyAudio();});
    dom.toggleMusicBtn?.addEventListener("click",()=>{progress.settings.musicMuted=!progress.settings.musicMuted;saveAndApplyAudio();});
    dom.concedeBtn?.addEventListener("click",concedeCurrentBattle);
    dom.openLeagueBtn?.addEventListener("click",openLeague);
    dom.leagueBackBtn?.addEventListener("click",showMainMenu);
    dom.startLeagueBtn?.addEventListener("click",startLeagueBattle);
    dom.rewardShowcaseCloseBtn?.addEventListener("click",closeRewardShowcase);
    dom.questTabs?.forEach(btn=>btn.addEventListener("click",()=>{questTab=btn.dataset.questTab;renderQuests();}));
    dom.difficultyButtons?.forEach(btn=>btn.addEventListener("click",()=>{adventureDifficulty=btn.dataset.adventureDifficulty;renderAdventure();}));
  }

  function hideAllScreens(){[dom.startScreen,dom.collectionScreen,dom.shopScreen,dom.questsScreen,dom.adventureScreen,dom.gameScreen,dom.settingsScreen,dom.leagueScreen].forEach(el=>el?.classList.add("hidden"));}

  function openSettings(origin){settingsReturnTarget=origin;hideAllScreens();dom.settingsScreen.classList.remove("hidden");renderSettings();}
  function closeSettings(){if(settingsReturnTarget==="game"&&gameState?.status==="playing"){hideAllScreens();dom.gameScreen.classList.remove("hidden");renderGame();}else showMainMenu();}
  function renderSettings(){
    const s=progress.settings;dom.volumeSlider.value=s.volume;dom.volumeValue.textContent=`${s.volume} %`;dom.toggleMusicBtn.textContent=s.musicMuted?"Réactiver la musique":"Couper la musique";dom.settingsAudioStatus.textContent=s.musicMuted?"Musique coupée":`Volume ${s.volume} %`;dom.concedeBtn.disabled=!(gameState?.status==="playing");
  }
  function saveAndApplyAudio(){original.saveProgress?.();applyAudioSettings();renderSettings();}
  function applyAudioSettings(){const volume=(progress?.settings?.volume??70)/100;document.querySelectorAll("audio,video").forEach(el=>{el.volume=volume;el.muted=Boolean(progress?.settings?.musicMuted);});document.documentElement.style.setProperty("--game-volume",String(volume));}
  function concedeCurrentBattle(){if(!gameState||gameState.status!=="playing")return;if(!confirm("Voulez-vous vraiment capituler ?"))return;closeSettings();gameState.player.hero.currentHealth=0;addLog("Vous capitulez.");checkGameOver();}

  function openLeague(){hideAllScreens();dom.leagueScreen.classList.remove("hidden");renderLeague();}
  function renderLeague(){
    const l=progress.league;const tier=Math.max(0,Math.min(LEAGUES.length-1,l.tier));const name=LEAGUES[tier];
    dom.leagueRankLabel.textContent=name;dom.leagueStarsLabel.textContent=`${l.stars} / 3 ★`;dom.leagueTitle.textContent=name;dom.leagueRecordLabel.textContent=`${l.wins} V · ${l.losses} D`;
    dom.leagueStarTrack.innerHTML=[0,1,2].map(i=>`<span class="league-star ${i<l.stars?"earned":""}">★</span>`).join("");
    dom.leagueDescription.textContent=tier===LEAGUES.length-1?"Vous avez atteint le rang Maître. Continuez à défendre votre position.":"Une victoire rapporte une étoile. Une défaite en retire une et peut vous faire redescendre.";
    dom.leagueLadder.innerHTML=LEAGUES.map((rank,i)=>`<div class="league-ladder-row ${i===tier?"current":""} ${i<tier?"passed":""}"><span>${i+1}</span><strong>${rank}</strong><b>${i<tier?"✓":i===tier?`${l.stars}/3 ★`:"🔒"}</b></div>`).join("");
  }
  function startLeagueBattle(){
    original.startBattle({mode:"league"});
    if(!gameState)return;gameState.mode="league";gameState.leagueResolved=false;
    const tier=progress.league.tier;gameState.ai.hero.maxHealth+=Math.floor(tier/3)*2;gameState.ai.hero.currentHealth=gameState.ai.hero.maxHealth;gameState.ai.hero.armor+=Math.floor(tier/2);addLog(`Combat League — ${LEAGUES[tier]}.`);renderGame();
  }
  function resolveLeagueResult(victory){
    if(!gameState||gameState.mode!=="league"||gameState.leagueResolved)return;gameState.leagueResolved=true;
    const l=progress.league;
    if(victory){l.wins++;l.stars++;updateExtendedQuestProgress("leagueWin",1);if(l.stars>=3&&l.tier<LEAGUES.length-1){l.tier++;l.stars=0;queueRewardShowcase({title:"Promotion !",text:`Vous atteignez la ligue ${LEAGUES[l.tier]}.`,icon:"♛"});}}
    else{l.losses++;if(l.stars>0)l.stars--;else if(l.tier>0){l.tier--;l.stars=2;queueRewardShowcase({title:"Rétrogradation",text:`Vous redescendez en ${LEAGUES[l.tier]}.`,icon:"▼"});}}
    original.saveProgress?.();
  }

  renderMenuSummary=function(){original.renderMenuSummary();renderV22Menu();};
  function renderV22Menu(){if(!progress)return;const ready=[...(progress.monthlyQuests?.quests||[]),...(progress.seasonalQuests?.quests||[])].filter(q=>q.progress>=q.goal&&!q.claimed).length;if(dom.questsSummaryLabel&&!dom.questsScreen.classList.contains("hidden"))dom.questsSummaryLabel.textContent+=ready?` · ${ready} longue(s) prête(s)`:"";}

  showMainMenu=function(){original.showMainMenu();dom.settingsScreen?.classList.add("hidden");dom.leagueScreen?.classList.add("hidden");renderV22Menu();};
  openAdventure=function(){original.openAdventure();adventureDifficulty=progress.lastAdventureDifficulty||"normal";renderAdventure();};

  renderAdventure=function(){
    const branch=adventureDifficulty==="hard"?progress.adventureHard:progress.adventure;const completed=new Set(branch.completed||[]);const selectedHero=getHeroDefinition(progress.selectedHeroId);const totalStars=Object.values(branch.stars||{}).reduce((a,b)=>a+Number(b||0),0);
    progress.lastAdventureDifficulty=adventureDifficulty;
    dom.difficultyButtons?.forEach(btn=>btn.classList.toggle("active",btn.dataset.adventureDifficulty===adventureDifficulty));
    if(dom.adventureDifficultyDescription)dom.adventureDifficultyDescription.textContent=adventureDifficulty==="hard"?"Ennemis : +10 PV, +5 Armure et decks renforcés. Bonus : 100 pièces par première victoire.":"Progression classique.";
    dom.adventureProgressLabel.textContent=`${completed.size} / ${ADVENTURE_ENCOUNTERS.length}`;dom.adventureStarsLabel.textContent=`${totalStars} ★`;dom.adventureSelectedHeroImage.src=selectedHero.portrait;dom.adventureSelectedHeroName.textContent=selectedHero.name;dom.adventureMap.innerHTML="";
    ADVENTURE_ENCOUNTERS.forEach((encounter,index)=>{const unlocked=index===0||completed.has(ADVENTURE_ENCOUNTERS[index-1].id);const done=completed.has(encounter.id);const stars=Number(branch.stars?.[encounter.id]||0);const hero=getHeroDefinition(encounter.heroId);const health=encounter.health+(adventureDifficulty==="hard"?10:0),armor=(encounter.startingArmor||0)+(adventureDifficulty==="hard"?5:0);const card=document.createElement("article");card.className=`adventure-node${unlocked?" unlocked":" locked"}${done?" completed":""}`;card.innerHTML=`<div class="adventure-node-path"></div><div class="adventure-node-portrait"><img src="${hero.portrait}" alt="${escapeHtml(hero.name)}"></div><div class="adventure-node-content"><div class="adventure-node-heading"><span>${escapeHtml(encounter.chapter)} · ${adventureDifficulty==="hard"?"Difficile":"Normal"}</span><strong>${escapeHtml(encounter.title)}</strong></div><p>${escapeHtml(encounter.subtitle)}</p><div class="adventure-boss-stats"><span>❤ ${health} PV</span><span>🛡 ${armor} Armure</span><span>${done?`${"★".repeat(stars)}${"☆".repeat(3-stars)}`:unlocked?"Disponible":"Verrouillé"}</span></div><div class="adventure-reward-line"><small>Récompense</small><strong>${escapeHtml(describeAdventureRewards(encounter.rewards))}${adventureDifficulty==="hard"?" + 100 pièces":""}</strong></div><button class="${unlocked?"primary-btn":"secondary-btn"}" ${unlocked?"":"disabled"}>${done?"Rejouer":unlocked?"Combattre":"À débloquer"}</button></div>`;card.querySelector("button").addEventListener("click",()=>startAdventureBattle(encounter.id));dom.adventureMap.appendChild(card);});
    dom.adventureRewardSummary.innerHTML=`<div class="adventure-summary-stat"><span>Difficulté</span><strong>${adventureDifficulty==="hard"?"Difficile":"Normal"}</strong></div><div class="adventure-summary-stat"><span>Étapes terminées</span><strong>${completed.size}</strong></div><div class="adventure-summary-stat"><span>Étoiles gagnées</span><strong>${totalStars} / ${ADVENTURE_ENCOUNTERS.length*3}</strong></div>`;
  };
  isAdventureEncounterUnlocked=function(encounterId){const branch=adventureDifficulty==="hard"?progress.adventureHard:progress.adventure;const idx=ADVENTURE_ENCOUNTERS.findIndex(e=>e.id===encounterId);return idx===0||branch.completed.includes(ADVENTURE_ENCOUNTERS[idx-1]?.id);};
  startAdventureBattle=function(id){const encounter=ADVENTURE_BY_ID[id];if(!encounter||!isAdventureEncounterUnlocked(id))return;const modified={...encounter,health:encounter.health+(adventureDifficulty==="hard"?10:0),startingArmor:(encounter.startingArmor||0)+(adventureDifficulty==="hard"?5:0),maxCardCost:adventureDifficulty==="hard"?99:encounter.maxCardCost};original.startBattle({mode:"adventure",encounter:modified});if(gameState){gameState.adventureDifficulty=adventureDifficulty;gameState.adventureId=id;}};
  completeAdventureEncounter=function(id){
    const encounter=ADVENTURE_BY_ID[id];if(!encounter)return"";const hard=gameState.adventureDifficulty==="hard";const branch=hard?progress.adventureHard:progress.adventure;const ratio=gameState.player.hero.currentHealth/Math.max(1,gameState.player.hero.maxHealth);const stars=ratio>=.67&&gameState.turnNumber<=12?3:ratio>=.34?2:1;branch.stars[id]=Math.max(Number(branch.stars[id]||0),stars);if(!branch.completed.includes(id))branch.completed.push(id);let txt="Combat déjà terminé : aucune nouvelle récompense.";if(!branch.claimed.includes(id)){grantAdventureRewards(encounter.rewards);if(hard)progress.coins+=100;branch.claimed.push(id);txt=`Récompense obtenue : ${describeAdventureRewards(encounter.rewards)}${hard?" + 100 pièces":""}.`;setTimeout(()=>showRewardCollection(encounter.rewards,hard?100:0),1800);}updateExtendedQuestProgress("adventureWin",1);original.saveProgress?.();return`${stars} étoile${stars>1?"s":""} gagnée${stars>1?"s":""}. ${txt}`;
  };

  renderQuests=function(){
    refreshLongQuests();dom.questTabs?.forEach(btn=>btn.classList.toggle("active",btn.dataset.questTab===questTab));
    if(questTab==="daily")return original.renderQuests();
    const set=questTab==="monthly"?progress.monthlyQuests:progress.seasonalQuests;const label=questTab==="monthly"?"mensuelles":"saisonnières";dom.questsGrid.innerHTML="";const ready=set.quests.filter(q=>q.progress>=q.goal&&!q.claimed).length;dom.questsReadyCount.textContent=`${ready} prêtes`;dom.questsSummaryLabel.textContent=`${set.quests.length} quête(s) ${label}`;dom.questsResetLabel.textContent=questTab==="monthly"?"Réinitialisation : chaque mois":"Durée : 3 mois";
    set.quests.forEach((q,i)=>{const ratio=Math.min(100,Math.round(q.progress/q.goal*100));const a=document.createElement("article");a.className=`quest-card long-quest ${q.progress>=q.goal?"completed":""} ${q.claimed?"claimed":""}`;a.innerHTML=`<div class="quest-topline"><div class="quest-badge">${q.icon}</div><span class="quest-status-pill ${q.claimed?"claimed":q.progress>=q.goal?"ready":""}">${q.claimed?"Réclamée":q.progress>=q.goal?"Prête":"En cours"}</span></div><div><h3>${escapeHtml(q.title)}</h3><p>${escapeHtml(q.description)}</p></div><div class="quest-progress-text"><span>Progression</span><strong>${q.progress} / ${q.goal}</strong></div><div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${ratio}%"></div></div><div class="quest-reward-box"><div class="quest-reward-icon">${getQuestRewardMarkup(q.reward)}</div><div><strong>${escapeHtml(getQuestRewardTitle(q.reward))}</strong><small>${escapeHtml(getQuestRewardDescription(q.reward))}</small></div></div><button class="${q.progress>=q.goal&&!q.claimed?"primary-btn":"secondary-btn"}" ${q.progress>=q.goal&&!q.claimed?"":"disabled"}>${q.claimed?"Déjà récupérée":q.progress>=q.goal?"Récupérer":"Quête en cours"}</button>`;a.querySelector("button").addEventListener("click",()=>claimLongQuest(questTab,i));dom.questsGrid.appendChild(a);});
  };
  function refreshLongQuests(){progress.monthlyQuests=normalizeQuestSet(progress.monthlyQuests,getMonthKey(),generateQuestSet(V22_MONTHLY_TEMPLATES,getMonthKey(),3));progress.seasonalQuests=normalizeQuestSet(progress.seasonalQuests,getSeasonKey(),generateQuestSet(V22_SEASONAL_TEMPLATES,getSeasonKey(),4));}
  function claimLongQuest(type,index){const set=type==="monthly"?progress.monthlyQuests:progress.seasonalQuests;const q=set.quests[index];if(!q||q.claimed||q.progress<q.goal)return;const visual=rewardVisualData(q.reward);grantQuestReward(q.reward);q.claimed=true;original.saveProgress?.();queueRewardShowcase({title:q.title,text:getQuestRewardDescription(q.reward),...visual});renderQuests();}
  updateDailyQuestProgress=function(event,amount=1){original.updateDailyQuestProgress(event,amount);updateExtendedQuestProgress(event,amount);};
  function updateExtendedQuestProgress(event,amount=1){refreshLongQuests();let changed=false;[progress.monthlyQuests,progress.seasonalQuests].forEach(set=>set.quests.forEach(q=>{if(!q.claimed&&q.event===event){const n=Math.min(q.goal,Number(q.progress||0)+amount);if(n!==q.progress){q.progress=n;changed=true;}}}));if(changed)original.saveProgress?.();}
  claimDailyQuest=function(index){const q=progress.dailyQuests?.quests?.[index];if(!q||q.claimed||q.progress<q.goal)return;const visual=rewardVisualData(q.reward);original.claimDailyQuest(index);queueRewardShowcase({title:q.title,text:getQuestRewardDescription(q.reward),...visual});};

  revealPackRewards=function(){
    if(!packOpeningState||packOpeningState.revealed)return;packOpeningState.revealed=true;dom.packOpeningStage.classList.add("revealed");dom.packOpeningHint.textContent="Nouvelles cartes obtenues !";dom.packOpeningCards.innerHTML="";
    packOpeningState.rewards.forEach((card,index)=>{const isNew=(progress.collection[card.id]||0)===0;progress.collection[card.id]=(progress.collection[card.id]||0)+1;const el=document.createElement("article");el.className=`pack-reward-card rarity-${card.rarity}${isNew?" is-new-card":""}`;el.style.animationDelay=`${index*70}ms`;el.innerHTML=`${isNew?'<span class="new-card-badge">NOUVEAU</span>':''}<div class="reward-art">${getCardArtMarkup(card)}</div><strong>${escapeHtml(card.name)}</strong><small>${typeLabel(card.type)} · ${escapeHtml(card.description)}</small><b>${rarityLabel(card.rarity)}</b>`;bindCardImageFallback(el,card);el.addEventListener("mouseenter",()=>previewCard(card));dom.packOpeningCards.appendChild(el);});
    updateDailyQuestProgress("openPack",1);original.saveProgress?.();renderShop();dom.packOpeningCloseBtn.disabled=false;dom.packOpeningXBtn.classList.remove("hidden");dom.packOpeningXBtn.disabled=false;
  };

  showGameOver=function(title,text){if(gameState?.mode==="league"&&!gameState.leagueResolved)resolveLeagueResult(title.includes("Victoire"));original.showGameOver(title,text);};

  function rewardVisualData(reward){if(!reward)return{icon:"✦"};if(reward.type==="pack")return{image:PACK_DEFINITIONS[reward.packId]?.image,icon:"◈"};if(reward.type==="card")return{image:CARD_BY_ID[reward.cardId]?.image,icon:"★"};if(reward.type==="randomCard")return{image:COLLECTIBLE_CARDS.find(c=>c.rarity===reward.rarity)?.image,icon:"★"};if(reward.type==="coins")return{image:"assets/ui/coin.png",icon:"●"};return{icon:"✦"};}
  function showRewardCollection(rewards,bonusCoins=0){const list=(rewards||[]).map(r=>({...rewardVisualData(r),text:getQuestRewardDescription(r)}));if(bonusCoins)list.push({image:"assets/ui/coin.png",text:`${bonusCoins} pièces bonus`});const first=list[0]||{icon:"✦"};queueRewardShowcase({title:"Récompense d’aventure",text:list.map(x=>x.text).join(" + "),image:first.image,icon:first.icon});}
  function queueRewardShowcase(data){rewardQueue.push(data);if(dom.rewardShowcaseModal.classList.contains("hidden"))showNextReward();}
  function showNextReward(){const r=rewardQueue.shift();if(!r)return;dom.rewardShowcaseTitle.textContent=r.title||"Récompense obtenue !";dom.rewardShowcaseText.textContent=r.text||"Votre récompense a été ajoutée.";dom.rewardShowcaseVisual.innerHTML=r.image?`<img src="${r.image}" alt="Récompense">`:`<span>${r.icon||"✦"}</span>`;dom.rewardShowcaseModal.classList.remove("hidden");}
  function closeRewardShowcase(){dom.rewardShowcaseModal.classList.add("hidden");if(rewardQueue.length)setTimeout(showNextReward,120);}
})();
/* ==========================================================================
   FIN DE LA VERSION V22
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V23
   ========================================================================== */
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
/* ==========================================================================
   FIN DE LA VERSION V23
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V24
   ========================================================================== */
/* Chroniques d'Astréa V24 — effets sonores personnalisables */
(() => {
  const originalShowGameOver = showGameOver;
  const originalAnimateCombat = animateCombat;

  const activeSfx = new Set();
  const sfxChannels = new Map();
  let lastResultGameState = null;

  document.addEventListener("DOMContentLoaded", () => {
    initializeSfxEngine();
    if (progress) {
      progress.version = Math.max(24, Number(progress.version || 0));
      saveProgress();
    }
  });

  showGameOver = function(title, text) {
    playResultSound(title);
    return originalShowGameOver(title, text);
  };

  animateCombat = async function(attacker, target) {
    const impactTimer = window.setTimeout(() => playSfx("attackHit", 0.82), 265);
    try {
      return await originalAnimateCombat(attacker, target);
    } finally {
      window.clearTimeout(impactTimer);
    }
  };

  function initializeSfxEngine() {
    ["victory", "defeat", "menuClick", "attackHit"].forEach(createSfxChannel);

    document.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || button.disabled || !isMenuButton(button)) return;
      playSfx("menuClick", 0.58);
    }, true);

    document.getElementById("volume-slider")?.addEventListener("input", applySfxVolume);
    window.addEventListener("beforeunload", stopAllSfx);
  }

  function isMenuButton(button) {
    if (!button.closest("#game-screen")) return true;
    return button.id === "open-settings-game-btn" || button.id === "leave-game-btn";
  }

  function playResultSound(title) {
    if (gameState && lastResultGameState === gameState) return;
    const normalized = normalizeText(title || "");
    if (normalized.includes("victoire")) {
      lastResultGameState = gameState || { result: "victory" };
      playSfx("victory", 1);
    } else if (normalized.includes("defaite")) {
      lastResultGameState = gameState || { result: "defeat" };
      playSfx("defeat", 1);
    }
  }

  function createSfxChannel(key) {
    if (sfxChannels.has(key)) return sfxChannels.get(key);
    const candidates = getSfxCandidates(key);
    const channel = {
      key,
      candidates,
      preferredIndex: 0,
      resolvedSource: null,
      exhausted: false
    };
    sfxChannels.set(key, channel);
    return channel;
  }

  function getSfxCandidates(key) {
    const configured = window.ASTREA_AUDIO_CONFIG?.[key];
    if (Array.isArray(configured) && configured.length) return configured.filter(Boolean);
    if (typeof configured === "string" && configured.trim()) return [configured.trim()];

    const defaults = {
      victory: ["audio/victoire.mp3", "audio/victoire.ogg", "audio/victoire.wav"],
      defeat: ["audio/defaite.mp3", "audio/defaite.ogg", "audio/defaite.wav"],
      menuClick: ["audio/clic_menu.mp3", "audio/clic_menu.ogg", "audio/clic_menu.wav"],
      attackHit: ["audio/impact_carte.mp3", "audio/impact_carte.ogg", "audio/impact_carte.wav"]
    };
    return defaults[key] || [];
  }

  function playSfx(key, gain = 1) {
    const channel = createSfxChannel(key);
    if (!channel.candidates.length || channel.exhausted || getMasterVolume() <= 0) return null;

    const orderedCandidates = channel.resolvedSource
      ? [channel.resolvedSource, ...channel.candidates.filter(source => source !== channel.resolvedSource)]
      : channel.candidates.slice(channel.preferredIndex);

    return tryPlayCandidate(channel, orderedCandidates, 0, gain);
  }

  function tryPlayCandidate(channel, candidates, index, gain) {
    if (index >= candidates.length) {
      channel.exhausted = true;
      return null;
    }

    const source = candidates[index];
    const audio = new Audio(source);
    let fallbackStarted = false;
    audio.preload = "auto";
    audio.volume = Math.max(0, Math.min(1, getMasterVolume() * gain));
    audio.muted = false;

    const fallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      activeSfx.delete(audio);
      tryPlayCandidate(channel, candidates, index + 1, gain);
    };

    audio.addEventListener("playing", () => {
      channel.resolvedSource = source;
      const sourceIndex = channel.candidates.indexOf(source);
      if (sourceIndex >= 0) channel.preferredIndex = sourceIndex;
      channel.exhausted = false;
    }, { once: true });
    audio.addEventListener("ended", () => activeSfx.delete(audio), { once: true });
    audio.addEventListener("error", fallback, { once: true });

    activeSfx.add(audio);
    const promise = audio.play();
    if (promise?.catch) {
      promise.catch(error => {
        if (error?.name === "NotSupportedError") fallback();
        else activeSfx.delete(audio);
      });
    }
    return audio;
  }

  function getMasterVolume() {
    return Math.max(0, Math.min(1, Number(progress?.settings?.volume ?? 70) / 100));
  }

  function applySfxVolume() {
    const volume = getMasterVolume();
    activeSfx.forEach(audio => {
      audio.volume = volume;
      if (volume <= 0) {
        audio.pause();
        activeSfx.delete(audio);
      }
    });
  }

  function stopAllSfx() {
    activeSfx.forEach(audio => {
      audio.pause();
      try { audio.currentTime = 0; } catch (_) {}
    });
    activeSfx.clear();
  }

  window.ASTREA_SFX = {
    play: playSfx,
    stopAll: stopAllSfx,
    reload() {
      sfxChannels.clear();
      ["victory", "defeat", "menuClick", "attackHit"].forEach(createSfxChannel);
    }
  };
})();
/* ==========================================================================
   FIN DE LA VERSION V24
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V25
   ========================================================================== */
/* Chroniques d'Astréa V25 — son de fin de tour et sons d'invocation par carte */
(() => {
  const originalEndPlayerTurn = endPlayerTurn;
  const configuredKeys = new Set();

  endPlayerTurn = async function(...args) {
    if (typeof canPlayerInteract === "function" && !canPlayerInteract()) {
      return originalEndPlayerTurn.apply(this, args);
    }
    window.ASTREA_SFX?.play("endTurn", 0.82);
    return originalEndPlayerTurn.apply(this, args);
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (progress) {
      progress.version = Math.max(25, Number(progress.version || 0));
      saveProgress();
    }
  });

  function normalizeCardFilename(value) {
    return String(value || "carte")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "carte";
  }

  function asCandidateList(value) {
    if (Array.isArray(value)) return value.filter(item => typeof item === "string" && item.trim());
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }

  function getCardSoundCandidates(card) {
    const slug = normalizeCardFilename(card?.name || card?.id);
    const overrides = window.ASTREA_AUDIO_CONFIG?.cardSummons || {};
    const custom = asCandidateList(overrides[card?.id] ?? overrides[card?.name] ?? overrides[slug]);
    if (custom.length) return custom;

    const exactName = String(card?.name || "").trim();
    const id = String(card?.id || "").trim();
    const extensions = ["mp3", "ogg", "wav"];
    const candidates = [];

    for (const extension of extensions) candidates.push(`audio/cartes/${slug}.${extension}`);
    for (const extension of extensions) candidates.push(`audio/${slug}.${extension}`);
    if (id) for (const extension of extensions) candidates.push(`audio/cartes/${id}.${extension}`);
    if (exactName) for (const extension of extensions) candidates.push(`audio/cartes/${exactName}.${extension}`);

    return [...new Set(candidates)];
  }

  function playCardSummonSound(cardOrId, gain = 0.9) {
    const card = typeof cardOrId === "string" ? CARD_BY_ID?.[cardOrId] : cardOrId;
    if (!card || !["creature", "token"].includes(card.type)) return null;

    const slug = normalizeCardFilename(card.name || card.id);
    const channelKey = `cardSummon_${card.id || slug}`;
    if (!configuredKeys.has(channelKey)) {
      window.ASTREA_AUDIO_CONFIG = window.ASTREA_AUDIO_CONFIG || {};
      window.ASTREA_AUDIO_CONFIG[channelKey] = getCardSoundCandidates(card);
      configuredKeys.add(channelKey);
    }
    return window.ASTREA_SFX?.play(channelKey, gain) || null;
  }

  window.ASTREA_CARD_AUDIO = {
    play: playCardSummonSound,
    filenameFor(cardOrId) {
      const card = typeof cardOrId === "string" ? CARD_BY_ID?.[cardOrId] : cardOrId;
      return card ? `${normalizeCardFilename(card.name || card.id)}.mp3` : "carte.mp3";
    },
    reload() {
      configuredKeys.forEach(key => {
        if (window.ASTREA_AUDIO_CONFIG) delete window.ASTREA_AUDIO_CONFIG[key];
      });
      configuredKeys.clear();
      window.ASTREA_SFX?.reload?.();
    }
  };
})();
/* ==========================================================================
   FIN DE LA VERSION V25
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V26
   ========================================================================== */
/* Chroniques d'Astréa V26 — sons d'interface, de deck, de pioche, de quêtes et pouvoir héroïque */
(() => {
  const originalAddCardToDeck = addCardToDeck;
  const originalDrawCard = drawCard;
  const originalBeginTurn = beginTurn;
  const originalRenderGame = renderGame;
  const originalRenderHeroesAndCounters = renderHeroesAndCounters;
  const originalPlayCardFromHand = playCardFromHand;
  const originalOpenShop = openShop;
  const originalUpdateDailyQuestProgress = updateDailyQuestProgress;
  const originalUpdateQuestProgress = updateQuestProgress;
  const originalCompleteAdventureEncounter = completeAdventureEncounter;
  const originalRenderQuests = renderQuests;

  let beginTurnOwnerId = null;
  let lastTurnAlertGame = null;
  let lastTurnAlertKey = "";
  let heroPowerGame = null;
  let previousPlayerPowerUsed = null;
  let userHasInteracted = false;
  let pendingNewQuestTypes = [];
  let lastHoverButton = null;

  document.addEventListener("DOMContentLoaded", () => {
    migrateV26Progress();
    bindV26InterfaceSounds();
    applyHeroPowerVisualState(false);
    syncQuestCycleNotifications({ allowNotification: false });
  });

  addCardToDeck = function(cardId) {
    const beforeLength = Number(progress?.deck?.length || 0);
    const result = originalAddCardToDeck.apply(this, arguments);
    const afterLength = Number(progress?.deck?.length || 0);

    if (afterLength > beforeLength) {
      playSound("deckAdd", 0.78);
      if (afterLength >= Number(CONFIG?.DECK_SIZE || 30)) {
        window.setTimeout(() => playSound("deckFull", 0.92), 170);
      }
    } else if (beforeLength >= Number(CONFIG?.DECK_SIZE || 30)) {
      playSound("deckFull", 0.92);
    }
    return result;
  };

  drawCard = function(playerId, options = {}) {
    const player = gameState?.[playerId];
    const beforeHand = Number(player?.hand?.length || 0);
    const beforeGrave = Number(player?.graveyard?.length || 0);
    const result = originalDrawCard.apply(this, arguments);

    if (playerId === "player" && !options?.silent && player) {
      const afterHand = Number(player.hand?.length || 0);
      const afterGrave = Number(player.graveyard?.length || 0);
      if (afterGrave > beforeGrave && afterHand <= beforeHand) {
        playSound("cardDiscard", 0.9);
      } else if (afterHand > beforeHand) {
        const delay = beginTurnOwnerId === "player" ? 260 : 0;
        window.setTimeout(() => playSound("cardDraw", 0.78), delay);
      }
    }
    return result;
  };

  beginTurn = function(playerId) {
    beginTurnOwnerId = playerId;
    if (playerId === "player") announcePlayerTurn();
    try {
      return originalBeginTurn.apply(this, arguments);
    } finally {
      beginTurnOwnerId = null;
    }
  };

  renderGame = function() {
    const result = originalRenderGame.apply(this, arguments);
    if (gameState?.status === "playing" && gameState.activePlayerId === "player") {
      announcePlayerTurn();
    }
    return result;
  };

  renderHeroesAndCounters = function() {
    const result = originalRenderHeroesAndCounters.apply(this, arguments);
    applyHeroPowerVisualState(true);
    return result;
  };

  playCardFromHand = async function(playerId, handIndex, target = null) {
    const instance = gameState?.[playerId]?.hand?.[handIndex];
    const card = instance ? CARD_BY_ID?.[instance.cardId] : null;
    const result = await originalPlayCardFromHand.apply(this, arguments);
    if (result && card?.type === "creature" && (card.keywords || []).includes("taunt")) {
      window.setTimeout(() => playSound("tauntPlayed", 0.9), 120);
    }
    return result;
  };

  openShop = function() {
    const result = originalOpenShop.apply(this, arguments);
    window.setTimeout(() => playSound("shopOpen", 0.9), 70);
    return result;
  };

  updateDailyQuestProgress = function(event, amount = 1) {
    const before = captureQuestCompletionState();
    const result = originalUpdateDailyQuestProgress.apply(this, arguments);
    playQuestCompletionIfNeeded(before);
    return result;
  };

  updateQuestProgress = function(ownerId, event, amount = 1) {
    const beforeIds = ownerId === "player"
      ? new Set((gameState?.player?.quests || []).map(quest => quest.instanceId))
      : null;
    const result = originalUpdateQuestProgress.apply(this, arguments);
    if (beforeIds) {
      const afterIds = new Set((gameState?.player?.quests || []).map(quest => quest.instanceId));
      if ([...beforeIds].some(id => !afterIds.has(id))) playSound("questComplete", 0.92);
    }
    return result;
  };

  completeAdventureEncounter = function(encounterId) {
    const before = captureQuestCompletionState();
    const result = originalCompleteAdventureEncounter.apply(this, arguments);
    playQuestCompletionIfNeeded(before);
    return result;
  };

  renderQuests = function() {
    const result = originalRenderQuests.apply(this, arguments);
    syncQuestCycleNotifications({ allowNotification: true });
    return result;
  };

  function migrateV26Progress() {
    if (!progress) return;
    progress.audioQuestCycles = progress.audioQuestCycles || {};
    progress.version = Math.max(26, Number(progress.version || 0));
    saveProgress();
  }

  function bindV26InterfaceSounds() {
    const markInteraction = () => {
      userHasInteracted = true;
      flushPendingNewQuestNotification();
    };
    document.addEventListener("pointerdown", markInteraction, { once: true, capture: true });
    document.addEventListener("keydown", markInteraction, { once: true, capture: true });

    document.addEventListener("mouseover", event => {
      const button = event.target.closest("button");
      if (!button || button.disabled || !isMenuHoverButton(button)) return;
      if (event.relatedTarget && button.contains(event.relatedTarget)) return;
      if (lastHoverButton === button) return;
      lastHoverButton = button;
      playSound("menuHover", 0.45);
    }, true);

    document.addEventListener("mouseout", event => {
      const button = event.target.closest("button");
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return;
      if (lastHoverButton === button) lastHoverButton = null;
    }, true);

    document.addEventListener("pointerdown", event => {
      const cardButton = event.target.closest(".collection-card");
      if (!cardButton?.disabled) return;
      playSound("deckFull", 0.82);
    }, true);
  }

  function isMenuHoverButton(button) {
    if (button.closest("#game-screen")) {
      return button.id === "open-settings-game-btn" || button.id === "leave-game-btn";
    }
    return !button.matches(".collection-card, .deck-row, .pack-reward-card, .secret-token, .quest-token");
  }

  function announcePlayerTurn() {
    if (!gameState || gameState.status !== "playing" || gameState.activePlayerId !== "player") return;
    const key = `${gameState.turnNumber}:${gameState.firstPlayerId || ""}`;
    if (lastTurnAlertGame === gameState && lastTurnAlertKey === key) return;
    lastTurnAlertGame = gameState;
    lastTurnAlertKey = key;
    playSound("turnAlert", 0.95);
  }

  function applyHeroPowerVisualState(withSound) {
    const button = document.getElementById("player-hero-power");
    const used = Boolean(gameState?.player?.heroPower?.usedThisTurn);
    if (!button) return;

    if (heroPowerGame !== gameState) {
      heroPowerGame = gameState;
      previousPlayerPowerUsed = gameState ? used : null;
      button.classList.toggle("power-concealed", used);
      button.classList.remove("power-reactivating");
      return;
    }

    button.classList.toggle("power-concealed", used);
    if (previousPlayerPowerUsed !== null && previousPlayerPowerUsed !== used && withSound) {
      if (used) {
        button.classList.remove("power-reactivating");
        playSound("heroPowerFlip", 0.88);
      } else if (gameState?.status === "playing") {
        button.classList.add("power-reactivating");
        window.setTimeout(() => button.classList.remove("power-reactivating"), 700);
        window.setTimeout(() => playSound("heroPowerReady", 0.88), 120);
      }
    }
    previousPlayerPowerUsed = used;
  }

  function captureQuestCompletionState() {
    const state = new Map();
    getQuestGroups().forEach(group => {
      group.quests.forEach((quest, index) => {
        const key = `${group.type}:${quest?.id || index}`;
        state.set(key, Number(quest?.progress || 0) >= Number(quest?.goal || 0));
      });
    });
    return state;
  }

  function playQuestCompletionIfNeeded(beforeState) {
    const completedNow = getQuestGroups().some(group => group.quests.some((quest, index) => {
      const key = `${group.type}:${quest?.id || index}`;
      const wasComplete = beforeState?.get(key) || false;
      const isComplete = Number(quest?.progress || 0) >= Number(quest?.goal || 0);
      return !wasComplete && isComplete;
    }));
    if (completedNow) playSound("questComplete", 0.92);
  }

  function getQuestGroups() {
    return [
      { type: "daily", quests: progress?.dailyQuests?.quests || [] },
      { type: "monthly", quests: progress?.monthlyQuests?.quests || [] },
      { type: "seasonal", quests: progress?.seasonalQuests?.quests || [] }
    ];
  }

  function currentQuestCycles() {
    return {
      daily: progress?.dailyQuests?.date || "",
      monthly: progress?.monthlyQuests?.key || "",
      seasonal: progress?.seasonalQuests?.key || ""
    };
  }

  function syncQuestCycleNotifications({ allowNotification }) {
    if (!progress) return;
    const previous = { ...(progress.audioQuestCycles || {}) };
    const current = currentQuestCycles();
    const hadPreviousCycle = Boolean(previous.daily || previous.monthly || previous.seasonal);
    const changedTypes = Object.keys(current).filter(type => previous[type] && current[type] && previous[type] !== current[type]);

    progress.audioQuestCycles = current;
    saveProgress();

    if (!hadPreviousCycle || !changedTypes.length) return;
    pendingNewQuestTypes = [...new Set([...pendingNewQuestTypes, ...changedTypes])];
    if (allowNotification && userHasInteracted) flushPendingNewQuestNotification();
  }

  function flushPendingNewQuestNotification() {
    if (!pendingNewQuestTypes.length) return;
    const types = pendingNewQuestTypes.splice(0);
    showNewQuestNotification(types);
    playSound("questNew", 0.92);
  }

  function showNewQuestNotification(types) {
    const stack = document.getElementById("quest-notification-stack");
    if (!stack) return;
    while (stack.children.length >= 4) stack.firstElementChild?.remove();

    const labels = {
      daily: "quotidiennes",
      monthly: "mensuelles",
      seasonal: "saisonnières"
    };
    const text = types.map(type => labels[type] || type).join(", ");
    const notification = document.createElement("article");
    notification.className = "quest-complete-notification quest-new-notification";
    notification.innerHTML = `
      <div class="quest-notification-icon">✦</div>
      <div class="quest-notification-copy">
        <span class="quest-notification-kicker">Nouvelles quêtes disponibles</span>
        <strong>Le tableau des quêtes a été renouvelé</strong>
        <span>De nouvelles quêtes ${escapeHtml(text)} vous attendent.</span>
        <span class="quest-notification-reward">Ouvrez le menu Quêtes pour les découvrir.</span>
      </div>
      <span class="quest-notification-progress"></span>`;
    stack.appendChild(notification);
    window.setTimeout(() => notification.classList.add("leaving"), 4700);
    window.setTimeout(() => notification.remove(), 5150);
  }

  function playSound(key, gain = 1) {
    return window.ASTREA_SFX?.play?.(key, gain) || null;
  }

  window.ASTREA_AUDIO_EVENTS = {
    ...(window.ASTREA_AUDIO_EVENTS || {}),
    playerTurn: () => playSound("turnAlert", 0.95),
    deckFull: () => playSound("deckFull", 0.92),
    deckAdd: () => playSound("deckAdd", 0.78),
    draw: () => playSound("cardDraw", 0.78),
    discard: () => playSound("cardDiscard", 0.9),
    heroPowerFlip: () => playSound("heroPowerFlip", 0.88),
    heroPowerReady: () => playSound("heroPowerReady", 0.88),
    menuHover: () => playSound("menuHover", 0.45),
    questNew: () => playSound("questNew", 0.92),
    questComplete: () => playSound("questComplete", 0.92),
    taunt: () => playSound("tauntPlayed", 0.9),
    shop: () => playSound("shopOpen", 0.9)
  };
})();
/* ==========================================================================
   FIN DE LA VERSION V26
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V27
   ========================================================================== */
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
/* ==========================================================================
   FIN DE LA VERSION V27
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V28
   ========================================================================== */
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
/* ==========================================================================
   FIN DE LA VERSION V28
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V29
   ========================================================================== */
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
/* ==========================================================================
   FIN DE LA VERSION V29
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V30
   ========================================================================== */
/* Chroniques d'Astréa V30 — Statistiques dans les Paramètres
   Ajoute une catégorie « Statistiques » à l'écran Paramètres avec :
   nombre de victoires total, nombre de combats joués, nombre de défaites,
   nombre de victoires/défaites par héros joué, nombre de cartes possédées,
   nombre de paquets ouverts, nombre de pièces actuelles, meilleur rang de
   League atteint et deck préféré (le plus joué).
*/
(() => {
  const originalShowGameOver = showGameOver;
  const originalRevealPackRewards = revealPackRewards;
  const originalSaveProgress = saveProgress;

  // Copie locale des paliers de League (mêmes noms que dans v22.js) pour
  // afficher le libellé du meilleur rang atteint sans dépendre de v22.js.
  const LEAGUES = ["Bronze III","Bronze II","Bronze I","Argent III","Argent II","Argent I","Or III","Or II","Or I","Platine III","Platine II","Platine I","Diamant III","Diamant II","Diamant I","Maître"];

  document.addEventListener("DOMContentLoaded", () => {
    migrateV30Progress();
    cacheV30Dom();
    bindV30Events();
  });

  function migrateV30Progress() {
    if (!progress) return;
    progress.stats = {
      totalMatches: 0,
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
      packsOpened: 0,
      bestLeagueTier: 0,
      heroRecords: {},
      deckStats: {},
      ...(progress.stats || {})
    };
    progress.stats.heroRecords = progress.stats.heroRecords || {};
    progress.stats.deckStats = progress.stats.deckStats || {};
    if (progress.league) {
      progress.stats.bestLeagueTier = Math.max(progress.stats.bestLeagueTier || 0, progress.league.tier || 0);
    }
    progress.version = Math.max(30, Number(progress.version || 0));
    originalSaveProgress?.();
  }

  function cacheV30Dom() {
    const ids = ["stats-summary-grid", "stats-hero-list", "stats-favorite-deck"];
    ids.forEach(id => dom[toCamel(id)] = document.getElementById(id));
  }

  function bindV30Events() {
    document.getElementById("open-settings-btn")?.addEventListener("click", renderStats);
    document.getElementById("open-settings-game-btn")?.addEventListener("click", renderStats);
  }

  // On laisse d'abord s'exécuter la chaîne existante (quêtes, League, sons…)
  // afin que progress.league soit déjà à jour avant d'enregistrer les stats.
  showGameOver = function(title, text) {
    const result = originalShowGameOver.apply(this, arguments);
    recordMatchResult(title);
    return result;
  };

  revealPackRewards = function() {
    const wasRevealed = Boolean(packOpeningState?.revealed);
    const result = originalRevealPackRewards.apply(this, arguments);
    if (!wasRevealed && packOpeningState?.revealed && progress?.stats) {
      progress.stats.packsOpened += 1;
      originalSaveProgress?.();
    }
    return result;
  };

  function recordMatchResult(title) {
    if (!progress?.stats || !gameState) return;
    const label = String(title || "");
    const isVictory = label.includes("Victoire");
    const isDefeat = label.includes("Défaite");
    const heroId = gameState.player?.heroId;
    const deckId = progress.activeDeckId;

    progress.stats.totalMatches += 1;

    if (heroId) {
      if (!progress.stats.heroRecords[heroId]) progress.stats.heroRecords[heroId] = { wins: 0, losses: 0 };
    }
    if (deckId) {
      if (!progress.stats.deckStats[deckId]) progress.stats.deckStats[deckId] = { matches: 0, wins: 0 };
      progress.stats.deckStats[deckId].matches += 1;
    }

    if (isVictory) {
      progress.stats.totalWins += 1;
      if (heroId) progress.stats.heroRecords[heroId].wins += 1;
      if (deckId) progress.stats.deckStats[deckId].wins += 1;
    } else if (isDefeat) {
      progress.stats.totalLosses += 1;
      if (heroId) progress.stats.heroRecords[heroId].losses += 1;
    } else {
      progress.stats.totalDraws += 1;
    }

    if (progress.league) {
      progress.stats.bestLeagueTier = Math.max(progress.stats.bestLeagueTier || 0, progress.league.tier || 0);
    }

    originalSaveProgress?.();
  }

  function bestLeagueRankLabel() {
    const tier = Math.max(0, Math.min(LEAGUES.length - 1, progress?.stats?.bestLeagueTier || 0));
    const hasPlayed = Boolean(progress?.league && (progress.league.wins || progress.league.losses || progress.stats.bestLeagueTier));
    return hasPlayed ? LEAGUES[tier] : "Aucun combat League";
  }

  function findFavoriteDeck() {
    const entries = Object.entries(progress?.stats?.deckStats || {});
    if (!entries.length) return null;
    entries.sort((a, b) => (b[1].matches - a[1].matches) || (b[1].wins - a[1].wins));
    const [deckId, stats] = entries[0];
    const deck = progress.decks?.find(d => d.id === deckId);
    return { name: deck?.name || "Deck supprimé", matches: stats.matches, wins: stats.wins };
  }

  function renderStats() {
    if (!progress?.stats || !dom.statsSummaryGrid) return;

    const stats = progress.stats;
    const ownedCards = typeof getOwnedCardTotal === "function" ? getOwnedCardTotal() : 0;

    const tiles = [
      { label: "Victoires totales", value: stats.totalWins },
      { label: "Combats joués", value: stats.totalMatches },
      { label: "Défaites", value: stats.totalLosses },
      { label: "Cartes possédées", value: ownedCards },
      { label: "Paquets ouverts", value: stats.packsOpened },
      { label: "Pièces actuelles", value: progress.coins },
      { label: "Meilleur rang League", value: bestLeagueRankLabel() }
    ];
    dom.statsSummaryGrid.innerHTML = tiles.map(t => `<div class="stats-stat-tile"><span>${escapeHtml(t.label)}</span><strong>${escapeHtml(String(t.value))}</strong></div>`).join("");

    if (dom.statsHeroList) {
      const heroIds = Object.keys(stats.heroRecords);
      if (!heroIds.length) {
        dom.statsHeroList.innerHTML = '<p class="stats-hero-empty">Aucun combat joué pour le moment.</p>';
      } else {
        dom.statsHeroList.innerHTML = heroIds.map(heroId => {
          const hero = getHeroDefinition(heroId);
          const record = stats.heroRecords[heroId];
          return `<div class="stats-hero-row"><img src="${hero.portrait}" alt="${escapeHtml(hero.name)}"><span class="stats-hero-name">${escapeHtml(hero.name)}</span><span class="stats-hero-record"><b>${record.wins} victoire${record.wins > 1 ? "s" : ""}</b><em>${record.losses} défaite${record.losses > 1 ? "s" : ""}</em></span></div>`;
        }).join("");
      }
    }

    if (dom.statsFavoriteDeck) {
      const favorite = findFavoriteDeck();
      dom.statsFavoriteDeck.innerHTML = favorite
        ? `<span>Deck le plus joué</span><strong>${escapeHtml(favorite.name)} · ${favorite.matches} combat${favorite.matches > 1 ? "s" : ""} (${favorite.wins} victoire${favorite.wins > 1 ? "s" : ""})</strong>`
        : `<span>Deck le plus joué</span><strong>Aucun combat joué pour le moment</strong>`;
    }
  }
})();
/* ==========================================================================
   FIN DE LA VERSION V30
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V31
   ========================================================================== */
/* Chroniques d'Astréa V31 — Écran de chargement
   Précharge les images et les sons du jeu (liste définie dans assets-manifest.js),
   affiche une barre de progression, puis remplace celle-ci par un bouton
   « Entrer dans la taverne » une fois le chargement terminé à 100 %.

   Sons personnalisables (à déposer dans le dossier audio/) :
   - loading_screen.mp3 / .ogg / .wav : joué en boucle pendant le chargement.
   - enter_game_button.mp3 / .ogg / .wav : joué lors du clic sur le bouton.
*/
(() => {
  const MIN_VISIBLE_DURATION_MS = 900; // évite un simple "flash" si tout charge instantanément
  const ASSET_TIMEOUT_MS = 12000; // un fichier trop lent n'empêche pas le jeu de démarrer

  let loadingAmbientAudio = null;
  let loadingAmbientCandidates = [];
  let loadingAmbientIndex = 0;
  let loadingAmbientUnlocked = false;

  document.addEventListener("DOMContentLoaded", () => {
    const dom = cacheLoadingDom();
    if (!dom.screen) return;

    startLoadingAmbient(dom);
    bindEnterButton(dom);
    runPreload(dom);
  });

  function cacheLoadingDom() {
    return {
      screen: document.getElementById("loading-screen"),
      progressWrap: document.getElementById("loading-progress-wrap"),
      progressFill: document.getElementById("loading-progress-fill"),
      progressLabel: document.getElementById("loading-progress-label"),
      progressPercent: document.getElementById("loading-progress-percent"),
      enterBtn: document.getElementById("enter-tavern-btn")
    };
  }

  /* ---------- Préchargement des assets ---------- */

  function runPreload(dom) {
    const manifest = window.ASTREA_ASSET_MANIFEST || { images: [], audio: [] };
    const images = Array.isArray(manifest.images) ? manifest.images : [];
    const audios = Array.isArray(manifest.audio) ? manifest.audio : [];
    const total = images.length + audios.length;
    const startedAt = Date.now();

    if (!total) {
      finishLoading(dom, startedAt);
      return;
    }

    let loaded = 0;
    const onOneDone = () => {
      loaded += 1;
      updateProgress(dom, loaded, total);
      if (loaded >= total) finishLoading(dom, startedAt);
    };

    images.forEach(src => preloadImage(src, onOneDone));
    audios.forEach(src => preloadAudio(src, onOneDone));

    updateProgress(dom, 0, total);
  }

  function preloadImage(src, done) {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; done(); };
    const img = new Image();
    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, ASSET_TIMEOUT_MS);
    img.src = src;
  }

  function preloadAudio(src, done) {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; done(); };
    const audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("canplaythrough", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, ASSET_TIMEOUT_MS);
    audio.src = src;
    try { audio.load(); } catch (_) {}
  }

  function updateProgress(dom, loaded, total) {
    const percent = total ? Math.min(100, Math.round((loaded / total) * 100)) : 100;
    if (dom.progressFill) dom.progressFill.style.width = `${percent}%`;
    if (dom.progressPercent) dom.progressPercent.textContent = `${percent} %`;
  }

  function finishLoading(dom, startedAt) {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, MIN_VISIBLE_DURATION_MS - elapsed);
    window.setTimeout(() => revealEnterButton(dom), remaining);
  }

  function revealEnterButton(dom) {
    updateProgress(dom, 1, 1);
    if (dom.progressLabel) dom.progressLabel.textContent = "Chargement terminé";
    if (dom.progressWrap) dom.progressWrap.classList.add("hidden");
    if (dom.enterBtn) dom.enterBtn.classList.remove("hidden");
    dom.enterBtn?.focus();
  }

  /* ---------- Bouton "Entrer dans la taverne" ---------- */

  function bindEnterButton(dom) {
    dom.enterBtn?.addEventListener("click", () => {
      if (dom.enterBtn.disabled) return;
      dom.enterBtn.disabled = true;
      playOneShot(getAudioCandidates("enterGameButton", [
        "audio/enter_game_button.mp3", "audio/enter_game_button.ogg", "audio/enter_game_button.wav"
      ]));
      stopLoadingAmbient();
      enterGame(dom);
    });
  }

  function enterGame(dom) {
    dom.screen.classList.add("loading-screen-leaving");
    window.setTimeout(() => {
      dom.screen.classList.add("hidden");
      if (typeof showMainMenu === "function") showMainMenu();
    }, 520);
  }

  /* ---------- Ambiance sonore de l'écran de chargement ---------- */

  function startLoadingAmbient(dom) {
    loadingAmbientCandidates = getAudioCandidates("loadingScreen", [
      "audio/loading_screen.mp3", "audio/loading_screen.ogg", "audio/loading_screen.wav"
    ]);
    if (!loadingAmbientCandidates.length) return;

    loadingAmbientAudio = new Audio();
    loadingAmbientAudio.loop = true;
    loadingAmbientAudio.volume = getMasterVolume();
    loadingAmbientIndex = 0;

    loadingAmbientAudio.addEventListener("error", () => {
      loadingAmbientIndex += 1;
      if (loadingAmbientIndex < loadingAmbientCandidates.length) {
        loadingAmbientAudio.src = loadingAmbientCandidates[loadingAmbientIndex];
        loadingAmbientAudio.load();
      }
    });

    loadingAmbientAudio.src = loadingAmbientCandidates[loadingAmbientIndex];
    attemptAmbientPlay();

    const unlock = () => {
      if (loadingAmbientUnlocked) return;
      loadingAmbientUnlocked = true;
      attemptAmbientPlay();
    };
    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    document.addEventListener("keydown", unlock, { once: true, capture: true });
  }

  function attemptAmbientPlay() {
    if (!loadingAmbientAudio) return;
    const promise = loadingAmbientAudio.play();
    if (promise?.catch) promise.catch(() => {});
  }

  function stopLoadingAmbient() {
    if (!loadingAmbientAudio) return;
    const audio = loadingAmbientAudio;
    const fadeSteps = 8;
    const startVolume = audio.volume;
    let step = 0;
    const fade = window.setInterval(() => {
      step += 1;
      audio.volume = Math.max(0, startVolume * (1 - step / fadeSteps));
      if (step >= fadeSteps) {
        window.clearInterval(fade);
        audio.pause();
      }
    }, 35);
  }

  /* ---------- Utilitaires audio partagés avec le reste du jeu ---------- */

  function getAudioCandidates(key, fallback) {
    const configured = window.ASTREA_AUDIO_CONFIG?.[key];
    if (Array.isArray(configured) && configured.length) return configured.filter(Boolean);
    if (typeof configured === "string" && configured.trim()) return [configured.trim()];
    return fallback;
  }

  function getMasterVolume() {
    const value = (typeof progress !== "undefined" && progress) ? progress.settings?.volume : undefined;
    return Math.max(0, Math.min(1, Number(value ?? 70) / 100));
  }

  function playOneShot(candidates, index = 0) {
    if (!candidates || index >= candidates.length) return null;
    if (getMasterVolume() <= 0) return null;
    const audio = new Audio(candidates[index]);
    audio.volume = getMasterVolume();
    audio.addEventListener("error", () => playOneShot(candidates, index + 1), { once: true });
    const promise = audio.play();
    if (promise?.catch) promise.catch(() => {});
    return audio;
  }
})();
/* ==========================================================================
   FIN DE LA VERSION V31
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V32
   ========================================================================== */
/* Chroniques d'Astréa V32 — Résolution d'écran
   Ajoute, dans les Paramètres, un sélecteur de résolution d'affichage pour le jeu
   ainsi qu'un bouton « Adaptation automatique » qui détecte la résolution de
   l'écran sur lequel le jeu est lancé et y adapte l'affichage.

   Remarque technique : une page web ne peut pas changer la résolution réelle du
   moniteur (restriction de sécurité des navigateurs). Ce réglage émule donc la
   résolution choisie en ajustant l'échelle d'affichage du jeu, comme si la
   fenêtre du navigateur faisait cette taille. L'option « Adaptation automatique »
   détecte la résolution réelle de l'écran (window.screen) et laisse le jeu
   occuper naturellement tout l'espace disponible, quelle que soit la machine.
*/
(() => {
  const RESOLUTION_PRESETS = {
    "1920x1080": "1920 × 1080 (Full HD)",
    "1366x768": "1366 × 768",
    "1536x864": "1536 × 864",
    "1280x720": "1280 × 720 (HD)",
    "1440x900": "1440 × 900",
    "1600x900": "1600 × 900",
    "1920x1200": "1920 × 1200",
    "1280x800": "1280 × 800",
    "1024x768": "1024 × 768",
    "2560x1440": "2560 × 1440 (QHD)",
    "3840x2160": "3840 × 2160 (4K UHD)"
  };
  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 2.2;

  let resizeTimer = null;

  document.addEventListener("DOMContentLoaded", () => {
    migrateV32Progress();
    cacheV32Dom();
    bindV32Events();
    renderResolutionSettings();
    applyStoredResolution();

    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(applyStoredResolution, 120);
    });
  });

  function migrateV32Progress() {
    if (!progress) return;
    progress.settings = { resolution: "auto", ...(progress.settings || {}) };
    if (!progress.settings.resolution) progress.settings.resolution = "auto";
    progress.version = Math.max(32, Number(progress.version || 0));
    saveProgress?.();
  }

  function cacheV32Dom() {
    const ids = ["resolution-select", "auto-resolution-btn", "resolution-status"];
    ids.forEach(id => { dom[toCamel(id)] = document.getElementById(id); });
  }

  function bindV32Events() {
    dom.resolutionSelect?.addEventListener("change", event => {
      setResolution(event.target.value);
    });
    dom.autoResolutionBtn?.addEventListener("click", () => {
      setResolution("auto");
      if (dom.resolutionSelect) dom.resolutionSelect.value = "auto";
    });
  }

  function setResolution(value) {
    if (!progress) return;
    progress.settings.resolution = value;
    saveProgress?.();
    applyStoredResolution();
  }

  function renderResolutionSettings() {
    if (!progress || !dom.resolutionSelect) return;
    dom.resolutionSelect.value = RESOLUTION_PRESETS[progress.settings.resolution]
      ? progress.settings.resolution
      : "auto";
  }

  /* ---------- Application de la résolution ---------- */

  function applyStoredResolution() {
    const value = progress?.settings?.resolution || "auto";
    const detected = getDetectedScreenResolution();

    if (value === "auto" || !RESOLUTION_PRESETS[value]) {
      resetToAutoAdaptation();
      updateStatus(`Adaptation automatique · Écran détecté : ${detected.width} × ${detected.height}`);
      return;
    }

    const [targetWidth, targetHeight] = value.split("x").map(Number);
    const zoom = computeZoom(targetWidth);
    applyZoom(zoom);
    updateStatus(`Résolution : ${RESOLUTION_PRESETS[value]} · Mise à l’échelle ${Math.round(zoom * 100)} % · Écran détecté : ${detected.width} × ${detected.height}`);
  }

  function resetToAutoAdaptation() {
    applyZoom(1, true);
  }

  function computeZoom(targetWidth) {
    if (!targetWidth) return 1;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || targetWidth;
    const zoom = viewportWidth / targetWidth;
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  }

  function applyZoom(zoom, isReset = false) {
    const html = document.documentElement;
    if (isReset) {
      html.style.zoom = "";
      html.style.removeProperty("zoom");
    } else {
      html.style.zoom = String(zoom);
    }
  }

  function getDetectedScreenResolution() {
    return {
      width: window.screen?.width || window.innerWidth || 0,
      height: window.screen?.height || window.innerHeight || 0
    };
  }

  function updateStatus(text) {
    if (dom.resolutionStatus) dom.resolutionStatus.textContent = text;
  }
})();
/* ==========================================================================
   FIN DE LA VERSION V32
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V33
   ========================================================================== */
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
  const CARDS_PER_HALF_PAGE = 4; // 2 colonnes x 2 rangées par page pour afficher chaque carte en entier
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
    el.setAttribute("aria-label", `${card.name}, coût ${card.cost}, ${typeLabel(card.type)}, ${owned > 0 ? `${owned} possédée(s), ${inDeck} dans le deck sur ${maxCopies}` : "non possédée"}`);
    el.title = `${card.name} — ${owned > 0 ? `Possédées ${owned} · Deck ${inDeck}/${maxCopies}` : "Non possédée"}`;
    el.innerHTML = `
      <span class="book-card-art">${getCardArtMarkup(card)}</span>
      <span class="book-card-info">${owned > 0 ? `Possédées ${owned} · Deck ${inDeck}/${maxCopies}` : "Non possédée"}</span>`;
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
/* ==========================================================================
   FIN DE LA VERSION V33
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V34
   ========================================================================== */
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
  const RAW_SERVER_URL = String(window.ASTREA_SERVER_URL || "").trim().replace(/\/+$/, "");
  const API_BASE_URL = RAW_SERVER_URL && !RAW_SERVER_URL.includes("REMPLACEZ-MOI") ? RAW_SERVER_URL : "";

  function buildApiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  function buildWebSocketUrl() {
    if (API_BASE_URL) return API_BASE_URL.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }

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

  let accountProgressReady = false;
  let progressSaveTimer = null;
  let progressSaveQueue = Promise.resolve();
  let lastProgressSyncWarningAt = 0;

  // Le moteur appelle ce hook à chaque saveProgress(), y compris depuis les
  // anciennes versions qui ont conservé une référence vers la fonction d'origine.
  window.astreaAccountProgressSync = snapshot => {
    if (!authToken || !accountProgressReady || !snapshot) return;
    scheduleAccountProgressSave(snapshot);
  };

  // -------------------------------------------------------------------
  // Utilitaires réseau
  // -------------------------------------------------------------------
  async function apiFetch(path, { method = "GET", body } = {}) {
    if (!API_BASE_URL && window.location.hostname.endsWith("github.io")) {
      throw new Error("Backend Render non configuré : renseignez son adresse dans server-url.js.");
    }
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    let res;
    try {
      res = await fetch(buildApiUrl(path), { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (_) {
      throw new Error("Serveur multijoueur injoignable. Veuillez contacter le support si le problème persiste.");
    }
    let data = {};
    try { data = await res.json(); } catch (_) { /* réponse vide */ }
    if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }

  function cloneProgressSnapshot(snapshot = progress) {
    if (!snapshot || typeof snapshot !== "object") return null;
    try { return JSON.parse(JSON.stringify(snapshot)); } catch (_) { return null; }
  }

  function scheduleAccountProgressSave(snapshot) {
    const safeSnapshot = cloneProgressSnapshot(snapshot);
    if (!safeSnapshot) return;
    window.clearTimeout(progressSaveTimer);
    progressSaveTimer = window.setTimeout(() => {
      progressSaveTimer = null;
      queueAccountProgressUpload(safeSnapshot, { silent: true });
    }, 450);
  }

  function queueAccountProgressUpload(snapshot, { silent = false } = {}) {
    const safeSnapshot = cloneProgressSnapshot(snapshot);
    if (!safeSnapshot || !authToken) return Promise.resolve(null);
    progressSaveQueue = progressSaveQueue
      .catch(() => null)
      .then(() => apiFetch("/api/progress", { method: "PUT", body: { progress: safeSnapshot } }))
      .catch(err => {
        if (!silent || Date.now() - lastProgressSyncWarningAt > 30000) {
          lastProgressSyncWarningAt = Date.now();
          showToast(`Sauvegarde en ligne impossible : ${escapeHtml(err.message)}`);
        }
        return null;
      });
    return progressSaveQueue;
  }

  async function flushAccountProgressSave() {
    if (!authToken || !accountProgressReady) return null;
    window.clearTimeout(progressSaveTimer);
    progressSaveTimer = null;
    return queueAccountProgressUpload(progress, { silent: true });
  }

  async function activateAccountProgress(fallbackSnapshot, { isRegistration = false } = {}) {
    accountProgressReady = false;
    window.clearTimeout(progressSaveTimer);
    progressSaveTimer = null;

    const remote = await apiFetch("/api/progress");
    const cachedAccountProgress = readStoredProgressForCurrentProfile();
    const fallback = cloneProgressSnapshot(fallbackSnapshot);
    const chosen = remote.progress || (isRegistration ? fallback : (cachedAccountProgress || fallback));

    if (chosen) {
      storeProgressForCurrentProfile(chosen);
      reloadProgressForCurrentProfile();
    }

    accountProgressReady = true;

    // On renvoie aussi l'état normalisé au serveur : cela enregistre immédiatement
    // une nouvelle progression et applique les éventuelles migrations du jeu.
    if (chosen) {
      await queueAccountProgressUpload(progress, { silent: Boolean(remote.progress) });
    }
  }

  function returnToGuestProgress() {
    accountProgressReady = false;
    window.clearTimeout(progressSaveTimer);
    progressSaveTimer = null;
    reloadProgressForCurrentProfile();
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
    const localSnapshot = cloneProgressSnapshot(progress);
    authToken = savedToken;
    try {
      const me = await apiFetch("/api/me");
      setSession(savedToken, me.username);
      await activateAccountProgress(localSnapshot);
      connectWebSocket();
      refreshFriends();
    } catch (_) {
      setSession(null, null);
      returnToGuestProgress();
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
    const modeUsed = authMode;
    const localSnapshot = cloneProgressSnapshot(progress);
    dom.authError?.classList.add("hidden");
    if (dom.authSubmitBtn) dom.authSubmitBtn.disabled = true;
    try {
      const data = await apiFetch(modeUsed === "login" ? "/api/login" : "/api/register", {
        method: "POST", body: { username: rawUsername, password }
      });
      setSession(data.token, data.username);
      await activateAccountProgress(localSnapshot, { isRegistration: modeUsed === "register" });
      connectWebSocket();
      refreshFriends();
      closeAuthModal();
      showToast(`Bienvenue, <strong>${escapeHtml(data.username)}</strong> ! Votre progression est synchronisée.`);
    } catch (err) {
      if (username) {
        setSession(null, null);
        returnToGuestProgress();
      }
      if (dom.authError) { dom.authError.textContent = err.message; dom.authError.classList.remove("hidden"); }
    } finally {
      if (dom.authSubmitBtn) dom.authSubmitBtn.disabled = false;
    }
  }

  async function logout() {
    await flushAccountProgressSave();
    accountProgressReady = false;
    try { await apiFetch("/api/logout", { method: "POST" }); } catch (_) { /* ignore */ }
    ws?.close();
    setSession(null, null);
    returnToGuestProgress();
    dom.accountMenu?.classList.add("hidden");
  }

  function openDeleteAccountModal() {
    dom.accountMenu?.classList.add("hidden");
    dom.deleteAccountPassword.value = "";
    dom.deleteAccountError?.classList.add("hidden");
    dom.deleteAccountModal?.classList.remove("hidden");
    window.setTimeout(() => dom.deleteAccountPassword?.focus(), 30);
  }

  function closeDeleteAccountModal() {
    dom.deleteAccountModal?.classList.add("hidden");
  }

  async function deleteAccount() {
    const password = String(dom.deleteAccountPassword?.value || "");
    if (!password) {
      if (dom.deleteAccountError) {
        dom.deleteAccountError.textContent = "Saisissez votre mot de passe.";
        dom.deleteAccountError.classList.remove("hidden");
      }
      return;
    }
    if (!window.confirm("Supprimer définitivement ce compte et toute sa progression ? Cette action est irréversible.")) return;

    if (dom.deleteAccountConfirmBtn) dom.deleteAccountConfirmBtn.disabled = true;
    dom.deleteAccountError?.classList.add("hidden");
    try {
      await apiFetch("/api/account", { method: "DELETE", body: { password } });
      accountProgressReady = false;
      ws?.close();
      setSession(null, null);
      returnToGuestProgress();
      closeDeleteAccountModal();
      showToast("Compte et progression supprimés définitivement.");
    } catch (err) {
      if (dom.deleteAccountError) {
        dom.deleteAccountError.textContent = err.message;
        dom.deleteAccountError.classList.remove("hidden");
      }
    } finally {
      if (dom.deleteAccountConfirmBtn) dom.deleteAccountConfirmBtn.disabled = false;
    }
  }

  // -------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------
  function connectWebSocket() {
    if (!authToken) return;
    window.clearTimeout(wsReconnectTimer);
    try {
      ws = new WebSocket(`${buildWebSocketUrl()}/ws?token=${encodeURIComponent(authToken)}`);
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
    draggedPayload = null;
    // L'invité verrouille son interface lorsqu'il termine son tour. Ce verrou
    // doit être recalculé à chaque état reçu, sinon il reste actif au tour
    // suivant et les deux joueurs se retrouvent bloqués.
    interactionLocked = gameState?.status !== "playing" || gameState.activePlayerId !== "player";
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
    if (!gameState || gameState.status !== "playing" || gameState.activePlayerId !== "ai") return;
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
      "auth-btn", "account-menu", "account-logout-btn", "account-delete-btn", "friends-btn", "friends-badge",
      "auth-modal", "auth-modal-close-btn", "auth-tab-login", "auth-tab-register", "auth-form",
      "delete-account-modal", "delete-account-close-btn", "delete-account-password",
      "delete-account-error", "delete-account-confirm-btn",
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
    dom.accountDeleteBtn?.addEventListener("click", openDeleteAccountModal);
    dom.deleteAccountCloseBtn?.addEventListener("click", closeDeleteAccountModal);
    dom.deleteAccountModal?.addEventListener("click", event => {
      if (event.target === dom.deleteAccountModal) closeDeleteAccountModal();
    });
    dom.deleteAccountConfirmBtn?.addEventListener("click", deleteAccount);
    dom.deleteAccountPassword?.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); deleteAccount(); }
    });
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
/* ==========================================================================
   FIN DE LA VERSION V34
   ========================================================================== */

/* ==========================================================================
   DÉBUT DE LA VERSION V36
   ========================================================================== */
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
/* ==========================================================================
   FIN DE LA VERSION V36
   ========================================================================== */


/* ==========================================================================
   DÉBUT DE LA VERSION V37
   ========================================================================== */
/* Chroniques d'Astréa V37 — Collection séparée, enchantements et impacts
   -----------------------------------------------------------------------
   - Le bouton Collection ouvre désormais une galerie indépendante affichant
     toutes les cartes, leur description et les cartes non possédées grisées.
   - Le bouton Decks conserve l'atelier des decks et son livre actuel.
   - Un doublon disponible peut être consommé pour enchanter définitivement
     une carte et lui donner une aura dorée dans les menus et en combat.
   - Les dégâts de 9 ou plus font trembler le plateau.
   - Les variations de coût des cartes en main sont animées.
*/
(() => {
  const ENCHANT_DUPLICATE_COST = 1;
  const LARGE_DAMAGE_THRESHOLD = 9;
  const IMPACT_COOLDOWN_MS = 240;
  const NOTICE_DURATION_MS = 3200;

  let cardLibraryNoticeTimer = null;
  let previousHandCosts = new Map();
  let trackedGameState = null;
  let lastImpactAt = 0;

  /* --------------------------- Persistance V37 --------------------------- */

  const originalLoadProgressV37 = loadProgress;
  loadProgress = function () {
    const raw = typeof readStoredProgressForCurrentProfile === "function"
      ? readStoredProgressForCurrentProfile()
      : null;
    const loadedProgress = originalLoadProgressV37.apply(this, arguments);

    loadedProgress.enchantedCards = sanitizeBooleanMap(raw?.enchantedCards || loadedProgress.enchantedCards);
    loadedProgress.enchantmentSpentCopies = sanitizeNumberMap(raw?.enchantmentSpentCopies || loadedProgress.enchantmentSpentCopies);

    // La collection enregistrée contient le nombre net de cartes. On rajoute
    // temporairement les doublons déjà consommés avant d'appliquer le minimum
    // de la collection de départ, puis on les retire à nouveau. Cela empêche
    // un doublon de départ consommé de réapparaître au prochain chargement.
    COLLECTIBLE_CARDS.forEach(card => {
      const spent = Math.max(0, Number(loadedProgress.enchantmentSpentCopies[card.id] || 0));
      const storedNet = Math.max(0, Number(raw?.collection?.[card.id] ?? loadedProgress.collection?.[card.id] ?? 0));
      const grossOwned = storedNet + spent;
      const starterMinimum = Math.max(0, Number(STARTER_COLLECTION_COUNTS[card.id] || 0));
      loadedProgress.collection[card.id] = Math.max(0, Math.max(starterMinimum, grossOwned) - spent);
    });

    loadedProgress.version = Math.max(37, Number(loadedProgress.version || 0));
    try { storageSet(getProgressStorageKey(), JSON.stringify(loadedProgress)); } catch (_) { /* stockage indisponible */ }
    return loadedProgress;
  };

  function sanitizeBooleanMap(value) {
    const result = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;
    Object.entries(value).forEach(([cardId, enabled]) => {
      if (CARD_BY_ID[cardId] && enabled) result[cardId] = true;
    });
    return result;
  }

  function sanitizeNumberMap(value) {
    const result = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;
    Object.entries(value).forEach(([cardId, amount]) => {
      if (!CARD_BY_ID[cardId]) return;
      const normalized = Math.max(0, Math.floor(Number(amount || 0)));
      if (normalized) result[cardId] = normalized;
    });
    return result;
  }

  function ensureEnchantProgress() {
    if (!progress) return;
    progress.enchantedCards = sanitizeBooleanMap(progress.enchantedCards);
    progress.enchantmentSpentCopies = sanitizeNumberMap(progress.enchantmentSpentCopies);
    progress.version = Math.max(37, Number(progress.version || 0));
  }

  function isCardEnchanted(cardId) {
    return Boolean(progress?.enchantedCards?.[cardId]);
  }

  /* ------------------------- Écrans Collection / Deck -------------------- */

  const openDeckWorkshopV37 = openCollection;
  openCollection = function (event) {
    if (event?.currentTarget?.id === "open-collection-btn") {
      openCardLibrary();
      return;
    }
    return openDeckWorkshopV37.apply(this, arguments);
  };

  const originalShowMainMenuV37 = showMainMenu;
  showMainMenu = function () {
    dom.cardLibraryScreen?.classList.add("hidden");
    return originalShowMainMenuV37.apply(this, arguments);
  };

  const originalReloadProgressV37 = reloadProgressForCurrentProfile;
  reloadProgressForCurrentProfile = function () {
    const result = originalReloadProgressV37.apply(this, arguments);
    ensureEnchantProgress();
    if (dom.cardLibraryScreen && !dom.cardLibraryScreen.classList.contains("hidden")) renderCardLibrary();
    return result;
  };

  function openCardLibrary() {
    ensureEnchantProgress();
    document.querySelectorAll("#app > .screen").forEach(screen => screen.classList.add("hidden"));
    dom.cardLibraryScreen?.classList.remove("hidden");
    renderCardLibrary();
  }

  function cacheCardLibraryDom() {
    [
      "card-library-screen", "card-library-back-btn", "card-library-search",
      "card-library-type-filter", "card-library-cost-filter",
      "card-library-ownership-filter", "card-library-grid",
      "card-library-owned-summary", "card-library-enchanted-summary",
      "card-library-notice"
    ].forEach(id => { dom[toCamel(id)] = document.getElementById(id); });
  }

  function bindCardLibraryEvents() {
    dom.cardLibraryBackBtn?.addEventListener("click", showMainMenu);
    dom.cardLibrarySearch?.addEventListener("input", renderCardLibrary);
    dom.cardLibraryTypeFilter?.addEventListener("change", renderCardLibrary);
    dom.cardLibraryCostFilter?.addEventListener("change", renderCardLibrary);
    dom.cardLibraryOwnershipFilter?.addEventListener("change", renderCardLibrary);
  }

  function renderCardLibrary() {
    if (!progress || !dom.cardLibraryGrid) return;
    ensureEnchantProgress();

    const search = normalizeText(dom.cardLibrarySearch?.value || "");
    const type = dom.cardLibraryTypeFilter?.value || "all";
    const costFilter = dom.cardLibraryCostFilter?.value || "all";
    const ownership = dom.cardLibraryOwnershipFilter?.value || "all";

    const cards = COLLECTIBLE_CARDS
      .filter(card => type === "all" || card.type === type)
      .filter(card => !search || normalizeText(`${card.name} ${card.description} ${typeLabel(card.type)} ${card.rarity}`).includes(search))
      .filter(card => costMatches(card.cost, costFilter))
      .filter(card => {
        const owned = Number(progress.collection?.[card.id] || 0);
        if (ownership === "owned") return owned > 0;
        if (ownership === "unowned") return owned <= 0;
        if (ownership === "enchanted") return isCardEnchanted(card.id);
        return true;
      })
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "fr"));

    dom.cardLibraryGrid.innerHTML = "";
    if (!cards.length) {
      const empty = document.createElement("div");
      empty.className = "library-empty-state";
      empty.textContent = "Aucune carte ne correspond à ces filtres.";
      dom.cardLibraryGrid.appendChild(empty);
    } else {
      cards.forEach(card => dom.cardLibraryGrid.appendChild(buildLibraryCard(card)));
    }

    const ownedDistinct = COLLECTIBLE_CARDS.filter(card => Number(progress.collection?.[card.id] || 0) > 0).length;
    const enchantedCount = COLLECTIBLE_CARDS.filter(card => isCardEnchanted(card.id)).length;
    if (dom.cardLibraryOwnedSummary) dom.cardLibraryOwnedSummary.textContent = `${ownedDistinct} / ${COLLECTIBLE_CARDS.length}`;
    if (dom.cardLibraryEnchantedSummary) dom.cardLibraryEnchantedSummary.textContent = `${enchantedCount} carte${enchantedCount > 1 ? "s" : ""} enchantée${enchantedCount > 1 ? "s" : ""}`;
  }

  function buildLibraryCard(card) {
    const owned = Math.max(0, Number(progress.collection?.[card.id] || 0));
    const reserved = getReservedCopiesAcrossDecks(card.id);
    const protectedCopies = Math.max(1, reserved);
    const availableDuplicates = Math.max(0, owned - protectedCopies);
    const enchanted = isCardEnchanted(card.id);
    const canEnchant = owned > 0 && !enchanted && availableDuplicates >= ENCHANT_DUPLICATE_COST;

    const el = document.createElement("article");
    el.className = `library-card rarity-${card.rarity}${owned <= 0 ? " unowned" : ""}${enchanted ? " enchanted-card" : ""}`;
    el.dataset.cardId = card.id;

    const enchantLabel = enchanted
      ? "✦ Carte enchantée"
      : owned <= 0
        ? "Carte non possédée"
        : canEnchant
          ? `Enchanter · ${ENCHANT_DUPLICATE_COST} doublon`
          : "Aucun doublon disponible";

    el.innerHTML = `
      <div class="library-card-head"><span class="library-card-cost">${card.cost}</span><span class="library-card-rarity">${escapeHtml(rarityLabelV37(card.rarity))}</span></div>
      <div class="library-card-art">${getCardArtMarkup(card)}</div>
      <div class="library-card-title"><strong>${escapeHtml(card.name)}</strong><span>${escapeHtml(typeLabel(card.type))}</span></div>
      <p class="library-card-description">${escapeHtml(card.description || "Aucune description.")}</p>
      <div class="library-card-footer">
        <span class="library-card-owned">${owned > 0 ? `Possédées : ${owned} · Doublons disponibles : ${availableDuplicates}` : "Non possédée"}</span>
        <button class="library-card-enchant-btn" type="button" ${canEnchant ? "" : "disabled"}>${escapeHtml(enchantLabel)}</button>
      </div>`;

    bindCardImageFallback(el, card);
    el.addEventListener("mouseenter", () => {
      if (typeof previewCard === "function" && gameState) previewCard(card);
    });
    const button = el.querySelector(".library-card-enchant-btn");
    button?.addEventListener("click", () => enchantCard(card.id));
    return el;
  }

  function rarityLabelV37(rarity) {
    return ({ common: "Commune", rare: "Rare", epic: "Épique", legendary: "Légendaire" })[rarity] || rarity || "Carte";
  }

  function getReservedCopiesAcrossDecks(cardId) {
    if (!Array.isArray(progress?.decks)) return Number(countIds(progress?.deck || [])[cardId] || 0);
    return progress.decks.reduce((highest, deck) => {
      const amount = Number(countIds(deck?.cards || [])[cardId] || 0);
      return Math.max(highest, amount);
    }, 0);
  }

  function enchantCard(cardId) {
    ensureEnchantProgress();
    const card = CARD_BY_ID[cardId];
    if (!card || isCardEnchanted(cardId)) return;

    const owned = Math.max(0, Number(progress.collection?.[cardId] || 0));
    const protectedCopies = Math.max(1, getReservedCopiesAcrossDecks(cardId));
    const availableDuplicates = Math.max(0, owned - protectedCopies);
    if (availableDuplicates < ENCHANT_DUPLICATE_COST) {
      showCardLibraryNotice("Ce doublon est nécessaire à l’un de vos decks ou vous ne possédez qu’un seul exemplaire.");
      renderCardLibrary();
      return;
    }

    progress.collection[cardId] = Math.max(0, owned - ENCHANT_DUPLICATE_COST);
    progress.enchantmentSpentCopies[cardId] = Math.max(0, Number(progress.enchantmentSpentCopies[cardId] || 0)) + ENCHANT_DUPLICATE_COST;
    progress.enchantedCards[cardId] = true;
    saveProgress();
    showCardLibraryNotice(`${card.name} est désormais enchantée et entourée d’une aura dorée.`);
    renderCardLibrary();
    decorateDeckWorkshopCards();
  }

  function showCardLibraryNotice(message) {
    if (!dom.cardLibraryNotice) return;
    clearTimeout(cardLibraryNoticeTimer);
    dom.cardLibraryNotice.textContent = message;
    dom.cardLibraryNotice.classList.add("visible");
    cardLibraryNoticeTimer = window.setTimeout(() => dom.cardLibraryNotice?.classList.remove("visible"), NOTICE_DURATION_MS);
  }

  /* ------------------------- Aura dorée dans le jeu ---------------------- */

  const originalRenderCollectionV37 = renderCollection;
  renderCollection = function () {
    const result = originalRenderCollectionV37.apply(this, arguments);
    decorateDeckWorkshopCards();
    return result;
  };

  const originalRenderDeckEditorV37 = renderDeckEditor;
  renderDeckEditor = function () {
    const result = originalRenderDeckEditorV37.apply(this, arguments);
    decorateDeckWorkshopCards();
    return result;
  };

  function decorateDeckWorkshopCards() {
    if (!dom.collectionScreen) return;
    dom.collectionScreen.querySelectorAll("[data-card-id]").forEach(el => {
      el.classList.toggle("enchanted-card", isCardEnchanted(el.dataset.cardId));
    });
  }

  const originalCreateMinionElementV37 = createMinionElement;
  createMinionElement = function (minion) {
    const el = originalCreateMinionElementV37.apply(this, arguments);
    if (el && minion?.cardId && isCardEnchanted(minion.cardId)) el.classList.add("enchanted-card");
    return el;
  };

  const originalPreviewCardV37 = previewCard;
  previewCard = function (card) {
    const result = originalPreviewCardV37.apply(this, arguments);
    if (dom.cardPreview) {
      dom.cardPreview.classList.add("card-preview");
      dom.cardPreview.classList.toggle("enchanted-card", Boolean(card?.id && isCardEnchanted(card.id)));
    }
    return result;
  };

  const originalRenderMenuSummaryV37 = renderMenuSummary;
  renderMenuSummary = function () {
    const result = originalRenderMenuSummaryV37.apply(this, arguments);
    const enchantedCount = COLLECTIBLE_CARDS.filter(card => isCardEnchanted(card.id)).length;
    if (dom.collectionSummary && enchantedCount > 0 && !dom.collectionSummary.textContent.includes("enchantée")) {
      dom.collectionSummary.textContent += ` · ${enchantedCount} enchantée${enchantedCount > 1 ? "s" : ""}`;
    }
    return result;
  };

  /* ---------------------- Animation des coûts de mana ------------------- */

  const originalRenderHandV37 = renderHand;
  renderHand = function () {
    if (trackedGameState !== gameState) {
      trackedGameState = gameState;
      previousHandCosts = new Map();
    }

    const currentCosts = new Map();
    const handInstances = new Map();
    (gameState?.player?.hand || []).forEach(instance => {
      currentCosts.set(instance.instanceId, getCardCost(instance, "player"));
      handInstances.set(instance.instanceId, instance);
    });

    const changes = [];
    currentCosts.forEach((cost, instanceId) => {
      if (previousHandCosts.has(instanceId)) {
        const oldCost = previousHandCosts.get(instanceId);
        if (oldCost !== cost) changes.push({ instanceId, oldCost, cost });
        return;
      }
      const instance = handInstances.get(instanceId);
      const printedCost = Number(CARD_BY_ID[instance?.cardId]?.cost || 0);
      if (printedCost !== cost) changes.push({ instanceId, oldCost: printedCost, cost });
    });

    const result = originalRenderHandV37.apply(this, arguments);

    Array.from(dom.playerHand?.children || []).forEach(el => {
      const instance = handInstances.get(el.dataset.instanceId);
      if (!instance) return;
      el.dataset.cardId = instance.cardId;
      el.classList.toggle("enchanted-card", isCardEnchanted(instance.cardId));
    });

    changes.forEach(change => {
      const el = Array.from(dom.playerHand?.children || []).find(cardEl => cardEl.dataset.instanceId === change.instanceId);
      if (el) animateManaCostChange(el, change.oldCost, change.cost);
    });

    previousHandCosts = currentCosts;
    return result;
  };

  function animateManaCostChange(cardEl, previousCost, currentCost) {
    const reduced = currentCost < previousCost;
    const difference = Math.abs(currentCost - previousCost);
    const cardClass = reduced ? "mana-cost-reduced" : "mana-cost-increased";
    const orbClass = reduced ? "mana-orb-reduced" : "mana-orb-increased";

    cardEl.classList.remove("mana-cost-reduced", "mana-cost-increased");
    void cardEl.offsetWidth;
    cardEl.classList.add(cardClass);

    const costOrb = cardEl.querySelector(".card-cost");
    if (costOrb) {
      costOrb.classList.remove("mana-orb-reduced", "mana-orb-increased");
      void costOrb.offsetWidth;
      costOrb.classList.add(orbClass);
    }

    const label = document.createElement("span");
    label.className = `mana-change-label ${reduced ? "reduced" : "increased"}`;
    label.textContent = `${reduced ? "−" : "+"}${difference} mana`;
    cardEl.appendChild(label);

    window.setTimeout(() => {
      label.remove();
      cardEl.classList.remove(cardClass);
      costOrb?.classList.remove(orbClass);
    }, 900);
  }

  /* ------------------------ Tremblement gros dégâts --------------------- */

  const originalDealDamageToHeroV37 = dealDamageToHero;
  dealDamageToHero = function (ownerId, amount) {
    const inflicted = originalDealDamageToHeroV37.apply(this, arguments);
    maybeTriggerLargeDamageImpact(amount, inflicted);
    return inflicted;
  };

  const originalDealDamageToMinionV37 = dealDamageToMinion;
  dealDamageToMinion = function (minion, amount) {
    const inflicted = originalDealDamageToMinionV37.apply(this, arguments);
    maybeTriggerLargeDamageImpact(amount, inflicted);
    return inflicted;
  };

  function maybeTriggerLargeDamageImpact(attemptedDamage, inflictedDamage) {
    if (Number(attemptedDamage || 0) < LARGE_DAMAGE_THRESHOLD || Number(inflictedDamage || 0) <= 0) return;
    const now = Date.now();
    if (now - lastImpactAt < IMPACT_COOLDOWN_MS) return;
    lastImpactAt = now;
    triggerLargeDamageImpact();
  }

  function triggerLargeDamageImpact() {
    const battlefield = document.querySelector(".battlefield");
    if (!battlefield || dom.gameScreen?.classList.contains("hidden")) return;

    battlefield.classList.remove("massive-damage-impact");
    void battlefield.offsetWidth;
    battlefield.classList.add("massive-damage-impact");

    battlefield.querySelectorAll(".massive-impact-wave,.massive-impact-flash").forEach(el => el.remove());
    const wave = document.createElement("span");
    wave.className = "massive-impact-wave";
    const flash = document.createElement("span");
    flash.className = "massive-impact-flash";
    battlefield.append(flash, wave);

    window.setTimeout(() => {
      battlefield.classList.remove("massive-damage-impact");
      wave.remove();
      flash.remove();
    }, 700);
  }

  document.addEventListener("DOMContentLoaded", () => {
    cacheCardLibraryDom();
    bindCardLibraryEvents();
    ensureEnchantProgress();
    saveProgress();
    decorateDeckWorkshopCards();
  });
})();
/* ==========================================================================
   FIN DE LA VERSION V37
   ========================================================================== */
