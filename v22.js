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
