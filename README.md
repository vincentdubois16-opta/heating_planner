# Heating Planner v0.2 — lecture seule

Mise à jour de la v0.1 : températures des profils **Nuit / Éco / Confort** modifiables depuis **Paramètres → Appareils et services → Heating Planner → Configurer**.

## Installation / mise à jour
1. Faire une sauvegarde Home Assistant.
2. Décompresser l'archive et copier **custom_components/heating_planner/** dans **/config/custom_components/heating_planner/** en remplaçant les fichiers existants.
3. Redémarrer Home Assistant (pas besoin de supprimer ou recréer l'intégration).
4. Ouvrir **Paramètres → Appareils et services → Heating Planner (Preview) → Configurer** et ajuster les températures.
5. Vérifier que « Consigne actuelle » et « Prochaine consigne » reflètent les profils configurés. Le recalcul est demandé immédiatement lors de l'enregistrement, et aussi chaque minute.

## Périmètre
- Conserve la zone de démonstration existante et les mêmes identifiants uniques des trois capteurs.
- Les plannings restent ceux de la v0.1, codés dans `const.py`. L'éditeur hebdomadaire n'est **pas encore disponible**.
- Aucune commande `climate`, MQTT ou OPTA n'est envoyée.
- Les valeurs des profils sont persistées dans les options de l'entrée de configuration Home Assistant.
- Les valeurs sont limitées à 5–35 °C.

## Retour arrière
Restaurer les fichiers v0.1 et redémarrer. Les options v0.2 resteront enregistrées mais ignorées par v0.1.
