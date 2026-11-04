import sys,types
from datetime import datetime,timedelta,timezone
from pathlib import Path
pkg=types.ModuleType('heating_planner');pkg.__path__=[str(Path(__file__).resolve().parent/'custom_components/heating_planner')];sys.modules['heating_planner']=pkg
from heating_planner.away_preheat import apply_temporary_mode
from heating_planner.preheat_engine import calculate_with_preheat
from heating_planner.override_engine import apply_override
now=datetime(2026,11,4,10,30,tzinfo=timezone.utc)
expiry=now.replace(hour=12,minute=0)
def planner(moment):return dict(target=19,next_change=moment.replace(hour=22,minute=30),next_target=17,preheat_active=False,preheat_start=None,preheat_target=None)
def run(until=expiry,mode='away',moment=now,temp=18,slope=1,dynamic=True,cap=180,fixed=30,cache=None,target=15,plan=planner):
 base=plan(moment)
 ov=dict(mode=mode,temperature=target,until=until.isoformat())
 return apply_temporary_mode(base,ov,moment,plan,dynamic,temp,slope,cap,fixed,cache if cache is not None else {})
r=run();assert r['target']==15 and r['next_change']==expiry-timedelta(hours=1) and r['away_return_minutes']==60
# Advance return from 12:00 to 11:00 while it is 10:30: start 10:00 already passed.
c={};r=run(until=expiry-timedelta(hours=1),cache=c)
assert r['target']==19 and r['preheat_active'] and r['preheat_start']==now.replace(hour=10,minute=0) and r['active_mode']=='away'
# Continue after the room warms; never withdraw an already active window.
r=run(until=expiry-timedelta(hours=1),moment=now+timedelta(minutes=10),temp=18.95,cache=c)
assert r['target']==19 and r['preheat_active'] and r['away_return_minutes']==60
# Postponing the return invalidates its old active window.
r=run(until=expiry+timedelta(hours=1),cache=c);assert not r['preheat_active'] and r['target']==15
r=run(moment=expiry);assert r['active_mode']=='planning' and r['target']==19 and 'away_return_deadline' not in r
for mode in ['manual','boost']:
 r=run(until=expiry-timedelta(hours=1),mode=mode);assert r['target']==15 and not r['preheat_active'] and 'away_return_deadline' not in r
r=run(target=20);assert r['target']==20 and 'away_return_deadline' not in r
assert run(temp=20)['away_return_minutes']==0
assert run(cap=15)['away_return_minutes']==15
assert run(cap=0)['away_return_minutes']==0
for temp,slope in [(None,1),(18,0),(18,'nan')]:
 r=run(temp=temp,slope=slope);assert r['away_return_strategy']=='fixed_fallback' and r['away_return_minutes']==30
assert run(dynamic=False)['away_return_strategy']=='fixed'
# Restart inside an already-started window does not require an equality trigger.
assert run(until=expiry-timedelta(hours=1),cache={})['preheat_active']
# Exceptions and wakes at expiry define the return target.
profiles={'night':17,'eco':19,'comfort':21}
weekly={str(i):[{'time':'00:00','profile':'night'}] for i in range(7)}
exceptions={'2026-11-04':[{'time':'00:00','profile':'night'},{'time':'12:00','profile':'eco'}]}
wakes=[{'id':'wake','name':'Wake','times':{str(i):{'start':'12:00','end':'13:00'} for i in range(7)},'dates':{},'zones':{'max':'comfort'}}]
def real_plan(moment):return calculate_with_preheat(moment,'UTC',profiles,weekly,exceptions,wakes,'max',0)
r=run(plan=real_plan,temp=18,slope=1);assert r['away_return_target']==21 and r['preheat_active']
print('PASS : retour anticipé, début passé, maintien, report, expiration, Manuel/Boost inchangés, absence de hausse, plafond, secours, redémarrage, exceptions et réveils')
