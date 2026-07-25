/*
  Chroniques d'Astréa — moteur vanilla JavaScript V18.
  Fonctionnalités : quêtes, armes, attaques du héros, pouvoirs héroïques, secrets,
  effets composés, choix multiples, transformations et deck persistant.
*/
"use strict";

const CONFIG = {
  HERO_START_HEALTH: 30,
  MAX_MANA: 10,
  MAX_BOARD: 7,
  MAX_HAND: 10,
  MAX_SECRETS: 5,
  STARTING_HAND: 3,
  DECK_SIZE: 30,
  AI_ACTION_DELAY: 360,
  PACK_SIZE: 5,
  STARTER_COINS: 500
};

const STORAGE_KEY = "astrea_tcg_progress_v8";
const AUTH_USERNAME_STORAGE_KEY = "astrea_auth_username";
const CARD_BY_ID = Object.fromEntries(CARDS.map(card => [card.id, card]));
const COLLECTIBLE_CARDS = CARDS.filter(card => card.collectible !== false && card.type !== "token");

const STARTER_COLLECTION_COUNTS = buildStarterCollectionCounts();

const HERO_POWER_DEFINITIONS = {
  couronne_astrale: {
    name: "Couronne astrale",
    image: "assets/ui/hero_power_reine_celeste.png",
    description: "Déploie une bénédiction stellaire et gagne 2 points d’Armure.",
    cost: 2,
    effectType: "armor"
  },
  egide_lunaire: {
    name: "Égide lunaire",
    image: "assets/ui/hero_power_pretresse_lunaire.png",
    description: "Tisse un voile lunaire et gagne 2 points d’Armure.",
    cost: 2,
    effectType: "armor"
  },
  rayon_du_zenith: {
    name: "Rayon du zénith",
    image: "assets/ui/hero_power_roi_solaire.png",
    description: "Inflige 1 dégât à une cible.",
    cost: 2,
    effectType: "damage"
  },
  faille_du_vide: {
    name: "Faille du vide",
    image: "assets/ui/hero_power_sorceleur_du_vide.png",
    description: "Inflige 1 dégât à une cible.",
    cost: 2,
    effectType: "damage"
  }
};

const HERO_DEFINITIONS = {
  reine_celeste: { id: "reine_celeste", name: "Reine céleste", subtitle: "Maîtresse des constellations", portrait: "assets/heroes/hero_reine_celeste.png", powerType: "couronne_astrale" },
  pretresse_lunaire: { id: "pretresse_lunaire", name: "Prêtresse lunaire", subtitle: "Gardienne des songes", portrait: "assets/heroes/hero_pretresse_lunaire.png", powerType: "egide_lunaire" },
  roi_solaire: { id: "roi_solaire", name: "Roi solaire", subtitle: "Souverain du zénith", portrait: "assets/heroes/hero_roi_solaire.png", powerType: "rayon_du_zenith" },
  sorceleur_du_vide: { id: "sorceleur_du_vide", name: "Sorceleur du vide", subtitle: "Maître du néant", portrait: "assets/heroes/hero_sorceleur_du_vide.png", powerType: "faille_du_vide" }
};

const DEFAULT_PLAYER_HERO_ID = "reine_celeste";
const DEFAULT_AI_HERO_ID = "sorceleur_du_vide";

const ADVENTURE_ENCOUNTERS = [
  {
    id: "chapter_1_moon", chapter: "Chapitre I", title: "Les Veilleurs de la Lune",
    subtitle: "Brisez le premier sceau lunaire.", heroId: "pretresse_lunaire",
    health: 24, startingArmor: 2, packTheme: "astral", maxCardCost: 4,
    signatureCards: ["creature_001", "creature_006", "spell_019", "spell_021"],
    rewards: [{ type: "coins", amount: 100 }],
    flavor: "La Prêtresse lunaire protège l’accès au sentier des constellations."
  },
  {
    id: "chapter_1_sun", chapter: "Chapitre I", title: "Le Champion du Zénith",
    subtitle: "Affrontez la lumière du royaume solaire.", heroId: "roi_solaire",
    health: 28, startingArmor: 0, packTheme: "zenith", maxCardCost: 6,
    signatureCards: ["creature_018", "creature_022", "spell_022", "weapon_003"],
    rewards: [{ type: "card", cardId: "creature_018", amount: 1 }],
    flavor: "Le Roi solaire ne laissera aucun voyageur profaner son sanctuaire."
  },
  {
    id: "chapter_2_rift", chapter: "Chapitre II", title: "La Faille Pourpre",
    subtitle: "Repoussez les premières légions du Néant.", heroId: "sorceleur_du_vide",
    health: 30, startingArmor: 4, packTheme: "neant", maxCardCost: 7,
    signatureCards: ["creature_021", "creature_026", "spell_023", "spell_026"],
    rewards: [{ type: "pack", packId: "neant", amount: 1 }],
    flavor: "Une faille vivante déverse des serviteurs corrompus sur Astréa."
  },
  {
    id: "chapter_2_crown", chapter: "Chapitre II", title: "La Couronne des Astres",
    subtitle: "Prouvez votre valeur devant la souveraine.", heroId: "reine_celeste",
    health: 32, startingArmor: 4, packTheme: "astral", maxCardCost: 8,
    signatureCards: ["creature_033", "creature_034", "spell_027", "spell_032"],
    rewards: [{ type: "coins", amount: 150 }, { type: "pack", packId: "astral", amount: 1 }],
    flavor: "La Reine céleste vous soumet à une épreuve avant la bataille finale."
  },
  {
    id: "chapter_3_throne", chapter: "Chapitre III", title: "Le Trône du Soleil",
    subtitle: "Survivez au jugement du zénith.", heroId: "roi_solaire",
    health: 36, startingArmor: 6, packTheme: "zenith", maxCardCost: 10,
    signatureCards: ["creature_038", "creature_040", "spell_034", "weapon_004"],
    rewards: [{ type: "pack", packId: "zenith", amount: 1 }, { type: "coins", amount: 180 }],
    flavor: "Le dernier rempart de lumière exige une victoire sans compromis."
  },
  {
    id: "chapter_3_void", chapter: "Chapitre III", title: "Le Cœur du Néant",
    subtitle: "Vainquez le maître de la corruption astrale.", heroId: "sorceleur_du_vide",
    health: 40, startingArmor: 8, packTheme: "neant", maxCardCost: 18,
    signatureCards: ["creature_035", "creature_039", "spell_035", "spell_037"],
    rewards: [{ type: "randomCard", rarity: "legendary", amount: 1 }, { type: "coins", amount: 300 }],
    flavor: "Au centre du Néant, le sorceleur rassemble assez de puissance pour consumer les constellations."
  }
];

const EXTENDED_ADVENTURE_CHAPTERS = [
  { chapter:"Chapitre IV", name:"Les Jardins de l’Aube", battles:[
    { title:"La Sentinelle des Pétales", subtitle:"Écartez la gardienne du jardin solaire." },
    { title:"Le Cœur du Jardin", subtitle:"Purifiez la graine qui dévore la lumière." }
  ]},
  { chapter:"Chapitre V", name:"La Mer de Cristal", battles:[
    { title:"Le Navigateur de Saphir", subtitle:"Traversez les courants de mana gelé." },
    { title:"Le Léviathan miroitant", subtitle:"Abattez le monstre caché sous les vagues." }
  ]},
  { chapter:"Chapitre VI", name:"Les Forges de Sol", battles:[
    { title:"Le Maître des Enclumes", subtitle:"Résistez aux armes forgées dans une étoile." },
    { title:"Le Colosse incandescent", subtitle:"Éteignez le gardien de métal solaire." }
  ]},
  { chapter:"Chapitre VII", name:"Le Labyrinthe Lunaire", battles:[
    { title:"L’Oracle aux mille chemins", subtitle:"Déjouez les visions du labyrinthe." },
    { title:"La Reine des Reflets", subtitle:"Affrontez votre propre ombre lunaire." }
  ]},
  { chapter:"Chapitre VIII", name:"Les Marches du Vide", battles:[
    { title:"Le Porteur de Faille", subtitle:"Fermez la brèche avant l’arrivée des légions." },
    { title:"L’Abomination d’Obsidienne", subtitle:"Brisez la créature nourrie par le Néant." }
  ]},
  { chapter:"Chapitre IX", name:"La Cour des Comètes", battles:[
    { title:"La Duelliste filante", subtitle:"Survivez à la danse des comètes." },
    { title:"Le Prince météorique", subtitle:"Faites tomber l’héritier du ciel en flammes." }
  ]},
  { chapter:"Chapitre X", name:"Les Ruines d’Orion", battles:[
    { title:"Le Gardien enseveli", subtitle:"Réveillez l’ancien protecteur des ruines." },
    { title:"Le Roi sans constellation", subtitle:"Rendez son nom au souverain oublié." }
  ]},
  { chapter:"Chapitre XI", name:"Le Palais des Échos", battles:[
    { title:"La Cantatrice astrale", subtitle:"Rompez le chant qui copie chaque sort." },
    { title:"Le Maître des Résonances", subtitle:"Faites taire le palais vivant." }
  ]},
  { chapter:"Chapitre XII", name:"La Tempête de Saphir", battles:[
    { title:"Le Chevaucheur d’Éclairs", subtitle:"Tenez bon sous les éclairs stellaires." },
    { title:"L’Œil de la Tempête", subtitle:"Pénétrez au centre du cyclone magique." }
  ]},
  { chapter:"Chapitre XIII", name:"Les Portes du Crépuscule", battles:[
    { title:"La Gardienne du Seuil", subtitle:"Obtenez le droit de franchir les portes." },
    { title:"Le Juge du Crépuscule", subtitle:"Affrontez celui qui pèse les âmes." }
  ]},
  { chapter:"Chapitre XIV", name:"La Citadelle des Astres", battles:[
    { title:"Le Capitaine des Remparts", subtitle:"Percez la première ligne de défense." },
    { title:"L’Archonte de la Citadelle", subtitle:"Prenez le contrôle du bastion céleste." }
  ]},
  { chapter:"Chapitre XV", name:"Le Royaume Renversé", battles:[
    { title:"Le Chevalier inversé", subtitle:"Combattez dans un monde où tout s’oppose." },
    { title:"La Souveraine à l’envers", subtitle:"Rétablissez l’ordre du royaume fracturé." }
  ]},
  { chapter:"Chapitre XVI", name:"Le Siège du Zénith", battles:[
    { title:"Le Briseur de murailles", subtitle:"Stoppez l’assaut contre le royaume solaire." },
    { title:"Le Général des Cendres", subtitle:"Mettez fin au siège du Zénith." }
  ]},
  { chapter:"Chapitre XVII", name:"Les Profondeurs Astrales", battles:[
    { title:"La Murène cosmique", subtitle:"Descendez sous la mer d’étoiles." },
    { title:"Le Titan des Abysses", subtitle:"Réveillez puis terrassez le géant englouti." }
  ]},
  { chapter:"Chapitre XVIII", name:"Le Fleuve du Temps", battles:[
    { title:"Le Passeur des Âges", subtitle:"Traversez les souvenirs du monde." },
    { title:"Le Dragon des Heures", subtitle:"Empêchez le temps de se refermer sur vous." }
  ]},
  { chapter:"Chapitre XIX", name:"La Guerre des Couronnes", battles:[
    { title:"Le Héraut solaire", subtitle:"Défiez le champion de la couronne d’or." },
    { title:"La Reine des Constellations", subtitle:"Remportez le duel des souverains." }
  ]},
  { chapter:"Chapitre XX", name:"Le Sanctuaire Brisé", battles:[
    { title:"Le Prêtre des Fragments", subtitle:"Rassemblez les morceaux du sanctuaire." },
    { title:"L’Idole éclatée", subtitle:"Détruisez le dieu né des ruines." }
  ]},
  { chapter:"Chapitre XXI", name:"Le Chant des Titans", battles:[
    { title:"Le Chœur de pierre", subtitle:"Survivez à la marche des géants." },
    { title:"Aion, l’Éveillé", subtitle:"Affrontez le titan revenu du firmament." }
  ]},
  { chapter:"Chapitre XXII", name:"La Nuit sans Lune", battles:[
    { title:"La Chasseresse nocturne", subtitle:"Progressez sans la lumière de la lune." },
    { title:"Le Dévoreur de clarté", subtitle:"Rallumez le ciel en vainquant l’ombre." }
  ]},
  { chapter:"Chapitre XXIII", name:"La Dernière Constellation", battles:[
    { title:"Le Scribe des étoiles", subtitle:"Protégez le dernier dessin du firmament." },
    { title:"Le Gardien d’Astréa", subtitle:"Prouvez que vous méritez la constellation finale." }
  ]},
  { chapter:"Chapitre XXIV", name:"Les Cendres du Soleil", battles:[
    { title:"Le Phénix mourant", subtitle:"Ravivez une flamme presque éteinte." },
    { title:"L’Empereur des Cendres", subtitle:"Renversez le maître du soleil noir." }
  ]},
  { chapter:"Chapitre XXV", name:"L’Empire du Néant", battles:[
    { title:"Le Duc des Failles", subtitle:"Infiltrez la cour du vide." },
    { title:"Vorakel, Seigneur du Néant", subtitle:"Faites tomber l’empire de l’ombre." }
  ]},
  { chapter:"Chapitre XXVI", name:"Le Retour d’Astréa", battles:[
    { title:"La Porteuse d’Aurore", subtitle:"Rassemblez les armées de lumière." },
    { title:"La Reine retrouvée", subtitle:"Libérez la véritable souveraine des étoiles." }
  ]},
  { chapter:"Chapitre XXVII", name:"La Fin des Étoiles", battles:[
    { title:"Le Moissonneur cosmique", subtitle:"Empêchez l’extinction des constellations." },
    { title:"L’Avatar de l’Entropie", subtitle:"Combattez la fin elle-même." }
  ]},
  { chapter:"Chapitre XXVIII", name:"L’Apothéose céleste", battles:[
    { title:"Le Dernier Serment", subtitle:"Brisez le sceau qui protège le combat final." },
    { title:"Le Crépuscule des Mondes", subtitle:"Décidez du destin d’Astréa dans l’ultime bataille." }
  ]}
];

function buildExtendedAdventureEncounters() {
  const themeCycle = ["astral", "zenith", "neant", "quetes"];
  const heroByTheme = {
    astral: "reine_celeste",
    zenith: "roi_solaire",
    neant: "sorceleur_du_vide",
    quetes: "pretresse_lunaire"
  };
  const signatureByTheme = {
    astral: ["creature_033", "creature_034", "spell_027", "spell_032"],
    zenith: ["creature_038", "creature_040", "spell_034", "weapon_004"],
    neant: ["creature_035", "creature_039", "spell_035", "spell_037"],
    quetes: ["quest_001", "quest_002", "spell_033", "creature_036"]
  };

  return EXTENDED_ADVENTURE_CHAPTERS.flatMap((chapter, chapterIndex) =>
    chapter.battles.map((battle, battleIndex) => {
      const position = chapterIndex * 2 + battleIndex;
      const chapterNumber = chapterIndex + 4;
      const theme = themeCycle[(chapterIndex + battleIndex) % themeCycle.length];
      const isChapterBoss = battleIndex === 1;
      const health = 38 + Math.floor(position * 0.48) + (isChapterBoss ? 3 : 0);
      const startingArmor = Math.min(26, 2 + Math.floor(position / 4) * 2 + (isChapterBoss ? 2 : 0));
      const maxCardCost = Math.min(18, 6 + Math.floor(position / 5));
      const rewards = [{ type: "coins", amount: 80 + Math.floor(position / 5) * 15 }];

      if (isChapterBoss) rewards.push({ type: "pack", packId: theme, amount: 1 });
      if ((position + 1) % 10 === 0) rewards.push({ type: "randomCard", rarity: position >= 39 ? "legendary" : "epic", amount: 1 });

      return {
        id: `chapter_${chapterNumber}_${battleIndex === 0 ? "guardian" : "boss"}`,
        chapter: chapter.chapter,
        chapterName: chapter.name,
        title: battle.title,
        subtitle: battle.subtitle,
        heroId: heroByTheme[theme],
        health,
        startingArmor,
        packTheme: theme,
        maxCardCost,
        signatureCards: [...signatureByTheme[theme]],
        rewards,
        flavor: `${chapter.name} — ${battle.subtitle}`
      };
    })
  );
}

ADVENTURE_ENCOUNTERS.push(...buildExtendedAdventureEncounters());

const ADVENTURE_BY_ID = Object.fromEntries(ADVENTURE_ENCOUNTERS.map(encounter => [encounter.id, encounter]));

const PACK_DEFINITIONS = {
  astral: {
    id: "astral",
    name: "Pack Astral",
    cost: 300,
    image: "assets/shop/pack_astral.png",
    description: "Cartes généralistes du firmament, idéales pour démarrer et renforcer vos decks.",
    pool: ["creature_001","creature_002","creature_003","creature_004","creature_005","creature_006","creature_007","creature_008","creature_010","creature_019","creature_020","creature_022","creature_023","creature_024","creature_025","spell_001","spell_003","spell_004","spell_006","spell_007","spell_010","spell_014","spell_015","spell_016","spell_018","spell_019","spell_020","spell_021","spell_022","spell_024","spell_025","weapon_001","weapon_003","secret_001","quest_001"]
  },
  zenith: {
    id: "zenith",
    name: "Pack du Zénith",
    cost: 520,
    image: "assets/shop/pack_zenith.png",
    description: "Lumière, soins, protection et héros sacrés du zénith.",
    pool: ["creature_004","creature_006","creature_010","creature_012","creature_018","creature_019","creature_022","creature_023","creature_024","creature_025","spell_003","spell_004","spell_007","spell_010","spell_013","spell_014","spell_019","spell_022","spell_027","weapon_001","weapon_003","secret_001","quest_002","quest_003"]
  },
  neant: {
    id: "neant",
    name: "Pack du Néant",
    cost: 520,
    image: "assets/shop/pack_neant.png",
    description: "Secrets, métamorphoses et puissances obscures venues du vide astral.",
    pool: ["creature_003","creature_007","creature_011","creature_016","creature_017","creature_021","creature_026","spell_005","spell_008","spell_009","spell_011","spell_012","spell_015","spell_017","spell_023","spell_024","spell_026","secret_001","secret_002","secret_003"]
  },
  quetes: {
    id: "quetes",
    name: "Pack des Quêtes",
    cost: 740,
    image: "assets/shop/pack_quetes.png",
    description: "Quêtes légendaires et cartes de soutien pour construire des stratégies évolutives.",
    pool: ["quest_001","quest_002","quest_003","creature_005","creature_006","creature_008","creature_020","creature_024","creature_025","spell_003","spell_006","spell_007","spell_010","spell_014","spell_016","spell_019","spell_021","weapon_003","secret_001"]
  }
};


const PACK_POOL_EXTENSIONS = {
  astral: ["spell_028","creature_027","spell_029","creature_028","spell_030","creature_029","spell_031","creature_030","spell_032","creature_031","location_001","spell_033","creature_032","creature_033","creature_034","creature_036","creature_037","creature_038","weapon_004","spell_034","spell_036","creature_039","creature_040","spell_037",
    "creature_041","creature_042","creature_043","creature_044","creature_045","creature_046","creature_047","creature_048","creature_049","creature_050","spell_038","creature_051","spell_039","spell_040","spell_041","spell_042","creature_052","creature_053","creature_054","weapon_005","weapon_006","weapon_007","weapon_008","weapon_009","weapon_010","weapon_011","weapon_012","weapon_013","weapon_014","creature_055","creature_056","creature_057","creature_058","creature_059","creature_060","creature_061","creature_062","creature_063","creature_064"],
  zenith: ["spell_028","spell_029","spell_030","creature_030","spell_032","creature_031","location_001","spell_033","creature_032","creature_033","creature_034","creature_036","creature_037","creature_038","weapon_004","spell_034","spell_036","creature_040",
    "creature_042","creature_043","creature_044","creature_045","creature_048","creature_049","creature_051","creature_053","spell_038","spell_040","spell_041","spell_042","weapon_005","weapon_006","weapon_007","weapon_008","weapon_010","weapon_011","weapon_012","weapon_013","creature_055","creature_056","creature_057","creature_058","creature_059","creature_060","creature_061","creature_062","creature_063","creature_064"],
  neant: ["creature_027","creature_028","creature_029","spell_031","creature_035","spell_035","creature_039","spell_037",
    "creature_041","creature_046","creature_047","creature_050","creature_052","creature_054","spell_039","spell_040","spell_041","weapon_009","weapon_014"],
  quetes: ["spell_028","spell_029","spell_030","spell_031","creature_030","location_001","spell_033","creature_033","creature_034","creature_036","spell_034","spell_036","creature_040",
    "creature_055","creature_056","creature_057","creature_058","creature_059","creature_060","creature_061","creature_062","creature_063","creature_064","weapon_010"]
};
for (const [packId, cardIds] of Object.entries(PACK_POOL_EXTENSIONS)) {
  const pool = PACK_DEFINITIONS[packId]?.pool;
  if (!pool) continue;
  cardIds.forEach(id => { if (CARD_BY_ID[id] && !pool.includes(id)) pool.push(id); });
}


const NEW_CARD_PACK_EXTENSIONS = {
  astral: [
    "new_veilleur_des_brumes","new_apprentie_du_flux","new_braconnier_des_sables","new_mineur_runique","new_sentinelle_du_hall","new_traqueuse_des_cometes","new_archiviste_astrea","new_rejeton_des_cendres","new_gardienne_du_sceau","new_frondeur_du_crepuscule","new_dragon_de_scories","new_brute_de_ferroc","new_gobelin_bidouilleur","new_lynx_des_ronces","new_automate_bastion","new_drake_azure","new_sanglier_de_loree","new_chaman_des_cendres","new_recuperateur_a_ressorts","new_faucon_mecanique","new_tempete_runique","new_drake_du_givre_ancien","new_chef_de_guerre_ferroc","new_bombardier_gobelin","new_canon_a_vapeur","new_mastodonte_des_ronces","new_totem_des_braises","new_sentinelle_des_engrenages","new_traqueuse_du_neant","new_benediction_astrale","new_drake_des_braises_eternelles","new_chaman_brise_tempete","new_chef_de_siege_ferroc","new_corrupteur_abyssal","new_championne_de_laurore","new_broyeur_a_pistons","new_artificier_fulminant","new_alpha_des_crocs_dargent","new_veteran_du_rempart","new_maree_purificatrice"
  ],
  zenith: ["new_gardienne_du_sceau","new_sentinelle_du_hall","new_automate_bastion","new_sentinelle_des_engrenages","new_benediction_astrale","new_championne_de_laurore","new_veteran_du_rempart","new_canon_a_vapeur","new_broyeur_a_pistons","new_faucon_mecanique"],
  neant: ["new_rejeton_des_cendres","new_frondeur_du_crepuscule","new_dragon_de_scories","new_tempete_runique","new_traqueuse_du_neant","new_drake_des_braises_eternelles","new_corrupteur_abyssal","new_totem_des_braises"],
  quetes: ["new_apprentie_du_flux","new_archiviste_astrea","new_mineur_runique","new_gobelin_bidouilleur","new_recuperateur_a_ressorts","new_artificier_fulminant","new_chaman_brise_tempete","new_maree_purificatrice"]
};
for (const [packId, cardIds] of Object.entries(NEW_CARD_PACK_EXTENSIONS)) {
  const pool = PACK_DEFINITIONS[packId]?.pool;
  if (!pool) continue;
  cardIds.forEach(id => { if (CARD_BY_ID[id] && !pool.includes(id)) pool.push(id); });
}

const DAILY_QUEST_TEMPLATES = [
  { id: "daily_play_cards", icon: "✦", title: "Élan astral", description: "Jouez 8 cartes.", event: "playCard", goal: 8, reward: { type: "coins", amount: 120 } },
  { id: "daily_win_match", icon: "⚔", title: "Victoire du firmament", description: "Gagnez 1 partie.", event: "winMatch", goal: 1, reward: { type: "pack", packId: "astral", amount: 1 } },
  { id: "daily_use_hero_power", icon: "☄", title: "Maîtrise héroïque", description: "Utilisez votre pouvoir héroïque 4 fois.", event: "useHeroPower", goal: 4, reward: { type: "coins", amount: 90 } },
  { id: "daily_cast_spells", icon: "✧", title: "Rituels stellaires", description: "Lancez 5 sorts.", event: "spellPlayed", goal: 5, reward: { type: "pack", packId: "neant", amount: 1 } },
  { id: "daily_open_pack", icon: "◈", title: "Collectionneuse", description: "Ouvrez 1 paquet.", event: "openPack", goal: 1, reward: { type: "randomCard", rarity: "rare", amount: 1 } },
  { id: "daily_summon_minions", icon: "🛡", title: "Ligne de front", description: "Invoquez 6 serviteurs.", event: "creatureSummoned", goal: 6, reward: { type: "pack", packId: "zenith", amount: 1 } },
  { id: "daily_spend_mana", icon: "⬢", title: "Canalisation", description: "Dépensez 20 cristaux de mana.", event: "spendMana", goal: 20, reward: { type: "coins", amount: 150 } }
];

function buildStarterCollectionCounts() {
  const starter = Object.fromEntries(COLLECTIBLE_CARDS.map(card => [card.id, 0]));
  const counts = countIds(DEFAULT_PLAYER_DECK);
  Object.entries(counts).forEach(([id, amount]) => {
    if (starter[id] !== undefined) starter[id] = Math.max(starter[id], amount);
  });
  ["creature_004", "spell_003", "weapon_001", "quest_003"].forEach(id => {
    if (starter[id] !== undefined) starter[id] = Math.max(starter[id], 1);
  });
  return starter;
}

let gameState = null;
let progress = null;
let draggedPayload = null;
let interactionLocked = false;
let choiceResolver = null;
let packOpeningState = null;
let heroDefeatSequenceId = 0;
let fatigueBannerTimer = null;
let attackPointerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const dom = {};
const memoryStorage = {};
const TAUNT_ENTRANCE_MS = 1400;
const HERO_DEFEAT_ANIMATION_MS = 1550;

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  bindStaticEvents();
  progress = loadProgress();
  renderMenuSummary();
});

function cacheDom() {
  const ids = [
    "start-screen","collection-screen","shop-screen","quests-screen","adventure-screen","game-screen","start-game-btn","open-collection-btn","open-decks-btn","open-shop-btn","open-quests-btn","open-adventure-btn",
    "collection-back-btn","shop-back-btn","quests-back-btn","adventure-back-btn","collection-search","collection-type-filter","collection-cost-filter","reset-deck-btn","deck-selector","deck-hero-select","new-deck-btn","rename-deck-btn","delete-deck-btn","deck-editor-title-text","deck-editor-subtitle",
    "collection-grid","deck-list","deck-count-label","deck-validity-label","deck-curve-label","active-deck-summary","collection-summary","menu-coins","shop-coins","shop-pack-grid","shop-inventory","shop-owned-cards","quests-grid","quests-reset-label","quests-summary-label","quests-ready-count","adventure-map","adventure-progress-label","adventure-stars-label","adventure-reward-summary","adventure-selected-hero-image","adventure-selected-hero-name","menu-profile-medallion","menu-profile-name","menu-profile-subtitle",
    "replay-btn","game-over-menu-btn","leave-game-btn","end-turn-btn","turn-indicator","status-message","fatigue-banner","fatigue-banner-label","fatigue-banner-value","attack-arrow-overlay","attack-arrow-path","attack-arrow-glow-path","attack-arrow-origin",
    "player-board","ai-board","player-hand","player-hero","ai-hero","player-health","ai-health","player-armor","ai-armor",
    "player-mana","ai-mana","player-deck-count","ai-deck-count","ai-hand-count","ai-hand-visual-count","ai-hand","player-grave-count","ai-grave-count","turn-count","player-hero-name","ai-hero-name","player-hero-avatar-img","ai-hero-avatar-img",
    "combat-log","card-preview","game-over-modal","game-over-title","game-over-text","choice-modal","choice-title","choice-options",
    "player-hero-power","ai-hero-power","player-weapon","ai-weapon","player-location","ai-location","player-secrets","ai-secrets","pack-opening-modal","pack-opening-title","pack-opening-stage","pack-opening-pack-image","pack-opening-hint","pack-opening-cards","pack-opening-close-btn","pack-opening-x-btn"
  ];
  ids.forEach(id => { dom[toCamel(id)] = document.getElementById(id); });
  dom.heroChoiceButtons = Array.from(document.querySelectorAll("[data-hero-choice]"));
}


function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function bindStaticEvents() {
  dom.startGameBtn.addEventListener("click", startNewGame);
  dom.openCollectionBtn.addEventListener("click", openCollection);
  dom.openDecksBtn.addEventListener("click", openCollection);
  dom.openShopBtn.addEventListener("click", openShop);
  dom.openQuestsBtn.addEventListener("click", openQuests);
  dom.openAdventureBtn.addEventListener("click", openAdventure);
  dom.collectionBackBtn.addEventListener("click", showMainMenu);
  dom.shopBackBtn.addEventListener("click", showMainMenu);
  dom.questsBackBtn.addEventListener("click", showMainMenu);
  dom.adventureBackBtn.addEventListener("click", showMainMenu);
  (dom.heroChoiceButtons || []).forEach(button => {
    button.addEventListener("click", () => selectPlayerHero(button.dataset.heroChoice));
  });
  dom.collectionSearch.addEventListener("input", renderCollection);
  dom.collectionTypeFilter.addEventListener("change", renderCollection);
  dom.collectionCostFilter.addEventListener("change", renderCollection);
  dom.resetDeckBtn.addEventListener("click", resetDeckToDefault);
  dom.deckSelector.addEventListener("change", event => switchActiveDeck(event.target.value));
  dom.deckHeroSelect.addEventListener("change", event => setActiveDeckHero(event.target.value));
  dom.newDeckBtn.addEventListener("click", createNewDeck);
  dom.renameDeckBtn.addEventListener("click", renameActiveDeck);
  dom.deleteDeckBtn.addEventListener("click", deleteActiveDeck);
  dom.replayBtn.addEventListener("click", replayCurrentBattle);
  dom.gameOverMenuBtn.addEventListener("click", returnAfterGameOver);
  dom.leaveGameBtn.addEventListener("click", leaveCurrentBattle);
  dom.endTurnBtn.addEventListener("click", endPlayerTurn);
  dom.playerHeroPower.addEventListener("click", usePlayerHeroPower);
  dom.packOpeningStage.addEventListener("click", handlePackOpeningStageClick);
  dom.packOpeningCloseBtn.addEventListener("click", closePackOpeningModal);
  dom.packOpeningXBtn.addEventListener("click", closePackOpeningModal);
  dom.packOpeningModal.addEventListener("click", event => {
    if (event.target === dom.packOpeningModal && packOpeningState?.revealed) closePackOpeningModal();
  });

  dom.playerBoard.addEventListener("dragover", event => {
    if (canDropCreatureOnPlayerBoard()) { event.preventDefault(); dom.playerBoard.classList.add("drag-over"); }
  });
  dom.playerBoard.addEventListener("dragleave", () => dom.playerBoard.classList.remove("drag-over"));
  dom.playerBoard.addEventListener("drop", onPlayerBoardDrop);

  [dom.playerHero, dom.aiHero].forEach(hero => {
    hero.setAttribute("tabindex", "0");
    hero.addEventListener("click", () => onHeroClick(hero.dataset.owner));
    hero.addEventListener("dragover", onTargetDragOver);
    hero.addEventListener("drop", onTargetDrop);
    hero.addEventListener("mouseenter", () => previewHero(hero.dataset.owner));
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (packOpeningState?.revealed && !dom.packOpeningModal.classList.contains("hidden")) {
      closePackOpeningModal();
      return;
    }
    if (gameState?.pendingAction) cancelPendingAction();
  });

  document.addEventListener("click", event => {
    if (!gameState?.pendingAction) return;
    if (!event.target.closest(".card,.minion,.hero,.hero-power,.board-zone,#end-turn-btn")) cancelPendingAction();
  });

  document.addEventListener("mousemove", event => {
    attackPointerPosition = { x: event.clientX, y: event.clientY };
    updateAttackArrow();
  });

  window.addEventListener("resize", () => {
    attackPointerPosition = {
      x: Math.min(attackPointerPosition.x, window.innerWidth),
      y: Math.min(attackPointerPosition.y, window.innerHeight)
    };
    updateAttackArrow();
  });
}

/* --------------------------- Persistance / decks -------------------------- */

function createPersistentDeckId() {
  return `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildDeckEntry({ id = createPersistentDeckId(), name = null, heroId = DEFAULT_PLAYER_HERO_ID, cards = DEFAULT_PLAYER_DECK } = {}, collection = STARTER_COLLECTION_COUNTS) {
  const normalizedHeroId = HERO_DEFINITIONS[heroId] ? heroId : DEFAULT_PLAYER_HERO_ID;
  let normalizedCards = Array.isArray(cards) ? cards.filter(cardId => CARD_BY_ID[cardId]?.collectible !== false) : [...DEFAULT_PLAYER_DECK];
  if (!isDeckStructurallyValid(normalizedCards, collection)) normalizedCards = [...DEFAULT_PLAYER_DECK];
  return {
    id,
    name: (name || "Deck astral").trim() || "Deck astral",
    heroId: normalizedHeroId,
    cards: [...normalizedCards]
  };
}

function getActiveDeck() {
  if (!progress?.decks?.length) return null;
  return progress.decks.find(deck => deck.id === progress.activeDeckId) || progress.decks[0] || null;
}

function syncLegacyFieldsFromActiveDeck() {
  const activeDeck = getActiveDeck();
  if (!activeDeck || !progress) return;
  progress.activeDeckId = activeDeck.id;
  progress.deck = [...activeDeck.cards];
  progress.selectedHeroId = activeDeck.heroId;
}

function persistActiveDeckState() {
  const activeDeck = getActiveDeck();
  if (!activeDeck || !progress) return;
  activeDeck.cards = [...progress.deck];
  activeDeck.heroId = HERO_DEFINITIONS[progress.selectedHeroId] ? progress.selectedHeroId : DEFAULT_PLAYER_HERO_ID;
}

function renderDeckManager() {
  if (!progress || !dom.deckSelector || !dom.deckHeroSelect) return;
  const activeDeck = getActiveDeck();
  if (!activeDeck) return;

  dom.deckSelector.innerHTML = progress.decks
    .map(deck => `<option value="${escapeHtml(deck.id)}">${escapeHtml(deck.name)} · ${escapeHtml(getHeroDefinition(deck.heroId).name)}</option>`)
    .join("");
  dom.deckSelector.value = activeDeck.id;

  dom.deckHeroSelect.innerHTML = Object.values(HERO_DEFINITIONS)
    .map(hero => `<option value="${escapeHtml(hero.id)}">Héros : ${escapeHtml(hero.name)}</option>`)
    .join("");
  dom.deckHeroSelect.value = activeDeck.heroId;
  dom.deleteDeckBtn.disabled = progress.decks.length <= 1;
}

function switchActiveDeck(deckId) {
  if (!progress?.decks?.some(deck => deck.id === deckId)) return;
  persistActiveDeckState();
  progress.activeDeckId = deckId;
  syncLegacyFieldsFromActiveDeck();
  saveProgress();
  renderCollection();
}

function getSuggestedDeckName() {
  const base = "Deck astral";
  let index = progress?.decks?.length ? progress.decks.length + 1 : 2;
  let candidate = `${base} ${index}`;
  const used = new Set((progress?.decks || []).map(deck => normalizeText(deck.name)));
  while (used.has(normalizeText(candidate))) {
    index += 1;
    candidate = `${base} ${index}`;
  }
  return candidate;
}

function createNewDeck() {
  if (!progress) return;
  persistActiveDeckState();
  const suggestedName = getSuggestedDeckName();
  const name = (window.prompt("Nom du nouveau deck :", suggestedName) || suggestedName).trim() || suggestedName;
  const heroId = progress.selectedHeroId || DEFAULT_PLAYER_HERO_ID;
  const newDeck = buildDeckEntry({
    name,
    heroId,
    cards: [...DEFAULT_PLAYER_DECK]
  }, progress.collection);
  progress.decks.push(newDeck);
  progress.activeDeckId = newDeck.id;
  syncLegacyFieldsFromActiveDeck();
  saveProgress();
  renderCollection();
}

function renameActiveDeck() {
  const activeDeck = getActiveDeck();
  if (!activeDeck) return;
  const nextName = (window.prompt("Nouveau nom du deck :", activeDeck.name) || activeDeck.name).trim();
  if (!nextName) return;
  activeDeck.name = nextName;
  saveProgress();
  renderCollection();
}

function deleteActiveDeck() {
  if (!progress || progress.decks.length <= 1) return;
  const activeDeck = getActiveDeck();
  if (!activeDeck) return;
  const confirmed = window.confirm(`Supprimer le deck « ${activeDeck.name} » ?`);
  if (!confirmed) return;
  progress.decks = progress.decks.filter(deck => deck.id !== activeDeck.id);
  progress.activeDeckId = progress.decks[0].id;
  syncLegacyFieldsFromActiveDeck();
  saveProgress();
  renderCollection();
}

function setActiveDeckHero(heroId) {
  if (!progress || !HERO_DEFINITIONS[heroId]) return;
  progress.selectedHeroId = heroId;
  persistActiveDeckState();
  saveProgress();
  renderHeroSelection();
  renderDeckManager();
  if (!dom.collectionScreen.classList.contains("hidden")) renderDeckEditor();
}

function getProgressStorageKey() {
  const accountName = String(storageGet(AUTH_USERNAME_STORAGE_KEY) || "").trim().toLowerCase();
  const safeAccountName = accountName.replace(/[^a-z0-9_]/g, "");
  return safeAccountName ? `${STORAGE_KEY}_account_${safeAccountName}` : STORAGE_KEY;
}

function readStoredProgressForCurrentProfile() {
  try {
    const raw = storageGet(getProgressStorageKey());
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function storeProgressForCurrentProfile(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  try {
    storageSet(getProgressStorageKey(), JSON.stringify(snapshot));
    return true;
  } catch (_) {
    return false;
  }
}

function loadProgress() {
  let loaded = null;
  try { loaded = JSON.parse(storageGet(getProgressStorageKey())); } catch (_) { loaded = null; }

  const collection = {};
  const hasStoredCollection = Boolean(loaded?.collection && typeof loaded.collection === "object" && !Array.isArray(loaded.collection));
  COLLECTIBLE_CARDS.forEach(card => {
    const loadedCount = Number(loaded?.collection?.[card.id] || 0);
    collection[card.id] = hasStoredCollection
      ? Math.max(0, loadedCount)
      : Math.max(STARTER_COLLECTION_COUNTS[card.id] || 0, loadedCount);
  });

  const packs = {};
  Object.keys(PACK_DEFINITIONS).forEach(packId => {
    packs[packId] = Math.max(0, Number(loaded?.packs?.[packId] || 0));
  });

  const coins = Math.max(0, Number(loaded?.coins ?? CONFIG.STARTER_COINS));

  let decks = [];
  if (Array.isArray(loaded?.decks) && loaded.decks.length) {
    decks = loaded.decks.map((deck, index) => buildDeckEntry({
      id: deck?.id || `deck_loaded_${index}`,
      name: deck?.name || `Deck ${index + 1}`,
      heroId: deck?.heroId,
      cards: deck?.cards
    }, collection));
  }
  if (!decks.length) {
    const legacyDeck = Array.isArray(loaded?.deck) ? loaded.deck : [...DEFAULT_PLAYER_DECK];
    const legacyHeroId = HERO_DEFINITIONS[loaded?.selectedHeroId] ? loaded.selectedHeroId : DEFAULT_PLAYER_HERO_ID;
    decks = [buildDeckEntry({ id: "deck_principal", name: "Deck principal", heroId: legacyHeroId, cards: legacyDeck }, collection)];
  }

  const activeDeckId = decks.some(deck => deck.id === loaded?.activeDeckId) ? loaded.activeDeckId : decks[0].id;
  const activeDeck = decks.find(deck => deck.id === activeDeckId) || decks[0];

  const today = getTodayKey();
  let dailyQuests = loaded?.dailyQuests;
  if (!dailyQuests || dailyQuests.date !== today || !Array.isArray(dailyQuests.quests) || !dailyQuests.quests.length) {
    dailyQuests = generateDailyQuests(today);
  } else {
    dailyQuests = {
      date: dailyQuests.date,
      quests: dailyQuests.quests.map(q => ({ ...q, progress: Number(q.progress || 0), claimed: Boolean(q.claimed) }))
    };
  }

  const adventure = {
    completed: Array.isArray(loaded?.adventure?.completed) ? loaded.adventure.completed.filter(id => ADVENTURE_BY_ID[id]) : [],
    claimed: Array.isArray(loaded?.adventure?.claimed) ? loaded.adventure.claimed.filter(id => ADVENTURE_BY_ID[id]) : [],
    stars: loaded?.adventure?.stars && typeof loaded.adventure.stars === "object" ? { ...loaded.adventure.stars } : {}
  };

  const preserved = loaded && typeof loaded === "object" && !Array.isArray(loaded) ? loaded : {};
  const result = {
    ...preserved,
    collection,
    deck: [...activeDeck.cards],
    decks,
    activeDeckId,
    packs,
    coins,
    dailyQuests,
    selectedHeroId: activeDeck.heroId,
    adventure,
    version: Math.max(19, Number(loaded?.version || 0))
  };
  storageSet(getProgressStorageKey(), JSON.stringify(result));
  return result;
}

function saveProgress() {
  if (!progress) return;
  persistActiveDeckState();
  storageSet(getProgressStorageKey(), JSON.stringify(progress));
  renderMenuSummary();
  if (typeof window.astreaAccountProgressSync === "function") {
    window.astreaAccountProgressSync(progress);
  }
}

function reloadProgressForCurrentProfile() {
  progress = loadProgress();
  renderMenuSummary();
  renderHeroSelection();
  if (dom.collectionScreen && !dom.collectionScreen.classList.contains("hidden")) renderCollection();
  if (dom.shopScreen && !dom.shopScreen.classList.contains("hidden")) renderShop();
  if (dom.questsScreen && !dom.questsScreen.classList.contains("hidden")) renderQuests();
  if (dom.adventureScreen && !dom.adventureScreen.classList.contains("hidden")) renderAdventure();
  return progress;
}

function isDeckStructurallyValid(deck, collection = progress?.collection || {}) {
  if (!Array.isArray(deck) || deck.length !== CONFIG.DECK_SIZE) return false;
  const counts = countIds(deck);
  return Object.entries(counts).every(([id, amount]) => {
    const card = CARD_BY_ID[id];
    if (!card || card.collectible === false) return false;
    const maxCopies = card.rarity === "legendary" ? 1 : 2;
    return amount <= maxCopies && amount <= (collection[id] || 0);
  });
}

function renderMenuSummary() {
  if (!progress) return;
  refreshDailyQuestsIfNeeded();
  syncLegacyFieldsFromActiveDeck();
  const activeDeck = getActiveDeck();
  const valid = isDeckStructurallyValid(progress.deck, progress.collection);
  const ownedDistinct = COLLECTIBLE_CARDS.filter(card => (progress.collection[card.id] || 0) > 0).length;
  const selectedHero = getHeroDefinition(progress.selectedHeroId);
  dom.activeDeckSummary.textContent = `${activeDeck?.name || "Deck"} · ${progress.deck.length}/${CONFIG.DECK_SIZE}${valid ? " ✓" : ""}`;
  dom.collectionSummary.textContent = `${ownedDistinct}/${COLLECTIBLE_CARDS.length} cartes possédées · ${progress.coins} pièces · ${progress.decks?.length || 1} deck(s)`;
  if (dom.menuCoins) dom.menuCoins.textContent = String(progress.coins);
  if (dom.shopCoins) dom.shopCoins.textContent = String(progress.coins);
  if (dom.shopOwnedCards) dom.shopOwnedCards.textContent = `${getOwnedCardTotal()} cartes · ${ownedDistinct} différentes`;
  if (dom.menuProfileName) dom.menuProfileName.textContent = selectedHero.name;
  if (dom.menuProfileSubtitle) dom.menuProfileSubtitle.textContent = `${selectedHero.subtitle} · Deck actif : ${activeDeck?.name || "Deck"}`;
  if (dom.menuProfileMedallion) dom.menuProfileMedallion.innerHTML = `<img src="${selectedHero.portrait}" alt="${escapeHtml(selectedHero.name)}" />`;
  const readyCount = progress.dailyQuests?.quests?.filter(q => q.progress >= q.goal && !q.claimed).length || 0;
  if (dom.questsReadyCount) dom.questsReadyCount.textContent = `${readyCount} prêtes`;
  if (dom.questsSummaryLabel) dom.questsSummaryLabel.textContent = `${progress.dailyQuests?.quests?.length || 0} quête(s) actives`;
  if (dom.questsResetLabel) dom.questsResetLabel.textContent = `Réinitialisation : demain`;
  dom.startGameBtn.disabled = !valid;
  renderHeroSelection();
  renderDeckManager();
}

function getHeroDefinition(heroId) {
  return HERO_DEFINITIONS[heroId] || HERO_DEFINITIONS[DEFAULT_PLAYER_HERO_ID];
}

function getHeroPowerDefinition(powerType) {
  return HERO_POWER_DEFINITIONS[powerType] || HERO_POWER_DEFINITIONS.couronne_astrale;
}

function renderHeroSelection() {
  const selectedHeroId = progress?.selectedHeroId || DEFAULT_PLAYER_HERO_ID;
  (dom.heroChoiceButtons || []).forEach(button => {
    button.classList.toggle("active", button.dataset.heroChoice === selectedHeroId);
  });
}

function selectPlayerHero(heroId) {
  if (!progress || !HERO_DEFINITIONS[heroId]) return;
  progress.selectedHeroId = heroId;
  persistActiveDeckState();
  saveProgress();
  renderMenuSummary();
  if (!dom.collectionScreen.classList.contains("hidden")) renderCollection();
}

function pickAiHeroDefinition(playerHeroId) {
  const pool = Object.values(HERO_DEFINITIONS).filter(hero => hero.id !== playerHeroId);
  if (!pool.length) return getHeroDefinition(DEFAULT_AI_HERO_ID);
  return pool[Math.floor(Math.random() * pool.length)];
}

function openCollection() {
  dom.startScreen.classList.add("hidden");
  dom.shopScreen.classList.add("hidden");
  dom.questsScreen.classList.add("hidden");
  dom.adventureScreen.classList.add("hidden");
  dom.gameScreen.classList.add("hidden");
  dom.collectionScreen.classList.remove("hidden");
  renderCollection();
}

function openShop() {
  dom.startScreen.classList.add("hidden");
  dom.collectionScreen.classList.add("hidden");
  dom.questsScreen.classList.add("hidden");
  dom.adventureScreen.classList.add("hidden");
  dom.gameScreen.classList.add("hidden");
  dom.shopScreen.classList.remove("hidden");
  renderShop();
}

function openQuests() {
  dom.startScreen.classList.add("hidden");
  dom.collectionScreen.classList.add("hidden");
  dom.shopScreen.classList.add("hidden");
  dom.adventureScreen.classList.add("hidden");
  dom.gameScreen.classList.add("hidden");
  dom.questsScreen.classList.remove("hidden");
  renderQuests();
}

function openAdventure() {
  resetHeroDefeatVisuals();
  interactionLocked = false;
  draggedPayload = null;
  gameState = null;
  dom.startScreen.classList.add("hidden");
  dom.collectionScreen.classList.add("hidden");
  dom.shopScreen.classList.add("hidden");
  dom.questsScreen.classList.add("hidden");
  dom.adventureScreen.classList.add("hidden");
  dom.gameScreen.classList.add("hidden");
  dom.adventureScreen.classList.remove("hidden");
  dom.gameOverModal.classList.add("hidden");
  renderAdventure();
}

function showMainMenu() {
  resetHeroDefeatVisuals();
  interactionLocked = false;
  draggedPayload = null;
  gameState = null;
  dom.gameOverModal.classList.add("hidden");
  dom.choiceModal.classList.add("hidden");
  dom.collectionScreen.classList.add("hidden");
  dom.shopScreen.classList.add("hidden");
  dom.questsScreen.classList.add("hidden");
  dom.adventureScreen.classList.add("hidden");
  dom.gameScreen.classList.add("hidden");
  dom.packOpeningModal.classList.add("hidden");
  packOpeningState = null;
  dom.startScreen.classList.remove("hidden");
  renderMenuSummary();
}

function renderAdventure() {
  if (!progress?.adventure) return;
  const completed = new Set(progress.adventure.completed || []);
  const selectedHero = getHeroDefinition(progress.selectedHeroId);
  const totalStars = Object.values(progress.adventure.stars || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  dom.adventureProgressLabel.textContent = `${completed.size} / ${ADVENTURE_ENCOUNTERS.length}`;
  dom.adventureStarsLabel.textContent = `${totalStars} ★`;
  dom.adventureSelectedHeroImage.src = selectedHero.portrait;
  dom.adventureSelectedHeroImage.alt = selectedHero.name;
  dom.adventureSelectedHeroName.textContent = selectedHero.name;
  dom.adventureMap.innerHTML = "";

  ADVENTURE_ENCOUNTERS.forEach((encounter, index) => {
    const previous = ADVENTURE_ENCOUNTERS[index - 1];
    const unlocked = index === 0 || completed.has(previous.id);
    const isCompleted = completed.has(encounter.id);
    const stars = Number(progress.adventure.stars?.[encounter.id] || 0);
    const hero = getHeroDefinition(encounter.heroId);
    const card = document.createElement("article");
    card.className = `adventure-node${unlocked ? " unlocked" : " locked"}${isCompleted ? " completed" : ""}`;
    card.innerHTML = `
      <div class="adventure-node-path" aria-hidden="true"></div>
      <div class="adventure-node-portrait"><img src="${hero.portrait}" alt="${escapeHtml(hero.name)}" /></div>
      <div class="adventure-node-content">
        <div class="adventure-node-heading"><span>${escapeHtml(encounter.chapter)}</span><strong>${escapeHtml(encounter.title)}</strong></div>
        <p>${escapeHtml(encounter.subtitle)}</p>
        <div class="adventure-boss-stats"><span>❤ ${encounter.health} PV</span><span>🛡 ${encounter.startingArmor} Armure</span><span>${isCompleted ? `${"★".repeat(stars)}${"☆".repeat(3-stars)}` : unlocked ? "Disponible" : "Verrouillé"}</span></div>
        <div class="adventure-reward-line"><small>Récompense</small><strong>${escapeHtml(describeAdventureRewards(encounter.rewards))}</strong></div>
        <button class="${unlocked ? "primary-btn" : "secondary-btn"}" type="button" ${unlocked ? "" : "disabled"}>${isCompleted ? "Rejouer" : unlocked ? "Combattre" : "À débloquer"}</button>
      </div>`;
    card.querySelector("button").addEventListener("click", () => startAdventureBattle(encounter.id));
    dom.adventureMap.appendChild(card);
  });

  const nextEncounter = ADVENTURE_ENCOUNTERS.find((encounter, index) =>
    !completed.has(encounter.id) && (index === 0 || completed.has(ADVENTURE_ENCOUNTERS[index - 1].id))
  );
  dom.adventureRewardSummary.innerHTML = `
    <div class="adventure-summary-stat"><span>Étapes terminées</span><strong>${completed.size}</strong></div>
    <div class="adventure-summary-stat"><span>Étoiles gagnées</span><strong>${totalStars} / ${ADVENTURE_ENCOUNTERS.length * 3}</strong></div>
    <div class="adventure-next-reward"><small>Prochaine récompense</small><strong>${nextEncounter ? escapeHtml(describeAdventureRewards(nextEncounter.rewards)) : "Campagne terminée !"}</strong></div>`;

  const activeNode = dom.adventureMap.querySelector(".adventure-node.unlocked:not(.completed)");
  if (activeNode) setTimeout(() => activeNode.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
}

function describeAdventureRewards(rewards = []) {
  return rewards.map(reward => {
    if (reward.type === "coins") return `${reward.amount} pièces`;
    if (reward.type === "pack") return `${reward.amount || 1} ${PACK_DEFINITIONS[reward.packId]?.name || "paquet"}`;
    if (reward.type === "card") return CARD_BY_ID[reward.cardId]?.name || "Carte spéciale";
    if (reward.type === "randomCard") return `1 carte ${reward.rarity === "legendary" ? "légendaire" : reward.rarity || "aléatoire"}`;
    return "Récompense mystérieuse";
  }).join(" + ");
}

function isAdventureEncounterUnlocked(encounterId) {
  const index = ADVENTURE_ENCOUNTERS.findIndex(encounter => encounter.id === encounterId);
  if (index < 0) return false;
  if (index === 0) return true;
  return progress.adventure.completed.includes(ADVENTURE_ENCOUNTERS[index - 1].id);
}

function renderCollection() {
  renderDeckManager();
  const search = normalizeText(dom.collectionSearch.value || "");
  const type = dom.collectionTypeFilter.value;
  const costFilter = dom.collectionCostFilter.value;
  const deckCounts = countIds(progress.deck);

  const cards = COLLECTIBLE_CARDS
    .filter(card => type === "all" || card.type === type)
    .filter(card => !search || normalizeText(`${card.name} ${card.description}`).includes(search))
    .filter(card => costMatches(card.cost, costFilter))
    .sort((a,b) => a.cost - b.cost || a.name.localeCompare(b.name, "fr"));

  dom.collectionGrid.innerHTML = "";
  cards.forEach(card => {
    const owned = progress.collection[card.id] || 0;
    const inDeck = deckCounts[card.id] || 0;
    const maxCopies = card.rarity === "legendary" ? 1 : 2;
    const canAdd = card.collectible !== false && progress.deck.length < CONFIG.DECK_SIZE && inDeck < Math.min(owned, maxCopies);
    const el = document.createElement("button");
    el.type = "button";
    el.className = `collection-card rarity-${card.rarity}${canAdd ? " can-add" : ""}${owned <= 0 ? " unowned" : ""}${card.collectible === false ? " liveops-card-disabled" : ""}`;
    el.disabled = !canAdd;
    el.innerHTML = `
      <span class="collection-cost">${card.cost}</span>
      <span class="collection-art">${getCardArtMarkup(card)}</span>
      <strong>${escapeHtml(card.name)}</strong>
      <small>${typeLabel(card.type)} · ${escapeHtml(card.description)}</small>
      <span class="collection-owned">${card.collectible === false ? "Temporairement désactivée" : `Possédées ${owned} · Deck ${inDeck}/${maxCopies}`}</span>`;
    bindCardImageFallback(el, card);
    el.addEventListener("click", () => addCardToDeck(card.id));
    el.addEventListener("mouseenter", () => previewCard(card));
    dom.collectionGrid.appendChild(el);
  });

  renderDeckEditor();
}

function renderDeckEditor() {
  const activeDeck = getActiveDeck();
  const counts = countIds(progress.deck);
  const entries = Object.keys(counts).map(id => CARD_BY_ID[id]).filter(Boolean).sort((a,b) => a.cost-b.cost || a.name.localeCompare(b.name,"fr"));
  if (dom.deckEditorTitleText) dom.deckEditorTitleText.textContent = activeDeck?.name || "Deck astral";
  if (dom.deckEditorSubtitle) dom.deckEditorSubtitle.textContent = `Héros : ${getHeroDefinition(progress.selectedHeroId).name} · Cliquez sur une carte pour l’ajouter.`;
  dom.deckList.innerHTML = "";
  entries.forEach(card => {
    const count = counts[card.id];
    const row = document.createElement("button");
    row.type = "button";
    row.className = `deck-row rarity-${card.rarity}`;
    row.dataset.cardId = card.id;
    row.innerHTML = `<span class="deck-row-cost">${card.cost}</span><span>${escapeHtml(card.name)}</span><small>${typeLabel(card.type)}</small><b>×${count}</b><i>−</i>`;
    row.addEventListener("click", () => removeCardFromDeck(card.id));
    dom.deckList.appendChild(row);
  });

  const valid = isDeckStructurallyValid(progress.deck, progress.collection);
  dom.deckCountLabel.textContent = `${progress.deck.length} / ${CONFIG.DECK_SIZE}`;
  dom.deckValidityLabel.textContent = valid ? "Deck prêt" : `Encore ${Math.max(0, CONFIG.DECK_SIZE-progress.deck.length)} carte(s)`;
  dom.deckValidityLabel.className = valid ? "valid" : "invalid";
  const avg = progress.deck.length ? progress.deck.reduce((sum,id)=>sum+(CARD_BY_ID[id]?.cost||0),0)/progress.deck.length : 0;
  dom.deckCurveLabel.textContent = `Mana moyen ${avg.toFixed(1)}`;
}

function addCardToDeck(cardId) {
  const card = CARD_BY_ID[cardId];
  if (!card || card.collectible === false || progress.deck.length >= CONFIG.DECK_SIZE) return;
  const amount = progress.deck.filter(id => id === cardId).length;
  const maxCopies = card.rarity === "legendary" ? 1 : 2;
  if (amount >= Math.min(progress.collection[cardId] || 0, maxCopies)) return;
  progress.deck.push(cardId);
  saveProgress();
  renderCollection();
}

function removeCardFromDeck(cardId) {
  const index = progress.deck.lastIndexOf(cardId);
  if (index === -1) return;
  progress.deck.splice(index,1);
  saveProgress();
  renderCollection();
}

function resetDeckToDefault() {
  progress.deck = [...DEFAULT_PLAYER_DECK];
  saveProgress();
  renderCollection();
}

function costMatches(cost, filter) {
  if (filter === "all") return true;
  if (filter === "0-2") return cost <= 2;
  if (filter === "3-4") return cost >= 3 && cost <= 4;
  if (filter === "5-6") return cost >= 5 && cost <= 6;
  return cost >= 7;
}

function getOwnedCardTotal() {
  return COLLECTIBLE_CARDS.reduce((sum, card) => sum + (progress.collection[card.id] || 0), 0);
}

function renderShop() {
  renderMenuSummary();
  dom.shopPackGrid.innerHTML = "";
  Object.values(PACK_DEFINITIONS).forEach(pack => {
    const ownedPacks = progress.packs[pack.id] || 0;
    const card = document.createElement("article");
    card.className = "shop-pack-card";
    card.dataset.packId = pack.id;
    card.innerHTML = `
      <img src="${pack.image}" alt="${escapeHtml(pack.name)}" />
      <h3>${escapeHtml(pack.name)}</h3>
      <p>${escapeHtml(pack.description)}</p>
      <div class="shop-pack-meta">
        <strong><img class="currency-icon" src="assets/ui/coin.png" alt="Pièces" /> ${pack.cost}</strong>
        <span>En stock : <b>${ownedPacks}</b></span>
      </div>
      <div class="shop-pack-actions">
        <button class="primary-btn" type="button">Acheter</button>
        <button class="secondary-btn" type="button" ${ownedPacks ? "" : "disabled"}>Ouvrir</button>
      </div>`;
    const [buyBtn, openBtn] = card.querySelectorAll("button");
    buyBtn.disabled = progress.coins < pack.cost;
    buyBtn.addEventListener("click", () => buyPack(pack.id));
    openBtn.addEventListener("click", () => requestOpenPack(pack.id));
    dom.shopPackGrid.appendChild(card);
  });

  dom.shopInventory.innerHTML = "";
  Object.values(PACK_DEFINITIONS).forEach(pack => {
    const amount = progress.packs[pack.id] || 0;
    const row = document.createElement("div");
    row.className = "shop-inventory-item";
    row.innerHTML = `
      <img src="${pack.image}" alt="${escapeHtml(pack.name)}" />
      <div><strong>${escapeHtml(pack.name)}</strong><small>${amount} paquet(s) prêt(s) à ouvrir</small></div>
      <div><b>${amount}</b></div>`;
    dom.shopInventory.appendChild(row);
  });
}

function buyPack(packId) {
  const pack = PACK_DEFINITIONS[packId];
  if (!pack || progress.coins < pack.cost) return;
  progress.coins -= pack.cost;
  progress.packs[packId] = (progress.packs[packId] || 0) + 1;
  updateDailyQuestProgress("openPack", 1);
  saveProgress();
  renderShop();
}

function requestOpenPack(packId) {
  const pack = PACK_DEFINITIONS[packId];
  if (!pack || !progress.packs[packId]) return;
  progress.packs[packId] -= 1;
  saveProgress();
  packOpeningState = { packId, rewards: generatePackRewards(packId), opening: false, revealed: false };
  dom.packOpeningTitle.textContent = pack.name;
  dom.packOpeningPackImage.src = pack.image;
  dom.packOpeningPackImage.alt = pack.name;
  dom.packOpeningHint.textContent = "Cliquez sur le paquet pour l’ouvrir.";
  dom.packOpeningCards.innerHTML = "";
  dom.packOpeningStage.classList.remove("opening", "revealed");
  dom.packOpeningCloseBtn.disabled = true;
  dom.packOpeningXBtn.classList.add("hidden");
  dom.packOpeningXBtn.disabled = true;
  dom.packOpeningModal.classList.remove("hidden");
  renderShop();
}

function handlePackOpeningStageClick() {
  if (!packOpeningState || packOpeningState.revealed || packOpeningState.opening) return;
  packOpeningState.opening = true;
  dom.packOpeningStage.classList.add("opening");
  dom.packOpeningHint.textContent = "Ouverture en cours...";
  window.setTimeout(revealPackRewards, 950);
}

function revealPackRewards() {
  if (!packOpeningState || packOpeningState.revealed) return;
  packOpeningState.revealed = true;
  dom.packOpeningStage.classList.add("revealed");
  dom.packOpeningHint.textContent = "Nouvelles cartes obtenues !";
  dom.packOpeningCards.innerHTML = "";
  packOpeningState.rewards.forEach((card, index) => {
    progress.collection[card.id] = (progress.collection[card.id] || 0) + 1;
    const el = document.createElement("article");
    el.className = `pack-reward-card rarity-${card.rarity}`;
    el.style.animationDelay = `${index * 70}ms`;
    el.innerHTML = `
      <div class="reward-art">${getCardArtMarkup(card)}</div>
      <strong>${escapeHtml(card.name)}</strong>
      <small>${typeLabel(card.type)} · ${escapeHtml(card.description)}</small>
      <b>${rarityLabel(card.rarity)}</b>`;
    bindCardImageFallback(el, card);
    el.addEventListener("mouseenter", () => previewCard(card));
    dom.packOpeningCards.appendChild(el);
  });
  updateDailyQuestProgress("openPack", 1);
  saveProgress();
  renderShop();
  dom.packOpeningCloseBtn.disabled = false;
  dom.packOpeningXBtn.classList.remove("hidden");
  dom.packOpeningXBtn.disabled = false;
}

function closePackOpeningModal() {
  if (!packOpeningState?.revealed) return;
  dom.packOpeningModal.classList.add("hidden");
  dom.packOpeningStage.classList.remove("opening", "revealed");
  dom.packOpeningCards.innerHTML = "";
  dom.packOpeningXBtn.classList.add("hidden");
  dom.packOpeningXBtn.disabled = true;
  packOpeningState = null;
  renderMenuSummary();
}

function generatePackRewards(packId) {
  const pack = PACK_DEFINITIONS[packId] || PACK_DEFINITIONS.astral;
  const poolCards = (pack.pool || []).map(id => CARD_BY_ID[id]).filter(card => card && card.collectible !== false);
  const grouped = {
    common: poolCards.filter(card => card.rarity === "common"),
    rare: poolCards.filter(card => card.rarity === "rare"),
    epic: poolCards.filter(card => card.rarity === "epic"),
    legendary: poolCards.filter(card => card.rarity === "legendary")
  };
  const rewards = [];
  for (let i = 0; i < CONFIG.PACK_SIZE - 1; i += 1) rewards.push(pickPackCard(grouped, false));
  rewards.push(pickPackCard(grouped, true));
  return shuffle(rewards.slice());
}

function pickPackCard(grouped, guaranteedRareOrBetter) {
  const all = [...grouped.common, ...grouped.rare, ...grouped.epic, ...grouped.legendary];
  const randomPool = list => list.length ? randomItem(list) : randomItem(all);
  const roll = Math.random();
  if (guaranteedRareOrBetter) {
    if (roll < 0.05 && grouped.legendary.length) return randomItem(grouped.legendary);
    if (roll < 0.24 && grouped.epic.length) return randomItem(grouped.epic);
    if (grouped.rare.length) return randomItem(grouped.rare);
    if (grouped.epic.length) return randomItem(grouped.epic);
    return randomPool(grouped.common);
  }
  if (roll < 0.70 && grouped.common.length) return randomItem(grouped.common);
  if (roll < 0.90 && grouped.rare.length) return randomItem(grouped.rare);
  if (roll < 0.98 && grouped.epic.length) return randomItem(grouped.epic);
  if (grouped.legendary.length) return randomItem(grouped.legendary);
  return randomPool(all);
}

function rarityLabel(rarity) {
  return ({ common: "Commune", rare: "Rare", epic: "Épique", legendary: "Légendaire" })[rarity] || rarity;
}

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function generateDailyQuests(dateKey = getTodayKey()) {
  const pool = shuffle(DAILY_QUEST_TEMPLATES.map(q => ({ ...q, reward: { ...q.reward } })));
  return {
    date: dateKey,
    quests: pool.slice(0, 3).map(q => ({ ...q, progress: 0, claimed: false }))
  };
}

function refreshDailyQuestsIfNeeded() {
  if (!progress) return;
  const today = getTodayKey();
  if (!progress.dailyQuests || progress.dailyQuests.date !== today) {
    progress.dailyQuests = generateDailyQuests(today);
    storageSet(STORAGE_KEY, JSON.stringify(progress));
  }
}

function renderQuests() {
  refreshDailyQuestsIfNeeded();
  dom.questsGrid.innerHTML = "";
  const quests = progress.dailyQuests?.quests || [];
  const readyCount = quests.filter(q => q.progress >= q.goal && !q.claimed).length;
  if (dom.questsReadyCount) dom.questsReadyCount.textContent = `${readyCount} prêtes`;
  if (dom.questsSummaryLabel) dom.questsSummaryLabel.textContent = `${quests.length} quête(s) actives`;
  if (dom.questsResetLabel) dom.questsResetLabel.textContent = `Réinitialisation : chaque jour`;

  quests.forEach((quest, index) => {
    const ratio = Math.max(0, Math.min(100, Math.round((quest.progress / quest.goal) * 100)));
    const statusText = quest.claimed ? "Réclamée" : quest.progress >= quest.goal ? "Prête" : "En cours";
    const article = document.createElement("article");
    article.className = `quest-card${quest.progress >= quest.goal ? " completed" : ""}${quest.claimed ? " claimed" : ""}`;
    article.innerHTML = `
      <div class="quest-topline">
        <div class="quest-badge">${escapeHtml(quest.icon || "!")}</div>
        <span class="quest-status-pill ${quest.claimed ? "claimed" : quest.progress >= quest.goal ? "ready" : ""}">${statusText}</span>
      </div>
      <div>
        <h3>${escapeHtml(quest.title)}</h3>
        <p>${escapeHtml(quest.description)}</p>
      </div>
      <div class="quest-progress-text"><span>Progression</span><strong>${quest.progress} / ${quest.goal}</strong></div>
      <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${ratio}%"></div></div>
      <div class="quest-reward-box">
        <div class="quest-reward-icon">${getQuestRewardMarkup(quest.reward)}</div>
        <div><strong>${escapeHtml(getQuestRewardTitle(quest.reward))}</strong><small>${escapeHtml(getQuestRewardDescription(quest.reward))}</small></div>
      </div>
      <button class="${quest.progress >= quest.goal && !quest.claimed ? "primary-btn" : "secondary-btn"}" type="button" ${quest.progress >= quest.goal && !quest.claimed ? "" : "disabled"}>${quest.claimed ? "Déjà récupérée" : quest.progress >= quest.goal ? "Récupérer" : "Quête en cours"}</button>`;
    article.querySelector("button").addEventListener("click", () => claimDailyQuest(index));
    dom.questsGrid.appendChild(article);
  });
}

function getQuestRewardMarkup(reward) {
  if (!reward) return "?";
  if (reward.type === "coins") return '<img class="currency-icon" src="assets/ui/coin.png" alt="Pièces" />';
  if (reward.type === "pack") return `<img src="${escapeHtml(PACK_DEFINITIONS[reward.packId]?.image || "assets/shop/pack_astral.png")}" alt="Paquet" />`;
  if (reward.type === "card") {
    const card = CARD_BY_ID[reward.cardId];
    return card ? getCardArtMarkup(card) : "★";
  }
  if (reward.type === "randomCard") return '<span class="quest-reward-card-icon">★</span>';
  return "★";
}

function getQuestRewardTitle(reward) {
  if (!reward) return "Récompense";
  if (reward.type === "coins") return `${reward.amount} pièces`;
  if (reward.type === "pack") return `${reward.amount || 1} ${PACK_DEFINITIONS[reward.packId]?.name || "paquet"}`;
  if (reward.type === "card") return CARD_BY_ID[reward.cardId]?.name || "Carte";
  if (reward.type === "randomCard") return `${reward.amount || 1} carte ${reward.rarity === "legendary" ? "légendaire" : reward.rarity === "epic" ? "épique" : reward.rarity === "rare" ? "rare" : "aléatoire"}`;
  return "Récompense";
}

function getQuestRewardDescription(reward) {
  if (!reward) return "";
  if (reward.type === "coins") return "Ajoutées immédiatement à votre bourse.";
  if (reward.type === "pack") return "Le paquet est ajouté à votre inventaire de la boutique.";
  if (reward.type === "card") return "Ajoutée directement à votre collection.";
  if (reward.type === "randomCard") return "Ajoutée directement à votre collection.";
  return "";
}

function claimDailyQuest(index) {
  const quest = progress?.dailyQuests?.quests?.[index];
  if (!quest || quest.claimed || quest.progress < quest.goal) return;
  grantQuestReward(quest.reward);
  quest.claimed = true;
  saveProgress();
  renderQuests();
}

function grantQuestReward(reward) {
  if (!reward) return;
  if (reward.type === "coins") {
    progress.coins += reward.amount || 0;
    return;
  }
  if (reward.type === "pack") {
    const amount = reward.amount || 1;
    progress.packs[reward.packId] = (progress.packs[reward.packId] || 0) + amount;
    return;
  }
  if (reward.type === "card") {
    progress.collection[reward.cardId] = (progress.collection[reward.cardId] || 0) + (reward.amount || 1);
    return;
  }
  if (reward.type === "randomCard") {
    const amount = reward.amount || 1;
    for (let i = 0; i < amount; i += 1) {
      const cardId = pickRewardCard(reward.rarity);
      if (cardId) progress.collection[cardId] = (progress.collection[cardId] || 0) + 1;
    }
  }
}

function pickRewardCard(rarity = "rare") {
  const pool = COLLECTIBLE_CARDS.filter(card => card.rarity === rarity);
  if (pool.length) return randomItem(pool).id;
  return randomItem(COLLECTIBLE_CARDS)?.id || null;
}

function updateDailyQuestProgress(event, amount = 1) {
  if (!progress?.dailyQuests?.quests || amount <= 0) return;
  let changed = false;
  for (const quest of progress.dailyQuests.quests) {
    if (quest.claimed || quest.event !== event) continue;
    const next = Math.min(quest.goal, Number(quest.progress || 0) + amount);
    if (next !== quest.progress) { quest.progress = next; changed = true; }
  }
  if (changed) saveProgress();
}

/* ------------------------------- Partie ---------------------------------- */

function startNewGame() {
  startBattle({ mode: "standard" });
}

function startAdventureBattle(encounterId) {
  const encounter = ADVENTURE_BY_ID[encounterId];
  if (!encounter || !isAdventureEncounterUnlocked(encounterId)) return;
  startBattle({ mode: "adventure", encounter });
}

function startBattle({ mode = "standard", encounter = null } = {}) {
  resetHeroDefeatVisuals();
  if (!isDeckStructurallyValid(progress.deck, progress.collection)) { openCollection(); return; }
  draggedPayload = null;
  const playerHeroDef = getHeroDefinition(progress.selectedHeroId);
  const aiHeroDef = mode === "adventure" ? getHeroDefinition(encounter.heroId) : pickAiHeroDefinition(playerHeroDef.id);
  const firstPlayerId = mode === "adventure" ? "player" : (Math.random() < 0.5 ? "player" : "ai");
  const secondPlayerId = getOpponentId(firstPlayerId);
  interactionLocked = firstPlayerId === "ai";
  gameState = {
    status:"playing", mode, adventureId:encounter?.id || null, turnNumber:1, activePlayerId:firstPlayerId, firstPlayerId, pendingAction:null, combatLog:[], cardsPlayedTotal:0,
    player:createPlayerState("player", playerHeroDef),
    ai:createPlayerState("ai", aiHeroDef)
  };
  gameState.player.deck = buildDeck(progress.deck);
  gameState.ai.deck = buildDeck(mode === "adventure" ? buildAdventureDeckList(encounter) : AI_DECK_LIST);
  if (encounter) {
    gameState.ai.hero.maxHealth = encounter.health;
    gameState.ai.hero.currentHealth = encounter.health;
    gameState.ai.hero.armor = encounter.startingArmor || 0;
  }
  for (let i=0;i<CONFIG.STARTING_HAND;i+=1) { drawCard("player",{silent:true}); drawCard("ai",{silent:true}); }
  addCardToHand(secondPlayerId,"token_004");
  gameState[firstPlayerId].mana = { current:1, maximum:1 };

  dom.startScreen.classList.add("hidden");
  dom.collectionScreen.classList.add("hidden");
  dom.shopScreen.classList.add("hidden");
  dom.questsScreen.classList.add("hidden");
  dom.adventureScreen.classList.add("hidden");
  dom.gameScreen.classList.remove("hidden");
  dom.gameOverModal.classList.add("hidden");
  dom.choiceModal.classList.add("hidden");
  dom.gameOverMenuBtn.textContent = mode === "adventure" ? "Retour à l’aventure" : "Menu";
  if(mode === "adventure") addLog(`Aventure : ${encounter.title}. ${encounter.flavor}`);
  addLog(firstPlayerId === "player" ? "La partie commence. Vous jouez en premier." : `${gameState.ai.name} joue en premier. Vous recevez La pièce.`);
  renderGame();
  if(firstPlayerId === "ai") window.setTimeout(async()=>{ if(gameState?.status === "playing" && gameState.activePlayerId === "ai") await playAiTurn(); }, CONFIG.AI_ACTION_DELAY);
}

function buildAdventureDeckList(encounter) {
  const themedPool = PACK_DEFINITIONS[encounter.packTheme]?.pool || AI_DECK_LIST;
  const candidates = [...new Set([...(encounter.signatureCards || []), ...themedPool, ...AI_DECK_LIST])]
    .filter(id => {
      const card = CARD_BY_ID[id];
      return card && card.collectible !== false && card.type !== "token" && card.cost <= (encounter.maxCardCost ?? 99);
    });
  const deck = [];
  const counts = {};
  const addCard = id => {
    const card = CARD_BY_ID[id];
    if (!card) return false;
    const limit = card.rarity === "legendary" ? 1 : 2;
    if ((counts[id] || 0) >= limit || deck.length >= CONFIG.DECK_SIZE) return false;
    deck.push(id); counts[id] = (counts[id] || 0) + 1; return true;
  };
  (encounter.signatureCards || []).forEach(addCard);
  let safety = 0;
  while (deck.length < CONFIG.DECK_SIZE && safety < 20) {
    shuffle([...candidates]).forEach(addCard);
    safety += 1;
  }
  while (deck.length < CONFIG.DECK_SIZE) deck.push(AI_DECK_LIST[deck.length % AI_DECK_LIST.length]);
  return deck.slice(0, CONFIG.DECK_SIZE);
}

function replayCurrentBattle() {
  const adventureId = gameState?.mode === "adventure" ? gameState.adventureId : null;
  if (adventureId) startAdventureBattle(adventureId);
  else startNewGame();
}

function returnAfterGameOver() {
  if (gameState?.mode === "adventure") openAdventure();
  else showMainMenu();
}

function leaveCurrentBattle() {
  if (gameState?.mode === "adventure") openAdventure();
  else showMainMenu();
}

function createPlayerState(id, heroDefinition) {
  const heroDef = getHeroDefinition(heroDefinition?.id || heroDefinition);
  const heroPowerDef = getHeroPowerDefinition(heroDef.powerType);
  return {
    id, name: heroDef.name, heroId: heroDef.id, heroDefinition: heroDef,
    hero:{ currentHealth:CONFIG.HERO_START_HEALTH,maxHealth:CONFIG.HERO_START_HEALTH,armor:0,weapon:null,hasAttacked:false,attacksThisTurn:0 },
    heroPower:{ type:heroDef.powerType,cost:heroPowerDef.cost,usedThisTurn:false },
    mana:{current:0,maximum:0}, deck:[],hand:[],board:[],graveyard:[],secrets:[],quests:[],fatigue:0,
    nextSpellDiscount:0, spellCostReductionThisTurn:0, location:null, cardsPlayedThisTurn:0, spellsPlayedThisTurn:0, cardsDrawnTotal:0
  };
}

function isMinionCardDefinition(card){return card?.type==="creature"||card?.type==="token";}
function buildDeck(list) { return shuffle([...list]).map(createCardInstance); }
function createCardInstance(cardId) { return { instanceId:generateId("card"), cardId, costModifier:0 }; }
function getCardCost(instance, ownerId=null) {
  const card = CARD_BY_ID[instance.cardId] || {};
  let cost = Math.max(0, (card.cost || 0) + (instance.costModifier || 0));
  if (!ownerId || !gameState?.[ownerId]) return cost;

  const owner = gameState[ownerId];
  if (card.dynamicCost === "cardsPlayed") cost -= gameState.cardsPlayedTotal || 0;
  if (card.dynamicCost === "spellPlayedThisTurn" && owner.spellsPlayedThisTurn > 0) cost -= 1;
  if (card.dynamicCost === "cardsDrawn") cost -= owner.cardsDrawnTotal || 0;
  if (card.dynamicCost === "cardsPlayedThisTurn") cost -= owner.cardsPlayedThisTurn || 0;
  if (card.dynamicCost === "friendlyBoardCount") cost -= owner.board.length || 0;
  if (card.type === "spell") {
    cost -= owner.nextSpellDiscount || 0;
    cost -= owner.spellCostReductionThisTurn || 0;
    const auraReduction = owner.board
      .filter(m => !m.dormantTurns && !m.silenced)
      .flatMap(m => m.effects || [])
      .filter(e => e.effect === "spellCostAura")
      .reduce((sum,e) => sum + (e.value || 0), 0);
    cost -= auraReduction;
  }
  if (isMinionCardDefinition(card)) {
    const minionAuraReduction = owner.board
      .filter(m => !m.dormantTurns && !m.silenced)
      .flatMap(m => m.effects || [])
      .filter(e => e.effect === "minionCostAura")
      .reduce((sum,e) => sum + (e.value || 0), 0);
    cost -= minionAuraReduction;
  }
  if (card.marginalDiscount) {
    const hand = gameState[ownerId].hand || [];
    const index = hand.findIndex(c => c.instanceId === instance.instanceId);
    if (index === 0 || index === hand.length - 1) cost -= card.marginalDiscount;
  }
  return Math.max(0, cost);
}

function hasChargeKeyword(source){
  const keywords=Array.isArray(source)?source:(source?.keywords||[]);
  return keywords.some(keyword=>normalizeText(keyword)==="charge");
}
function hasRushKeyword(source){
  const keywords=Array.isArray(source)?source:(source?.keywords||[]);
  return keywords.some(keyword=>{const normalized=normalizeText(keyword);return normalized==="rush"||normalized==="ruee";});
}
function hasActiveDamagedAttackLock(){
  return ["player","ai"].some(ownerId => gameState?.[ownerId]?.board?.some(minion =>
    !minion.dormantTurns && !minion.silenced && (minion.effects||[]).some(effect => effect.effect === "damagedMinionsCannotAttack")
  ));
}
function canMinionAttackNow(minion){
  if(!minion || minion.dormantTurns>0 || minion.frozen || !minion.canAttack || minion.hasAttacked) return false;
  if(hasActiveDamagedAttackLock() && minion.currentHealth < minion.maxHealth) return false;
  return true;
}

function createMinionInstance(card,ownerId,overrides={}) {
  const keywords=[...(overrides.keywords ?? card.keywords ?? [])];
  const dormantTurns=overrides.dormantTurns ?? card.dormantTurns ?? 0;
  return {
    instanceId:generateId("minion"),cardId:card.id,ownerId,name:card.name,
    baseAttack:overrides.attack ?? card.attack,baseHealth:overrides.health ?? card.health,
    attack:overrides.attack ?? card.attack,currentHealth:overrides.health ?? card.health,maxHealth:overrides.maxHealth ?? overrides.health ?? card.health,
    keywords,effects:(overrides.effects ?? card.effects ?? []).map(e=>({...e})),
    canAttack:dormantTurns<=0&&(hasChargeKeyword(keywords)||hasRushKeyword(keywords)),hasAttacked:false,attacksThisTurn:0,summonedThisTurn:true,
    divineShieldActive:keywords.includes("divineShield"),silenced:false,triggerFlags:{...(overrides.triggerFlags||{})},resurrectionPool:[],
    dormantTurns,reincarnationUsed:Boolean(overrides.reincarnationUsed),frozen:Boolean(overrides.frozen),temporaryControl:overrides.temporaryControl||null,temporaryAttackBonus:0,temporaryAttackExpiresTurnOwnerId:null
  };
}

function drawCard(playerId,options={}) {
  const player=gameState[playerId];
  if (!player.deck.length) {
    player.fatigue+=1; dealDamageToHero(playerId,player.fatigue);
    if(!options.silent) {
      addLog(`${player.name} subit ${player.fatigue} dégât(s) de fatigue.`);
      showFatigueBanner(playerId, player.fatigue);
    }
    checkGameOver(); return null;
  }
  const drawn=player.deck.pop();
  if(!options.silent) player.cardsDrawnTotal=(player.cardsDrawnTotal||0)+1;
  if(player.hand.length>=CONFIG.MAX_HAND){ player.graveyard.push(drawn); if(!options.silent)addLog(`${player.name} brûle ${CARD_BY_ID[drawn.cardId].name}.`); return null; }
  player.hand.push(drawn);
  if(!options.silent)addLog(playerId==="player"?`Vous piochez ${CARD_BY_ID[drawn.cardId].name}.`:"L’adversaire pioche une carte.");
  return drawn;
}

function showFatigueBanner(playerId, amount) {
  if (!dom.fatigueBanner || !dom.fatigueBannerValue) return;
  clearTimeout(fatigueBannerTimer);
  dom.fatigueBannerLabel.textContent = "Fatigue";
  dom.fatigueBannerValue.textContent = `(${amount})`;
  dom.fatigueBanner.classList.remove("hidden", "visible", "player-side", "enemy-side");
  dom.fatigueBanner.offsetWidth;
  dom.fatigueBanner.classList.add("visible", playerId === "player" ? "player-side" : "enemy-side");
  fatigueBannerTimer = setTimeout(() => {
    dom.fatigueBanner.classList.remove("visible", "player-side", "enemy-side");
    dom.fatigueBanner.classList.add("hidden");
  }, 1650);
}

function endTurnCleanup(ownerId){
  clearTemporaryAttackBonuses(ownerId);
  if(gameState?.[ownerId])gameState[ownerId].spellCostReductionThisTurn=0;
  returnTemporaryControlledMinions(ownerId);
  gameState[ownerId].board.forEach(minion=>{
    if(minion.frozen){
      minion.frozen=false;
      minion.canAttack=false;
      minion.hasAttacked=false;
      addLog(`${minion.name} dégèle.`);
    }
  });
}

function freezeMinion(minion){
  if(!minion||minion.dormantTurns>0)return;
  minion.frozen=true;
  minion.canAttack=false;
  addLog(`${minion.name} est gelé.`);
}

function takeTemporaryControl(ownerId,instanceId){
  const minion=findMinionById(instanceId);if(!minion)return null;
  const originalOwnerId=minion.ownerId;
  if(originalOwnerId===ownerId)return minion;
  if(gameState[ownerId].board.length>=CONFIG.MAX_BOARD){addLog(`Le plateau de ${gameState[ownerId].name} est plein.`);return null;}
  const index=gameState[originalOwnerId].board.findIndex(m=>m.instanceId===instanceId);if(index<0)return null;
  gameState[originalOwnerId].board.splice(index,1);
  const hadCharge=hasChargeKeyword(minion);
  minion.ownerId=ownerId;
  minion.temporaryControl={originalOwnerId,controllerId:ownerId,grantedCharge:!hadCharge};
  if(!hadCharge)minion.keywords.push("charge");
  minion.summonedThisTurn=true;minion.hasAttacked=false;minion.attacksThisTurn=0;minion.canAttack=!minion.frozen&&minion.dormantTurns<=0;
  gameState[ownerId].board.push(minion);
  addLog(`${gameState[ownerId].name} prend temporairement le contrôle de ${minion.name}.`);
  return minion;
}

function returnTemporaryControlledMinions(controllerId){
  const controlled=[...gameState[controllerId].board].filter(minion=>minion.temporaryControl?.controllerId===controllerId);
  for(const minion of controlled){
    const currentIndex=gameState[controllerId].board.findIndex(m=>m.instanceId===minion.instanceId);if(currentIndex<0)continue;
    gameState[controllerId].board.splice(currentIndex,1);
    const originalOwnerId=minion.temporaryControl.originalOwnerId;
    if(minion.temporaryControl.grantedCharge)minion.keywords=minion.keywords.filter(keyword=>normalizeText(keyword)!=="charge");
    minion.temporaryControl=null;minion.ownerId=originalOwnerId;minion.canAttack=false;minion.hasAttacked=true;minion.summonedThisTurn=true;
    if(gameState[originalOwnerId].board.length>=CONFIG.MAX_BOARD){
      gameState[originalOwnerId].graveyard.push(createCardInstance(minion.cardId));
      addLog(`${minion.name} ne peut pas revenir : le plateau est plein.`);
    }else{
      gameState[originalOwnerId].board.push(minion);
      addLog(`${minion.name} retourne dans son camp.`);
    }
  }
}

function beginTurn(playerId) {
  if(gameState.status!=="playing")return;
  gameState.activePlayerId=playerId; gameState.pendingAction=null;
  const p=gameState[playerId];
  p.cardsPlayedThisTurn=0;p.spellsPlayedThisTurn=0;p.spellCostReductionThisTurn=0;
  p.mana.maximum=Math.min(CONFIG.MAX_MANA,p.mana.maximum+1); p.mana.current=p.mana.maximum;
  p.hero.hasAttacked=false;p.hero.attacksThisTurn=0;p.heroPower.usedThisTurn=false;
  if(p.hero.weapon){p.hero.weapon.attack=p.hero.weapon.baseAttack ?? p.hero.weapon.attack;}
  p.board.forEach(m=>{
    if(m.dormantTurns>0){m.dormantTurns-=1;if(m.dormantTurns===0)addLog(`${m.name} se réveille.`);}
    m.attacksThisTurn=0;m.hasAttacked=false;m.summonedThisTurn=false;
    m.canAttack=m.dormantTurns<=0&&!m.frozen;
  });
  resolveLocationStart(playerId);
  resolveTriggeredEffects(playerId,"startOfTurn"); drawCard(playerId); resolveDeaths(); checkGameOver(); renderGame();
}

async function endPlayerTurn() {
  if(!canPlayerInteract())return;
  interactionLocked=true; gameState.pendingAction=null;
  resolveTriggeredEffects("player","endOfTurn"); resolveDeaths(); endTurnCleanup("player"); renderGame();
  if(checkGameOver())return;
  gameState.turnNumber+=1; beginTurn("ai"); addLog(`Tour ${gameState.turnNumber} : l’adversaire joue.`); renderGame();
  await sleep(CONFIG.AI_ACTION_DELAY); await playAiTurn();
}

async function playAiTurn() {
  if(gameState.status!=="playing")return;
  let safety=0;
  while(safety++<24 && gameState.status==="playing") {
    const action=chooseBestAiPlay(); if(!action)break;
    await executeAiPlay(action); await sleep(CONFIG.AI_ACTION_DELAY);
  }

  if(canUseHeroPower("ai") && (gameState.ai.hero.currentHealth<=22 || gameState.ai.mana.current>=4)) {
    useAiHeroPower(); await sleep(CONFIG.AI_ACTION_DELAY);
  }

  for(const snapshot of [...gameState.ai.board]) {
    let attacker=findMinionById(snapshot.instanceId);
    while(attacker&&canMinionAttackNow(attacker)&&gameState.status==="playing"){
      const target=chooseAiAttackTarget(attacker.attack,{kind:"minion",instanceId:attacker.instanceId,ownerId:"ai"}); if(!target)break;
      await performAttack({kind:"minion",instanceId:attacker.instanceId,ownerId:"ai"},target); await sleep(CONFIG.AI_ACTION_DELAY);
      attacker=findMinionById(snapshot.instanceId);
    }
    if(gameState.status!=="playing")return;
  }
  if(canHeroAttack("ai")) {
    const target=chooseAiAttackTarget(gameState.ai.hero.weapon.attack,{kind:"hero",instanceId:null,ownerId:"ai"});
    if(target) { await performAttack({kind:"hero",instanceId:null,ownerId:"ai"},target); await sleep(CONFIG.AI_ACTION_DELAY); }
  }

  resolveTriggeredEffects("ai","endOfTurn"); resolveDeaths(); endTurnCleanup("ai"); if(checkGameOver())return;
  gameState.turnNumber+=1; beginTurn("player"); addLog(`Tour ${gameState.turnNumber} : à vous de jouer.`); interactionLocked=false; renderGame();
}

function chooseBestAiPlay() {
  const candidates=[];
  gameState.ai.hand.forEach((instance,handIndex)=>{
    const card=CARD_BY_ID[instance.cardId]; if(!isCardPlayable("ai",instance))return;
    let target=null,score=getCardCost(instance,"ai");
    if(cardNeedsTarget(card)) { const effect=getManualEffect(card); target=chooseAiTarget(effect); if(!target)return; }
    if(isMinionCardDefinition(card))score=card.attack+(card.health*.75)+(card.keywords?.includes("taunt")?3:0)+(card.keywords?.includes("charge")?2:0);
    if(card.type==="weapon")score=card.attack*card.durability+3;
    if(card.type==="location")score=12;
    if(card.type==="secret")score=gameState.ai.secrets.length?5:10;
    if(card.type==="quest")score=gameState.ai.quests.length?4:11;
    if(card.type==="spell")score=scoreAiEffects(card.effects,target);
    if(card.choices)score=12;
    candidates.push({instance,handIndex,card,target,score});
  });
  candidates.sort((a,b)=>b.score-a.score||getCardCost(b.instance,"ai")-getCardCost(a.instance,"ai"));
  return candidates[0]||null;
}

function scoreAiEffects(effects,target) {
  let score=0;
  for(const e of effects){
    if(e.effect==="damage") { if(target?.kind==="hero"&&gameState.player.hero.currentHealth<=e.value)return 1000; score+=target?.kind==="minion"?18:8; }
    else if(e.effect==="areaDamage")score+=gameState.player.board.length*e.value*2-(e.target==="allCreatures"?gameState.ai.board.length*e.value:0);
    else if(e.effect==="heal")score+=gameState.ai.hero.currentHealth<=20?16:-4;
    else if(e.effect==="draw")score+=gameState.ai.hand.length<=5?14:4;
    else if(e.effect==="buff")score+=gameState.ai.board.length?12:-50;
    else if(e.effect==="transform")score+=target?20:-50;
    else if(e.effect==="destroyIfDamaged")score+=target?22:-50;
    else if(e.effect==="nextSpellDiscount")score+=12;
    else if(["destroyDamagedEnemy","destroyAndSummonCopy","arenaLastSurvivor"].includes(e.effect))score+=22;
    else if(["buffStats","buffStatsAndKeyword","grantReincarnation","silenceAndBuff"].includes(e.effect))score+=gameState.ai.board.length?14:-30;
    else if(["freeze","freezeAllEnemyMinions","freezeRandomEnemy"].includes(e.effect))score+=12;
    else if(["temporaryControl","forceAllMinionsAttackRandom","forceAllOtherMinionsAttackRandom","forceTargetAttackRandomAlly"].includes(e.effect))score+=18;
    else if(["gainEmptyManaCrystal","gainManaCrystalIfEmpty","refreshMana","gainTemporaryMana","gainEmptyManaIfCardsPlayed"].includes(e.effect))score+=14;
    else if(e.effect==="randomDamage")score+=e.value*(e.count||1)*3;
    else score+=8;
  }
  return score;
}

function chooseAiTarget(effect) {
  const targets=getValidTargetsForEffect("ai",effect); if(!targets.length)return null;
  if(effect.effect==="heal")return targets.sort((a,b)=>getMissingHealth(b)-getMissingHealth(a))[0];
  if(["buff","buffStats","buffStatsAndKeyword","grantReincarnation","silenceAndBuff"].includes(effect.effect))return targets.filter(t=>t.kind==="minion").sort((a,b)=>minionThreat(findMinionById(b.instanceId))-minionThreat(findMinionById(a.instanceId)))[0];
  if(["damage","transform","silence","destroyIfDamaged","freeze","temporaryControl","forceTargetAttackRandomAlly"].includes(effect.effect)){
    const hero=targets.find(t=>t.kind==="hero");
    if(effect.effect==="damage"&&hero&&gameState.player.hero.currentHealth<=effect.value)return hero;
    return targets.filter(t=>t.kind==="minion").sort((a,b)=>minionThreat(findMinionById(b.instanceId))-minionThreat(findMinionById(a.instanceId)))[0]||hero||targets[0];
  }
  return targets[0];
}

async function executeAiPlay(action) {
  await playCardFromHand("ai",action.handIndex,action.target);
  renderGame();
}

function chooseAiAttackTarget(attackValue,attackerRef=null) {
  const targets=getValidAttackTargets("ai",attackerRef); if(!targets.length)return null;
  const hero=targets.find(t=>t.kind==="hero"); if(hero&&gameState.player.hero.currentHealth+gameState.player.hero.armor<=attackValue)return hero;
  const favorable=targets.filter(t=>t.kind==="minion").map(t=>({t,m:findMinionById(t.instanceId)})).filter(x=>x.m&&x.m.currentHealth<=attackValue).sort((a,b)=>minionThreat(b.m)-minionThreat(a.m))[0];
  return favorable?.t||hero||targets[0];
}
function minionThreat(m){return m?m.attack*2+m.currentHealth+(m.keywords?.length||0)*2:0;}

/* ------------------------- Jouer cartes / effets -------------------------- */

async function playCardFromHand(playerId,handIndex,target=null) {
  const p=gameState[playerId],instance=p.hand[handIndex]; if(!instance)return false;
  const card=CARD_BY_ID[instance.cardId]; if(!isCardPlayable(playerId,instance))return false;
  if(cardNeedsTarget(card)){ const effect=getManualEffect(card); if(!target||!isTargetValidForEffect(playerId,effect,target))return false; }

  let selectedEffects=card.effects||[];
  if(card.choices?.length) {
    const choice=await requestChoice(playerId,card); if(!choice)return false;
    selectedEffects=choice.effects||[];
  }

  const spentMana=getCardCost(instance,playerId);
  const consumedNextSpellDiscount=card.type==="spell"?(p.nextSpellDiscount||0):0;
  if(card.type==="spell")p.nextSpellDiscount=0;
  p.mana.current-=spentMana;p.hand.splice(handIndex,1);gameState.pendingAction=null;
  if(playerId==="player"){updateDailyQuestProgress("playCard",1);updateDailyQuestProgress("spendMana",spentMana);}
  if(consumedNextSpellDiscount)addLog(`Écho du firmament réduit ce sort de (${consumedNextSpellDiscount}).`);

  let playedMinion=null;
  if(isMinionCardDefinition(card)) {
    playedMinion=createMinionInstance(card,playerId);p.board.push(playedMinion);if(gameState.pendingAction)gameState.pendingAction.sourceMinionInstanceId=playedMinion.instanceId;markTauntEntrance(playedMinion);window.ASTREA_CARD_AUDIO?.play(card);
    updateQuestProgress(playerId,"creatureSummoned",1);if(playerId==="player")updateDailyQuestProgress("creatureSummoned",1);
    addLog(`${p.name} invoque ${card.name}.`);
    resolveEffects(selectedEffects.filter(e=>e.trigger==="battlecry"),{ownerId:playerId,sourceMinion:playedMinion,chosenTarget:target,playedCard:card});
    resolveSecrets(getOpponentId(playerId),"afterEnemyPlaysCreature",{playedCard:card,playedMinion,enemyId:playerId});
  } else if(card.type==="weapon") {
    equipWeapon(playerId,card,instance);addLog(`${p.name} équipe ${card.name}.`);
    resolveEffects(selectedEffects.filter(e=>e.trigger==="onPlay"),{ownerId:playerId,chosenTarget:target,playedCard:card});
  } else if(card.type==="location") {
    equipLocation(playerId,card,instance);addLog(`${p.name} établit ${card.name}.`);
  } else if(card.type==="secret") {
    p.secrets.push(instance);addLog(playerId==="player"?`Vous préparez le secret ${card.name}.`:`L’adversaire prépare un secret.`);
  } else if(card.type==="quest") {
    p.quests.push({...instance,progress:0});addLog(`${p.name} lance la quête ${card.name}.`);
  } else if(card.type==="spell") {
    addLog(`${p.name} lance ${card.name}.`);
    const secretResult=resolveSecrets(getOpponentId(playerId),"beforeEnemySpell",{playedCard:card,enemyId:playerId});
    if(!secretResult.cancelled)resolveEffects(selectedEffects.filter(e=>e.trigger==="onPlay"),{ownerId:playerId,chosenTarget:target,playedCard:card});
    else addLog(`${card.name} est contré.`);
    updateQuestProgress(playerId,"spellPlayed",1);if(playerId==="player")updateDailyQuestProgress("spellPlayed",1);
    p.graveyard.push(instance);
  }

  gameState.cardsPlayedTotal=(gameState.cardsPlayedTotal||0)+1;
  p.cardsPlayedThisTurn=(p.cardsPlayedThisTurn||0)+1;
  if(card.type==="spell")p.spellsPlayedThisTurn=(p.spellsPlayedThisTurn||0)+1;
  notifyCardPlayed(playerId,card,playedMinion?.instanceId||null);
  resolveDeaths();checkGameOver();renderGame();return true;
}

function equipWeapon(ownerId,card,instance) {
  const p=gameState[ownerId];
  if(p.hero.weapon){ p.graveyard.push(createCardInstance(p.hero.weapon.cardId)); addLog(`${p.hero.weapon.name} est remplacée.`); }
  p.hero.weapon={instanceId:generateId("weapon"),cardId:card.id,name:card.name,attack:card.attack,baseAttack:card.attack,durability:card.durability,maxDurability:card.durability,keywords:[...(card.keywords||[])],divineShieldActive:(card.keywords||[]).includes("heroDivineShield"),effects:(card.effects||[]).map(e=>({...e}))};
  p.hero.attacksThisTurn=0;p.hero.hasAttacked=false;
}

function equipLocation(ownerId,card,instance){
  const p=gameState[ownerId];
  if(p.location){p.graveyard.push(createCardInstance(p.location.cardId));addLog(`${p.location.name} est remplacé.`);}
  p.location={instanceId:instance.instanceId,cardId:card.id,name:card.name,durability:card.durability,maxDurability:card.durability,effects:(card.effects||[]).map(e=>({...e}))};
}
function resolveLocationStart(ownerId){
  const location=gameState[ownerId].location;if(!location)return;
  resolveEffects(location.effects.filter(e=>e.trigger==="startOfTurn"),{ownerId,playedCard:CARD_BY_ID[location.cardId]});
  location.durability-=1;
  if(location.durability<=0){addLog(`${location.name} s'effondre.`);gameState[ownerId].graveyard.push(createCardInstance(location.cardId));gameState[ownerId].location=null;}
}

function resolveEffects(effects,context) { for(const effect of effects) { resolveEffect(effect,context); resolveDeaths(); if(checkGameOver())break; } }
function resolveTriggeredEffects(ownerId,trigger) {
  [...gameState[ownerId].board].forEach(m=>{
    if(!findMinionById(m.instanceId)||m.dormantTurns>0)return;
    resolveEffects(m.effects.filter(e=>e.trigger===trigger),{ownerId,sourceMinion:m});
  });
}

function notifyCardPlayed(ownerId,card,playedMinionInstanceId=null){
  for(const side of ["player","ai"]){
    for(const minion of [...gameState[side].board]){
      if(minion.dormantTurns>0||minion.instanceId===playedMinionInstanceId||!findMinionById(minion.instanceId))continue;
      resolveEffects(minion.effects.filter(e=>e.trigger==="afterAnyCardPlayed"),{ownerId:side,sourceMinion:minion,playedCard:card,playedBy:ownerId});
    }
  }
  if(card.type==="spell"){
    for(const minion of [...gameState[ownerId].board]){
      if(minion.dormantTurns>0||!findMinionById(minion.instanceId))continue;
      resolveEffects(minion.effects.filter(e=>e.trigger==="afterOwnerSpellPlayed"),{ownerId,sourceMinion:minion,playedCard:card});
    }
  }
  if(isMinionCardDefinition(card)){
    for(const minion of [...gameState[ownerId].board]){
      if(minion.dormantTurns>0||minion.instanceId===playedMinionInstanceId||!findMinionById(minion.instanceId))continue;
      resolveEffects(minion.effects.filter(e=>e.trigger==="afterOwnerCreaturePlayed"),{ownerId,sourceMinion:minion,playedCard:card});
    }
  }
}

function forceMinionCombat(attacker,target){
  if(!attacker||!target||attacker.instanceId===target.instanceId||attacker.dormantTurns>0||target.dormantTurns>0)return;
  if(!findMinionById(attacker.instanceId)||!findMinionById(target.instanceId))return;
  const attackerDamage=attacker.attack,targetDamage=target.attack;
  dealDamageToMinion(target,attackerDamage);
  dealDamageToMinion(attacker,targetDamage);
  addLog(`${attacker.name} est forcé d’attaquer ${target.name} (${attackerDamage} ↔ ${targetDamage}).`);
  if(findMinionById(attacker.instanceId))resolveEffects(attacker.effects.filter(e=>e.trigger==="afterAttack"),{ownerId:attacker.ownerId,sourceMinion:attacker,attackedTarget:{ownerId:target.ownerId,kind:"minion",instanceId:target.instanceId}});
  resolveDeaths();
}

function forceAllMinionsAttackRandom(excludedInstanceId=null){
  const snapshots=shuffle([...gameState.player.board,...gameState.ai.board].filter(m=>!m.dormantTurns&&m.instanceId!==excludedInstanceId));
  for(const snapshot of snapshots){
    const attacker=findMinionById(snapshot.instanceId);if(!attacker)continue;
    const candidates=[...gameState.player.board,...gameState.ai.board].filter(m=>!m.dormantTurns&&m.instanceId!==attacker.instanceId);
    if(!candidates.length)continue;
    forceMinionCombat(attacker,randomItem(candidates));
  }
}

function forceTargetAttackRandomAlly(instanceId){
  const attacker=findMinionById(instanceId);if(!attacker)return;
  const candidates=gameState[attacker.ownerId].board.filter(m=>!m.dormantTurns&&m.instanceId!==attacker.instanceId);
  if(candidates.length)forceMinionCombat(attacker,randomItem(candidates));
}


function cardHasTribe(card,tribe){
  const expected=normalizeText(tribe||"");
  const actual=normalizeText(card?.tribe||"");
  if(expected==="mech")return actual==="mech"||actual==="construct";
  return Boolean(expected)&&actual===expected;
}
function minionHasTribe(minion,tribe){return cardHasTribe(CARD_BY_ID[minion?.cardId],tribe);}
function returnMinionToHand(instanceId,discount=0){
  const minion=findMinionById(instanceId);if(!minion)return null;
  const ownerId=minion.ownerId,player=gameState[ownerId],index=player.board.findIndex(m=>m.instanceId===instanceId);if(index<0)return null;
  player.board.splice(index,1);
  const instance=createCardInstance(minion.cardId);instance.costModifier-=Math.max(0,discount||0);
  if(player.hand.length>=CONFIG.MAX_HAND){player.graveyard.push(instance);addLog(`${minion.name} est brûlé car la main est pleine.`);return null;}
  player.hand.push(instance);addLog(`${minion.name} retourne dans la main de ${player.name}${discount?` et coûte (${discount}) de moins`:""}.`);return instance;
}
function addRandomTribeCardToHand(ownerId,tribe,maxCost=null){
  const pool=COLLECTIBLE_CARDS.filter(card=>card.type==="creature"&&cardHasTribe(card,tribe)&&(maxCost==null||card.cost<=maxCost));
  if(!pool.length)return null;return addCardToHand(ownerId,randomItem(pool).id);
}
function addTemporaryAttack(minion,value){
  if(!minion||!value)return;
  minion.attack+=value;minion.temporaryAttackBonus=(minion.temporaryAttackBonus||0)+value;minion.temporaryAttackExpiresTurnOwnerId=gameState.activePlayerId;
  addLog(`${minion.name} gagne +${value} ATQ ce tour-ci.`);
}
function clearTemporaryAttackBonuses(turnOwnerId){
  for(const minion of [...gameState.player.board,...gameState.ai.board]){
    if(minion.temporaryAttackExpiresTurnOwnerId!==turnOwnerId||!minion.temporaryAttackBonus)continue;
    minion.attack=Math.max(0,minion.attack-minion.temporaryAttackBonus);minion.temporaryAttackBonus=0;minion.temporaryAttackExpiresTurnOwnerId=null;
  }
}
function targetSurvived(target){
  if(!target)return false;
  if(target.kind==="hero")return gameState[target.ownerId].hero.currentHealth>0;
  const minion=findMinionById(target.instanceId);return Boolean(minion&&minion.currentHealth>0);
}

function resolveEffect(effect,context={}) {
  const ownerId=context.ownerId,opponentId=getOpponentId(ownerId),target=context.chosenTarget;
  switch(effect.effect) {
    case "damage": {
      const targets=target?[target]:getAutomaticTargets(ownerId,effect.target,context.sourceMinion);
      targets.forEach(t=>applyDamageToTarget(t,effect.value));break;
    }
    case "heal": {
      const healingTargets=target?[target]:getAutomaticTargets(ownerId,effect.target,context.sourceMinion);
      let totalHealed=0;
      healingTargets.forEach(t=>{const healed=healTarget(t,effect.value);totalHealed+=healed;if(healed>0&&t.ownerId===ownerId)notifyAllyHealed(ownerId,t,healed);});
      if(totalHealed>0)updateQuestProgress(ownerId,"healingDone",totalHealed);break;
    }
    case "draw": for(let i=0;i<effect.value;i+=1)drawCard(ownerId);break;
    case "gainMaxHealth": gameState[ownerId].hero.maxHealth+=effect.value;gameState[ownerId].hero.currentHealth+=effect.value;addLog(`${gameState[ownerId].name} gagne ${effect.value} PV maximum.`);break;
    case "armor": gameState[ownerId].hero.armor+=effect.value;addLog(`${gameState[ownerId].name} gagne ${effect.value} Armure.`);break;
    case "silence": {const m=findMinionById(target?.instanceId);if(m)silenceMinion(m);break;}
    case "areaDamage": {
      let targets=[];
      if(effect.target==="allEnemyCreatures")targets=[...gameState[opponentId].board].filter(m=>!m.dormantTurns).map(m=>({ownerId:opponentId,kind:"minion",instanceId:m.instanceId}));
      if(effect.target==="allFriendlyCreatures")targets=[...gameState[ownerId].board].filter(m=>!m.dormantTurns).map(m=>({ownerId,kind:"minion",instanceId:m.instanceId}));
      if(effect.target==="allCreatures")targets=[...gameState.player.board,...gameState.ai.board].filter(m=>!m.dormantTurns).map(m=>({ownerId:m.ownerId,kind:"minion",instanceId:m.instanceId}));
      if(effect.target==="allEnemies")targets=[{ownerId:opponentId,kind:"hero",instanceId:null},...gameState[opponentId].board.filter(m=>!m.dormantTurns).map(m=>({ownerId:opponentId,kind:"minion",instanceId:m.instanceId}))];
      targets.forEach(t=>applyDamageToTarget(t,effect.value));addLog(`${effect.value} dégât(s) de zone sont infligés.`);break;
    }
    case "buff": {const m=findMinionById(target?.instanceId);if(m)buffMinion(m,effect.value,effect.value);break;}
    case "buffStats": {const m=findMinionById(target?.instanceId);if(m&&m.instanceId!==context.sourceMinion?.instanceId)buffMinion(m,effect.attack||0,effect.health||0);break;}
    case "buffStatsAndKeyword": {const m=findMinionById(target?.instanceId);if(m){buffMinion(m,effect.attack||0,effect.health||0);if(effect.keyword&&!m.keywords.includes(effect.keyword))m.keywords.push(effect.keyword);}break;}
    case "buffSelf": {const m=context.sourceMinion;if(m&&findMinionById(m.instanceId))buffMinion(m,effect.attack||0,effect.health||0);break;}
    case "buffRandomFriendly": {const list=gameState[ownerId].board.filter(m=>m.instanceId!==context.sourceMinion?.instanceId&&!m.dormantTurns);if(list.length)buffMinion(randomItem(list),effect.value,effect.value);break;}
    case "buffAllFriendly": gameState[ownerId].board.filter(m=>!m.dormantTurns&&(!effect.excludeSelf||m.instanceId!==context.sourceMinion?.instanceId)).forEach(m=>buffMinion(m,effect.value,effect.value));break;
    case "summon": for(let i=0;i<(effect.count||1);i+=1)summonCard(ownerId,effect.cardId);break;
    case "transform": transformMinion(target?.instanceId,effect.cardId);break;
    case "randomDamage": for(let i=0;i<(effect.count||1);i+=1){const targets=getRandomTargetPool(ownerId,effect.target);if(targets.length)applyDamageToTarget(randomItem(targets),effect.value);}break;
    case "randomDamageConditionalStealth": {
      const targets=getRandomTargetPool(ownerId,effect.target);if(targets.length){const chosen=randomItem(targets);applyDamageToTarget(chosen,effect.value);if(chosen.kind==="minion"&&context.sourceMinion&&!context.sourceMinion.keywords.includes("stealth")){context.sourceMinion.keywords.push("stealth");addLog(`${context.sourceMinion.name} gagne Camouflage.`);}}break;
    }
    case "destroyIfDamaged": {const m=findMinionById(target?.instanceId);if(m&&m.currentHealth<m.maxHealth){m.currentHealth=0;addLog(`${m.name} est englouti par la faille.`);}break;}
    case "destroyDamagedEnemy": {const list=gameState[opponentId].board.filter(m=>!m.dormantTurns&&m.currentHealth<m.maxHealth);if(list.length){const victim=list.sort((a,b)=>minionThreat(b)-minionThreat(a))[0];victim.currentHealth=0;addLog(`${victim.name} est consumé par Vorakel.`);}break;}
    case "destroyAndSummonCopy": {
      const victim=findMinionById(target?.instanceId);if(!victim)break;const card=CARD_BY_ID[victim.cardId];victim.currentHealth=0;resolveDeaths();
      if(card&&gameState[ownerId].board.length<CONFIG.MAX_BOARD){const copy=createMinionInstance(card,ownerId,{attack:effect.attack||5,health:effect.health||5,maxHealth:effect.health||5});copy.canAttack=false;gameState[ownerId].board.push(copy);window.ASTREA_CARD_AUDIO?.play(card);addLog(`${gameState[ownerId].name} invoque une copie 5/5 de ${card.name}.`);}break;
    }
    case "arenaLastSurvivor": resolveArenaLastSurvivor(ownerId);break;
    case "nextSpellDiscount": gameState[ownerId].nextSpellDiscount=(gameState[ownerId].nextSpellDiscount||0)+effect.value;addLog(`Le prochain sort de ${gameState[ownerId].name} coûte (${effect.value}) de moins.`);break;
    case "reduceRandomHandCost": {const list=gameState[ownerId].hand;if(list.length){const inst=randomItem(list);inst.costModifier-=effect.value;addLog(`Le coût de ${CARD_BY_ID[inst.cardId].name} est réduit de ${effect.value}.`);}break;}
    case "discountSpellsInHand": {const spells=gameState[ownerId].hand.filter(inst=>CARD_BY_ID[inst.cardId]?.type==="spell");spells.forEach(inst=>{inst.costModifier-=effect.value;});if(spells.length)addLog(`${spells.length} sort(s) coûtent ${effect.value} cristal de moins.`);break;}
    case "addCardToHand": for(let i=0;i<(effect.count||1);i+=1)addCardToHand(ownerId,effect.cardId);break;
    case "discoverRandom": {const pool=(effect.cardIds||[]).filter(id=>CARD_BY_ID[id]);if(pool.length)addCardToHand(ownerId,randomItem(pool));break;}
    case "discoverAnyCardDiscountSpell": {
      const pool=COLLECTIBLE_CARDS.filter(card=>card.id!==context.playedCard?.id);if(!pool.length)break;const chosen=randomItem(pool);const inst=addCardToHand(ownerId,chosen.id);if(inst&&chosen.type==="spell")inst.costModifier-=effect.value||1;addLog(`${gameState[ownerId].name} découvre ${chosen.name}.`);break;
    }
    case "grantReincarnation": {const m=findMinionById(target?.instanceId);if(m&&!m.keywords.includes("reincarnation")){m.keywords.push("reincarnation");addLog(`${m.name} reçoit Réincarnation.`);}break;}
    case "reincarnateSource": {const source=context.sourceMinion;if(source&&!source.triggerFlags.reincarnated)summonReincarnated(ownerId,source,effect.health||1);break;}
    case "fillBoardRandomLowCost": fillBoardRandomLowCost(ownerId,effect.maxCost||3);break;
    case "damageOwnHero": dealDamageToHero(ownerId,effect.value||0);addLog(`${gameState[ownerId].name} subit ${effect.value||0} dégât(s) du Râle d’agonie.`);break;
    case "buffSelfOnce": {const m=context.sourceMinion;if(m&&!m.triggerFlags.afterDamagedBuff){m.triggerFlags.afterDamagedBuff=true;buffMinion(m,effect.attack||0,effect.health||0);}break;}
    case "gainAttack": {const m=context.sourceMinion;if(m){m.attack+=effect.value;addLog(`${m.name} gagne +${effect.value} ATQ.`);}break;}
    case "buffSelfPerFriendly": {const m=context.sourceMinion;if(m){const amount=Math.max(0,gameState[ownerId].board.length-1)*(effect.value||1);if(amount)buffMinion(m,amount,amount);}break;}
    case "drawFromTopThree": drawBestOfTopThree(ownerId);break;
    case "devourBoard": {const source=context.sourceMinion;if(!source)break;const victims=[...gameState.player.board,...gameState.ai.board].filter(m=>m.instanceId!==source.instanceId&&!m.dormantTurns);source.resurrectionPool=victims.map(m=>m.cardId);victims.forEach(m=>{m.currentHealth=0;});addLog(`${source.name} engloutit ${victims.length} autre(s) créature(s).`);break;}
    case "resurrectFromSource": {const pool=[...(context.sourceMinion?.resurrectionPool||[])];shuffle(pool);for(let i=0;i<Math.min(effect.count||3,pool.length);i+=1)summonCard(ownerId,pool[i]);break;}
    case "summonRandomHighCostAndAttack": summonRandomHighCostAndAttack(ownerId,effect.count||2,effect.minCost||5);break;
    case "summonCopyFromContext": {const source=context.secretContext?.playedMinion;if(source&&gameState[ownerId].board.length<CONFIG.MAX_BOARD){const original=CARD_BY_ID[source.cardId];const copy=createMinionInstance(original,ownerId,{attack:effect.attack||1,health:effect.health||1,maxHealth:effect.health||1,keywords:[],effects:[]});gameState[ownerId].board.push(copy);window.ASTREA_CARD_AUDIO?.play(original);addLog(`${gameState[ownerId].name} invoque un reflet 1/1 de ${source.name}.`);}break;}
    case "counterSpell": if(context.secretContext)context.secretContext.cancelled=true;break;
    case "destroy": {const m=findMinionById(target?.instanceId);if(m)m.currentHealth=0;break;}
    case "silenceAndBuff": {const m=findMinionById(target?.instanceId);if(m){silenceMinion(m);buffMinion(m,effect.attack||0,effect.health||0);}break;}
    case "buffSelfAfterAttackingMinion": {const m=context.sourceMinion;if(m&&context.attackedTarget?.kind==="minion"&&findMinionById(m.instanceId))buffMinion(m,effect.attack||0,effect.health||0);break;}
    case "damageBothHeroes": {dealDamageToHero("player",effect.value||0);dealDamageToHero("ai",effect.value||0);addLog(`Les deux héros subissent ${effect.value||0} dégât(s).`);break;}
    case "destroyRandomDamagedMinion": {const list=[...gameState.player.board,...gameState.ai.board].filter(m=>!m.dormantTurns&&m.currentHealth<m.maxHealth);if(list.length){const victim=randomItem(list);victim.currentHealth=0;addLog(`${victim.name} est détruit aléatoirement.`);}break;}
    case "freeze": {const m=findMinionById(target?.instanceId);if(m)freezeMinion(m);break;}
    case "freezeAllEnemyMinions": gameState[opponentId].board.filter(m=>!m.dormantTurns).forEach(freezeMinion);break;
    case "freezeRandomEnemy": {const list=gameState[opponentId].board.filter(m=>!m.dormantTurns);if(list.length)freezeMinion(randomItem(list));break;}
    case "temporaryControl": {if(target?.instanceId)takeTemporaryControl(ownerId,target.instanceId);break;}
    case "forceAllMinionsAttackRandom": forceAllMinionsAttackRandom();break;
    case "forceAllOtherMinionsAttackRandom": forceAllMinionsAttackRandom(context.sourceMinion?.instanceId||null);break;
    case "forceTargetAttackRandomAlly": {if(target?.instanceId)forceTargetAttackRandomAlly(target.instanceId);break;}
    case "gainEmptyManaCrystal": {const p=gameState[ownerId],before=p.mana.maximum;p.mana.maximum=Math.min(CONFIG.MAX_MANA,p.mana.maximum+(effect.value||1));if(p.mana.maximum>before)addLog(`${p.name} gagne un cristal de mana vide.`);break;}
    case "gainManaCrystalIfEmpty": {const p=gameState[ownerId];if(p.mana.current===0){const gain=effect.value||1;const before=p.mana.maximum;p.mana.maximum=Math.min(CONFIG.MAX_MANA,p.mana.maximum+gain);p.mana.current+=Math.max(0,p.mana.maximum-before);addLog(`${p.name} gagne un cristal de mana.`);}break;}
    case "gainTemporaryMana": {const p=gameState[ownerId];p.mana.current+=(effect.value||1);addLog(`${p.name} gagne ${effect.value||1} cristal de mana temporaire.`);break;}
    case "refreshMana": {const p=gameState[ownerId];p.mana.current=p.mana.maximum;addLog(`${p.name} rafraîchit ses cristaux de mana.`);break;}
    case "gainEmptyManaIfCardsPlayed": {const p=gameState[ownerId];if((p.cardsPlayedThisTurn||0)>=(effect.threshold||2)){const before=p.mana.maximum;p.mana.maximum=Math.min(CONFIG.MAX_MANA,p.mana.maximum+(effect.value||1));if(p.mana.maximum>before)addLog(`${p.name} gagne un cristal de mana vide.`);}break;}
    case "gainWeaponAttackThisTurn": {const weapon=gameState[ownerId].hero.weapon;if(weapon){weapon.attack+=effect.value||1;addLog(`${weapon.name} gagne +${effect.value||1} ATQ ce tour-ci.`);}break;}
    case "gainWeaponDurability": {const weapon=gameState[ownerId].hero.weapon;if(weapon){weapon.durability+=effect.value||1;weapon.maxDurability=Math.max(weapon.maxDurability||0,weapon.durability);addLog(`${weapon.name} gagne +${effect.value||1} Durabilité.`);}break;}
    case "damageAllOtherMinions": {const source=context.attackingHero?null:context.sourceMinion;[...gameState.player.board,...gameState.ai.board].filter(m=>!m.dormantTurns&&m.instanceId!==source?.instanceId).forEach(m=>dealDamageToMinion(m,effect.value||1));addLog(`${effect.value||1} dégât(s) sont infligés à tous les serviteurs.`);break;}
    case "returnToHand": {if(target?.instanceId&&target.instanceId!==context.sourceMinion?.instanceId)returnMinionToHand(target.instanceId,effect.discount||0);break;}
    case "damageEnemyHeroIfSpellPlayedThisTurn": {if((gameState[ownerId].spellsPlayedThisTurn||0)>0)applyDamageToTarget({ownerId:opponentId,kind:"hero",instanceId:null},effect.value||0);break;}
    case "drawAndDiscountIfType": {for(let i=0;i<(effect.draw||1);i+=1){const instance=drawCard(ownerId);const card=instance?CARD_BY_ID[instance.cardId]:null;if(instance&&card?.type===effect.cardType){instance.costModifier-=effect.discount||1;addLog(`${card.name} coûte (${effect.discount||1}) de moins.`);}}break;}
    case "buffSelfIfOtherFriendly": {const source=context.sourceMinion;if(source&&gameState[ownerId].board.some(m=>m.instanceId!==source.instanceId&&!m.dormantTurns))buffMinion(source,effect.attack||0,effect.health||0);break;}
    case "addRandomTribeToHand": {for(let i=0;i<(effect.count||1);i+=1)addRandomTribeCardToHand(ownerId,effect.tribe,effect.maxCost??null);break;}
    case "drawIfControlTribe": {if(gameState[ownerId].board.some(m=>!m.dormantTurns&&minionHasTribe(m,effect.tribe)))for(let i=0;i<(effect.value||1);i+=1)drawCard(ownerId);break;}
    case "areaDamageDrawIfDeath": {const minions=[...gameState.player.board,...gameState.ai.board].filter(m=>!m.dormantTurns);minions.forEach(m=>dealDamageToMinion(m,effect.value||0));if(minions.some(m=>m.currentHealth<=0))for(let i=0;i<(effect.draw||1);i+=1)drawCard(ownerId);addLog(`${effect.value||0} dégât(s) sont infligés à tous les serviteurs.`);break;}
    case "buffAllFriendlyAttackThisTurn": {gameState[ownerId].board.filter(m=>!m.dormantTurns&&(!effect.excludeSelf||m.instanceId!==context.sourceMinion?.instanceId)).forEach(m=>addTemporaryAttack(m,effect.value||0));break;}
    case "damageAndDrawIfSurvives": {if(target){applyDamageToTarget(target,effect.value||0);if(targetSurvived(target))for(let i=0;i<(effect.draw||1);i+=1)drawCard(ownerId);}break;}
    case "conditionalDamageEnemyHeroIfTribe": {if(gameState[ownerId].board.some(m=>!m.dormantTurns&&minionHasTribe(m,effect.tribe)))applyDamageToTarget({ownerId:opponentId,kind:"hero",instanceId:null},effect.value||0);break;}
    case "buffFriendlyTribe": {gameState[ownerId].board.filter(m=>!m.dormantTurns&&minionHasTribe(m,effect.tribe)&&(!effect.excludeSelf||m.instanceId!==context.sourceMinion?.instanceId)).forEach(m=>buffMinion(m,effect.attack||0,effect.health||0));break;}
    case "freezeOrDamageIfFrozen": {const minion=findMinionById(target?.instanceId);if(minion){if(minion.frozen)dealDamageToMinion(minion,effect.value||2);else freezeMinion(minion);}break;}
    case "damageAndSummonIfKilled": {const minion=findMinionById(target?.instanceId);if(minion){dealDamageToMinion(minion,effect.value||0);if(minion.currentHealth<=0)summonCard(ownerId,effect.cardId);}break;}
    case "discountSpellsThisTurn": {gameState[ownerId].spellCostReductionThisTurn=(gameState[ownerId].spellCostReductionThisTurn||0)+(effect.value||1);addLog(`Les sorts de ${gameState[ownerId].name} coûtent (${effect.value||1}) de moins ce tour-ci.`);break;}
    case "equipWeaponCard": {const weaponCard=CARD_BY_ID[effect.cardId];if(weaponCard?.type==="weapon")equipWeapon(ownerId,weaponCard,createCardInstance(weaponCard.id));break;}
    case "discardRandom": {for(let i=0;i<(effect.count||1);i+=1){const hand=gameState[ownerId].hand;if(!hand.length)break;const index=Math.floor(Math.random()*hand.length),instance=hand.splice(index,1)[0];gameState[ownerId].graveyard.push(instance);addLog(`${gameState[ownerId].name} défausse ${CARD_BY_ID[instance.cardId]?.name||"une carte"}.`);}break;}
    case "healAllFriendlyMinions": {let total=0;for(const minion of gameState[ownerId].board.filter(m=>!m.dormantTurns)){const targetRef={ownerId,kind:"minion",instanceId:minion.instanceId};const healed=healTarget(targetRef,effect.value||0);total+=healed;if(healed>0)notifyAllyHealed(ownerId,targetRef,healed);}if(total>0)updateQuestProgress(ownerId,"healingDone",total);break;}
    case "gainTemporaryAttack": {addTemporaryAttack(context.sourceMinion,effect.value||0);break;}
    case "healAndSummonIfFullBefore": {const minion=findMinionById(target?.instanceId);if(minion){const wasFull=minion.currentHealth>=minion.maxHealth;const healed=healTarget(target,effect.value||0);if(healed>0)notifyAllyHealed(ownerId,target,healed);if(wasFull)summonCard(ownerId,effect.cardId);}break;}
    case "spellCostAura":
    case "minionCostAura":
    case "damagedMinionsCannotAttack": break;
    default: console.warn("Effet inconnu",effect.effect);
  }
}

function summonReincarnated(ownerId,source,health=1){
  if(gameState[ownerId].board.length>=CONFIG.MAX_BOARD)return null;
  const card=CARD_BY_ID[source.cardId];if(!card)return null;
  const minion=createMinionInstance(card,ownerId,{triggerFlags:{reincarnated:true},reincarnationUsed:true});
  minion.currentHealth=Math.max(1,Math.min(health,minion.maxHealth));minion.canAttack=false;minion.summonedThisTurn=true;
  minion.keywords=minion.keywords.filter(k=>k!=="reincarnation");gameState[ownerId].board.push(minion);markTauntEntrance(minion);window.ASTREA_CARD_AUDIO?.play(card);addLog(`${source.name} revient à la vie avec ${minion.currentHealth} PV.`);return minion;
}
function fillBoardRandomLowCost(ownerId,maxCost){
  const pool=COLLECTIBLE_CARDS.filter(card=>card.type==="creature"&&card.cost<=maxCost&&card.id!=="creature_039");
  while(pool.length&&gameState[ownerId].board.length<CONFIG.MAX_BOARD)summonCard(ownerId,randomItem(pool).id);
}
function resolveArenaLastSurvivor(ownerId){
  const opponentId=getOpponentId(ownerId),enemy=gameState[opponentId].board.filter(m=>!m.dormantTurns);
  if(enemy.length===3){
    const room=CONFIG.MAX_BOARD-gameState[ownerId].board.length;
    const stolen=enemy.slice(0,room);
    stolen.forEach(m=>{const i=gameState[opponentId].board.findIndex(x=>x.instanceId===m.instanceId);if(i>=0)gameState[opponentId].board.splice(i,1);m.ownerId=ownerId;m.canAttack=false;m.hasAttacked=true;m.summonedThisTurn=true;gameState[ownerId].board.push(m);});
    enemy.slice(room).forEach(m=>m.currentHealth=0);
    addLog(`${gameState[ownerId].name} vole ${stolen.length} serviteur(s) adverse(s).`);return;
  }
  if(enemy.length<=1)return;
  const survivor=[...enemy].sort((a,b)=>minionThreat(b)-minionThreat(a))[0];
  enemy.filter(m=>m.instanceId!==survivor.instanceId).forEach(m=>m.currentHealth=0);
  survivor.currentHealth=Math.max(1,survivor.currentHealth-Math.max(0,Math.floor(enemy.reduce((s,m)=>s+(m.instanceId===survivor.instanceId?0:m.attack),0)/2)));
  addLog(`${survivor.name} est le dernier survivant de l’arène.`);
}

function resolveSecrets(ownerId,trigger,secretContext) {
  const result=secretContext||{};
  const p=gameState[ownerId];
  for(let i=0;i<p.secrets.length;i+=1){
    const instance=p.secrets[i],card=CARD_BY_ID[instance.cardId]; if(card.secretTrigger!==trigger)continue;
    p.secrets.splice(i,1); p.graveyard.push(instance); addLog(`${p.name} révèle ${card.name} !`);
    resolveEffects(card.effects.filter(e=>e.trigger==="secret"),{ownerId,secretContext:result,playedCard:result.playedCard});
    break;
  }
  return result;
}

function updateQuestProgress(ownerId,event,amount=1) {
  const player=gameState?.[ownerId];if(!player?.quests?.length||amount<=0)return;
  for(const questInstance of [...player.quests]){
    const card=CARD_BY_ID[questInstance.cardId];if(!card?.quest||card.quest.event!==event)continue;
    questInstance.progress=Math.min(card.quest.goal,(questInstance.progress||0)+amount);
    addLog(`${card.name} : ${questInstance.progress}/${card.quest.goal}.`);
    if(questInstance.progress>=card.quest.goal){
      const index=player.quests.findIndex(q=>q.instanceId===questInstance.instanceId);if(index>=0)player.quests.splice(index,1);
      player.graveyard.push(questInstance);addLog(`${player.name} accomplit ${card.name} !`);
      resolveEffects(card.quest.reward||[],{ownerId,playedCard:card});
    }
  }
}

function notifyAllyHealed(ownerId,target,amount){
  if(amount<=0)return;
  for(const minion of [...gameState[ownerId].board]){
    if(target.kind==="minion"&&target.instanceId===minion.instanceId)continue;
    for(const effect of minion.effects.filter(e=>e.trigger==="allyHealed"))resolveEffect(effect,{ownerId,sourceMinion:minion,healedTarget:target});
  }
}

function addCardToHand(ownerId,cardId){
  const player=gameState[ownerId],card=CARD_BY_ID[cardId];if(!card)return null;
  const instance=createCardInstance(cardId);
  if(player.hand.length>=CONFIG.MAX_HAND){player.graveyard.push(instance);addLog(`${player.name} brûle ${card.name}.`);return null;}
  player.hand.push(instance);addLog(`${card.name} est ajouté à la main de ${player.name}.`);return instance;
}

function drawBestOfTopThree(ownerId){
  const player=gameState[ownerId],seen=[];
  for(let i=0;i<3&&player.deck.length;i+=1)seen.push(player.deck.pop());
  if(!seen.length)return;
  seen.sort((a,b)=>getCardCost(b)-getCardCost(a));
  const chosen=seen.shift();
  if(player.hand.length<CONFIG.MAX_HAND){player.hand.push(chosen);addLog(`${player.name} choisit ${CARD_BY_ID[chosen.cardId].name} parmi les étoiles.`);}else player.graveyard.push(chosen);
  shuffle(seen).forEach(inst=>player.deck.unshift(inst));
}

function summonRandomHighCostAndAttack(ownerId,count,minCost){
  const pool=COLLECTIBLE_CARDS.filter(card=>card.type==="creature"&&card.cost>=minCost);
  const opponentId=getOpponentId(ownerId);
  for(let i=0;i<count;i+=1){
    if(!pool.length||gameState[ownerId].board.length>=CONFIG.MAX_BOARD)break;
    const minion=summonCard(ownerId,randomItem(pool).id);if(!minion)continue;
    const targets=[...gameState[opponentId].board];if(!targets.length)continue;
    const defender=randomItem(targets),retaliation=defender.attack;
    dealDamageToMinion(defender,minion.attack);dealDamageToMinion(minion,retaliation);
    addLog(`${minion.name} surgit du portail et attaque ${defender.name}.`);resolveDeaths();
  }
}

function requestChoice(ownerId,card) {
  if(ownerId==="ai")return Promise.resolve(chooseAiChoice(card));
  interactionLocked=true; dom.choiceTitle.textContent=card.name; dom.choiceOptions.innerHTML=""; dom.choiceModal.classList.remove("hidden");
  return new Promise(resolve=>{
    choiceResolver=resolve;
    card.choices.forEach(choice=>{
      const button=document.createElement("button");button.type="button";button.className="choice-option";
      button.innerHTML=`<strong>${escapeHtml(choice.label)}</strong><span>${escapeHtml(choice.description)}</span>`;
      button.addEventListener("click",()=>{dom.choiceModal.classList.add("hidden");interactionLocked=false;choiceResolver=null;resolve(choice);});
      dom.choiceOptions.appendChild(button);
    });
  });
}
function chooseAiChoice(card) {
  if(card.id==="spell_010")return gameState.ai.hand.length<=4?card.choices.find(c=>c.id==="draw"):card.choices.find(c=>c.id==="armor");
  return card.choices[0];
}

function summonCard(ownerId,cardId) {
  if(gameState[ownerId].board.length>=CONFIG.MAX_BOARD)return null;
  const card=CARD_BY_ID[cardId];if(!card)return null;
  const minion=createMinionInstance(card,ownerId);gameState[ownerId].board.push(minion);markTauntEntrance(minion);window.ASTREA_CARD_AUDIO?.play(card);updateQuestProgress(ownerId,"creatureSummoned",1);addLog(`${gameState[ownerId].name} invoque ${card.name}.`);return minion;
}

function transformMinion(instanceId,cardId) {
  const old=findMinionById(instanceId),card=CARD_BY_ID[cardId];if(!old||!card)return;
  const board=gameState[old.ownerId].board,index=board.findIndex(m=>m.instanceId===instanceId);
  const transformed=createMinionInstance(card,old.ownerId);transformed.canAttack=false;transformed.summonedThisTurn=true;board.splice(index,1,transformed);markTauntEntrance(transformed);window.ASTREA_CARD_AUDIO?.play(card);
  addLog(`${old.name} est transformé en ${card.name}.`);
}

function getAutomaticTargets(ownerId,targetType,sourceMinion) {
  if(targetType==="friendlyHero")return[{ownerId,kind:"hero",instanceId:null}];
  if(targetType==="enemyHero")return[{ownerId:getOpponentId(ownerId),kind:"hero",instanceId:null}];
  if(targetType==="selfMinion"&&sourceMinion)return[{ownerId,kind:"minion",instanceId:sourceMinion.instanceId}];
  return[];
}
function getRandomTargetPool(ownerId,targetType) {
  const opp=getOpponentId(ownerId);
  if(targetType==="randomEnemyCharacter")return[{ownerId:opp,kind:"hero",instanceId:null},...gameState[opp].board.filter(m=>!m.dormantTurns).map(m=>({ownerId:opp,kind:"minion",instanceId:m.instanceId}))];
  if(targetType==="randomEnemyMinion")return gameState[opp].board.filter(m=>!m.dormantTurns).map(m=>({ownerId:opp,kind:"minion",instanceId:m.instanceId}));
  return[];
}

/* -------------------------- Combat / héros -------------------------------- */

function usePlayerHeroPower() {
  if(!canUseHeroPower("player"))return;
  const p=gameState.player;
  const heroPowerDef=getHeroPowerDefinition(p.heroPower.type);
  if(heroPowerDef.effectType==="damage"){
    gameState.pendingAction={type:"heroPower",playerId:"player",effect:{effect:"damage",target:"enemyCharacter",value:1}};renderGame();
    return;
  }
  p.mana.current-=p.heroPower.cost;
  p.heroPower.usedThisTurn=true;
  p.hero.armor+=2;
  addLog(`Vous utilisez ${heroPowerDef.name} et gagnez 2 Armure.`);
  updateDailyQuestProgress("useHeroPower",1);
  renderGame();
}
function useAiHeroPower() {
  if(!canUseHeroPower("ai"))return false;
  const p=gameState.ai;
  const heroPowerDef=getHeroPowerDefinition(p.heroPower.type);
  p.mana.current-=p.heroPower.cost;
  p.heroPower.usedThisTurn=true;
  if(heroPowerDef.effectType==="damage"){
    const effect={effect:"damage",target:"enemyCharacter",value:1};
    const target=chooseAiTarget(effect)||{ownerId:"player",kind:"hero",instanceId:null};
    applyDamageToTarget(target,1);
    const logTarget=target.kind==="hero"?"votre héros":`${findMinionById(target.instanceId)?.name||"une cible"}`;
    addLog(`${p.name} utilise ${heroPowerDef.name} et touche ${logTarget}.`);
    resolveDeaths();
    checkGameOver();
    renderGame();
    return true;
  }
  p.hero.armor+=2;
  addLog(`${p.name} utilise ${heroPowerDef.name} et gagne 2 Armure.`);
  renderGame();
  return true;
}
function canUseHeroPower(ownerId) {const p=gameState?.[ownerId];return !!p&&gameState.status==="playing"&&gameState.activePlayerId===ownerId&&!p.heroPower.usedThisTurn&&p.mana.current>=p.heroPower.cost;}
function canHeroAttack(ownerId){
  const p=gameState?.[ownerId],weapon=p?.hero.weapon;if(!weapon||weapon.attack<=0||weapon.durability<=0||gameState.activePlayerId!==ownerId)return false;
  const maxAttacks=(weapon.keywords||[]).includes("windfury")?2:1;
  return (p.hero.attacksThisTurn||0)<maxAttacks;
}

function onHeroClick(ownerId) {
  if(!gameState||gameState.status!=="playing")return;
  if(gameState.pendingAction){onTargetClicked(ownerId,"hero",null);return;}
  if(ownerId==="player"&&canPlayerInteract()&&canHeroAttack("player")){gameState.pendingAction={type:"attack",attacker:{kind:"hero",ownerId:"player",instanceId:null}};renderGame();}
}

async function performAttack(attackerRef,target) {
  if(gameState.status!=="playing")return false;
  const ownerId=attackerRef.ownerId;if(ownerId!==gameState.activePlayerId)return false;
  const valid=getValidAttackTargets(ownerId,attackerRef).some(t=>sameTarget(t,target));if(!valid)return false;
  let attackValue=0,attackerMinion=null,weaponAtAttack=null;
  if(attackerRef.kind==="minion"){
    attackerMinion=findMinionById(attackerRef.instanceId);
    if(!canMinionAttackNow(attackerMinion))return false;
    attackValue=attackerMinion.attack;
  }else{
    if(!canHeroAttack(ownerId))return false;
    weaponAtAttack=gameState[ownerId].hero.weapon;
    attackValue=weaponAtAttack.attack;
  }

  interactionLocked=true;
  if(target.kind==="hero")resolveSecrets(target.ownerId,"beforeHeroAttacked",{attacker:attackerRef,enemyId:ownerId});
  await animateCombat(attackerRef,target);

  if(attackerRef.kind==="minion"){
    attackerMinion.keywords=attackerMinion.keywords.filter(k=>k!=="stealth");
    attackerMinion.attacksThisTurn=(attackerMinion.attacksThisTurn||0)+1;
    const maxAttacks=attackerMinion.keywords.includes("windfury")?2:1;
    attackerMinion.hasAttacked=attackerMinion.attacksThisTurn>=maxAttacks;
    attackerMinion.canAttack=!attackerMinion.hasAttacked;
  }else{
    const hero=gameState[ownerId].hero;
    hero.attacksThisTurn=(hero.attacksThisTurn||0)+1;
    const maxAttacks=(weaponAtAttack.keywords||[]).includes("windfury")?2:1;
    hero.hasAttacked=hero.attacksThisTurn>=maxAttacks;
  }

  let damageDealtToTarget=0;
  if(target.kind==="hero"){
    damageDealtToTarget=dealDamageToHero(target.ownerId,attackValue);
    addLog(`${attackerRef.kind==="hero"?gameState[ownerId].name:attackerMinion.name} inflige ${attackValue} dégât(s) au héros adverse.`);
  }else{
    const defender=findMinionById(target.instanceId);if(!defender)return false;
    const retaliation=defender.attack;damageDealtToTarget=dealDamageToMinion(defender,attackValue);
    if(attackerRef.kind==="minion")dealDamageToMinion(attackerMinion,retaliation);else dealDamageToHero(ownerId,retaliation);
    addLog(`${attackerRef.kind==="hero"?gameState[ownerId].name:attackerMinion.name} attaque ${defender.name} (${attackValue} ↔ ${retaliation}).`);
  }

  if(attackerRef.kind==="minion"&&findMinionById(attackerMinion.instanceId)){
    resolveEffects(attackerMinion.effects.filter(e=>e.trigger==="afterAttack"),{ownerId,sourceMinion:attackerMinion,attackedTarget:target});
  }
  if(attackerRef.kind==="hero"){
    const currentWeapon=gameState[ownerId].hero.weapon;
    if(currentWeapon){
      if((currentWeapon.keywords||[]).includes("lifesteal")&&damageDealtToTarget>0)healTarget({ownerId,kind:"hero",instanceId:null},damageDealtToTarget);
      if(currentWeapon.divineShieldActive){currentWeapon.divineShieldActive=false;addLog(`Le Bouclier divin de ${currentWeapon.name} se dissipe après l’attaque.`);}
      resolveEffects(currentWeapon.effects.filter(e=>e.trigger==="afterHeroAttack"),{ownerId,sourceWeapon:currentWeapon,attackingHero:true,attackedTarget:target});
      currentWeapon.durability-=1;
      if(currentWeapon.durability<=0){addLog(`${currentWeapon.name} se brise.`);gameState[ownerId].graveyard.push(createCardInstance(currentWeapon.cardId));gameState[ownerId].hero.weapon=null;}
    }
  }
  resolveDeaths();checkGameOver();gameState.pendingAction=null;interactionLocked=gameState.activePlayerId==="ai";renderGame();return true;
}

function applyDamageToTarget(target,amount){if(!target)return;if(target.kind==="hero"){dealDamageToHero(target.ownerId,amount);addLog(`${gameState[target.ownerId].name} subit ${amount} dégât(s).`);}else{const m=findMinionById(target.instanceId);if(m){dealDamageToMinion(m,amount);addLog(`${m.name} subit ${amount} dégât(s).`);}}}
function healTarget(target,amount){if(!target)return 0;if(target.kind==="hero"){const h=gameState[target.ownerId].hero,b=h.currentHealth;h.currentHealth=Math.min(h.maxHealth,h.currentHealth+amount);const healed=h.currentHealth-b;addLog(`${gameState[target.ownerId].name} récupère ${healed} PV.`);return healed;}const m=findMinionById(target.instanceId);if(m){const b=m.currentHealth;m.currentHealth=Math.min(m.maxHealth,m.currentHealth+amount);const healed=m.currentHealth-b;addLog(`${m.name} récupère ${healed} PV.`);return healed;}return 0;}
function buffMinion(m,a,h){m.attack+=a;m.maxHealth+=h;m.currentHealth+=h;addLog(`${m.name} gagne +${a}/+${h}.`);}
function silenceMinion(m){m.keywords=[];m.effects=[];m.divineShieldActive=false;m.temporaryAttackBonus=0;m.temporaryAttackExpiresTurnOwnerId=null;m.attack=m.baseAttack;m.maxHealth=m.baseHealth;m.currentHealth=Math.min(m.currentHealth,m.maxHealth);m.silenced=true;addLog(`${m.name} est réduit au silence.`);}
function dealDamageToHero(ownerId,amount){const h=gameState[ownerId].hero;if(amount<=0)return 0;const weapon=h.weapon;if(weapon?.divineShieldActive){weapon.divineShieldActive=false;addLog(`Le Bouclier divin de ${weapon.name} absorbe les dégâts.`);return 0;}let remaining=amount,inflicted=0;if(h.armor>0){const absorbed=Math.min(h.armor,remaining);h.armor-=absorbed;remaining-=absorbed;inflicted+=absorbed;}h.currentHealth-=remaining;inflicted+=remaining;return inflicted;}
function dealDamageToMinion(m,amount){if(amount<=0||m.dormantTurns>0)return 0;if(m.keywords.includes("immuneOpponentTurn")&&gameState.activePlayerId!==m.ownerId){addLog(`${m.name} est insensible pendant le tour adverse.`);return 0;}if(m.divineShieldActive){m.divineShieldActive=false;addLog(`Le Bouclier divin de ${m.name} absorbe les dégâts.`);return 0;}const before=Math.max(0,m.currentHealth);m.currentHealth-=amount;const inflicted=Math.min(before,amount);if(m.currentHealth>0){const triggers=m.effects.filter(e=>e.trigger==="afterDamaged");if(triggers.length)resolveEffects(triggers,{ownerId:m.ownerId,sourceMinion:m});}return inflicted;}

function resolveDeaths() {
  let found=true,guard=0;
  while(found&&guard++<40){
    found=false;
    for(const ownerId of ["player","ai"]){
      const p=gameState[ownerId],dead=p.board.filter(m=>m.currentHealth<=0);
      if(!dead.length)continue;found=true;
      for(const m of dead){
        const i=p.board.findIndex(x=>x.instanceId===m.instanceId);if(i<0)continue;
        spawnDestroyedCardEffect(m.instanceId);
        p.board.splice(i,1);p.graveyard.push(createCardInstance(m.cardId));addLog(`${m.name} est détruit.`);
        const grantedReincarnation=m.keywords.includes("reincarnation")&&!m.reincarnationUsed;
        resolveEffects(m.effects.filter(e=>e.trigger==="deathrattle"),{ownerId,sourceMinion:m});
        if(grantedReincarnation)summonReincarnated(ownerId,{...m,triggerFlags:{...m.triggerFlags,reincarnated:true}},1);
      }
    }
  }
}

function checkGameOver(){
  if(!gameState||gameState.status!=="playing")return gameState?.status!=="playing";
  const playerDefeated=gameState.player.hero.currentHealth<=0;
  const aiDefeated=gameState.ai.hero.currentHealth<=0;
  if(!playerDefeated&&!aiDefeated)return false;

  gameState.status="finished";
  interactionLocked=true;
  let title="";
  let message="";

  if(playerDefeated&&aiDefeated){
    title="Égalité";
    message="Les deux héros sont tombés au même instant.";
  }else if(aiDefeated){
    updateDailyQuestProgress("winMatch", 1);
    if(gameState.mode==="adventure"&&gameState.adventureId){
      const result=completeAdventureEncounter(gameState.adventureId);
      title="Victoire d’aventure !";
      message=`Vous avez vaincu ${gameState.ai.name}. ${result}`;
    }else{
      title="Victoire !";
      message=`Vous avez brisé la défense de ${gameState.ai.name}.`;
    }
  }else{
    const retryText=gameState.mode==="adventure"?" Vous pouvez recommencer ce combat.":"";
    title="Défaite";
    message=`${gameState.ai.name} a réduit vos points de vie à zéro.${retryText}`;
  }

  renderGame();
  const defeatedOwners=[];
  if(playerDefeated)defeatedOwners.push("player");
  if(aiDefeated)defeatedOwners.push("ai");
  const sequenceId=++heroDefeatSequenceId;
  animateHeroDefeatSequence(defeatedOwners).then(()=>{
    if(sequenceId!==heroDefeatSequenceId||!gameState||gameState.status!=="finished")return;
    showGameOver(title,message);
  });
  return true;
}

function completeAdventureEncounter(encounterId){
  const encounter=ADVENTURE_BY_ID[encounterId];
  if(!encounter)return "";
  const healthRatio=gameState.player.hero.currentHealth/Math.max(1,gameState.player.hero.maxHealth);
  const stars=healthRatio>=0.67&&gameState.turnNumber<=12?3:healthRatio>=0.34?2:1;
  const previousStars=Number(progress.adventure.stars[encounterId]||0);
  progress.adventure.stars[encounterId]=Math.max(previousStars,stars);
  if(!progress.adventure.completed.includes(encounterId))progress.adventure.completed.push(encounterId);
  let rewardText="Combat déjà terminé : aucune nouvelle récompense.";
  if(!progress.adventure.claimed.includes(encounterId)){
    grantAdventureRewards(encounter.rewards);
    progress.adventure.claimed.push(encounterId);
    rewardText=`Récompense obtenue : ${describeAdventureRewards(encounter.rewards)}.`;
  }
  saveProgress();
  return `${stars} étoile${stars>1?"s":""} gagnée${stars>1?"s":""}. ${rewardText}`;
}

function grantAdventureRewards(rewards=[]){
  rewards.forEach(reward=>grantQuestReward(reward));
}

function animateHeroDefeatSequence(ownerIds=[]){
  const uniqueOwners=[...new Set(ownerIds)].filter(ownerId=>ownerId==="player"||ownerId==="ai");
  if(!uniqueOwners.length)return Promise.resolve();
  return Promise.all(uniqueOwners.map(ownerId=>animateSingleHeroDefeat(ownerId))).then(()=>undefined);
}

function animateSingleHeroDefeat(ownerId){
  const heroElement=dom[`${ownerId}Hero`];
  const playerState=gameState?.[ownerId];
  if(!heroElement||!playerState)return Promise.resolve();

  const heroDefinition=playerState.heroDefinition||getHeroDefinition(playerState.heroId);
  const avatar=heroElement.querySelector(".hero-avatar");
  if(!avatar)return Promise.resolve();

  heroElement.classList.remove("hero-defeat-active");
  heroElement.querySelectorAll(".hero-shatter-layer,.hero-defeat-particle").forEach(element=>element.remove());
  void heroElement.offsetWidth;
  heroElement.classList.add("hero-defeat-active");

  const layer=document.createElement("div");
  layer.className="hero-shatter-layer";
  layer.setAttribute("aria-hidden","true");
  const columns=4;
  const rows=3;
  for(let row=0;row<rows;row+=1){
    for(let column=0;column<columns;column+=1){
      const shard=document.createElement("span");
      shard.className="hero-shard";
      shard.style.left=`${column*(100/columns)}%`;
      shard.style.top=`${row*(100/rows)}%`;
      shard.style.width=`${100/columns+0.8}%`;
      shard.style.height=`${100/rows+0.8}%`;
      shard.style.backgroundImage=`url("${heroDefinition.portrait}")`;
      shard.style.backgroundSize=`${columns*100}% ${rows*100}%`;
      shard.style.backgroundPosition=`${columns===1?0:(column/(columns-1))*100}% ${rows===1?0:(row/(rows-1))*100}%`;
      const angle=(row*columns+column)/(rows*columns)*Math.PI*2;
      const distance=70+Math.random()*105;
      shard.style.setProperty("--shard-x",`${Math.cos(angle)*distance+(Math.random()-.5)*45}px`);
      shard.style.setProperty("--shard-y",`${Math.sin(angle)*distance-25-Math.random()*55}px`);
      shard.style.setProperty("--shard-rotation",`${(Math.random()-.5)*520}deg`);
      shard.style.setProperty("--shard-delay",`${Math.random()*90}ms`);
      layer.appendChild(shard);
    }
  }
  avatar.appendChild(layer);

  for(let index=0;index<24;index+=1){
    const particle=document.createElement("span");
    particle.className="hero-defeat-particle";
    const angle=Math.random()*Math.PI*2;
    const distance=90+Math.random()*170;
    particle.style.setProperty("--particle-x",`${Math.cos(angle)*distance}px`);
    particle.style.setProperty("--particle-y",`${Math.sin(angle)*distance}px`);
    particle.style.setProperty("--particle-delay",`${Math.random()*150}ms`);
    particle.style.setProperty("--particle-size",`${3+Math.random()*7}px`);
    heroElement.appendChild(particle);
  }

  return new Promise(resolve=>{
    setTimeout(()=>{
      heroElement.classList.add("hero-defeat-finished");
      resolve();
    },HERO_DEFEAT_ANIMATION_MS);
  });
}

function resetHeroDefeatVisuals(){
  heroDefeatSequenceId+=1;
  [dom.playerHero,dom.aiHero].forEach(heroElement=>{
    if(!heroElement)return;
    heroElement.classList.remove("hero-defeat-active","hero-defeat-finished");
    heroElement.querySelectorAll(".hero-shatter-layer,.hero-defeat-particle").forEach(element=>element.remove());
  });
}

function showGameOver(title,text){
  dom.gameOverTitle.textContent=title;
  dom.gameOverText.textContent=text;
  dom.gameOverModal.classList.remove("hidden");
}

/* ---------------------------- Interactions -------------------------------- */

function onPlayerCardClick(instanceId) {
  if(!canPlayerInteract())return;const index=gameState.player.hand.findIndex(c=>c.instanceId===instanceId);if(index<0)return;const instance=gameState.player.hand[index],card=CARD_BY_ID[instance.cardId];if(!isCardPlayable("player",instance))return;
  if(cardNeedsTarget(card)){gameState.pendingAction={type:"playCard",handInstanceId:instanceId,effect:getManualEffect(card)};renderGame();return;}
  playCardFromHand("player",index);
}
function onMinionClick(ownerId,instanceId){if(!gameState||gameState.status!=="playing")return;if(gameState.pendingAction){onTargetClicked(ownerId,"minion",instanceId);return;}if(!canPlayerInteract()||ownerId!=="player")return;const m=findMinionById(instanceId);if(!canMinionAttackNow(m))return;gameState.pendingAction={type:"attack",attacker:{kind:"minion",ownerId:"player",instanceId}};renderGame();}
function onTargetClicked(ownerId,kind,instanceId){if(!gameState?.pendingAction||interactionLocked)return;executePendingAction({ownerId,kind,instanceId});}
async function executePendingAction(target){const p=gameState.pendingAction;if(!p)return;if(p.type==="attack"){if(getValidAttackTargets("player",p.attacker).some(t=>sameTarget(t,target)))await performAttack(p.attacker,target);return;}if(p.type==="playCard"){if(!isTargetValidForEffect("player",p.effect,target))return;const i=gameState.player.hand.findIndex(c=>c.instanceId===p.handInstanceId);if(i>=0)await playCardFromHand("player",i,target);return;}if(p.type==="heroPower"){if(!isTargetValidForEffect("player",p.effect,target))return;const player=gameState.player;const heroPowerDef=getHeroPowerDefinition(player.heroPower.type);player.mana.current-=player.heroPower.cost;player.heroPower.usedThisTurn=true;applyDamageToTarget(target,1);addLog(`Vous utilisez ${heroPowerDef.name}.`);gameState.pendingAction=null;updateDailyQuestProgress("useHeroPower",1);resolveDeaths();checkGameOver();renderGame();}}
function cancelPendingAction(){if(!gameState)return;gameState.pendingAction=null;renderGame();}

function onPlayerBoardDrop(event){event.preventDefault();dom.playerBoard.classList.remove("drag-over");if(!draggedPayload||draggedPayload.type!=="handCard")return;const i=gameState.player.hand.findIndex(c=>c.instanceId===draggedPayload.instanceId);if(i<0)return;const inst=gameState.player.hand[i],card=CARD_BY_ID[inst.cardId];if(!isMinionCardDefinition(card)||!isCardPlayable("player",inst))return;playCardFromHand("player",i);}
function onTargetDragOver(event){if(!draggedPayload||!gameState)return;const e=event.currentTarget,target={ownerId:e.dataset.owner,kind:e.dataset.targetKind,instanceId:e.dataset.instanceId||null};if(isDraggedPayloadValidForTarget(target)){event.preventDefault();e.classList.add("drag-over");}}
function onTargetDrop(event){event.preventDefault();const e=event.currentTarget;e.classList.remove("drag-over");if(!draggedPayload)return;const target={ownerId:e.dataset.owner,kind:e.dataset.targetKind,instanceId:e.dataset.instanceId||null};if(!isDraggedPayloadValidForTarget(target))return;if(draggedPayload.type==="minion")performAttack({kind:"minion",ownerId:"player",instanceId:draggedPayload.instanceId},target);else if(draggedPayload.type==="hero")performAttack({kind:"hero",ownerId:"player",instanceId:null},target);else{const i=gameState.player.hand.findIndex(c=>c.instanceId===draggedPayload.instanceId);if(i>=0)playCardFromHand("player",i,target);}}
function isDraggedPayloadValidForTarget(target){if(!canPlayerInteract())return false;if(draggedPayload.type==="minion"||draggedPayload.type==="hero"){const attacker=draggedPayload.type==="minion"?{kind:"minion",ownerId:"player",instanceId:draggedPayload.instanceId}:{kind:"hero",ownerId:"player",instanceId:null};return getValidAttackTargets("player",attacker).some(t=>sameTarget(t,target));}if(draggedPayload.type==="handCard"){const inst=gameState.player.hand.find(c=>c.instanceId===draggedPayload.instanceId);if(!inst||!isCardPlayable("player",inst))return false;const card=CARD_BY_ID[inst.cardId];return cardNeedsTarget(card)&&isTargetValidForEffect("player",getManualEffect(card),target);}return false;}
function canDropCreatureOnPlayerBoard(){if(!draggedPayload||draggedPayload.type!=="handCard"||!canPlayerInteract())return false;const inst=gameState.player.hand.find(c=>c.instanceId===draggedPayload.instanceId);return !!inst&&isMinionCardDefinition(CARD_BY_ID[inst.cardId])&&isCardPlayable("player",inst);}

function isCardPlayable(playerId,instance){const p=gameState[playerId],card=CARD_BY_ID[instance.cardId];if(gameState.status!=="playing"||gameState.activePlayerId!==playerId)return false;if(p.mana.current<getCardCost(instance,playerId))return false;if(isMinionCardDefinition(card)&&p.board.length>=CONFIG.MAX_BOARD)return false;if(card.type==="secret"&&(p.secrets.length>=CONFIG.MAX_SECRETS||p.secrets.some(s=>s.cardId===card.id)))return false;if(card.type==="quest"&&(p.quests.length>=3||p.quests.some(q=>q.cardId===card.id)))return false;if(cardNeedsTarget(card)&&!getValidTargetsForEffect(playerId,getManualEffect(card)).length)return false;return true;}
function cardNeedsTarget(card){return(card.effects||[]).some(e=>isManualTargetType(e.target));}
function getManualEffect(card){return(card.effects||[]).find(e=>isManualTargetType(e.target));}
function isManualTargetType(type){return["friendlyCreature","otherFriendlyCreature","enemyCreature","enemyCreatureMaxCost","anyCreature","damagedCreature","friendlyCharacter","enemyCharacter","anyCharacter"].includes(type);}
function getValidTargetsForEffect(ownerId,effect){
  if(!effect)return[];const opp=getOpponentId(ownerId);
  const fm=gameState[ownerId].board.filter(m=>!m.dormantTurns).map(m=>({ownerId,kind:"minion",instanceId:m.instanceId}));
  const em=gameState[opp].board.filter(m=>!m.dormantTurns&&!m.keywords.includes("stealth")).map(m=>({ownerId:opp,kind:"minion",instanceId:m.instanceId}));
  const fh={ownerId,kind:"hero",instanceId:null},eh={ownerId:opp,kind:"hero",instanceId:null};
  switch(effect.target){
    case"friendlyCreature":return fm;case"otherFriendlyCreature":return fm.filter(t=>t.instanceId!==effect?.sourceInstanceId&&t.instanceId!==gameState?.pendingAction?.sourceMinionInstanceId);case"enemyCreature":return em;case"enemyCreatureMaxCost":return em.filter(t=>(CARD_BY_ID[findMinionById(t.instanceId)?.cardId]?.cost||0)<=(effect.maxCost??999));case"anyCreature":return[...fm,...em];
    case"damagedCreature":return[...fm,...em].filter(t=>{const m=findMinionById(t.instanceId);return m&&m.currentHealth<m.maxHealth;});
    case"friendlyCharacter":return[fh,...fm];case"enemyCharacter":return[eh,...em];case"anyCharacter":return[fh,eh,...fm,...em];default:return[];
  }
}
function isTargetValidForEffect(ownerId,effect,target){return getValidTargetsForEffect(ownerId,effect).some(t=>sameTarget(t,target));}
function getValidAttackTargets(ownerId,attackerRef=null){
  const opp=getOpponentId(ownerId),p=gameState[opp];
  const minions=p.board.filter(m=>!m.dormantTurns&&!m.keywords.includes("stealth"));
  const taunts=minions.filter(m=>m.keywords.includes("taunt"));
  if(taunts.length)return taunts.map(m=>({ownerId:opp,kind:"minion",instanceId:m.instanceId}));
  if((p.hero.weapon?.keywords||[]).includes("taunt"))return[{ownerId:opp,kind:"hero",instanceId:null}];
  let canHitHero=true;
  if(attackerRef?.kind==="minion"){
    const attacker=findMinionById(attackerRef.instanceId);
    if(attacker?.summonedThisTurn&&hasRushKeyword(attacker)&&!hasChargeKeyword(attacker))canHitHero=false;
  }
  const targets=minions.map(m=>({ownerId:opp,kind:"minion",instanceId:m.instanceId}));
  return canHitHero?[{ownerId:opp,kind:"hero",instanceId:null},...targets]:targets;
}
function sameTarget(a,b){return a.ownerId===b.ownerId&&a.kind===b.kind&&(a.instanceId||null)===(b.instanceId||null);}
function canPlayerInteract(){return !!gameState&&gameState.status==="playing"&&gameState.activePlayerId==="player"&&!interactionLocked;}

/* -------------------------------- Rendu ---------------------------------- */

function markTauntEntrance(minion){
  if(!minion||minion.dormantTurns>0||!minion.keywords?.includes("taunt"))return;
  minion.tauntEntranceUntil=Date.now()+TAUNT_ENTRANCE_MS;
}

function hasActiveTauntEntrance(minion){
  return Boolean(minion?.tauntEntranceUntil && minion.tauntEntranceUntil>Date.now());
}

function renderGame(){if(!gameState)return;renderHeroesAndCounters();renderAiHand();renderBoards();renderHand();renderSecrets();renderLog();renderHighlights();dom.endTurnBtn.disabled=!canPlayerInteract();dom.turnIndicator.textContent=`Tour ${gameState.turnNumber}`;dom.turnCount.textContent=String(gameState.turnNumber);dom.statusMessage.textContent=gameState.status==="finished"?"Partie terminée":gameState.activePlayerId==="player"?(gameState.pendingAction?"Choisissez une cible — Échap pour annuler":"À vous de jouer"):"L’adversaire réfléchit…";}

function renderHeroesAndCounters(){
  for(const id of["player","ai"]){
    const p=gameState[id],heroEl=dom[`${id}Hero`],health=dom[`${id}Health`],armor=dom[`${id}Armor`],weaponEl=dom[`${id}Weapon`],locationEl=dom[`${id}Location`];
    const heroDef=p.heroDefinition||getHeroDefinition(p.heroId);
    const heroPowerDef=getHeroPowerDefinition(p.heroPower.type);
    health.textContent=p.hero.currentHealth;armor.textContent=p.hero.armor;armor.classList.toggle("hidden",p.hero.armor<=0);
    dom[`${id}Mana`].textContent=`${p.mana.current} / ${p.mana.maximum}`;dom[`${id}DeckCount`].textContent=`Deck : ${p.deck.length}`;
    if(dom[`${id}HeroName`]) dom[`${id}HeroName`].textContent = p.name;
    if(dom[`${id}HeroAvatarImg`]){
      dom[`${id}HeroAvatarImg`].src = heroDef.portrait;
      dom[`${id}HeroAvatarImg`].alt = p.name;
    }
    const heroPowerButton = dom[`${id}HeroPower`];
    if(heroPowerButton){
      heroPowerButton.setAttribute("aria-label", `${heroPowerDef.name} : ${heroPowerDef.description}`);
      const heroPowerImage = heroPowerButton.querySelector(".hero-power-image");
      const heroPowerLabel = heroPowerButton.querySelector("small");
      const heroPowerCost = heroPowerButton.querySelector("b");
      if(heroPowerImage){ heroPowerImage.src = heroPowerDef.image; heroPowerImage.alt = heroPowerDef.name; }
      if(heroPowerLabel) heroPowerLabel.textContent = heroPowerDef.name;
      if(heroPowerCost) heroPowerCost.textContent = String(p.heroPower.cost);
      heroPowerButton.classList.toggle("used", p.heroPower.usedThisTurn);
    }
    heroEl.classList.toggle("ready",id==="player"&&canPlayerInteract()&&canHeroAttack("player"));heroEl.draggable=id==="player"&&canHeroAttack("player");
    heroEl.ondragstart=heroEl.draggable?(event=>{draggedPayload={type:"hero"};event.dataTransfer.setData("text/plain","hero");}):null;heroEl.ondragend=()=>{draggedPayload=null;};
    if(p.hero.weapon){weaponEl.className="weapon-slot";weaponEl.innerHTML=`<strong>${p.hero.weapon.attack}</strong><span>${escapeHtml(p.hero.weapon.name)}</span><b>${p.hero.weapon.durability}</b>`;weaponEl.onmouseenter=()=>previewCard(CARD_BY_ID[p.hero.weapon.cardId]);}else{weaponEl.className="weapon-slot empty";weaponEl.innerHTML="";}
    if(p.location){locationEl.className="location-slot";locationEl.innerHTML=`<strong>⌂</strong><span>${escapeHtml(p.location.name)}</span><b>${p.location.durability}</b>`;locationEl.onmouseenter=()=>previewCard(CARD_BY_ID[p.location.cardId]);}else{locationEl.className="location-slot empty";locationEl.innerHTML="";}
  }
  dom.aiHandCount.textContent=gameState.ai.hand.length;dom.playerGraveCount.textContent=gameState.player.graveyard.length;dom.aiGraveCount.textContent=gameState.ai.graveyard.length;
  dom.playerHeroPower.disabled=!canUseHeroPower("player")||!canPlayerInteract();
  dom.aiHeroPower.disabled=true;
}

function renderBoards(){dom.playerBoard.innerHTML="";dom.aiBoard.innerHTML="";gameState.ai.board.forEach(m=>dom.aiBoard.appendChild(createMinionElement(m)));gameState.player.board.forEach(m=>dom.playerBoard.appendChild(createMinionElement(m)));}
function createMinionElement(m){
  const card=CARD_BY_ID[m.cardId],el=document.createElement("article");el.className="minion";el.dataset.owner=m.ownerId;el.dataset.targetKind="minion";el.dataset.instanceId=m.instanceId;el.tabIndex=0;
  const tauntActive=m.keywords.includes("taunt")&&!m.dormantTurns;
  if(tauntActive)el.classList.add("taunt");if(m.divineShieldActive)el.classList.add("divine-shield");if(m.silenced)el.classList.add("silenced");if(m.keywords.includes("stealth"))el.classList.add("stealth");if(m.dormantTurns>0)el.classList.add("dormant");if(m.frozen)el.classList.add("frozen");
  if(tauntActive&&hasActiveTauntEntrance(m))el.classList.add("taunt-entry-active");
  const mobilityReady=m.ownerId==="player"&&m.summonedThisTurn&&canMinionAttackNow(m)&&canPlayerInteract()&&(hasChargeKeyword(m)||hasRushKeyword(m));
  if(m.ownerId==="player"&&canMinionAttackNow(m)&&canPlayerInteract())el.classList.add("ready");
  if(mobilityReady)el.classList.add("mobility-ready");
  const tauntMarkup=tauntActive?'<span class="taunt-crest" aria-hidden="true"></span><span class="taunt-entry" aria-hidden="true"></span>':"";
  const mobilityMarkup=mobilityReady?'<span class="mobility-aura" aria-hidden="true"></span>':"";
  el.innerHTML=`${tauntMarkup}${mobilityMarkup}<div class="minion-art">${getCardArtMarkup(card)}</div>${m.dormantTurns>0?`<div class="dormant-label">Sommeil : ${m.dormantTurns}</div>`:""}${m.frozen?`<div class="frozen-label">Gelé</div>`:""}<div class="minion-name">${escapeHtml(m.name)}</div><div class="minion-stats"><span class="stat-orb attack-orb">${m.attack}</span><span class="stat-orb minion-health">${m.currentHealth}</span></div>`;
  bindCardImageFallback(el,card);el.addEventListener("click",()=>onMinionClick(m.ownerId,m.instanceId));el.addEventListener("mouseenter",()=>previewCard(card,m));el.addEventListener("dragover",onTargetDragOver);el.addEventListener("drop",onTargetDrop);
  if(m.ownerId==="player"&&canMinionAttackNow(m)){el.draggable=true;el.addEventListener("dragstart",event=>{draggedPayload={type:"minion",instanceId:m.instanceId};event.dataTransfer.setData("text/plain",m.instanceId);});el.addEventListener("dragend",()=>{draggedPayload=null;});}
  return el;
}

function renderAiHand(){
  if(!dom.aiHand)return;
  const count=gameState.ai.hand.length;
  dom.aiHand.innerHTML="";
  if(dom.aiHandVisualCount)dom.aiHandVisualCount.textContent=`${count} carte${count>1?"s":""}`;
  for(let index=0;index<count;index+=1){
    const back=document.createElement("div");
    back.className="opponent-card-back";
    back.setAttribute("aria-label",`Carte adverse ${index+1} sur ${count}`);
    back.title="Carte adverse";
    const middle=(count-1)/2;
    const delta=index-middle;
    back.style.setProperty("--fan-x",`${delta*10}px`);
    back.style.setProperty("--fan-y",`${Math.abs(delta)*1.8}px`);
    back.style.setProperty("--fan-r",`${delta*2.2}deg`);
    back.style.zIndex=String(index+1);
    back.innerHTML='<span class="card-back-gem">✦</span><span class="card-back-ring"></span>';
    dom.aiHand.appendChild(back);
  }
}

function renderHand(){dom.playerHand.innerHTML="";gameState.player.hand.forEach(instance=>{const card=CARD_BY_ID[instance.cardId],playable=isCardPlayable("player",instance)&&canPlayerInteract(),el=document.createElement("article");el.className=`card rarity-${card.rarity} ${playable?"playable":"unplayable"}`;if(playable&&(hasChargeKeyword(card)||hasRushKeyword(card)))el.classList.add("mobility-card-ready");el.dataset.instanceId=instance.instanceId;el.tabIndex=0;if(gameState.pendingAction?.handInstanceId===instance.instanceId)el.classList.add("selected-card");el.innerHTML=`<div class="card-cost">${getCardCost(instance,"player")}</div><div class="card-art">${getCardArtMarkup(card)}</div><div class="card-name">${escapeHtml(card.name)}</div><p class="card-description">${escapeHtml(card.description)}</p><div class="card-bottom"><span class="card-type">${typeLabel(card.type)}</span>${card.type==="creature"?`<div class="card-stats"><span class="atk">${card.attack}</span><span class="hp">${card.health}</span></div>`:(card.type==="weapon"?`<div class="card-stats"><span class="atk">${card.attack}</span><span class="hp">${card.durability}</span></div>`:card.type==="location"?`<div class="card-stats"><span class="hp">${card.durability}</span></div>`:"")}</div>`;bindCardImageFallback(el,card);el.addEventListener("click",()=>{hideHandCardZoom();onPlayerCardClick(instance.instanceId);});el.addEventListener("mouseenter",()=>{previewCard(card,null,instance);showHandCardZoom(el);});el.addEventListener("mouseleave",hideHandCardZoom);el.addEventListener("focus",()=>showHandCardZoom(el));el.addEventListener("blur",hideHandCardZoom);if(playable){el.draggable=true;el.addEventListener("dragstart",event=>{hideHandCardZoom();draggedPayload={type:"handCard",instanceId:instance.instanceId};event.dataTransfer.setData("text/plain",instance.instanceId);});el.addEventListener("dragend",()=>{draggedPayload=null;});}dom.playerHand.appendChild(el);});}

function renderSecrets(){
  dom.playerSecrets.innerHTML="";dom.aiSecrets.innerHTML="";
  gameState.player.secrets.forEach(instance=>{const card=CARD_BY_ID[instance.cardId],el=document.createElement("button");el.className="secret-token known";el.textContent="?";el.title=card.name;el.addEventListener("mouseenter",()=>previewCard(card));dom.playerSecrets.appendChild(el);});
  gameState.ai.secrets.forEach(()=>{const el=document.createElement("span");el.className="secret-token";el.textContent="?";dom.aiSecrets.appendChild(el);});
  for(const ownerId of ["player","ai"]){
    const root=ownerId==="player"?dom.playerSecrets:dom.aiSecrets;
    gameState[ownerId].quests.forEach(instance=>{const card=CARD_BY_ID[instance.cardId],el=document.createElement("button");el.className="quest-token";el.textContent=`! ${instance.progress||0}/${card.quest.goal}`;el.title=card.name;el.addEventListener("mouseenter",()=>previewCard(card));root.appendChild(el);});
  }
}

function renderHighlights(){document.querySelectorAll(".valid-target,.invalid-target,.selected-attacker").forEach(e=>e.classList.remove("valid-target","invalid-target","selected-attacker"));const p=gameState.pendingAction;if(!p){updateAttackArrow();return;}let targets=[];if(p.type==="attack"){targets=getValidAttackTargets("player",p.attacker);if(p.attacker.kind==="hero")dom.playerHero.classList.add("selected-attacker");else document.querySelector(`[data-instance-id="${p.attacker.instanceId}"]`)?.classList.add("selected-attacker");}else if(p.type==="playCard"||p.type==="heroPower")targets=getValidTargetsForEffect("player",p.effect);document.querySelectorAll(".minion,.hero").forEach(el=>{const t={ownerId:el.dataset.owner,kind:el.dataset.targetKind,instanceId:el.dataset.instanceId||null};el.classList.add(targets.some(x=>sameTarget(x,t))?"valid-target":"invalid-target");});updateAttackArrow();}
function renderLog(){dom.combatLog.innerHTML=gameState.combatLog.map(e=>`<div class="log-entry"><strong>T${e.turn}</strong> — ${escapeHtml(e.text)}</div>`).join("");dom.combatLog.scrollTop=dom.combatLog.scrollHeight;}

let handCardZoomElement=null;
let handCardZoomTimer=null;

function showHandCardZoom(sourceCard){
  if(!sourceCard||window.innerWidth<700)return;
  clearTimeout(handCardZoomTimer);
  hideHandCardZoom(true);
  const wrapper=document.createElement("div");
  wrapper.className="hand-card-zoom";
  const clone=sourceCard.cloneNode(true);
  clone.classList.remove("unplayable","playable","selected-card");
  clone.removeAttribute("draggable");
  clone.removeAttribute("tabindex");
  clone.style.transform="none";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  handCardZoomElement=wrapper;

  const rect=sourceCard.getBoundingClientRect();
  const zoomWidth=260;
  const zoomHeight=390;
  let left=rect.left+(rect.width/2)-(zoomWidth/2);
  left=Math.max(14,Math.min(window.innerWidth-zoomWidth-14,left));
  let top=rect.top-zoomHeight-18;
  if(top<14)top=Math.max(14,rect.top-(zoomHeight-70));
  wrapper.style.left=`${left}px`;
  wrapper.style.top=`${top}px`;
  requestAnimationFrame(()=>wrapper.classList.add("visible"));
}

function hideHandCardZoom(immediate=false){
  clearTimeout(handCardZoomTimer);
  const current=handCardZoomElement;
  if(!current)return;
  handCardZoomElement=null;
  if(immediate){current.remove();return;}
  current.classList.remove("visible");
  handCardZoomTimer=setTimeout(()=>current.remove(),160);
}

function updateAttackArrow(){
  const overlay = dom.attackArrowOverlay;
  const path = dom.attackArrowPath;
  const glowPath = dom.attackArrowGlowPath;
  const origin = dom.attackArrowOrigin;
  if(!overlay||!path||!glowPath||!origin) return;
  const pending = gameState?.pendingAction;
  if(!gameState||gameState.status!=="playing"||!pending||pending.type!=="attack"||pending.attacker.ownerId!=="player"){
    overlay.classList.add("hidden");
    path.setAttribute("d", "");
    glowPath.setAttribute("d", "");
    origin.setAttribute("r", "0");
    return;
  }
  const attackerEl = pending.attacker.kind==="hero" ? dom.playerHero : document.querySelector(`[data-instance-id="${pending.attacker.instanceId}"]`);
  if(!attackerEl){
    overlay.classList.add("hidden");
    return;
  }
  const rect = attackerEl.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top + rect.height / 2;
  const endX = attackPointerPosition.x || startX;
  const endY = attackPointerPosition.y || startY;
  overlay.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const curve = Math.min(120, Math.max(34, length * 0.15));
  const c1x = startX + dx * 0.28 + nx * curve * 0.45;
  const c1y = startY + dy * 0.12 + ny * curve * 0.45;
  const c2x = startX + dx * 0.76 - nx * curve * 0.25;
  const c2y = startY + dy * 0.88 - ny * curve * 0.25;
  const d = `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`;
  overlay.classList.remove("hidden");
  path.setAttribute("d", d);
  glowPath.setAttribute("d", d);
  origin.setAttribute("cx", startX.toFixed(1));
  origin.setAttribute("cy", startY.toFixed(1));
  origin.setAttribute("r", Math.max(8, Math.min(15, Math.min(rect.width, rect.height) * 0.12)).toFixed(1));
}

function spawnDestroyedCardEffect(instanceId){
  const sourceEl = document.querySelector(`[data-instance-id="${instanceId}"]`);
  if(!sourceEl) return;
  const rect = sourceEl.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = "destroy-card-overlay";
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.borderRadius = `${Math.max(14, Math.min(rect.width, rect.height) * 0.1)}px`;

  const core = sourceEl.cloneNode(true);
  core.classList.add("destroy-card-core");
  core.removeAttribute("data-instance-id");
  overlay.appendChild(core);

  const dust = document.createElement("div");
  dust.className = "destroy-card-dust";
  overlay.appendChild(dust);

  const shardData = [
    { clip: "polygon(0 0, 55% 0, 42% 34%, 0 52%)", dx: -34, dy: -46, rot: -18, scale: .84 },
    { clip: "polygon(55% 0, 100% 0, 100% 36%, 65% 48%, 42% 34%)", dx: 38, dy: -40, rot: 24, scale: .82 },
    { clip: "polygon(0 52%, 42% 34%, 48% 72%, 10% 100%, 0 100%)", dx: -42, dy: 32, rot: -22, scale: .78 },
    { clip: "polygon(42% 34%, 65% 48%, 58% 100%, 10% 100%, 48% 72%)", dx: -8, dy: 58, rot: -8, scale: .76 },
    { clip: "polygon(65% 48%, 100% 36%, 100% 100%, 58% 100%)", dx: 44, dy: 36, rot: 20, scale: .74 },
    { clip: "polygon(42% 34%, 65% 48%, 58% 100%, 48% 72%)", dx: 10, dy: 18, rot: 10, scale: .64 }
  ];

  shardData.forEach((data, index) => {
    const shard = sourceEl.cloneNode(true);
    shard.classList.add("destroy-card-shard");
    shard.style.clipPath = data.clip;
    shard.style.setProperty("--dx", `${data.dx}px`);
    shard.style.setProperty("--dy", `${data.dy}px`);
    shard.style.setProperty("--rot", `${data.rot}deg`);
    shard.style.setProperty("--scale", String(data.scale));
    shard.style.setProperty("--shard-delay", `${180 + index * 26}ms`);
    shard.removeAttribute("data-instance-id");
    overlay.appendChild(shard);
  });

  document.body.appendChild(overlay);
  window.setTimeout(() => overlay.remove(), 980);
}

function previewCard(card,minion=null,instance=null){const labels={charge:"Charge",rush:"Ruée",ruee:"Ruée","ruée":"Ruée",taunt:"Provocation",divineShield:"Bouclier divin",windfury:"Furie des vents",immuneOpponentTurn:"Insensible au tour adverse",stealth:"Camouflage",reincarnation:"Réincarnation",marginal:"Marginal"};const keywords=(minion?minion.keywords:card.keywords||[]).map(k=>labels[k]||k);let stats="";if(card.type==="creature"||card.type==="token")stats=` · ${minion?minion.attack:card.attack}/${minion?minion.currentHealth:card.health}`;if(card.type==="weapon")stats=` · ${card.attack}/${card.durability}`;if(card.type==="location")stats=` · ${card.durability} utilisations`;dom.cardPreview.innerHTML=`<div class="preview-art">${getCardArtMarkup(card)}</div><div class="preview-card-name">${escapeHtml(card.name)}</div><div class="preview-card-meta">Coût ${instance?getCardCost(instance, minion?null:"player"):card.cost} · ${typeLabel(card.type)}${stats}</div><div class="preview-card-description">${escapeHtml(card.description)}</div>${keywords.length?`<div class="preview-card-meta preview-keywords">${keywords.join(" · ")}</div>`:""}`;bindCardImageFallback(dom.cardPreview,card);}
function previewHero(ownerId){const p=gameState?.[ownerId];if(!p)return;const heroDef=p.heroDefinition||getHeroDefinition(p.heroId);const heroPowerDef=getHeroPowerDefinition(p.heroPower.type);dom.cardPreview.innerHTML=`<div class="preview-art"><img src="${heroDef.portrait}" alt="${escapeHtml(p.name)}" style="width:100%;height:180px;object-fit:cover;border-radius:14px;display:block;" /></div><div class="preview-card-name">${escapeHtml(p.name)}</div><div class="preview-card-meta">${p.hero.currentHealth}/${p.hero.maxHealth} PV · ${p.hero.armor} Armure · ${p.mana.current}/${p.mana.maximum} mana</div><div class="preview-card-description"><strong>Pouvoir héroïque :</strong> ${heroPowerDef.name} — ${heroPowerDef.description}<br>${p.hero.weapon?`Arme : ${escapeHtml(p.hero.weapon.name)} (${p.hero.weapon.attack}/${p.hero.weapon.durability}).`:"Aucune arme équipée."}${p.nextSpellDiscount?`<br>Prochain sort : réduction de coût de (${p.nextSpellDiscount}).`:""}</div>`;}

async function animateCombat(attacker,target){
  renderGame();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const attackerEl=attacker.kind==="hero"?document.getElementById(`${attacker.ownerId}-hero`):document.querySelector(`[data-instance-id="${attacker.instanceId}"]`);
  const targetEl=target.kind==="hero"?document.getElementById(`${target.ownerId}-hero`):document.querySelector(`[data-instance-id="${target.instanceId}"]`);
  if(!attackerEl||!targetEl){await sleep(260);return;}

  const aRect=attackerEl.getBoundingClientRect();
  const tRect=targetEl.getBoundingClientRect();
  const dx=(tRect.left+tRect.width/2)-(aRect.left+aRect.width/2);
  const dy=(tRect.top+tRect.height/2)-(aRect.top+aRect.height/2);
  const distance=Math.max(1,Math.hypot(dx,dy));
  const stopDistance=Math.min(78,Math.max(34,(Math.min(aRect.width,aRect.height)+Math.min(tRect.width,tRect.height))*.20));
  const ratio=Math.max(0.35,Math.min(.88,(distance-stopDistance)/distance));
  const hitX=dx*ratio;
  const hitY=dy*ratio;
  const rotation=Math.max(-5,Math.min(5,dx/110));

  attackerEl.classList.add("combat-moving");
  targetEl.classList.add("combat-target-active");
  const attackAnimation=attackerEl.animate([
    {transform:"translate3d(0,0,0) scale(1) rotate(0deg)",offset:0},
    {transform:`translate3d(${hitX*.18}px,${hitY*.18}px,0) scale(1.04) rotate(${rotation*.25}deg)`,offset:.20},
    {transform:`translate3d(${hitX}px,${hitY}px,0) scale(1.10) rotate(${rotation}deg)`,offset:.58},
    {transform:`translate3d(${hitX*.92}px,${hitY*.92}px,0) scale(1.04) rotate(${-rotation*.35}deg)`,offset:.70},
    {transform:"translate3d(0,0,0) scale(1) rotate(0deg)",offset:1}
  ],{duration:560,easing:"cubic-bezier(.18,.78,.2,1)",fill:"none"});

  window.setTimeout(()=>{
    spawnCombatImpact(tRect,dx,dy);
    targetEl.animate([
      {transform:"translate3d(0,0,0)",filter:"brightness(1)"},
      {transform:`translate3d(${Math.sign(dx)*-10}px,${Math.sign(dy)*-5}px,0) rotate(-2deg)`,filter:"brightness(1.9) saturate(1.6)",offset:.28},
      {transform:`translate3d(${Math.sign(dx)*7}px,${Math.sign(dy)*3}px,0) rotate(1.5deg)`,filter:"brightness(1.3)",offset:.62},
      {transform:"translate3d(0,0,0)",filter:"brightness(1)"}
    ],{duration:330,easing:"ease-out"});
  },270);

  try{await attackAnimation.finished;}catch(_){await sleep(560);}
  attackerEl.classList.remove("combat-moving");
  targetEl.classList.remove("combat-target-active");
}

function spawnCombatImpact(targetRect,dx,dy){
  const impact=document.createElement("div");
  impact.className="combat-impact-fx";
  impact.style.left=`${targetRect.left+targetRect.width/2}px`;
  impact.style.top=`${targetRect.top+targetRect.height/2}px`;
  impact.style.setProperty("--impact-rotation",`${Math.atan2(dy,dx)*180/Math.PI}deg`);
  impact.innerHTML='<span class="combat-impact-ring"></span><span class="combat-impact-slash"></span><span class="combat-impact-spark s1"></span><span class="combat-impact-spark s2"></span><span class="combat-impact-spark s3"></span>';
  document.body.appendChild(impact);
  window.setTimeout(()=>impact.remove(),520);
}

/* -------------------------------- Utilitaires ----------------------------- */
function addLog(text){if(!gameState)return;gameState.combatLog.push({turn:gameState.turnNumber,text});if(gameState.combatLog.length>100)gameState.combatLog.shift();}
function findMinionById(id){return gameState?[...gameState.player.board,...gameState.ai.board].find(m=>m.instanceId===id)||null:null;}
function getOpponentId(id){return id==="player"?"ai":"player";}
function getMissingHealth(target){if(target.kind==="hero"){const h=gameState[target.ownerId].hero;return h.maxHealth-h.currentHealth;}const m=findMinionById(target.instanceId);return m?m.maxHealth-m.currentHealth:0;}
function typeLabel(type){return({creature:"Créature",spell:"Sort",weapon:"Arme",location:"Lieu",secret:"Secret",quest:"Quête",token:"Jeton"})[type]||type;}
function getCardArtMarkup(card){return card.image?`<img class="card-image" src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}">`:getCardIcon(card);}
function bindCardImageFallback(root,card){const img=root.querySelector?.(".card-image");if(img)img.addEventListener("error",()=>{if(img.parentElement)img.parentElement.textContent=getCardIcon(card);},{once:true});}
function getCardIcon(card){if(card.type==="spell")return"✦";if(card.type==="weapon")return"⚔";if(card.type==="location")return"⌂";if(card.type==="secret")return"?";if(card.type==="quest")return"!";return({elemental:"✹",beast:"◆",spirit:"☁",construct:"⬢",mystic:"☾",human:"♙",dragon:"♜",titan:"✺"})[card.tribe]||"✧";}

function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch (_) { return memoryStorage[key] || null; }
}
function storageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch (_) { memoryStorage[key] = value; }
}

function countIds(list){return list.reduce((acc,id)=>(acc[id]=(acc[id]||0)+1,acc),{});}
function normalizeText(value){return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function randomItem(list){return list[Math.floor(Math.random()*list.length)];}
function shuffle(array){for(let i=array.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[array[i],array[j]]=[array[j],array[i]];}return array;}
function generateId(prefix){return`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function escapeHtml(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
