// Nouveauté v0.9.9 : `node test_ui_v099.cjs` (Node.js + Playwright ; Chrome s'il est installé, sinon Chromium).
// Le texte du préchauffage dynamique affiche le retard avant la montée.
const {chromium}=require('playwright');
const path=require('path');
const assert=(cond,msg)=>{if(!cond)throw Error(msg);};

(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'}).catch(()=>chromium.launch({headless:true}));
const page=await browser.newPage({viewport:{width:1000,height:900}});
const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
await page.setContent('<body></body>');
await page.addScriptTag({path:path.join(__dirname,'www/heating-planner-card.js')});
const text=async effective=>{
  await page.evaluate(effective=>{
    document.body.innerHTML='';
    const day=[{time:'00:00',profile:'night'},{time:'07:00',profile:'comfort'},{time:'22:00',profile:'night'}];
    const server={name:'Salon',weekly:Object.fromEntries([0,1,2,3,4,5,6].map(i=>[String(i),day])),exceptions:{},
      profiles:{night:17,eco:18,comfort:21},mode_temperatures:{away:15,boost:22},preheat_minutes:30,override:{mode:'planning'},
      permissions:{edit:true,control:true},effective};
    const c=document.createElement('heating-planner-card');c.setConfig({temperature_entity:'sensor.t'});document.body.append(c);
    c.hass={states:{'sensor.t':{state:'17.4',attributes:{}}},user:{is_admin:true},callWS:async m=>{
      switch(m.type){
        case 'heating_planner/list':return [{entry_id:'z1',name:'Salon'}];
        case 'heating_planner/get':return JSON.parse(JSON.stringify(server));
        case 'heating_planner/get_wakes':return {events:[],zones:[{entry_id:'z1',name:'Salon',profiles:['night','eco','comfort']}]};
      }
      return {ok:true};
    }};
  },effective);
  await page.waitForFunction(()=>document.querySelector('heating-planner-card')._loaded);
  return (await page.locator('#dynamic-preheat').textContent()).replace(/\s+/g,' ');
};
const start=new Date(Date.now()+3600000).toISOString(), deadline=new Date(Date.now()+3*3600000).toISOString();
let t=await text({target:17,active_mode:'planning',preheat_strategy:'dynamic',preheat_active:false,dynamic_start:start,dynamic_deadline:deadline,
  dynamic_minutes:163,dynamic_target:21,dynamic_slope:1.68,dynamic_dead_time:20,dead_time_minutes:20,dead_time_source:'learned'});
assert(t.includes('163 min')&&t.includes('vitesse 1,68 °C/h · retard 20 min'),'retard affiché : '+t);
t=await text({target:17,active_mode:'planning',preheat_strategy:'dynamic',preheat_active:false,dynamic_start:start,dynamic_deadline:deadline,
  dynamic_minutes:143,dynamic_target:21,dynamic_slope:1.68,dynamic_dead_time:0,dead_time_minutes:0});
assert(!t.includes('retard'),'pas de retard affiché à 0 : '+t);
t=await text({target:17,active_mode:'planning',preheat_strategy:'dynamic',preheat_active:false,dynamic_start:start,dynamic_deadline:deadline,
  dynamic_minutes:143,dynamic_target:21,dynamic_slope:1.68});
assert(!t.includes('retard'),'réponse d’un composant v0.9.8 : '+t);
t=await text({target:15,active_mode:'away',override_until:deadline,away_return_deadline:deadline,away_return_target:21,away_return_start:start,
  away_return_minutes:75,away_return_strategy:'dynamic',dead_time_minutes:15,preheat_active:false});
assert(t.includes('75 min · dynamique (retard 15 min inclus)'),'retour d’absence : '+t);
t=await text({target:15,active_mode:'away',override_until:deadline,away_return_deadline:deadline,away_return_target:21,away_return_start:start,
  away_return_minutes:30,away_return_strategy:'fixed',dead_time_minutes:15,preheat_active:false});
assert(t.includes('durée fixe')&&!t.includes('retard'),'durée fixe sans retard : '+t);
assert(!pageErrors.length,'erreurs de page : '+pageErrors.join(' | '));
console.log('PASS v0.9.9 : retard affiché en dynamique (planning et retour d’absence), masqué à 0, en durée fixe et avec un composant v0.9.8');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
