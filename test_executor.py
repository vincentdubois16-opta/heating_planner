import ast,copy,sys,types,threading
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime,timedelta,timezone
from concurrent.futures import ThreadPoolExecutor
root=(Path(__file__).resolve().parent/'custom_components/heating_planner')
p=types.ModuleType('hp');p.__path__=[str(root)];sys.modules['hp']=p
from hp.const import room_defaults
from hp.calculation import calculate_cycle,configuration_key
source=ast.parse((root/'__init__.py').read_text(encoding='utf-8'))
setup=next(n for n in source.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='async_setup_entry')
selected=[n for n in setup.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in ['reading','snapshot','update']]
factory=ast.FunctionDef(name='factory',args=ast.arguments(posonlyargs=[],args=[],kwonlyargs=[],kw_defaults=[],defaults=[]),body=ast.parse('calculation_cache={}').body+selected+[ast.Return(value=ast.Name(id='update',ctx=ast.Load()))],decorator_list=[])
module=ast.fix_missing_locations(ast.Module(body=[factory],type_ignores=[]))
now=datetime(2026,11,4,10,30,tzinfo=timezone.utc);expiry=now.replace(hour=12,minute=0)
profiles={'night':17,'eco':19,'comfort':21}
entry=SimpleNamespace(entry_id='max',unique_id='demo_max_bedroom',options={'profiles':profiles,'dynamic_preheat':True,'slope_unit':'minute','preheat_minutes':30,'max_preheat_minutes':180})
main=threading.get_ident();workers=[];calls=[];mutate=False
entities={'sensor.temperature_chambre_max':SimpleNamespace(state='18',attributes={}), 'input_number.max_bedroom_slope':SimpleNamespace(state=str(1/60),attributes={})}
def get(entity):assert threading.get_ident()==main;return entities.get(entity)
state={'weekly':{str(i):[{'time':'00:00','profile':'eco'},{'time':'22:30','profile':'night'}] for i in range(7)},'exceptions':{},'override':{'mode':'away','temperature':15,'until':expiry.isoformat()}}
with ThreadPoolExecutor(max_workers=1) as pool:
 async def executor(function,*args):
  assert threading.get_ident()==main
  calls.append(copy.deepcopy(args[0]))
  def work():
   workers.append(threading.get_ident());assert threading.get_ident()!=main
   return function(*args)
  result=pool.submit(work).result()
  if mutate and len(calls)==4:state['override']['until']=(expiry-timedelta(hours=1)).isoformat()
  return result
 hass=SimpleNamespace(states=SimpleNamespace(get=get),config=SimpleNamespace(time_zone='UTC'),data={'heating_planner_wakes':[]},async_add_executor_job=executor)
 env={'room_defaults':room_defaults,'copy':copy,'hass':hass,'entry':entry,'state':state,'DOMAIN':'heating_planner','DEFAULT_PROFILES':profiles,'dt_util':SimpleNamespace(utcnow=lambda:now),'calculate_cycle':calculate_cycle,'configuration_key':configuration_key}
 exec(compile(module,'actual_coordinator','exec'),env);update=env['factory']()
 def run():
  coro=update()
  try:coro.send(None)
  except StopIteration as result:return result.value
  raise AssertionError('unexpected pending await')
 r=run();assert r['target']==15 and r['away_return_minutes']==60
 state['override']['until']=(expiry-timedelta(hours=1)).isoformat()
 r=run();assert r['target']==19 and r['preheat_active']
 state['override']['until']=(expiry+timedelta(hours=1)).isoformat()
 r=run();assert r['target']==15 and not r['preheat_active']
 mutate=True
 r=run();assert len(calls)==5 and r['target']==19 and r['preheat_active']
 assert len(workers)==5 and all(thread!=main for thread in workers)
print('PASS : véritable update via executor, calcul sur autre thread, lectures HA sur thread principal, retour anticipé/reporté et résultat périmé recalculé')
