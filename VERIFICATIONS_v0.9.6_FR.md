# Vérifications v0.9.6

Base : JavaScript fourni par l’utilisateur, moteur Python v0.9.5.

- Syntaxe JavaScript : OK.
- Clic et deuxième clic sur la période de minuit : sélection seule, aucun ajout ni modification du planning.
- Couverture explicite de 00:00 à 24:00, insertion au milieu d’une période occupée, à minuit et en fin de journée : OK.
- Fin avant début, limite de 48 changements, suppression et annulation : OK.
- Déplacement des limites sans période de fond fantôme : OK.
- Copie vers plusieurs jours et enregistrement des réveils : OK.
- Accueil fondé sur les données enregistrées, erreur après première sauvegarde réussie et conservation des autres brouillons : OK.
- Compte sans droit d’édition : lecture seule visible ; Boost possible avec droit de contrôle : OK.
- Modèle de données : 80 journées aléatoires, équivalence profil par profil pour leurs 115 200 minutes.
- Chrome 390 et 980 pixels : test sans débordement et contrôle visuel.
- Comparaison binaire : tous les fichiers Python du composant sont identiques à ceux du ZIP v0.9.5.

Le test navigateur est test_ui.cjs (Node.js, Playwright et Chrome). Il simule les réponses WebSocket ; aucun Home Assistant réel, OPTA ou équipement Shelly n’a reçu de commande. L’adaptateur OPTA séparé n’est pas inclus ou activé par cette mise à jour.
