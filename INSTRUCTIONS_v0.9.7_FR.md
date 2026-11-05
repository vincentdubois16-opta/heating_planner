# Heating Planner v0.9.7 — encore plus simple au quotidien

Base : ta v0.9.6 (éditeur par périodes, enregistrement commun, droits familiaux, calcul hors boucle). Rien n'est retiré de l'éditeur de semaine. Format de stockage des horaires, jours spéciaux et réveils inchangé, aucune migration.

## Installer depuis la v0.9.6

1. Sauvegarder Home Assistant (configuration et `.storage`).
2. Remplacer tout le dossier `/config/custom_components/heating_planner/` (nouveau fichier `temperatures.py` compris).
3. Remplacer `/config/www/heating-planner-card.js`.
4. Redémarrer Home Assistant. Ne pas supprimer l'intégration, ses entrées ni `.storage`.
5. Ressource du tableau de bord : `/local/heating-planner-card.js?v=0.9.7`, puis actualiser complètement le navigateur ou l'application.

Si seule la carte est remplacée, tout fonctionne sauf l'enregistrement des températures : la carte affiche alors que le composant Python doit passer en v0.9.7.

## 1. Modes en un geste (accueil)

L'onglet Modes disparaît ; tout se fait depuis l'accueil.

- **Boost** : un toucher = 1 h à la température Boost.
- **Maintenir** : − / + par 0,5 °C, puis « jusqu'au prochain changement » (heure affichée), 1 h, 2 h ou 4 h. Envoyé au moteur en mode Manuel.
- **Absent** : « Ce soir à 18:00 » (avant 17 h), « Demain à 18:00 » ou une date et une heure ; température d'absence réglable. Un retour dans le passé est refusé avant tout envoi. Le préchauffage de retour d'absence de la v0.9.4 continue de s'appliquer.
- Pendant un mode : bandeau avec la température, le temps restant ou l'heure de retour, **+1 h** (Boost / Maintenir), **Changer le retour** (Absent) et **Reprendre le planning**.
- Sans droit de contrôle, les boutons sont grisés avec une explication.

L'accueil ne se redessine plus à chaque changement d'état de Home Assistant : seulement si la sonde, l'état de chauffe ou la minute affichée changent, et jamais pendant une saisie dans une fenêtre Absent / Maintenir.

## 2. Congés du… au… (Jours spéciaux)

- Liste **À venir** : les jours consécutifs ayant le même horaire sont regroupés (« Du mer. 25 nov. au mer. 2 déc. · 8 jours · Comme un dimanche »), avec un aperçu coloré, **Modifier** et **Supprimer**. Les jours passés sont repliés, avec « Retirer les jours passés ».
- **+ Ajouter des congés ou jours spéciaux** : du… au…, puis « comme un [jour] » ou « toute la journée en Nuit / Éco / Confort ». L'écran annonce le nombre de jours et ceux déjà personnalisés qui seront remplacés. Fin avant début et dépassement de 366 jours spéciaux sont refusés avant l'ajout.
- **Modifier** une plage ouvre l'éditeur habituel et applique chaque changement à tous ses jours ; « Ne modifier que le … » limite au jour affiché.
- **Un seul jour** reste disponible en bas de la liste.
- L'horaire « comme un dimanche » est **recopié** : modifier ensuite le dimanche habituel ne change pas ces jours (l'écran le précise). Pour un départ, l'écran rappelle d'utiliser plutôt Absent.

## 3. Réveils sur la frise d'accueil

La frise « Planning du jour » montre ce qui va réellement se passer : planning enregistré (jour spécial ou semaine) **plus les réveils de cette zone**, hachurés, avec « Réveil » dans la légende. Même règle que le moteur : un réveil prime, et en cas de chevauchement le dernier commencé l'emporte ; un réveil désactivé à cette date ou destiné à une autre pièce est ignoré. Toucher un réveil ouvre ce réveil dans l'onglet Réveils.

## 4. Températures dans la carte

Nouvel onglet **Températures** (et bouton sur l'accueil) : Nuit, Éco, Confort, Absent et Boost, par pas de 0,5 °C entre 5 et 35 °C. Les changements suivent le même brouillon que le reste (un seul **Enregistrer**, **↶ Annuler**). Les chips de l'éditeur montrent déjà les nouvelles valeurs ; l'accueil reste sur les valeurs enregistrées.

Avertissements : ordre inhabituel (Nuit ≤ Éco ≤ Confort non respecté), température Absent aussi chaude qu'un mode du planning.

Côté serveur, nouvelle commande `heating_planner/set_temperatures` réservée aux administrateurs. Elle écrit dans les mêmes options que l'écran Configurer de l'intégration (les autres options, préchauffage et sondes compris, sont conservées) et relance le calcul. Les clés Nuit/Éco/Confort restent fixes, seules leurs valeurs changent.

## Tests

- `python test_temperatures_backend.py` : nouveau, vrai gestionnaire WebSocket avec Home Assistant simulé.
- Tests Python de la v0.9.6 inchangés et OK.
- `node test_ui.cjs` : test v0.9.6, seule l'activation Boost passe désormais par l'accueil.
- `node test_ui_v097.cjs` : nouveautés de la v0.9.7.

Les deux tests navigateur utilisent Chrome s'il est installé, sinon le Chromium de Playwright. Détail des vérifications dans `VERIFICATIONS_v0.9.7_FR.md`. Pas de validation sur une installation Home Assistant réelle ; aucune commande OPTA.
