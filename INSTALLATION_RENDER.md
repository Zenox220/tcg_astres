# Installer Chroniques d'Astréa avec GitHub Pages et Render PostgreSQL

## Architecture

- **GitHub Pages** héberge le jeu : `index.html`, JavaScript, CSS et ressources.
- **Render Web Service** exécute le backend Node.js situé dans `server/`.
- **Render Postgres** conserve définitivement les comptes et progressions tant que la base Render existe.

Le backend crée automatiquement les tables au premier démarrage : utilisateurs, sessions, demandes d'amis, amitiés, messages et signalements.

## 1. Envoyer cette version sur GitHub

Remplacez les fichiers actuels du dépôt par ceux de cette archive, puis effectuez un commit et un push.

Ne mettez jamais une URL PostgreSQL ou un mot de passe directement dans les fichiers GitHub.

## 2. Créer la base PostgreSQL sur Render

> Pour conserver les données sans limite de 30 jours, choisissez une base Render Postgres payante. Le fichier `render.yaml` fourni utilise `basic-256mb`. Une base gratuite fonctionne pour tester, mais elle expire après 30 jours.

1. Ouvrez le Dashboard Render.
2. Cliquez sur **New**, puis **Postgres**.
3. Donnez un nom à la base, par exemple `astrea-database`.
4. Choisissez la même région que celle prévue pour le backend.
5. Créez la base.

L'adresse à utiliser ensuite est l'**Internal Database URL** lorsque le backend et la base sont sur Render dans la même région.

## 3. Créer le backend Render

1. Dans Render, cliquez sur **New**, puis **Web Service**.
2. Connectez le dépôt GitHub du jeu.
3. Configurez :

```text
Language       : Node
Root Directory : server
Build Command  : npm install
Start Command  : npm start
Health Check   : /api/health
```

4. Ajoutez les variables d'environnement :

```env
DATABASE_URL=<Internal Database URL de Render Postgres>
DATABASE_SSL=true
CORS_ORIGINS=https://VOTRE-PSEUDO.github.io
```

`CORS_ORIGINS` doit contenir uniquement l'origine du site, sans le nom du dépôt et sans slash final.

Exemple : pour `https://lb-studio.github.io/chroniques-astrea/`, utilisez :

```env
CORS_ORIGINS=https://lb-studio.github.io
```

Pour autoriser plusieurs sites, séparez-les par une virgule :

```env
CORS_ORIGINS=https://pseudo.github.io,http://localhost:5500
```

## 4. Relier le jeu GitHub au backend

Après le premier déploiement, Render fournit une URL semblable à :

```text
https://astrea-backend.onrender.com
```

Dans le fichier `server-url.js` à la racine du dépôt, remplacez :

```js
window.ASTREA_SERVER_URL = "https://REMPLACEZ-MOI.onrender.com";
```

par :

```js
window.ASTREA_SERVER_URL = "https://astrea-backend.onrender.com";
```

Ne mettez pas de slash à la fin. Envoyez ensuite cette modification sur GitHub.

## 5. Vérifier le fonctionnement

Ouvrez dans un navigateur :

```text
https://VOTRE-BACKEND.onrender.com/api/health
```

La réponse attendue est :

```json
{
  "ok": true,
  "database": "postgresql"
}
```

Créez ensuite un compte depuis le jeu, gagnez quelques pièces ou modifiez un deck, puis redémarrez le Web Service Render. Après reconnexion, le compte et la progression doivent toujours être présents.

## Suppression du compte

Le menu du compte contient maintenant **Supprimer mon compte**. Le joueur doit confirmer avec son mot de passe. PostgreSQL supprime alors le compte, sa progression, ses sessions, ses amitiés et ses messages associés.

## Import de l'ancien fichier JSON

Si `server/data/db.json` contient déjà des comptes lors du premier démarrage PostgreSQL, le backend les importe automatiquement une seule fois. Les mots de passe restent hashés et les progressions sont transférées dans PostgreSQL.

## Fichiers importants

```text
server/server.js       Backend Express + WebSocket + PostgreSQL
server/package.json    Dépendances Node, dont pg
server/.env.example    Exemple de variables d'environnement
server-url.js          Adresse publique du backend Render
render.yaml            Modèle d'infrastructure Render
```
