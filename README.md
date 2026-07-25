# Chroniques d’Astréa — Jeu complet V25

Jeu de cartes stratégique en HTML, CSS et JavaScript vanilla. Aucun framework, serveur ou outil de compilation n’est nécessaire **pour jouer en solo**.

## Nouveau : comptes, amis et multijoueur réel (V34)

Le jeu propose maintenant :
- **Connexion / inscription** (bouton en haut de l’écran d’accueil).
- **Progression liée au compte** : pièces, paquets, collection de cartes, decks, quêtes quotidiennes/mensuelles/saisonnières, statistiques, aventure normale/difficile et rang League sont sauvegardés dans une base **PostgreSQL Render**. La progression reste conservée après les redémarrages et redéploiements du backend.
- Une copie locale distincte est conservée pour chaque compte et une progression invitée séparée est restaurée à la déconnexion, afin de ne pas mélanger les sauvegardes de plusieurs utilisateurs sur le même ordinateur.
- **Amis** : recherche par pseudo, demandes envoyées/reçues, liste d’amis avec statut en ligne.
- En cliquant sur un ami : **Duel**, **Envoyer un message** (ouvre la conversation avec tout l’historique), **Échanger des cartes**, **Signaler**, **Retirer l’ami**.
- Un défi de duel affiche « *[pseudo] vous provoque en duel* » avec **Accepter / Décliner** chez l’adversaire.
- La messagerie affiche l’historique complet de la conversation ; une notification « *Nouveau message de [pseudo]* » s’affiche et ouvre directement la conversation si on clique dessus.
- **Échange de cartes** : sélectionnez une carte de votre collection à proposer, l’ami reçoit « *[pseudo] vous propose [carte]* » avec Accepter/Décliner ; s’il accepte, il choisit à son tour une carte **de la même rareté** à donner en retour, confirme, puis une animation d’échange s’affiche des deux côtés et les deux collections sont mises à jour.
- **Multijoueur** : bouton dans le menu principal pour affronter un vrai joueur trouvé automatiquement (file d’attente).

## Pop-up administrateur publiées dans le jeu

Le panneau `admin.html` contient une rubrique **Pop-up du jeu**. Un administrateur peut y créer une annonce avec un titre, une description, un footer facultatif, jusqu’à 8 images par URL, jusqu’à 4 boutons avec lien, une date de début et une durée d’affichage.

Les publications sont enregistrées dans PostgreSQL. Elles sont envoyées immédiatement aux joueurs connectés et récupérées automatiquement par les joueurs invités. Une même version d’une pop-up est affichée une fois par navigateur ; la modifier depuis le panel crée une nouvelle version qui sera de nouveau présentée.

Aucune variable d’environnement supplémentaire n’est nécessaire. La table `game_popups` est créée automatiquement au redémarrage du backend.

## Pioches visuelles et dos de carte personnalisé

Chaque joueur a maintenant une pioche face cachée visible sur le plateau, à côté de son héros, avec le nombre de cartes restantes. À chaque pioche (début de tour, effet de pioche…), une carte s’envole visuellement de la pioche vers la main.

Pour personnaliser le dos des cartes, déposez une image nommée **`cards_back_cover`** (au format `.png`, `.jpg`, `.jpeg` ou `.gif`) dans le dossier `assets/ui`. Le jeu la détecte automatiquement au chargement ; sans image fournie, un dos par défaut est utilisé.

Ces fonctionnalités nécessitent le petit serveur Node fourni dans `server/` (comptes, amis, messages et relais des parties se font via ce serveur — impossible de les faire fonctionner avec de simples fichiers locaux). **Sans ce serveur lancé, tout le reste du jeu (solo, collection, boutique, quêtes, aventure, league) continue de fonctionner normalement** ; les boutons Connexion/Amis/Multijoueur affichent simplement un message indiquant que le serveur est injoignable.

### Backend PostgreSQL sur Render

Le backend nécessite désormais une base PostgreSQL. Sur Render, créez une base **Render Postgres** et un **Web Service Node.js**, puis reliez la variable `DATABASE_URL` à l'URL interne de la base.

Configuration du Web Service :

```text
Root Directory : server
Build Command  : npm install
Start Command  : npm start
Health Check   : /api/health
```

Variables d'environnement :

```env
DATABASE_URL=<URL interne de Render Postgres>
DATABASE_SSL=true
CORS_ORIGINS=https://votre-pseudo.github.io
```

Ensuite, ouvrez `server-url.js` à la racine du jeu et remplacez :

```js
window.ASTREA_SERVER_URL = "https://REMPLACEZ-MOI.onrender.com";
```

par l'adresse réelle du Web Service Render. Consultez `INSTALLATION_RENDER.md` pour le guide complet.

Pour tester avec une base PostgreSQL locale :

```bash
cd server
export DATABASE_URL="postgresql://postgres:motdepasse@localhost:5432/astrea"
export DATABASE_SSL=false
npm install
npm start
```

## Lancer le jeu en solo (sans serveur)

1. Décompressez l’archive ZIP.
2. Ouvrez `index.html` dans Chrome, Edge ou Firefox.
3. Le jeu, la collection, les decks, les pièces, les paquets et les quêtes sont sauvegardés localement dans le navigateur.


## Contenu de la V21

- **131 définitions de cartes** dans le catalogue : **127 cartes collectionnables** et **4 cartes non collectionnables/jetons**, dont **La pièce**.
- Les **109 images** du fichier `cards.zip` ont été examinées et traitées : **108 illustrations de cartes sont reliées à des cartes jouables** et la planche récapitulative restante est conservée dans `assets/cards/source_pack/`.
- **40 nouvelles cartes jouables** ont été ajoutées : 20 cartes de contrôle/serviteurs, 10 armes et 10 serviteurs centrés sur le mana.
- Les nouvelles cartes sont disponibles dans la collection, les paquets, le mode Aventure et plusieurs cartes ont été ajoutées au deck de l’IA.
- Le joueur commence toujours avec **24 cartes différentes**, avec les quantités nécessaires pour constituer le deck de départ de 30 cartes.
- Les cartes non possédées restent grisées dans la collection.
- La partie choisit désormais aléatoirement le premier joueur en mode standard. Le second joueur reçoit automatiquement **La pièce**.

## Nouvelles mécaniques prises en charge

- **Lieux** avec plusieurs utilisations et effet au début du tour.
- **Furie des vents** : jusqu’à deux attaques par tour.
- **Camouflage** : le serviteur ne peut pas être ciblé par l’adversaire avant d’attaquer.
- **Insensibilité pendant le tour adverse**.
- **Réincarnation** et retour à la vie avec 1 PV.
- **Sommeil** pendant plusieurs tours.
- Coût dynamique selon le nombre de cartes jouées durant la partie.
- **Marginal** : réduction du coût lorsque la carte se trouve à une extrémité de la main.
- Aura permanente de réduction du coût des sorts.
- Déclenchements après chaque carte ou chaque sort joué.
- Vol de serviteurs, combat collectif et dernier survivant.
- Destruction suivie de l’invocation d’une copie 5/5.
- Remplissage du plateau avec des serviteurs aléatoires à faible coût.

## Fichiers principaux

```text
index.html   Interface du jeu
style.css    Interface, plateau, collection, boutique et animations
cards.js     Catalogue des cartes, decks de départ et deck de l’IA
game.js      Moteur de jeu, IA, quêtes, boutique et effets
assets/cards/ Illustrations utilisées dans le jeu
```

## Ajouter une carte

Ajoutez un objet dans `CARDS` dans `cards.js`, puis placez son illustration dans `assets/cards/`.

```js
{
  id: "spell_999",
  name: "Nouveau sort",
  type: "spell",
  cost: 3,
  keywords: [],
  effects: [
    { trigger: "onPlay", effect: "draw", target: "self", value: 2 }
  ],
  description: "Piochez 2 cartes.",
  rarity: "rare",
  image: "assets/cards/spell_999.png"
}
```

Les cartes nouvellement ajoutées apparaissent automatiquement dans la collection. Pour les rendre obtenables dans un paquet précis, ajoutez leur identifiant au tableau correspondant dans `PACK_POOL_EXTENSIONS` dans `game.js`.


## Mise à jour V13
- Plateau de jeu relooké avec un fond de plateau inspiré de la référence fournie.
- Animation de bouclier déployé pour les serviteurs avec **Provocation** lorsqu'ils arrivent sur le plateau.
- Les améliorations V12 restent actives : dos des cartes adverses visibles et zoom au survol dans la main du joueur.


## Mise à jour V15

- Les attaques utilisent désormais une animation de déplacement complète : la carte fonce vers sa cible, frappe, déclenche un effet d'impact, puis revient sur le plateau.
- Les serviteurs **Charge** ou **Ruée** sont entourés d'une aura verte lorsqu'ils peuvent profiter immédiatement de leur capacité.
- La mécanique **Ruée** est prise en charge : attaque immédiate des serviteurs, sans pouvoir viser le héros adverse le tour où la carte est jouée.


## Mode Aventure V17
Le menu **Aventures** ouvre désormais la campagne solo **La Guerre des Astres**. Elle comprend 6 combats, une progression persistante, des niveaux verrouillés à débloquer, des étoiles et des récompenses uniques.


## Mise à jour V18

- Le mode Aventure comprend désormais **56 combats** répartis sur **28 chapitres**.
- Cinquante nouveaux affrontements progressifs ont été ajoutés avec des récompenses, des decks thématiques et des héros adverses variés.
- Quand un héros tombe à 0 PV, son portrait se fissure, se brise en fragments et explose avant l’écran de fin de partie.


## Mise à jour V21 — intégration de `cards.zip`

- Ajout des mécaniques **Gel**, **contrôle temporaire**, **attaque forcée**, **Vol de vie d’arme**, **Bouclier divin du héros**, **Furie des vents d’arme**, cristaux de mana temporaires et cristaux de mana vides.
- Ajout de coûts dynamiques selon les sorts joués, les cartes jouées pendant le tour, les cartes piochées et le nombre de serviteurs alliés.
- Ajout de nouvelles auras : réduction du coût des serviteurs et interdiction d’attaquer pour les serviteurs blessés.
- Les cartes sous contrôle temporaire retournent automatiquement dans leur camp à la fin du tour.
- Les serviteurs gelés sont signalés visuellement sur le plateau.
- `cards_pack_manifest.json` permet de retrouver l’origine et la destination de chacune des 109 images du pack.

## Mise à jour V22
Cette version ajoute la difficulté Difficile de l’aventure, les quêtes mensuelles et saisonnières, le mode League, les paramètres audio, la capitulation, les animations de récompenses et le badge NOUVEAU lors des ouvertures de paquets.

## Mise à jour V23 — notifications et musiques

Une notification animée apparaît dès qu'une quête quotidienne, mensuelle, saisonnière ou une quête de combat est terminée.

Pour ajouter vos musiques :

- placez la musique des menus dans `audio/menu.mp3` ;
- placez la musique des combats dans `audio/combat.mp3`.

Les formats `.ogg` et `.wav` sont également acceptés avec les noms `menu` et `combat`. Le fichier `audio/audio-config.js` permet de choisir d'autres noms. Le volume et la coupure de la musique se règlent depuis le menu **Paramètres**.


## Mise à jour V24 — effets sonores

Les fichiers `audio/victoire`, `audio/defaite`, `audio/clic_menu` et `audio/impact_carte` permettent de personnaliser les sons de victoire, de défaite, des boutons et des impacts d’attaque. Les formats MP3, OGG et WAV sont acceptés.

## Mise à jour V25 — fin de tour et voix propres aux cartes

- Placez le son de fin de tour dans `audio/fin_tour.mp3`, `.ogg` ou `.wav`.
- Chaque serviteur et jeton peut avoir son propre son d’invocation dans `audio/cards/`. L’ancien dossier `audio/cartes/` reste compatible.
- Le nom recommandé est le nom de la carte en minuscules, sans accents, avec des tirets bas. Exemple : `Étincelle familière` devient `audio/cards/etincelle_familiere.mp3`.
- La liste complète des 67 fichiers est fournie dans `audio/LISTE_SONS_CARTES.txt`.
- Les sons sont également déclenchés lors des invocations par effet, copies, transformations et réincarnations.
- Des chemins personnalisés peuvent être configurés dans `cardSummons` dans `audio/audio-config.js`.

## Mise à jour V37 — Collection et effets visuels

- Le menu **Collection** possède maintenant sa propre galerie avec toutes les cartes, leurs descriptions, les filtres et les cartes non possédées grisées.
- Le menu **Decks** conserve l'atelier des decks et son livre interactif.
- Une carte peut être **enchantée** en consommant un doublon disponible. L'enchantement est permanent et ajoute une aura dorée dans la collection, le livre de decks, la main et sur le plateau.
- Les dégâts de **9 ou plus** déclenchent un tremblement du plateau.
- Les réductions et augmentations de coût en mana sont désormais animées dans la main du joueur.

## Mise à jour V38 — Signalements Discord et administration complète

- Le bouton **Signaler** ouvre maintenant un formulaire avec catégorie et description obligatoire.
- Chaque signalement est conservé dans PostgreSQL et envoyé à Discord par un webhook sécurisé côté serveur.
- La notification Discord contient un bouton **Gérer le signalement** menant vers `admin.html`.
- Le panneau d’administration permet de consulter le compte complet, modifier les pièces, cartes, paquets, identité et progression, fermer les sessions, réinitialiser ou supprimer le compte.
- Les administrateurs peuvent bannir temporairement ou définitivement un joueur. Le joueur reçoit immédiatement une fenêtre indiquant la durée et la raison, puis ne peut plus se reconnecter pendant la sanction.
- Un second webhook Discord annonce chaque bannissement avec un bouton menant vers la fiche de débannissement.
- Toutes les actions sensibles sont historisées dans PostgreSQL.

La configuration détaillée des variables Render se trouve dans `INSTALLATION_RENDER.md`.

## LiveOps administrables — version V40

Le panel `admin.html` permet maintenant de piloter le contenu suivant sans modifier les fichiers du jeu :

- pop-up avec ciblage par ancienneté du compte, rang, inactivité, compte administrateur ou liste de pseudos ;
- récompense unique dans une pop-up : pièces, paquet ou carte ;
- avertissements et mutes temporaires, reçus en direct par le joueur ;
- équilibrage des cartes : mana, dégâts/attaque, rareté, description et désactivation temporaire ;
- événements programmés avec récompenses immédiates, cartes exclusives et quêtes ;
- quêtes quotidiennes, hebdomadaires ou événementielles ;
- offres temporaires de boutique avec prix, ancien prix, limite d’achat et durée ;
- gestion des quatre paquets permanents : activation/désactivation de l’achat et prix administrable ;
- cartes vendues à l’unité pendant une période personnalisée, avec promotion, quantité et limite par joueur ;
- mode maintenance avec message et heure estimée de réouverture ;
- codes cadeaux limités, programmables et expirables ;
- journal des connexions, achats, ouvertures de paquets, parties, récompenses, sanctions et actions administratives.

Les récompenses et tous les achats de paquets ou de cartes sont appliqués côté serveur et protégés contre les contournements ou doubles récupérations. Les changements de configuration sont diffusés aux joueurs connectés par WebSocket et sont aussi rechargés périodiquement.

### Déploiement

Aucune nouvelle variable d’environnement n’est nécessaire. Après avoir remplacé les fichiers du dépôt, redéployez le Web Service Render. Au démarrage, PostgreSQL crée automatiquement les nouvelles tables et colonnes grâce à des migrations `CREATE TABLE IF NOT EXISTS` et `ALTER TABLE ... IF NOT EXISTS`.

Les nouveaux fichiers importants sont :

- `live-admin.js` : intégration des LiveOps dans le jeu ;
- `admin-extensions.js` : écrans supplémentaires du panel ;
- `server/admin-extensions.js` : tables, routes, récompenses, sanctions et logs.
