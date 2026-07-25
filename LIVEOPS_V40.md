# LiveOps V40 — boutique administrable étendue

## Gestion des paquets
- activation ou désactivation individuelle de l’achat des packs Astral, Zénith, Néant et Quêtes ;
- prix modifiable depuis le panel ;
- contrôle côté serveur avant chaque achat ;
- mise à jour immédiate chez les joueurs connectés grâce au WebSocket.

## Cartes à l’unité
- sélection d’une carte du catalogue ;
- prix normal et ancien prix promotionnel facultatif ;
- nombre de copies accordées par achat ;
- limite d’achats par joueur ;
- début et fin de disponibilité personnalisés ;
- activation, modification et suppression depuis le panel ;
- achat et ajout à la collection validés côté serveur.

## Déploiement
Aucune nouvelle variable d’environnement n’est nécessaire. Redéployez le backend Render après la mise à jour des fichiers. Les tables `pack_shop_settings`, `card_shop_listings` et `card_shop_purchases` seront créées automatiquement.
