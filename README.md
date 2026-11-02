# Heating Planner v0.8 — interface graphique

Mise à jour de la v0.7 : moteur Python et données inchangés.

- Accueil avec accès rapide aux modes, planning, exceptions et réveils.
- Frise 24 h colorée pour le planning et les exceptions.
- Clic sur une plage pour accéder à la ligne de modification correspondante.
- Les heures et profils se modifient via les champs existants, puis Enregistrer.

**Limite connue :** la consigne affichée sur l’accueil est indicative : elle ne tient pas compte des réveils ni du préchauffage. Les capteurs restent la source fiable.

## Installation

1. Sauvegarder Home Assistant.
2. Copier `custom_components/heating_planner/` dans `/config/custom_components/heating_planner/`.
3. Copier `www/heating-planner-card.js` dans `/config/www/`.
4. Redémarrer Home Assistant et changer la ressource en `/local/heating-planner-card.js?v=8`.
5. Carte : `type: custom:heating-planner-card`.

Aucun contrôle OPTA ajouté.
