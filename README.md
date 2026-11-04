# Heating Planner v0.9.6 — éditeur par périodes

Cette version reprend le JavaScript que tu as fourni, avec son bouton Enregistrer commun, son annulation et sa copie vers plusieurs jours. Elle corrige les clics et l'ajout de périodes et rend la liste plus compacte. Le moteur Python de la v0.9.5 est inchangé.

## Installer depuis la v0.9.5

1. Enregistrer les changements utiles dans la carte actuelle avant de remplacer le fichier.
2. Remplacer `/config/www/heating-planner-card.js` par celui du dossier `www` du ZIP. Si tu utilises le téléchargement JavaScript seul, le renommer en `heating-planner-card.js` à cet emplacement.
3. Garder une seule ressource JavaScript pour la carte et utiliser `/local/heating-planner-card.js?v=0.9.6`.
4. Actualiser complètement le navigateur ou l'application. Aucun redémarrage Home Assistant n'est nécessaire pour ce remplacement du JavaScript seul.

Le backend doit être au minimum celui de la v0.9.5 pour les droits familiaux et le calcul optimisé. Le ZIP complet inclut ce moteur et un manifest de version 0.9.6 ; si tu remplaces aussi le dossier de l'intégration, redémarrer Home Assistant. Ne pas supprimer l'intégration, ses entrées ou `.storage`.

## Choisir et modifier une période

Toutes les périodes sont visibles dans l'ordre, y compris **Nuit de 00:00 à 07:00**, par exemple, et la dernière jusqu'à 24:00. Le « reste du temps » n'est plus une période cachée.

Cliquer sur la frise ou sur une ligne choisit cette période. Même un deuxième clic ne crée rien. Une seule ligne déplie les heures, les températures Nuit/Éco/Confort et les actions ; les autres gardent un résumé lisible.

Le début de la première période reste fixé à 00:00, et la fin de la dernière à 24:00. Pour changer la température à minuit, modifier sa température ou ajouter une période commençant à 00:00. Il est donc toujours possible de couvrir toute la journée sans trou.

Les périodes voisines s'ajustent lorsqu'une limite est déplacée. Les périodes contiguës avec la même température de profil se regroupent. Supprimer une période prolonge sa voisine ; la seule période d'une journée ne peut pas être supprimée. Annuler revient à l'état précédent.

## Ajouter où tu veux

Utiliser **Ajouter une période**, ou **Ajouter dans cette période** après avoir choisi une ligne. Choisir un début, une fin et une température, puis cliquer sur **Ajouter**. Ouvrir ou fermer ce formulaire ne modifie pas le planning.

L'ajout fonctionne à minuit, en fin de journée, entre deux périodes et au milieu d'une période déjà occupée. Il n'a plus besoin d'un intervalle libre. Les horaires qui dépassent avant et après l'ajout sont conservés ; seule la durée choisie est remplacée. L'écran le précise avant validation, et Annuler permet de revenir en arrière.

Les choix d'heure restent par quarts d'heure comme dans ton prototype ; les heures plus précises déjà enregistrées sont conservées dans les listes. La fin 24:00 est disponible. Une fin avant le début est refusée. La limite de 48 changements par jour du moteur est vérifiée avant l'ajout. Si la température choisie est déjà prévue sur tout cet intervalle, un message le précise sans créer une fausse modification.

## Enregistrer et annuler

**Enregistrer** envoie toutes les catégories modifiées : semaine, jours spéciaux et réveils. Les périodes doivent d'abord être validées avec Ajouter ou leur formulaire fermé. Les données de l'accueil et de sa frise restent celles enregistrées sur le serveur, jamais celles d'un brouillon.

Les appels d'enregistrement restent séparés côté serveur. Si la semaine réussit mais qu'un jour spécial échoue, la semaine est enregistrée et les changements restants sont conservés avec un message d'enregistrement incomplet. Réessayer n'envoie que les catégories encore modifiées. L'historique d'annulation est remis à zéro après un enregistrement réussi pour ne pas annuler silencieusement une catégorie déjà envoyée.

Annuler revient sur la dernière modification locale. Abandonner les changements demande confirmation puis recharge les données enregistrées. Les changements de page à l'intérieur de la carte conservent les brouillons. Le navigateur peut avertir à la fermeture ou au rechargement de la page ; enregistrer avant de quitter le tableau de bord.

## Présentation et droits

La copie vers plusieurs jours est conservée dans un volet à ouvrir lorsque nécessaire. Les réglages de températures et de préchauffage sont également regroupés. La vue normale privilégie les heures et les températures plutôt que les informations de fonctionnement du moteur.

Les comptes ordinaires gardent l'accès aux modes temporaires selon leurs droits Home Assistant. Les éditeurs d'horaires et de réveils affichent Lecture seule pour les comptes sans droit d'édition, avec champs désactivés dès l'ouverture. Les protections serveur de la v0.9.5 restent applicables.

## Vérifications

- Clic et deuxième clic sur la première période : sélection uniquement, aucune création ni modification.
- Période de minuit visible et couverture jusqu'à 24:00.
- Insertion au milieu d'une période existante, à 00:00 et jusqu'à 24:00 ; horaires extérieurs conservés.
- Heures invalides, limite de 48 changements, suppression, réglage des limites et annulation.
- Copie vers plusieurs jours, enregistrement des réveils, sauvegarde partiellement échouée avec brouillons conservés.
- Accueil sur horaires enregistrés et droits familiaux de la v0.9.5.
- Conversion du modèle vérifiée sur 80 journées : température/profil inchangés pour chacune de leurs 115 200 minutes.
- Test et contrôle visuel Chrome aux largeurs 390 et 980 pixels, sans débordement horizontal ; syntaxe JavaScript vérifiée.

Le test navigateur autonome est `node test_ui.cjs` avec Node.js, Playwright et Chrome disponibles. Les captures utilisent des données d'exemple. Aucun test n'a activé OPTA ; le raccordement séparé reste inchangé. La vérification sur ton installation Home Assistant reste à faire.
