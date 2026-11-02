# Heating Planner v0.8.1

## Installation depuis la v0.8

1. Effectuer une sauvegarde Home Assistant, y compris la configuration et le dossier `.storage`.
2. Extraire le ZIP. Remplacer `/config/custom_components/heating_planner/` par le dossier fourni et remplacer `/config/www/heating-planner-card.js`.
3. Ne pas supprimer l’intégration, ses entrées ou les fichiers `.storage`. Aucune migration de données n’est nécessaire.
4. Redémarrer Home Assistant.
5. Dans les ressources du tableau de bord, utiliser `/local/heating-planner-card.js?v=0.8.1` (module JavaScript), puis actualiser complètement le navigateur ou l’application.

La carte existante reste valable :

```yaml
type: custom:heating-planner-card
```

Pour plusieurs zones, conserver votre `entry_id` existant.

Facultatif, pour afficher les mesures réelles disponibles :

```yaml
type: custom:heating-planner-card
temperature_entity: sensor.temperature_chambre
heating_entity: binary_sensor.chauffage_chambre
```

`heating_entity` peut également désigner une entité climate disposant de `hvac_action`. Ces entités sont lues uniquement. Sans mesure configurée, la température affiche « — » et l’état « Non connecté ». Le mode Planning/Manuel/Boost/Absent et le préchauffage proviennent du moteur. La consigne effective et le prochain changement proviennent du calcul serveur, sans estimation locale. L’accueil se rafraîchit lors des mises à jour Home Assistant, au maximum une fois toutes les 15 secondes.

## Utilisation et corrections

- La saisie des heures ne reconstruit plus les champs : le focus est conservé. Les changements actualisent la frise et activent Enregistrer.
- Une seule plage est surlignée à la fois. Cliquer sur une plage depuis l’accueil ouvre le jour hebdomadaire ou l’exception concernée, puis sélectionne sa ligne. L’heure de fin correspond au début de la plage suivante ; la dernière finit à 24:00.
- Les dates d’exceptions enregistrées sont regroupées dans un volet dépliable. « Retirer les dates passées » prépare leur suppression ; cliquer sur « Enregistrer les exceptions » pour la confirmer, ou « Annuler » pour recharger les données. Aucun nettoyage automatique.
- Pour les réveils, les pièces/profils et les modifications à une date précise sont dans des volets dépliables. Les horaires habituels restent directement accessibles. Enregistrer les réveils après modification.
- Enregistrer chaque catégorie avant de passer à une autre. Annuler recharge les données enregistrées et abandonne les modifications locales.

## Compatibilité

Le format de stockage, les identifiants, les profils et les moteurs de semaine, réveils, préchauffage et modes temporaires sont conservés. La réponse de lecture `heating_planner/get` ajoute uniquement `effective`, avec les résultats du coordinateur existant. Aucune commande OPTA, aucun appel de service de chauffage.

## Vérifications réalisées

- Syntaxe JavaScript : `node --check` — OK.
- Syntaxe de tous les fichiers Python : compilation et analyse — OK.
- Test existant de préchauffage : quatre transitions, y compris passage au jour suivant — OK.
- Test existant des modes Manuel/Boost/Absent et expiration — OK (chargement isolé des moteurs, sans dépendance à Home Assistant).
- Test navigateur Chrome automatisé : maintien du même champ et du focus après changement d’heure, sélection unique, consigne serveur, édition depuis l’accueil, ouverture Exceptions et Réveils — OK.
- Comparaison binaire : quatre moteurs et constantes identiques à la v0.8 — OK.

Une installation Home Assistant réelle et des équipements OPTA n’ont pas été utilisés pour ces tests. Après mise à jour, vérifier visuellement la consigne de la carte par rapport au capteur « Consigne actuelle », puis enregistrer et recharger un horaire de test.

## Retour à la v0.8

Restaurer les deux dossiers/fichiers de la v0.8, redémarrer Home Assistant et remettre l’ancienne ressource JavaScript. Les modifications de planning déjà enregistrées restent présentes ; restaurer la sauvegarde si vous souhaitez également revenir aux anciennes données.
