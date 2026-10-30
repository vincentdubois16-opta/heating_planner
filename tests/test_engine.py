from datetime import datetime
from zoneinfo import ZoneInfo
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'custom_components'))
# Import the pure engine without loading the HA package.
import importlib.util
p = Path(__file__).resolve().parents[1] / 'custom_components/heating_planner/schedule_engine.py'
spec = importlib.util.spec_from_file_location('schedule_engine', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

profiles = {'night': 17, 'comfort': 21}
weekly = {str(i): [{'time': '00:00', 'profile': 'night'}, {'time': '07:00', 'profile': 'comfort'}, {'time': '22:00', 'profile': 'night'}] for i in range(7)}

def test_next_change():
    out = m.calculate(datetime(2026, 10, 30, 6, 0, tzinfo=ZoneInfo('Europe/Brussels')), 'Europe/Brussels', profiles, weekly)
    assert out['target'] == 17
    assert out['next_target'] == 21
    assert out['next_change'].hour == 7

def test_exception():
    exceptions = {'2026-10-31': [{'time': '00:00', 'profile': 'night'}, {'time': '09:00', 'profile': 'comfort'}]}
    out = m.calculate(datetime(2026, 10, 31, 8, 0, tzinfo=ZoneInfo('Europe/Brussels')), 'Europe/Brussels', profiles, weekly, exceptions)
    assert out['next_change'].hour == 9

def test_midnight():
    out = m.calculate(datetime(2026, 10, 30, 23, 0, tzinfo=ZoneInfo('Europe/Brussels')), 'Europe/Brussels', profiles, weekly)
    assert out['next_change'].date().isoformat() == '2026-10-31'
