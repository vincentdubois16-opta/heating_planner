import sys, types
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
pkg = types.ModuleType('heating_planner'); pkg.__path__ = [str(Path(__file__).resolve().parent/'custom_components/heating_planner')]; sys.modules['heating_planner'] = pkg
from heating_planner.dynamic_preheat import calculate_dynamic, lead_minutes, normalize_dead_time
from heating_planner.away_preheat import apply_temporary_mode
from heating_planner.calculation import calculate_cycle, effective_dead_time

# Formule : retard + écart / pente, rien si aucun écart positif.
assert lead_minutes(4, 1.68) == 143
assert lead_minutes(4, 1.68, 20) == 163
assert lead_minutes(4, 1.68, 20, 150) == 150
assert lead_minutes(0, 1.68, 20) == 0 and lead_minutes(-1, 1.68, 20) == 0
assert lead_minutes(0.05, 1.2, 20) == 23
for value in [None, '', 'unknown', 'nan', 'inf', -1, 361]:
    assert normalize_dead_time(value) is None
assert normalize_dead_time('12.5') == 12.5 and normalize_dead_time(0) == 0
print('PASS formule : retard ajouté, plafond, aucun écart = aucun préchauffage, valeurs invalides')

profiles = {'night': 17, 'comfort': 21}
w = {str(i): [{'time': '00:00', 'profile': 'night'}, {'time': '10:00', 'profile': 'comfort'}, {'time': '23:00', 'profile': 'night'}] for i in range(7)}
now = datetime(2026, 11, 3, 7, tzinfo=ZoneInfo('Europe/Brussels'))
def calc(moment=now, temp=17, slope=1.68, cap=180, cache=None, dead=0):
    return calculate_dynamic(moment, 'Europe/Brussels', profiles, w, {}, [], 'max', 30, cap, temp, slope,
                             cache if cache is not None else {}, dead_time=dead)
assert calc()['dynamic_minutes'] == 143 and calc()['dynamic_dead_time'] == 0
r = calc(dead=20); assert r['dynamic_minutes'] == 163 and r['dynamic_start'].strftime('%H:%M') == '07:17' and r['dynamic_dead_time'] == 20
assert r['next_change'].strftime('%H:%M') == '07:17' and r['target'] == 17
assert calc(cap=150, dead=20)['dynamic_minutes'] == 150
assert calc(temp=22, dead=20)['dynamic_minutes'] == 0 and not calc(temp=22, dead=20)['preheat_active']
c = {}; assert calc(now.replace(minute=17), cache=c, dead=20)['preheat_active']
# Fenêtre déjà ouverte : un retard appris qui change ensuite ne la retire pas.
assert calc(now.replace(minute=40), temp=19, cache=c, dead=0)['preheat_active']
r = calc(slope=None, dead=20); assert r['preheat_strategy'] == 'fixed_fallback' and r['next_change'].strftime('%H:%M') == '09:30'
print('PASS planning : début avancé du retard, plafond, objectif atteint, fenêtre maintenue, secours fixe inchangé')

utc_now = datetime(2026, 11, 4, 10, 30, tzinfo=timezone.utc); expiry = utc_now.replace(hour=12, minute=0)
def planner(moment): return dict(target=19, next_change=moment.replace(hour=22, minute=30), next_target=17, preheat_active=False, preheat_start=None, preheat_target=None)
def away(dead=0, dynamic=True, temp=18, moment=utc_now):
    ov = dict(mode='away', temperature=15, until=expiry.isoformat())
    return apply_temporary_mode(planner(moment), ov, moment, planner, dynamic, temp, 1, 180, 30, {}, dead_time=dead)
assert away()['away_return_minutes'] == 60
r = away(dead=15); assert r['away_return_minutes'] == 75 and r['next_change'] == expiry-timedelta(minutes=75)
assert away(dead=15, temp=19)['away_return_minutes'] == 0
assert away(dead=15, dynamic=False)['away_return_minutes'] == 30
print('PASS retour d\'absence : retard ajouté en dynamique, ignoré en durée fixe et sans écart')

assert effective_dead_time({}, None) == (0, 'fixed')
assert effective_dead_time({'dead_time_minutes': 20}, '12.5') == (20, 'fixed')
assert effective_dead_time({'dead_time_minutes': 20, 'dead_time_entity': 'input_number.x'}, '12.5') == (12.5, 'learned')
for bad in [None, 'unavailable', 'nan', '-3']:
    assert effective_dead_time({'dead_time_minutes': 20, 'dead_time_entity': 'input_number.x'}, bad) == (20, 'fixed')
def snapshot(options, temperature='17', slope='1.68', dead=None):
    return {'now': now.astimezone(timezone.utc), 'timezone': 'Europe/Brussels', 'zone': 'max',
            'options': {'profiles': profiles, 'preheat_minutes': 30, 'max_preheat_minutes': 180, **options},
            'profiles': profiles, 'weekly': w, 'exceptions': {}, 'wakes': [], 'override': {'mode': 'planning'},
            'temperature': temperature, 'slope': slope, 'dead_time': dead}
r, _ = calculate_cycle(snapshot({'dynamic_preheat': True, 'dead_time_minutes': 20}), {})
assert r['dynamic_minutes'] == 163 and r['dead_time_minutes'] == 20 and r['dead_time_source'] == 'fixed'
r, _ = calculate_cycle(snapshot({'dynamic_preheat': True, 'dead_time_minutes': 20, 'dead_time_entity': 'input_number.x'}, dead='10'), {})
assert r['dynamic_minutes'] == 153 and r['dead_time_minutes'] == 10 and r['dead_time_source'] == 'learned'
r, _ = calculate_cycle(snapshot({'dynamic_preheat': False, 'dead_time_minutes': 20}), {})
assert 'dynamic_minutes' not in r and r['dead_time_minutes'] == 20 and r['preheat_minutes'] == 30
r, _ = calculate_cycle(snapshot({'dynamic_preheat': True}), {})
assert r['dynamic_minutes'] == 143 and r['dead_time_minutes'] == 0
print('PASS cycle : retard fixe par pièce, retard appris prioritaire, secours si invalide, publié même en préchauffage fixe, anciennes options = 0')
