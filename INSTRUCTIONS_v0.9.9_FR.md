# Heating Planner v0.9.9 — retard avant la montée

Base : v0.9.8. Le préchauffage dynamique tient compte du temps qui s'écoule entre le début de la chauffe et le moment où la pièce commence à monter (poêle qui s'allume, eau qui arrive aux radiateurs). Format de stockage inchangé, aucune migration.

## Ce qui change

- **Formule.** Durée de préchauffage = retard + écart ÷ pente, au lieu de écart ÷ pente. Sans écart positif, aucun préchauffage, même pas le retard. Le plafond « Durée maximale du préchauffage dynamique » s'applique au total. Le retour d'absence dynamique utilise la même formule. Le préchauffage à durée fixe ne change pas.
- **Réglage par pièce.** Deux nouvelles options dans Configurer :
  - *Retard avant la montée (minutes, valeur fixe)* : 0 par défaut, donc comportement identique à la v0.9.8.
  - *Entité du retard appris* (facultatif) : un assistant numérique en minutes. S'il a une valeur valide, il remplace la valeur fixe. Sinon, la valeur fixe sert de secours.
- **Nouveau capteur par pièce : « Retard de chauffe »** (minutes), avec l'attribut `source` = `learned` ou `fixed`. Il est publié même si le préchauffage est à durée fixe, pour les alertes.
- **Carte.** Le texte du préchauffage dynamique affiche « · retard X min ».

## Apprentissage (blueprint mis à jour)

`apprentissage_pente.yaml` garde son nom de fichier. Les automatisations existantes continuent de fonctionner avec l'ancienne mesure tant que les nouveaux champs restent vides.

- **Lecture du signal climate.** Nouveau choix « État heat = demande de chauffe (OPTA) ». Avec l'ancien réglage (`hvac_action`), un thermostat OPTA qui signale la demande par son état ne déclenchait jamais l'apprentissage.
- **Assistant numérique du retard.** Une fois renseigné, l'automatisation note l'instant où la pièce a gagné le seuil (0,2 °C par défaut), puis mesure la pente nette entre ce point et la consigne. Le retard est l'instant où cette droite de montée part de la température initiale : retard = temps jusqu'au seuil − seuil ÷ pente. Les deux valeurs sont lissées comme avant (0,7 × ancienne + 0,3 × mesurée).
- **Cycles écartés** en plus de ceux de la v0.9.8 : seuil non atteint en 3 h, montée nette de moins de 5 minutes, retard hors des bornes de son assistant.
- **Sonde extérieure** (facultatif) : seulement notée dans le journal, avec le retard et la pente de chaque cycle retenu.

**Règle importante.** Dès qu'un retard est utilisé, fixe ou appris, la pente doit être la pente *nette*. Il faut donc renseigner l'assistant de retard dans le blueprint. Avec un retard fixe et l'ancienne mesure, le retard serait compté deux fois.

## Mise en place par pièce

1. Sauvegarder Home Assistant. Remplacer `/config/custom_components/heating_planner/`, `/config/www/heating-planner-card.js` et les blueprints. Redémarrer, puis ressource `/local/heating-planner-card.js?v=0.9.9`.
2. Créer un assistant numérique par pièce (Paramètres → Appareils et services → Entrées → Nombre), par exemple `input_number.retard_salon` : minimum 0, maximum 90, pas 1, unité min. Le régler sur ton estimation actuelle (Salon environ 20, autres pièces environ 12, studio environ 30).
3. Dans Configurer de la pièce : mettre la même estimation en valeur fixe, et l'assistant dans « Entité du retard appris ».
4. Dans l'automatisation d'apprentissage de la pièce : choisir « État heat » pour un thermostat OPTA, renseigner l'assistant de retard et, si tu veux, la sonde extérieure.

La pente enregistrée jusqu'ici inclut le retard, elle est donc un peu basse pour une pente nette. Les premiers préchauffages arriveront un peu en avance, ce qui est le sens sûr. Avec le lissage 0,7/0,3, l'écart restant est d'environ 17 % après 5 cycles. Tu peux aussi corriger la pente à la main.

## Alerte « chauffe sans montée » (nouveau blueprint)

`alerte_chauffe_sans_montee.yaml` : quand la chauffe démarre, il attend que la pièce gagne le seuil (0,2 °C). Délai = retard de chauffe × 2 + 10 min, au minimum 15 et au maximum 120 min (tous réglables). Sans hausse à temps, il crée une notification persistante et lance les actions que tu ajoutes (notification téléphone…), qui peuvent utiliser `{{ message }}`. Il ne commande rien. Une instance par pièce, avec le même signal que l'apprentissage et le capteur « Retard de chauffe » de la pièce.

Exemple Salon avec 20 min appris : alerte après 50 min sans hausse de 0,2 °C. Le délai suit le retard appris, y compris quand il varie avec la saison.

## Tests

- `python test_dead_time.py` : nouveau (formule, plafond, planning, retour d'absence, retard fixe/appris/secours, publication du capteur).
- `node test_ui_v099.cjs` : nouveau, texte du préchauffage avec retard (planning, retour d'absence, durée fixe, composant v0.9.8).
- Tous les tests Python de la v0.9.8 et les tests navigateur `test_ui.cjs` et `test_ui_v097.cjs` passent sans modification.
- Les deux blueprints ont été exécutés hors Home Assistant avec un moteur Jinja réel et des états simulés : retard de 20 min et pente nette de 0,02 °C/min retrouvés sur un cycle OPTA, ancienne mesure inchangée sans assistant, cycles écartés, délais d'alerte et bornes.
- Restent à vérifier dans Home Assistant : l'écran Configurer, le capteur et un vrai cycle de chauffe.
