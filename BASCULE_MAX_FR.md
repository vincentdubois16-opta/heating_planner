# Passage en production de Chambre Max

Cette procédure commence par Chambre Max. Les autres pièces pourront être basculées après le premier contrôle de réception et le contrôle de redémarrage.

## Source confirmée

- Consigne actuelle Heating Planner : `sensor.chambre_max_demo_consigne_actuelle`.
- Ancienne consigne calculée en YAML : `sensor.max_bedroom_effective_setpoint`. Son intégration est Modèle/Template. Elle sert au retour arrière, pas à alimenter le nouveau raccordement.
- Thermostat : `climate.climate_max_bedroom`.
- Topic de commande : `opta/target/set/MaxBedroom`.
- Retour de consigne dans le climate : attribut `temperature`, issu de `opta/targetha/MaxBedroom` dans le YAML fourni.
- Mesure PT100 : `opta/current/MaxBedroom`.
- Autorisation : `input_boolean.heating_planner_max_opta_send`.
- Vannes : `climate.shellyblutrv_f844772a4157`, `climate.shellyblutrv_f844772cb22d`, `climate.shellyblutrv_f844772ace93`.

## Raccordement de production fourni

Le nouveau blueprint `heating_planner/opta_max_production.yaml` est réservé à Chambre Max. Il vérifie que la source appartient à l'intégration Heating Planner et que le thermostat sélectionné est celui de Max. Les limites, le pas, les valeurs numériques et le preset planning sont contrôlés. Les commandes sont placées derrière l'autorisation, y compris lors d'une exécution manuelle des actions.

L'envoi OPTA passe par **une publication MQTT** sur le topic Max, avec `retain: true` et `qos: 1`. Ce choix remplace l'ancienne consigne mémorisée par le broker. Il évite qu'une ancienne cible mémorisée soit rejouée à une reconnexion. La publication est renouvelée chaque minute tant que l'envoi est autorisé et que les gardes sont satisfaites, ainsi qu'au démarrage et lors d'une différence de cible. Le retour de consigne du climate reste le moyen de vérifier la réception.

Les trois vannes reçoivent la consigne + 2 °C via leurs services climate, avec vérification de leurs limites et de leur pas. Les valeurs déjà concordantes sont laissées en place. Un échec sur une vanne est signalé par Home Assistant et laisse le traitement continuer pour les suivantes.

Le mode observation est activé dans l'exemple fourni. L'état on/off de l'automatisation sera restauré après redémarrage grâce à l'absence de `initial_state`. Lors de sa première création, Home Assistant peut l'activer, mais l'observation reste sans envoi. Le verrou est une protection distincte.

## 1. Sauvegarder et installer en observation

1. Faire une sauvegarde Home Assistant. Noter l'état on/off des anciennes automatisations de la section suivante pour pouvoir le restaurer.
2. Laisser l'autorisation d'envoi **off**. Installer le blueprint dans `/config/blueprints/automation/heating_planner/opta_max_production.yaml`.
3. Créer une automatisation à partir de ce blueprint. Le fichier `automatisation_max.yaml` contient les paramètres déjà remplis et peut être utilisé dans l'éditeur YAML d'une nouvelle automatisation. Conserver `observation_only: true`.
4. Activer cette nouvelle automatisation pour lire ses traces. Les anciennes automatisations peuvent encore piloter durant cette observation.
5. Vérifier que le calcul observé correspond à la carte Heating Planner, avec la source `sensor.chambre_max_demo_consigne_actuelle`. Vérifier aussi les trois messages de vannes, leur cible +2 °C, leurs limites et leur pas. Les profils et modes de Max doivent rester dans les limites OPTA et leurs cibles +2 °C dans celles des vannes.

Si la source n'appartient pas à Heating Planner, si le preset n'est pas planning ou si une valeur est invalide, le motif de blocage apparaît dans le message principal. Une trace d'observation seule ne valide pas encore une transmission physique.

## 2. Suspendre les anciens producteurs de Max

Suspendre les instances actuellement actives ci-dessous, ainsi que l'automatisation utilisant le précédent blueprint « Consigne vers OPTA (préparation v1) ». Ne pas modifier les blueprints communs utilisés par d'autres pièces. Les alias ne garantissent pas l'entity_id exact : rechercher les instances dans l'interface.

| Alias connu | Fonction |
|---|---|
| Opta Publish Max BedRoom | Ancienne publication vers OPTA |
| Preheat Max Bed Room | Ancien déclenchement de préchauffage |
| MBR - Cancel Preheat | Ancienne annulation et publication |
| Align Profile Max BedRoom | Ancien alignement et commande de preset |
| MBR - Cancel boost mode | Ancienne échéance Boost |
| MaxBedroom - Fin mode Absent | Ancienne échéance Absent, id `max_bedroom_cancel_away` |
| MaxBedroom - Fin dérogation manuelle | Ancienne échéance manuelle, id `max_bedroom_manual_override_end` |
| Chambre Max - Change valeur vannes | Anciennes consignes Shelly |
| Max BedRoom - Start Slope Calculation | Ancienne mesure de pente |
| Max BedRoom - Slope Cancellation - rule 1 | Ancienne annulation de pente |
| Max Bed Room - Slope Calculation | Ancienne écriture de pente |
| Max Bed Room - Cancel Slope rule 2 | Ancienne annulation de pente |

Suspendre les schedules ciblant `input_select.max_bedroom_profile`. Conserver la transmission **Chambre Max - PT100 vers Shelly TRV** vers les deux vannes de la chambre. La troisième vanne de la petite salle de bain conserve sa mesure locale, comme tu l'as précisé.

Utiliser ensuite la carte Heating Planner pour les modes de Max. Les anciennes cartes/scripts de commande Max peuvent encore modifier les presets OPTA si quelqu'un les utilise.

Pour ce premier démarrage, conserver la pente actuelle et laisser l'apprentissage automatique arrêté. Cela évite de changer simultanément le pilotage et sa calibration.

## 3. Autoriser le premier envoi

1. Vérifier que les anciens producteurs ont terminé leurs éventuelles actions et que la nouvelle autorisation est toujours off.
2. Sur le thermostat OPTA Max, choisir le preset **planning**. Dans Outils de développement → Actions, l'action suivante peut être utilisée si nécessaire.

```yaml
action: climate.set_preset_mode
target:
  entity_id: climate.climate_max_bedroom
data:
  preset_mode: planning
```

3. Vérifier dans l'état du climate que `preset_mode` vaut planning. Les modes Absent, Boost et Maintenir seront désormais ceux de Heating Planner. Le preset OPTA restera planning, y compris pendant une absence gérée par Heating Planner.
4. Dans la nouvelle automatisation, décocher Observation uniquement et enregistrer. Vérifier qu'elle est activée.
5. Passer `input_boolean.heating_planner_max_opta_send` sur on. Ce changement déclenche la première publication de la consigne actuelle avec retain, même si le retour OPTA lui correspond déjà.
6. Vérifier les valeurs de la section suivante avant de laisser le système fonctionner sans surveillance.

## 4. Contrôler les valeurs et les modes

- L'attribut `temperature` de `climate.climate_max_bedroom` doit rejoindre la valeur de `sensor.chambre_max_demo_consigne_actuelle`.
- L'attribut `temperature` de chacune des trois vannes doit rejoindre cette valeur +2 °C, à condition que les gardes de la vanne l'acceptent.
- Faire un essai bref de Boost dans Heating Planner, vérifier ces quatre retours, puis choisir Reprendre pour revenir au planning. Une température de pièce ne monte pas instantanément ; les premiers contrôles portent sur les consignes reçues.
- Vérifier le retour d'absence et son préchauffage calculé. Le nouveau raccordement suit la consigne effective, y compris lorsqu'elle remonte avant la fin d'absence.
- Si une cible ne rejoint pas la valeur prévue, couper le verrou, consulter la trace puis utiliser le retour arrière ci-dessous si nécessaire.

Une valeur visible dans HA peut être ancienne en cas de déconnexion : le climate MQTT fourni n'a pas de topic d'availability. Le contrôle de reconnexion OPTA doit donc aussi vérifier ce que le module reçoit réellement. Le broker conserve la dernière consigne publiée pour sa prochaine reconnexion ; cela ne garantit pas à lui seul que le module est connecté.

## 5. Reprise après redémarrage

Le nouveau blueprint restaure l'état de son automatisation. L'assistant d'autorisation créé dans le package de préparation contient toutefois `initial: false`, qui le force à off après chaque redémarrage.

Après le premier contrôle réussi, modifier **la définition existante** de cet assistant en retirant seulement `initial: false`, si la reprise automatique est souhaitée. Conserver son nom et son identifiant. Ne pas ajouter une deuxième définition. La définition devient par exemple :

```yaml
input_boolean:
  heating_planner_max_opta_send:
    name: Heating Planner Chambre Max - Autoriser envoi OPTA
    icon: mdi:radiator
```

Un assistant créé dans l'interface restaure normalement son dernier état. Vérifier le résultat après un redémarrage contrôlé : automatisation activée, observation désactivée, autorisation on, preset planning et consignes concordantes. Les gardes bloquent l'envoi tant que les valeurs nécessaires sont indisponibles, puis le passage périodique permet la reprise.

## Retour arrière

Couper le verrou et arrêter la nouvelle automatisation. OPTA conserve alors sa dernière cible jusqu'à une nouvelle commande. Restaurer les seuls anciens automatismes qui étaient actifs au départ, y compris la synchronisation des vannes. Vérifier l'ancienne consigne YAML puis exécuter « Opta Publish Max BedRoom » pour la réémettre avec ses paramètres historiques. Contrôler les retours OPTA et Shelly. Les plannings et helpers Heating Planner restent disponibles pour un nouvel essai.

## Vérifications locales et limites

La syntaxe YAML, les entrées du blueprint, la séparation observation/envoi, le verrou dans les actions, la source par défaut correcte, le contrôle d'appartenance à Heating Planner, le topic MQTT unique avec retain/QoS1 et la boucle des vannes ont été vérifiés statiquement. Les templates et services de cette variante doivent être exécutés en observation dans ton installation avant le premier envoi. Aucun accès distant à ton Home Assistant ou OPTA n'est disponible dans cette conversation.

Références consultées :

- https://www.home-assistant.io/docs/automation/yaml/
- https://www.home-assistant.io/integrations/input_boolean/
- https://www.home-assistant.io/integrations/mqtt/
- https://www.home-assistant.io/template-functions/integration_entities/
