# Heating Planner v0.9.8

Cette version reprend la carte v0.9.7 et permet de créer plusieurs pièces. Chaque pièce a son planning, ses températures, sa sonde et son assistant de pente. Chambre Max conserve son identifiant et ses données.

## Installation

1. Sauvegarder Home Assistant et enregistrer les modifications de planning en cours.
2. Remplacer le dossier `/config/custom_components/heating_planner/` et le fichier `/config/www/heating-planner-card.js`.
3. Redémarrer Home Assistant et actualiser la ressource de la carte avec `/local/heating-planner-card.js?v=0.9.8`.
4. Pour ajouter Chambre ou Chambre Pauline, ajouter une nouvelle instance de l’intégration Heating Planner et lui donner un nom distinct. Dans les options de cette pièce, choisir sa sonde et, pour le préchauffage dynamique, son propre assistant numérique de pente. La carte accepte le nom exact de la pièce via `room`. La sélection par `entry_id` reste disponible.

```yaml
type: custom:heating-planner-card
room: Chambre Pauline
temperature_entity: sensor.temperature_chambre_pauline
heating_entity: climate.thermostat_chambre_pauline
```

Les entités de cet exemple sont à remplacer par tes identifiants. La sonde utilisée pour le calcul se règle dans les options de l’intégration. Celle affichée dans la carte se règle avec `temperature_entity`.

## Automatisations par pièce

Copier les fichiers de `blueprints/automation/heating_planner/` dans le dossier correspondant sous `/config`, puis créer les automatisations voulues depuis les blueprints. Elles sont initialement arrêtées et reviennent à l’arrêt après redémarrage. Configurer et activer chaque instance séparément après vérification. Le raccordement de Chambre Max déjà en place peut rester tel quel.

- **Apprentissage de la pente.** Sélectionner le thermostat qui reçoit la consigne, une sonde en °C et un signal de chauffe réelle. Le signal peut être un climate dont `hvac_action` est renseigné ou un capteur binaire fiable. Utiliser le même assistant numérique et la même unité dans le blueprint et dans les options de la pièce. Renseigner une pente initiale positive, des bornes plausibles et une précision compatible avec son unité. Une seule automatisation doit écrire dans chaque assistant.
- **Consigne OPTA et vannes par pièce.** Sélectionner le capteur Consigne actuelle de la pièce, son thermostat OPTA et son interrupteur d’autorisation. La liste de vannes peut être vide. Pour Max, sélectionner les trois vannes et conserver le décalage de +2 °C. Le mode observation permet de vérifier la cible. L’envoi exige le preset OPTA `planning`, le verrou actif et la sortie du mode observation. Suspendre les anciennes automatisations de consigne de cette pièce avant de prendre le relais.
- **Suivi du mode du thermostat.** Pour Chambre et Chambre Pauline, créer une instance par pièce, avec le thermostat de référence, la ou les clims et un interrupteur d’autorisation. Le blueprint suit l’état `heat` ou `off` et vérifie que la cible accepte ce mode. Il ne modifie pas la consigne de la clim. Pendant la synchronisation, une modification manuelle de son mode peut être réappliquée au contrôle suivant, au plus tard au prochain passage périodique d’une minute.

## Calcul de la pente

L’automatisation relève la température au passage en chauffe réelle. Elle attend que la température atteigne la consigne initiale. L’écart initial doit être d’au moins 1 °C, ou le seuil supérieur choisi. La consigne doit rester constante et la chauffe continue. Le cycle est écarté en cas d’interruption, de mesure indisponible, de durée inférieure à cinq minutes ou supérieure à six heures, ou de pente hors des bornes de l’assistant. Si l’arrêt de chauffe est reçu avant la dernière mesure, le cycle est écarté aussi.

La pente mesurée est la hausse effective divisée par le temps. La valeur enregistrée vaut `0.7 × ancienne + 0.3 × mesurée`. Par exemple, 0,028 et 0,035 °C/min donnent 0,0301 °C/min. C’est une moyenne mobile exponentielle. Le préchauffage lit ensuite l’assistant via les options existantes.

Pour tenir compte de l’extérieur, une prochaine étape serait de relever, pour chaque cycle valable, la température extérieure moyenne et l’écart moyen intérieur–extérieur. On pourrait alors comparer les pentes dans des plages d’écart comparables, séparément par pièce et par type de chauffe. Il faut plusieurs cycles par plage pour juger si le gain justifie un modèle plus complexe. Cette version utilise une pente par pièce.

## Vérifications

Les tests Python existants, le test de création de deux pièces distinctes avec doublons refusés et les tests Chrome de la carte v0.9.7 passent. Les trois fichiers YAML ont été analysés et leurs références d’entrées vérifiées. Le rendu des templates et l’exécution des automatisations restent à vérifier dans Home Assistant.
