# Vérifications v0.9.7

Base : ZIP v0.9.6 fourni (SHA-256 6628b780…52d4).

## Python
- `test_temperatures_backend.py` : bornes 5–35 °C, valeurs non numériques / NaN / booléennes refusées, clés Nuit/Éco/Confort fixes, autres options conservées, options d'origine intactes ; vrai gestionnaire `ws_set_temperatures` : administrateur requis, zone inconnue, valeur refusée sans écriture, écriture dans les options, recalcul demandé, Absent/Boost facultatifs, commande enregistrée dans `async_setup` : OK.
- `test_permissions_backend.py`, `test_executor.py`, `test_preheat_regression.py`, `test_dynamic_preheat.py`, `test_away_preheat.py`, `test_override.py` : OK, sans modification.

## Navigateur
- `test_ui.cjs` (v0.9.6, Boost désormais lancé depuis l'accueil) : OK.
- `test_ui_v097.cjs` : OK.
  - Boost 1 h en un toucher, bandeau, temps restant, +1 h, reprise.
  - Maintenir ±0,5 °C, jusqu'au prochain changement ou durée fixe.
  - Absent : retour passé refusé sans envoi, date et heure exactes, modifier le retour.
  - Saisie préservée pendant les mises à jour Home Assistant ; pas de redessin pour une entité sans rapport.
  - Droits de contrôle.
  - Frise avec réveils (chevauchement, jour désactivé, autre zone, accès au réveil).
  - Congés : plage, fin avant début, remplacement annoncé, « comme un dimanche », toute la journée en Éco, modification d'une plage entière ou d'un seul jour, suppression, jours passés, limite 366.
  - Températures : brouillon, ordre, composant Python ancien signalé, envoi, bornes, lecture seule.
  - Enregistrement commun températures + jours spéciaux.
  - Aucun débordement à 390 px sur tous les écrans.
- Frise d'accueil comparée au moteur Python (`build_timeline`) sur 150 plannings aléatoires, minute par minute (88 avec réveil visible) : identique.
- Contrôle visuel mobile en thème sombre et clair.

Aucun Home Assistant réel, OPTA ou Shelly n'a reçu de commande.
