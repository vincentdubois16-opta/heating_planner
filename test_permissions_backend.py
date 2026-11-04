import ast,sys,types,copy
from pathlib import Path
from datetime import datetime,timedelta,timezone
from types import SimpleNamespace
root=(Path(__file__).resolve().parent/'custom_components/heating_planner')
p=types.ModuleType('hp');p.__path__=[str(root)];sys.modules['hp']=p
from hp.override_engine import validate_override
from hp.schedule_engine import validate_schedule,validate_exceptions
source=ast.parse((root/'__init__.py').read_text(encoding='utf-8'))
names={'can_control_zone','store_zone_change','ws_get','ws_set_mode','ws_set','ws_set_exceptions','ws_wakes_set'}
body=[n for n in source.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names]
for n in body:n.decorator_list=[]
module=ast.fix_missing_locations(ast.Module(body=body,type_ignores=[]))
now=datetime(2026,11,4,10,30,tzinfo=timezone.utc)
class Lock:
 async def __aenter__(self):pass
 async def __aexit__(self,*args):pass
class Store:
 def __init__(self):self.writes=[]
 async def async_save(self,value):self.writes.append(copy.deepcopy(value))
class Coordinator:
 data={}
 async def async_request_refresh(self):pass
profiles={'night':17,'eco':19,'comfort':21}
weekly={str(i):[{'time':'00:00','profile':'night'}] for i in range(7)}
store=Store();obj={'weekly':weekly,'exceptions':{},'override':{'mode':'planning'},'store':store,'write_lock':Lock(),'coordinator':Coordinator()}
entry=SimpleNamespace(options={'profiles':profiles},title='Max')
registry=SimpleNamespace(async_get_entity_id=lambda domain,platform,unique:'sensor.hp_target' if unique=='max_target' else None)
hass=SimpleNamespace(data={'heating_planner':{'max':obj}},config_entries=SimpleNamespace(async_get_entry=lambda _:entry))
env={'er':SimpleNamespace(async_get=lambda _:registry),'DOMAIN':'heating_planner','POLICY_CONTROL':'control','validate_override':validate_override,'validate_schedule':validate_schedule,'validate_exceptions':validate_exceptions,'DEFAULT_PROFILES':profiles,'dt_util':SimpleNamespace(utcnow=lambda:now),'copy':copy}
exec(compile(module,'actual_websocket_handlers','exec'),env)
def run(coroutine):
 try:coroutine.send(None)
 except StopIteration as done:return done.value
 raise AssertionError('Unexpected suspended operation')
class Connection:
 def __init__(self,admin=False,allowed=True):
  self.checks=[];self.errors=[];self.results=[]
  def check(entity,policy):self.checks.append((entity,policy));return allowed
  self.user=SimpleNamespace(is_admin=admin,permissions=SimpleNamespace(check_entity=check))
 def send_error(self,*args):self.errors.append(args)
 def send_result(self,*args):self.results.append(args)
for mode in ['boost','away','manual','planning']:
 c=Connection();ov={'mode':mode,'temperature':20,'until':(now+timedelta(hours=2)).isoformat()}
 run(env['ws_set_mode'](hass,c,{'id':1,'entry_id':'max','override':ov}))
 assert c.results and not c.errors and c.checks==[('sensor.hp_target','control')]
 assert obj['override']['mode']==mode
c=Connection(allowed=False);before=len(store.writes)
run(env['ws_set_mode'](hass,c,{'id':1,'entry_id':'max','override':{'mode':'planning'}}))
assert c.errors[0][1]=='unauthorized' and len(store.writes)==before
c=Connection();run(env['ws_set_mode'](hass,c,{'id':1,'entry_id':'max','override':{'mode':'boost','temperature':99,'until':(now+timedelta(hours=2)).isoformat()}}))
assert c.errors[0][1]=='invalid_mode' and len(store.writes)==before
for name,msg in [('ws_set',{'weekly':weekly}),('ws_set_exceptions',{'exceptions':{}}),('ws_wakes_set',{'events':[]})]:
 c=Connection();run(env[name](hass,c,{'id':1,'entry_id':'max',**msg}));assert c.errors[0][1]=='unauthorized'
for admin,allowed in [(False,True),(False,False),(True,False)]:
 c=Connection(admin,allowed);run(env['ws_get'](hass,c,{'id':1,'entry_id':'max'}));caps=c.results[0][1]['permissions'];assert caps=={'edit':admin,'control':admin or allowed}
print('PASS : vrais handlers WebSocket, 4 modes compte ordinaire, contrôle refusé selon permissions, validation des valeurs, édition admin, capacités exposées')
# Interleave two real save helpers: the second snapshot must include the first commit.
class Pause:
 def __await__(self):yield self
class CooperativeLock:
 def __init__(self):self.locked=False
 async def __aenter__(self):
  while self.locked:await Pause()
  self.locked=True
 async def __aexit__(self,*args):self.locked=False
class SlowStore(Store):
 async def async_save(self,value):
  self.writes.append(copy.deepcopy(value));await Pause()
obj['write_lock']=CooperativeLock();obj['store']=SlowStore()
first=env['store_zone_change'](obj,'weekly',{'new':'week'})
second=env['store_zone_change'](obj,'exceptions',{'new':'exception'})
first.send(None);second.send(None)
try:first.send(None)
except StopIteration:pass
second.send(None)
try:second.send(None)
except StopIteration:pass
assert obj['store'].writes[-1]['weekly']=={'new':'week'} and obj['store'].writes[-1]['exceptions']=={'new':'exception'}
print('PASS : sauvegardes concurrentes sérialisées, aucune catégorie écrasée dans le stockage')
