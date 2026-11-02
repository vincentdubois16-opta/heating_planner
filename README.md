# Heating Planner v0.8.3 — Ajout et ordre des plages

Cette version inclut les corrections v0.8.1 et les paramètres Absent/Boost de la v0.8.2.

## Installation
1. Sauvegarder Home Assistant.
2. Remplacer `/config/custom_components/heating_planner/` et `/config/www/heating-planner-card.js` avec les fichiers du ZIP, sans supprimer l’intégration ni les données `.storage`.
3. Redémarrer Home Assistant.
4. Utiliser la ressource `/local/heating-planner-card.js?v=0.8.3` puis actualiser complètement la page.

## Corrections
- Une heure modifiée reste dans le même champ pendant la saisie. En quittant le champ (clic ailleurs ou Tab), la liste se remet dans l’ordre chronologique. La frise reflète les changements valides.
- « + Plage » insère une plage après le début de la plage sélectionnée dans la frise. Sans sélection, elle est ajoutée dans la dernière plage du jour. L’heure proposée est 30 minutes après le début, ou au milieu si la plage est trop courte. Le profil est repris de cette plage et reste modifiable. La nouvelle ligne est sélectionnée et son heure reçoit le focus.
- Si cette plage ne peut pas être divisée, un autre créneau disponible est recherché. Aucune heure n’est imposée à 01:00.
- Les heures en double sont refusées : un message apparaît et l’ancienne heure est rétablie à la sortie du champ. La plage de 00:00 reste obligatoire et protégée.
- Les profils et les suppressions restent associés aux bonnes plages après réorganisation. Les mêmes corrections s’appliquent à la semaine et aux exceptions datées.

Cliquer sur Enregistrer pour conserver les modifications. Les consignes Absent et Boost restent configurables dans les options de l’intégration ; actualiser la carte après changement de ces options.

## Vérifications
Syntaxe JavaScript et Python : OK. Tests Chrome : ordre après changement d’heure, maintien du champ et du focus, ajout contextuel, édition du profil et suppression après tri, rejet d’un doublon, sélection unique, édition depuis l’accueil, consignes Absent/Boost : OK.
Les fichiers Python sont identiques à la v0.8.2 : moteurs, stockage et paramètres inchangés. Aucune commande OPTA. Pas de test sur une installation Home Assistant réelle.
