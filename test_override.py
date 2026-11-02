from datetime import datetime, timedelta, timezone
from custom_components.heating_planner.override_engine import validate_override, apply_override

now=datetime(2026,10,31,21,45,tzinfo=timezone.utc)
base={'target':22.,'next_target':17.,'next_change':now+timedelta(hours=1),'preheat_active':True}
for mode in ('manual','boost','away'):
    value=validate_override({'mode':mode,'temperature':20.5,'until':(now+timedelta(hours=2)).isoformat()},now)
    state=apply_override(base,value,now)
    assert state['target']==20.5 and state['active_mode']==mode and not state['preheat_active']
    assert apply_override(base,value,now+timedelta(hours=3))['active_mode']=='planning'
assert validate_override({'mode':'planning'},now)=={'mode':'planning'}
print('Override tests OK')
