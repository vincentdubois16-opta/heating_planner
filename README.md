# Heating Planner v0.1.0 — aperçu en lecture seule

**ATTENTION :** Prototype de démonstration. Les horaires et températures sont fictifs, codés en dur dans `const.py`. Ne pilote **aucun** `climate`, `input_*`, MQTT ou OPTA. Pas encore d'éditeur, de sauvegarde de planning, de réveil, de préchauffage ou d'exceptions configurables.

## Installation

1. Faire une sauvegarde Home Assistant.
2. Copier le dossier `custom_components/heating_planner` dans `/config/custom_components/heating_planner` sur Home Assistant (File Editor, Samba, SSH, etc.). Ne pas copier le dossier parent `heating_planner` du ZIP dans `custom_components`.
3. Redémarrer Home Assistant.
4. Aller dans **Paramètres → Appareils et services → Ajouter une intégration**, rechercher **Heating Planner (Preview)**.
5. Conserver « Chambre Max (démo) » ou choisir un autre nom. Cette version ne crée qu'une seule zone fictive.
6. Ouvrir l'appareil créé pour consulter les trois capteurs. Leurs identifiants précis sont attribués par Home Assistant ; ne pas supposer un `entity_id`.

## Ce que fait v0.1

- Calcule la consigne actuelle et la prochaine **modification de température** à partir d'un planning hebdomadaire fictif.
- Gère le passage de minuit, les jours de semaine et week-end, et utilise le fuseau horaire Home Assistant.
- Le moteur Python accepte aussi des exceptions datées, mais cette première intégration ne propose pas encore d'interface pour les définir.
- Les heures inexistantes au changement d'heure sont décalées à la première minute valide ; une heure répétée utilise sa première occurrence. Ce choix est provisoire et doit être validé fonctionnellement.
- Actualise les capteurs environ une fois par minute.

## Limites et prochaines étapes

- La configuration n'est **pas persistée par zone** : seul le nom de l'entrée est enregistré ; les profils/plannings sont constants.
- Pas de gestion d'un planning partagé, de profils configurables, d'événements réveil ou d'actions de chauffage.
- La logique est expérimentale et doit être testée avant toute connexion aux automatismes existants.

## Désinstallation

Supprimer l'intégration dans **Paramètres → Appareils et services**, puis supprimer `/config/custom_components/heating_planner` et redémarrer.
