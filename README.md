# Heating Planner v0.9.0 — Préchauffage dynamique

## Installation depuis v0.8.x
1. Effectuer une sauvegarde Home Assistant.
2. Remplacer `/config/custom_components/heating_planner/` et `/config/www/heating-planner-card.js` avec ceux du ZIP. Ne pas supprimer l’intégration, ses entrées ou les fichiers `.storage`.
3. Redémarrer Home Assistant.
4. Changer la ressource en `/local/heating-planner-card.js?v=0.9.0`, puis actualiser complètement la page.

## Activer pour Chambre Max
Dans Paramètres → Appareils et services → Heating Planner → Configurer (ou Options) :
- Activer le préchauffage dynamique : cocher (désactivé par défaut pour préserver la v0.8).
- Entité de température : `sensor.temperature_chambre_max`.
- Entité de vitesse de chauffe : `input_number.max_bedroom_slope`.
- Durée maximale : 180 minutes par défaut, réglable de 0 à 360 minutes. 0 désactive l’anticipation dynamique.
- Préchauffage (minutes) : conserver la durée fixe voulue comme secours.

La valeur 1,68 °C/h est lue dans ton input_number existant ; Heating Planner ne crée ni ne modifie cet assistant. Ajuste-le dans Home Assistant si nécessaire. Les entités de calcul sont définies dans les options de l’intégration, indépendamment des entités d’affichage de la carte. La température peut aussi venir de current_temperature d’un climate. Les températures doivent être en °C et la vitesse en °C/h.

La configuration de carte reste valable :
```yaml
type: custom:heating-planner-card
temperature_entity: sensor.temperature_chambre_max
heating_entity: climate.climate_max_bedroom
```

## Calcul et affichage
Durée = arrondi supérieur en minutes de max(0, consigne future − température actuelle) / vitesse × 60, limitée au maximum configuré.
Exemple : de 17 à 21 °C à 1,68 °C/h → 143 minutes ; objectif à 10:00 → début estimé à 07:37.
Le calcul examine les hausses du planning effectif, réveils et exceptions compris. La plus forte consigne de préchauffage active reste prioritaire comme auparavant. L’accueil indique le début estimé, la durée, l’objectif et la vitesse. Les informations sont aussi exposées dans les attributs du capteur Consigne actuelle (dynamic_start, dynamic_deadline, dynamic_minutes, dynamic_target, dynamic_slope, preheat_strategy).

Le coordinateur recalcule chaque minute et lors de changements de configuration/planning : prévoir jusqu’à une minute pour une modification de la sonde ou de la vitesse. L’accueil se rafraîchit via Home Assistant.
Une fenêtre de préchauffage déjà déclenchée reste active jusqu’à son échéance malgré la montée de température. Ce maintien est en mémoire : après redémarrage, reconfiguration ou modification du planning, il est recalculé avec les mesures disponibles.

Température absente/non numérique, ou vitesse absente, non finie ou ≤ 0 : retour au préchauffage fixe et message de secours. Les entités unknown/unavailable sont traitées comme indisponibles. Une mesure numérique ancienne n’est pas détectée comme périmée automatiquement.
Manuel, Boost et Absent restent prioritaires et suspendent le préchauffage. L’estimation de la reprise à la fin d’un mode temporaire utilise le préchauffage fixe, car la température future est inconnue ; le dynamique reprend avec la mesure réelle à l’expiration.

Cette première version utilise la température actuelle pour ses prévisions : elle ne modélise ni le refroidissement futur, ni la météo, ni l’inertie, et n’apprend pas automatiquement la vitesse. La vitesse est gérée par ton input_number. Le résultat est une estimation à observer avant d’envisager le pilotage.

## Préservation et périmètre
Formats de stockage et identifiants conservés, aucune migration. Moteurs de planning, réveils et modes temporaires conservés ; le moteur de préchauffage accepte désormais une anticipation par transition. Désactiver le dynamique rétablit le calcul fixe existant.
Aucune commande OPTA, aucun appel de service climate/switch et aucune écriture vers tes assistants. Le lien OPTA et l’ajout d’autres pièces ne font pas partie de cette version.

## Vérifications
- Syntaxe Python et JavaScript : OK.
- Tests dynamiques : 1,68 °C/h, plafond, maintien jusqu’à échéance, fin de préchauffage, secours, valeurs invalides, objectif déjà atteint, exceptions datées, réveils et priorité Absent : OK.
- Tests existants du préchauffage fixe et des modes temporaires : OK.
- Tests Chrome de l’affichage dynamique/secours/suspension et régressions de l’interface : OK.
- Intégrité ZIP : OK.
Pas de validation sur une installation Home Assistant réelle. Après installation, activer le calcul et comparer l’heure prévue avec un objectif connu, sans connecter de commande OPTA.

Pour exécuter les tests Python autonomes, se placer à la racine du ZIP : `python test_dynamic_preheat.py` et `python test_preheat_regression.py`. Le test navigateur nécessite Node.js, Playwright et Chrome (`node test_ui.cjs`).
