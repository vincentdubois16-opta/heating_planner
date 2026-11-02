import sys,types
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
p=types.ModuleType('heating_planner');p.__path__=['custom_components/heating_planner'];sys.modules['heating_planner']=p
from heating_planner.dynamic_preheat import calculate_dynamic
profiles={'night':17,'comfort':21}
w={str(i):[{'time':'00:00','profile':'night'},{'time':'10:00','profile':'comfort'},{'time':'23:00','profile':'night'}] for i in range(7)}
now=datetime(2026,11,3,7,tzinfo=ZoneInfo('Europe/Brussels'))
def calc(moment=now,temp=17,slope=1.68,cap=180,cache=None,ex=None):
 return calculate_dynamic(moment,'Europe/Brussels',profiles,w,ex or {},[],'max',30,cap,temp,slope,cache if cache is not None else {})
r=calc();assert r['dynamic_minutes']==143 and r['dynamic_start'].strftime('%H:%M')=='07:37'
assert r['next_change'].strftime('%H:%M')=='07:37' and r['target']==17
assert calc(cap=60)['dynamic_minutes']==60
c={};start=now.replace(minute=37)
assert calc(start,cache=c)['preheat_active']
assert calc(start+timedelta(minutes=30),temp=20.9,cache=c)['preheat_active']
assert not calc(now.replace(hour=10),temp=21,cache=c)['preheat_active']
for slope in [0,-1,None,'unavailable','nan','inf']:
 r=calc(slope=slope);assert r['preheat_strategy']=='fixed_fallback' and r['next_change'].strftime('%H:%M')=='09:30'
for temp in [None,'unknown','nan','inf']:assert calc(temp=temp)['preheat_strategy']=='fixed_fallback'
assert calc(temp=22)['dynamic_minutes']==0 and not calc(temp=22)['preheat_active']
assert calc(cap=0)['dynamic_minutes']==0
ex={'2026-11-03':[{'time':'00:00','profile':'night'},{'time':'11:00','profile':'comfort'}]}
assert calc(ex=ex)['dynamic_start'].strftime('%H:%M')=='08:37'
print('PASS dynamique : pente, plafond, maintien, fin, secours, valeurs invalides, objectif atteint, exception')
wakes=[{'id':'wake','name':'Réveil','times':{str(i):{'start':'09:00','end':'09:30'} for i in range(7)},'dates':{},'zones':{'max':'comfort'}}]
r=calculate_dynamic(now,'Europe/Brussels',profiles,w,{},wakes,'max',30,180,17,1.68,{})
assert r['preheat_active'] and r['target']==21
from heating_planner.override_engine import apply_override
ov={'mode':'away','temperature':15,'until':(now+timedelta(hours=4)).isoformat()}
r=apply_override(r,ov,now);assert r['target']==15 and not r['preheat_active']
print('PASS : réveil prioritaire et mode Absent prioritaire sur préchauffage')
