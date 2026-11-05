"""Températures réglées depuis la carte (v0.9.7) : `python test_temperatures_backend.py`.

Exécute le vrai gestionnaire WebSocket ws_set_temperatures extrait de __init__.py,
avec des objets Home Assistant simulés (même méthode que test_permissions_backend.py).
"""
import ast
import copy
import sys
import types
from pathlib import Path
from types import SimpleNamespace

root = Path(__file__).resolve().parent / 'custom_components/heating_planner'
package = types.ModuleType('hp')
package.__path__ = [str(root)]
sys.modules['hp'] = package
from hp.temperatures import apply_temperatures  # noqa: E402

DEFAULTS = {'night': 17.0, 'eco': 18.0, 'comfort': 21.0}

# 1. Validation pure
base = {'profiles': {'night': 17.0, 'eco': 18.0, 'comfort': 21.0}, 'preheat_minutes': 30,
        'dynamic_preheat': True, 'temperature_entity': 'sensor.t', 'away_temperature': 15.0}
new = apply_temperatures(base, {'night': 16.5, 'eco': 18, 'comfort': 21.5}, 14, 22.5, DEFAULTS)
assert new['profiles'] == {'night': 16.5, 'eco': 18.0, 'comfort': 21.5}
assert new['away_temperature'] == 14.0 and new['boost_temperature'] == 22.5
assert new['preheat_minutes'] == 30 and new['dynamic_preheat'] is True and new['temperature_entity'] == 'sensor.t'
assert base['profiles']['night'] == 17.0, 'les options d’origine ne doivent pas être modifiées'
assert list(new['profiles']) == ['night', 'eco', 'comfort']
assert apply_temperatures({}, {'night': 17, 'eco': 18, 'comfort': 21}, defaults=DEFAULTS)['profiles']['comfort'] == 21.0
for bad, expected in [({'night': 4.5, 'eco': 18, 'comfort': 21}, 'Nuit'),
                      ({'night': 17, 'eco': 'chaud', 'comfort': 21}, 'Éco'),
                      ({'night': 17, 'eco': 18, 'comfort': float('nan')}, 'Confort'),
                      ({'night': 17, 'eco': 18, 'comfort': True}, 'Confort'),
                      ({'night': 17, 'eco': 18}, 'attendues'),
                      ({'night': 17, 'eco': 18, 'comfort': 21, 'extra': 20}, 'attendues')]:
    try:
        apply_temperatures(base, bad, defaults=DEFAULTS)
    except ValueError as exc:
        assert expected in str(exc), (bad, exc)
    else:
        raise AssertionError(f'valeur acceptée à tort : {bad}')
for away, boost in [(36, None), (None, 4)]:
    try:
        apply_temperatures(base, DEFAULTS, away, boost, DEFAULTS)
    except ValueError:
        pass
    else:
        raise AssertionError('Absent/Boost hors limites acceptés')
print('PASS validation : bornes 5–35 °C, clés fixes, autres options conservées, original intact')

# 2. Vrai gestionnaire WebSocket
source = ast.parse((root / '__init__.py').read_text(encoding='utf-8'))
handler = [n for n in source.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'ws_set_temperatures']
assert handler, 'ws_set_temperatures absent de __init__.py'
assert any(isinstance(n, ast.Expr) and 'ws_set_temperatures' in ast.unparse(n)
           for f in source.body if isinstance(f, ast.AsyncFunctionDef) and f.name == 'async_setup' for n in f.body), \
    'commande non enregistrée dans async_setup'
for n in handler:
    n.decorator_list = []
module = ast.fix_missing_locations(ast.Module(body=handler, type_ignores=[]))


class Coordinator:
    refreshed = 0

    async def async_request_refresh(self):
        Coordinator.refreshed += 1


entry = SimpleNamespace(entry_id='max', options=copy.deepcopy(base))
updates = []


def update_entry(target, options):
    updates.append(copy.deepcopy(options))
    target.options = options
    return True


hass = SimpleNamespace(data={'heating_planner': {'max': {'coordinator': Coordinator()}}},
                       config_entries=SimpleNamespace(async_get_entry=lambda eid: entry if eid == 'max' else None,
                                                      async_update_entry=update_entry))
env = {'DOMAIN': 'heating_planner', 'DEFAULT_PROFILES': DEFAULTS, 'apply_temperatures': apply_temperatures}
exec(compile(module, 'actual_websocket_handler', 'exec'), env)


def run(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as done:
        return done.value
    raise AssertionError('opération suspendue inattendue')


class Connection:
    def __init__(self, admin=True):
        self.user = SimpleNamespace(is_admin=admin)
        self.errors, self.results = [], []

    def send_error(self, *args):
        self.errors.append(args)

    def send_result(self, *args):
        self.results.append(args)


message = {'id': 7, 'entry_id': 'max', 'profiles': {'night': 16, 'eco': 18.5, 'comfort': 21.5},
           'away_temperature': 14, 'boost_temperature': 23}
c = Connection(admin=False)
run(env['ws_set_temperatures'](hass, c, message))
assert c.errors[0][1] == 'unauthorized' and not updates
c = Connection()
run(env['ws_set_temperatures'](hass, c, {**message, 'entry_id': 'inconnue'}))
assert c.errors[0][1] == 'not_found' and not updates
c = Connection()
run(env['ws_set_temperatures'](hass, c, {**message, 'profiles': {'night': 50, 'eco': 18, 'comfort': 21}}))
assert c.errors[0][1] == 'invalid_temperatures' and 'Nuit' in c.errors[0][2] and not updates
c = Connection()
run(env['ws_set_temperatures'](hass, c, message))
assert not c.errors and c.results[0][1]['ok'] is True
assert entry.options['profiles'] == {'night': 16.0, 'eco': 18.5, 'comfort': 21.5}
assert entry.options['away_temperature'] == 14.0 and entry.options['boost_temperature'] == 23.0
assert entry.options['preheat_minutes'] == 30 and entry.options['temperature_entity'] == 'sensor.t'
assert len(updates) == 1 and Coordinator.refreshed == 1
c = Connection()
run(env['ws_set_temperatures'](hass, c, {'id': 8, 'entry_id': 'max', 'profiles': {'night': 16.5, 'eco': 18.5, 'comfort': 21.5}}))
assert entry.options['away_temperature'] == 14.0 and entry.options['boost_temperature'] == 23.0, 'Absent/Boost facultatifs conservés'
print('PASS gestionnaire WebSocket : administrateur requis, zone inconnue, valeur refusée sans écriture, '
      'enregistrement dans les options, recalcul demandé, Absent/Boost facultatifs')
