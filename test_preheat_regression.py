import sys
from datetime import datetime
from zoneinfo import ZoneInfo
import types
pkg=types.ModuleType('heating_planner')
pkg.__path__=['custom_components/heating_planner']
sys.modules['heating_planner']=pkg
from heating_planner.preheat_engine import calculate_with_preheat

profiles={'night':17,'eco':18,'comfort':22}
weekly={str(i):[{'time':'00:00','profile':'night'},{'time':'10:00','profile':'eco'},{'time':'22:15','profile':'comfort'},{'time':'23:00','profile':'night'}] for i in range(7)}
weekly['5'].insert(2,{'time':'11:00','profile':'eco'})
tz=ZoneInfo('Europe/Brussels')
def calc(day,h,m):
 return calculate_with_preheat(datetime(2026,10,day,h,m,tzinfo=tz),'Europe/Brussels',profiles,weekly,{},[],None,30)
for h,m,expected,change,next_target,active in [
 (21,44,18,'21:45',22,False),
 (21,45,22,'23:00',17,True),
 (22,15,22,'23:00',17,False),
 (23,0,17,'09:30',18,False),
]:
 r=calc(31,h,m)
 assert (r['target'],r['next_change'].strftime('%H:%M'),r['next_target'],r['preheat_active'])==(expected,change,next_target,active),r
 print(f'{h:02}:{m:02} -> {r["target"]} next {r["next_change"]} / {r["next_target"]} preheat {active}')
print('PASS')
