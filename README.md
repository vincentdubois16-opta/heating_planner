# Heating Planner v0.8.4 — Accueil et mesures réelles

## Installation
Sauvegarder Home Assistant, remplacer `/config/custom_components/heating_planner/` et `/config/www/heating-planner-card.js` avec le contenu du ZIP. Ne pas supprimer l’intégration ni `.storage`. Redémarrer Home Assistant et utiliser la ressource `/local/heating-planner-card.js?v=0.8.4`, puis actualiser complètement le navigateur.

## Température et état de chauffe
« Non connecté » dans les versions précédentes concernait uniquement l’état de chauffe. Une température pouvait être lue correctement sans que l’état de chauffe soit renseigné.

Avec un thermostat climate :
```yaml
type: custom:heating-planner-card
name: Chambre Max
temperature_entity: climate.chambre_max
```
La carte lit automatiquement `current_temperature` et `hvac_action` sur cette entité. Remplacer les identifiants d’exemple par vos entités réelles. `name` est facultatif et modifie seulement le titre de la carte.

Avec un capteur de température distinct :
```yaml
type: custom:heating-planner-card
name: Chambre Max
temperature_entity: sensor.temperature_chambre_max
heating_entity: climate.chambre_max
```
`heating_entity` peut aussi être un binary_sensor ou un switch dont on/off indique réellement la chauffe. Attention : une autorisation générale du chauffage n’indique pas nécessairement une chauffe en cours. Aucune commande n’est envoyée à ces entités.

Pour un attribut de température spécifique, ajouter `temperature_attribute: current_temperature` (ou le nom de l’attribut voulu) ; sinon la carte lit l’état du sensor, ou automatiquement `current_temperature` pour un climate.

Les températures configurées sont supposées en °C, comme les consignes du moteur. Utiliser un capteur en °C.

Libellés de l’état de chauffe :
- Chauffe : `hvac_action: heating` ou état on d’un indicateur de chauffe.
- Au repos : `hvac_action: idle`.
- Arrêté : `hvac_action: off` ou état off d’un indicateur de chauffe.
- État de chauffe non renseigné : aucune entité d’état configurée et aucune entité climate utilisée pour la température.
- État de chauffe indisponible : entité absente, unknown ou unavailable.
- État de chauffe inconnu : entité disponible sans indication reconnue. Le mode heat d’un climate n’est pas assimilé à une chauffe réelle.

Sans source valide, la température affiche « — ». Le mode Planning/Manuel/Boost/Absent et la consigne effective restent ceux du moteur Heating Planner.

## Accueil
Présentation inspirée de la maquette : température actuelle à gauche, consigne effective à droite, état de chauffe en haut, prochain changement, badge du mode et boutons Manuel/Boost/Absent séparés. Ces boutons ouvrent le formulaire correspondant ; Appliquer reste nécessaire pour activer le mode. La frise du jour reste éditable. Toutes les corrections et options de la v0.8.3 sont incluses.

## Vérifications
Syntaxe JavaScript et Python : OK. Tests Chrome : lecture sensor et climate.current_temperature, hvac_action, données indisponibles, bouton Absent et consigne configurée, largeur mobile, focus horaire, tri, ajout, sélection unique et modes : OK. Contrôle visuel mobile réalisé.
Tous les fichiers Python sont identiques à la v0.8.3 (hors version du manifest JSON). Moteurs et stockage conservés. Aucune commande OPTA. Pas de validation sur une installation Home Assistant réelle.
