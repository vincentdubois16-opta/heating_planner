# Heating Planner v0.6 — préchauffage (lecture seule)

## Installation
1. Sauvegarder Home Assistant.
2. Remplacer `/config/custom_components/heating_planner/` par le dossier `custom_components/heating_planner/` fourni.
3. Remplacer `/config/www/heating-planner-card.js` par `www/heating-planner-card.js`.
4. Redémarrer Home Assistant. Ressource Lovelace : `/local/heating-planner-card.js?v=6` (module JavaScript).
5. **Conserver** l’entrée d’intégration et les données `.storage` existantes.

## Configuration
Paramètres > Appareils et services > Heating Planner > Configurer : régler **preheat_minutes** (0 à 360 minutes ; défaut 0). Les trois profils restent configurables. C’est une **avance fixe par zone** pour cette première version, et non un modèle thermique intelligent.

## Fonctionnement
- Uniquement lors d’une hausse de consigne effective (semaine / exception / réveil).
- Le préchauffage commence `preheat_minutes` avant la transition, en appliquant à titre indicatif la future consigne.
- Une baisse de consigne ne déclenche pas de préchauffage.
- Les capteurs actuels « Consigne actuelle », « Prochaine consigne », « Prochain changement » tiennent compte du préchauffage.
- Nouveaux capteurs : « Consigne sans préchauffage », « Consigne de préchauffage », « Début préchauffage » ; et indicateur binaire « Préchauffage actif ».
- Le préchauffage ne commande aucun thermostat, vanne, relais ou MQTT.
- Si plusieurs changements se chevauchent, cette préversion reste expérimentale : valider les résultats avant toute future activation du pilotage.

## Test
1. Régler 30 minutes dans Configurer.
2. Prévoir une montée Nuit 17 °C vers Confort 21 °C à une heure proche.
3. Vérifier que « Prochain changement » annonce le début de préchauffage 30 minutes avant la montée.
4. Pendant cette fenêtre, « Préchauffage actif » = ON, « Consigne actuelle » = 21 °C et « Consigne sans préchauffage » = 17 °C.
5. Mettre 0 minute pour désactiver instantanément le préchauffage.
