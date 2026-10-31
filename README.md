# Heating Planner v0.7.0 (préversion)

Mise à jour incrémentale de la v0.6.1 fournie par l'utilisateur.

## Installation

1. Sauvegarder Home Assistant.
2. Copier `custom_components/heating_planner/` dans `/config/custom_components/heating_planner/` en remplaçant les fichiers.
3. Copier `www/heating-planner-card.js` dans `/config/www/`.
4. Redémarrer Home Assistant.
5. Mettre à jour la ressource Lovelace en `/local/heating-planner-card.js?v=7` (Module JavaScript), puis actualiser la page.
6. Garder la carte `type: custom:heating-planner-card`.

## Fonctionnement

Nouvel onglet « Modes » : Planning, Manuel (température et durée), Boost (température et durée), Absent (température et date/heure de fin). Le dernier mode choisi remplace le précédent. Retour automatique au planning à l'échéance, y compris les réveils, exceptions et préchauffage. Les réglages sont persistés dans le même stockage que les plannings.

Nouveaux capteurs : `Mode actif`, `Fin du mode temporaire`.

Les commandes sont réservées aux administrateurs. Cette préversion ne commande aucun thermostat, relais, MQTT ou OPTA.

**Limites :** le rafraîchissement des capteurs est effectué chaque minute; la carte ne se rafraîchit pas automatiquement pendant qu'elle est ouverte. Une seule zone de démonstration est disponible tant que le flux de création de zones n'a pas été étendu.
