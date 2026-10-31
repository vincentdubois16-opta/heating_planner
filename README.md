# Heating Planner v0.5 — Réveils programmables (préversion)

## Installation
1. Faire une sauvegarde Home Assistant.
2. Copier `custom_components/heating_planner/` vers `/config/custom_components/heating_planner/` (remplacer les fichiers).
3. Copier `www/heating-planner-card.js` vers `/config/www/heating-planner-card.js`.
4. Redémarrer Home Assistant et modifier la ressource du dashboard en `/local/heating-planner-card.js?v=5` (type module JavaScript). Garder la carte `type: custom:heating-planner-card`.
5. Ne pas supprimer l'entrée d'intégration existante.

## Nouveautés
- Onglet « Réveils » : événements nommés et horaires différents pour chaque jour de semaine.
- Un événement peut concerner plusieurs zones Heating Planner, chacune avec son propre profil.
- Exceptions ponctuelles à une date : autre heure, suppression du réveil ou retour à l'horaire habituel.
- Priorité : réveil actif > exception datée de planning > semaine habituelle. À la fin du réveil, retour automatique à la consigne normale du moment.
- Les réveils sont partagés entre les entrées Heating Planner et stockés dans `.storage/heating_planner.shared_wakes`.
- Les réveils traversant minuit ne sont pas encore pris en charge. Le préchauffage et le contrôle des thermostats ne sont pas activés.

## Validation
- Créer un réveil, régler lundi-vendredi 06:30–08:00 et samedi-dimanche 08:00–09:30.
- Choisir une ou plusieurs zones et un profil par zone, enregistrer.
- Choisir une date, cliquer « Voir la date », modifier puis « Définir cette date » et « Enregistrer les réveils ».
- Contrôler « Prochaine consigne » et « Prochain changement » lorsque le réveil approche.
- Pour désactiver le réveil à une date : « Pas de réveil à cette date » puis enregistrer.

## Important
Cette version ne pilote ni OPTA, ni MQTT, ni aucun équipement. Les modifications de réveils nécessitent un compte administrateur HA.
