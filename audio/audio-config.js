/*
  Configuration audio de Chroniques d'Astréa.

  Déposez vos fichiers dans le dossier audio avec les noms suivants :
  - Musique accueil : menu.mp3, menu.ogg ou menu.wav
  - Musique combat : combat.mp3, combat.ogg ou combat.wav
  - Victoire : victoire.mp3, victoire.ogg ou victoire.wav
  - Défaite : defaite.mp3, defaite.ogg ou defaite.wav
  - Clic des menus : clic_menu.mp3, clic_menu.ogg ou clic_menu.wav
  - Impact d'attaque : impact_carte.mp3, impact_carte.ogg ou impact_carte.wav
  - Fin de votre tour : fin_tour.mp3, fin_tour.ogg ou fin_tour.wav
  - Invocation de chaque serviteur : audio/cartes/nom_de_la_carte.mp3 (ou .ogg / .wav)
  - Écran de chargement : loading_screen.mp3, loading_screen.ogg ou loading_screen.wav
  - Clic sur "Entrer dans la taverne" : enter_game_button.mp3, enter_game_button.ogg ou enter_game_button.wav
  - Tourner une page du livre de collection : tourne_page.mp3, tourne_page.ogg ou tourne_page.wav

  Vous pouvez aussi modifier directement les chemins ci-dessous.
*/
window.ASTREA_AUDIO_CONFIG = {
  menu: ["audio/menu.mp3", "audio/menu.ogg", "audio/menu.wav"],
  combat: ["audio/combat.mp3", "audio/combat.ogg", "audio/combat.wav"],
  victory: ["audio/victoire.mp3", "audio/victoire.ogg", "audio/victoire.wav"],
  defeat: ["audio/defaite.mp3", "audio/defaite.ogg", "audio/defaite.wav"],
  menuClick: ["audio/clic_menu.mp3", "audio/clic_menu.ogg", "audio/clic_menu.wav"],
  attackHit: ["audio/impact_carte.mp3", "audio/impact_carte.ogg", "audio/impact_carte.wav"],
  endTurn: ["audio/fin_tour.mp3", "audio/fin_tour.ogg", "audio/fin_tour.wav"],

  // V26 — nouveaux sons d’interface et de combat
  turnAlert: ["audio/tour_joueur.mp3", "audio/tour_joueur.ogg", "audio/tour_joueur.wav", "audio/alerte_tour.mp3"],
  deckFull: ["audio/deck_plein.mp3", "audio/deck_plein.ogg", "audio/deck_plein.wav", "audio/deck_impossible.mp3"],
  deckAdd: ["audio/ajout_deck.mp3", "audio/ajout_deck.ogg", "audio/ajout_deck.wav", "audio/carte_ajoutee_deck.mp3"],
  cardDraw: ["audio/pioche_carte.mp3", "audio/pioche_carte.ogg", "audio/pioche_carte.wav"],
  cardDiscard: ["audio/defausse_carte.mp3", "audio/defausse_carte.ogg", "audio/defausse_carte.wav"],
  heroPowerFlip: ["audio/pouvoir_retourne.mp3", "audio/pouvoir_retourne.ogg", "audio/pouvoir_retourne.wav"],
  heroPowerReady: ["audio/pouvoir_reactive.mp3", "audio/pouvoir_reactive.ogg", "audio/pouvoir_reactive.wav"],
  menuHover: ["audio/survol_menu.mp3", "audio/survol_menu.ogg", "audio/survol_menu.wav"],
  questNew: ["audio/nouvelle_quete.mp3", "audio/nouvelle_quete.ogg", "audio/nouvelle_quete.wav"],
  questComplete: ["audio/quete_terminee.mp3", "audio/quete_terminee.ogg", "audio/quete_terminee.wav"],
  tauntPlayed: ["audio/provocation.mp3", "audio/provocation.ogg", "audio/provocation.wav"],
  shopOpen: ["audio/ouverture_boutique.mp3", "audio/ouverture_boutique.ogg", "audio/ouverture_boutique.wav"],

  // V27 — Fatigue, mana, mots-clés de combat, dégâts, mort, secrets, arme, pouvoir héroïque, soin
  fatigue: ["audio/fatigue.mp3", "audio/fatigue.ogg", "audio/fatigue.wav"],
  manaGain: ["audio/gain_mana.mp3", "audio/gain_mana.ogg", "audio/gain_mana.wav"],
  rushPlayed: ["audio/ruee.mp3", "audio/ruee.ogg", "audio/ruee.wav"],
  chargePlayed: ["audio/charge.mp3", "audio/charge.ogg", "audio/charge.wav"],
  silence: ["audio/silence.mp3", "audio/silence.ogg", "audio/silence.wav"],
  freeze: ["audio/gel.mp3", "audio/gel.ogg", "audio/gel.wav"],
  damageTaken: ["audio/degat_subit.mp3", "audio/degat_subit.ogg", "audio/degat_subit.wav"],
  deathrattle: ["audio/rale_agonie.mp3", "audio/rale_agonie.ogg", "audio/rale_agonie.wav"],
  secretTriggered: ["audio/secret_declenche.mp3", "audio/secret_declenche.ogg", "audio/secret_declenche.wav"],
  weaponEquip: ["audio/arme_equipee.mp3", "audio/arme_equipee.ogg", "audio/arme_equipee.wav"],
  weaponDestroyed: ["audio/arme_detruite.mp3", "audio/arme_detruite.ogg", "audio/arme_detruite.wav"],
  divineShield: ["audio/bouclier_divin.mp3", "audio/bouclier_divin.ogg", "audio/bouclier_divin.wav"],
  minionDeath: ["audio/mort_serviteur.mp3", "audio/mort_serviteur.ogg", "audio/mort_serviteur.wav"],
  attackTargetSelect: ["audio/choix_attaque.mp3", "audio/choix_attaque.ogg", "audio/choix_attaque.wav"],
  heroPowerAttack: ["audio/pouvoir_attaque.mp3", "audio/pouvoir_attaque.ogg", "audio/pouvoir_attaque.wav"],
  heroPowerArmor: ["audio/pouvoir_armure.mp3", "audio/pouvoir_armure.ogg", "audio/pouvoir_armure.wav"],
  heal: ["audio/soin.mp3", "audio/soin.ogg", "audio/soin.wav"],

  // Écran de chargement — musique/ambiance jouée pendant le chargement des assets,
  // et son joué lorsque le joueur clique sur « Entrer dans la taverne ».
  loadingScreen: ["audio/loading_screen.mp3", "audio/loading_screen.ogg", "audio/loading_screen.wav"],
  enterGameButton: ["audio/enter_game_button.mp3", "audio/enter_game_button.ogg", "audio/enter_game_button.wav"],

  // V33 — Livre de collection : son joué à chaque tourne-page
  pageTurn: ["audio/tourne_page.mp3", "audio/tourne_page.ogg", "audio/tourne_page.wav"],

  /*
    Facultatif : vous pouvez imposer un fichier particulier à une carte.
    La clé peut être l'identifiant, le nom exact ou le nom normalisé de la carte.
    Sans réglage ici, le jeu cherche automatiquement dans audio/cartes/.

    Exemple :
    cardSummons: {
      "creature_001": ["audio/cartes/etincelle_familiere.mp3"],
      "Titan des constellations": ["audio/cartes/voix_du_titan.ogg"]
    }
  */
  cardSummons: {}
};
