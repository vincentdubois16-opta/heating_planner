const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'}).catch(()=>chromium.launch({headless:true}));
const page=await browser.newPage();await page.setContent('<body></body>');await page.addScriptTag({path:require('path').join(__dirname,'www/heating-planner-card.js')});
await page.evaluate(async()=>{
 const weekly=Object.fromEntries(Array.from({length:7},(_,i)=>[i,[{time:'00:00',profile:'night'},{time:'07:00',profile:'comfort'},{time:'08:30',profile:'eco'},{time:'12:00',profile:'comfort'},{time:'13:00',profile:'eco'},{time:'19:00',profile:'comfort'},{time:'22:30',profile:'night'}]]));
 window.server={name:'Chambre Max',weekly,exceptions:{},profiles:{night:17,eco:19,comfort:21},effective:{target:19,active_mode:'planning'},permissions:{edit:true,control:true}};window.messages=[];
 const c=document.createElement('heating-planner-card');document.body.append(c);c.setConfig({temperature_entity:'sensor.room',heating_entity:'climate.room'});
 c._hass={states:{'sensor.room':{state:'16.5'},'climate.room':{state:'off',attributes:{temperature:19}}},user:{is_admin:true},callWS:async msg=>{
  messages.push(structuredClone(msg));if(msg.type==='heating_planner/list')return[{entry_id:'max'}];
  if(msg.type==='heating_planner/get')return structuredClone(server);
  if(msg.type==='heating_planner/get_wakes')return{events:[],zones:[]};
  if(msg.type==='heating_planner/set_schedule')server.weekly=structuredClone(msg.weekly);
  if(msg.type==='heating_planner/set_exceptions'){if(window.failException)throw Error('erreur simulée');server.exceptions=structuredClone(msg.exceptions);}
  return {ok:true};
 }};
 window.resetEditor=async()=>{await c.load();c._tab='weekly';c.render();};await resetEditor();
 window.atMinute=(entries,minute)=>[...entries].reverse().find(p=>Number(p.time.slice(0,2))*60+Number(p.time.slice(3))<=minute)?.profile;
 window.assertCover=()=>{const rows=c.model(c.dayKey()).periods;return rows[0].start===0&&rows.at(-1).end===1440&&rows.every((r,i)=>r.end>r.start&&(i===0||r.start===rows[i-1].end));};
});
const initial=await page.evaluate(()=>JSON.stringify(document.querySelector('heating-planner-card')._weekly));
await page.locator('.hp-ed [data-segment="0"]').click();await page.locator('.hp-ed [data-segment="0"]').click();
if(!await page.evaluate(initial=>{const c=document.querySelector('heating-planner-card');return JSON.stringify(c._weekly)===initial&&c._dirty.size===0&&c.model(c.dayKey()).periods.length===7;},initial))throw Error('first period mutates');
if(!(await page.locator('.hp-period').first().textContent()).includes('00:00 – 07:00'))throw Error('midnight hidden');
if(await page.locator('.hp-selected select[data-field="start"]').inputValue()!=='0')throw Error('first period wrong');
await page.locator('#addperiod').click();
await page.locator('select[data-period="new"][data-field="start"]').selectOption('60');
await page.locator('select[data-period="new"][data-field="end"]').selectOption('120');
await page.locator('[data-new-profile][data-choice="eco"]').click();
if(await page.evaluate(()=>document.querySelector('heating-planner-card')._dirty.size)!==0)throw Error('unconfirmed creation dirties schedule');
await page.locator('#confirmperiod').click();
if(!await page.evaluate(()=>{const c=document.querySelector('heating-planner-card'),e=c.entriesOf(c.dayKey());return assertCover()&&atMinute(e,30)==='night'&&atMinute(e,90)==='eco'&&atMinute(e,180)==='night'&&c._dirty.has('weekly');}))throw Error('insert into midnight');
await page.locator('[data-act="undo"]').click();
if(!await page.evaluate(initial=>JSON.stringify(document.querySelector('heating-planner-card')._weekly)===initial,initial))throw Error('undo');
// Add inside a fully occupied daytime period, not only a free background gap.
await page.locator('#addperiod').click();
await page.locator('select[data-period="new"][data-field="start"]').selectOption('435');
await page.locator('select[data-period="new"][data-field="end"]').selectOption('465');
await page.locator('[data-new-profile][data-choice="night"]').click();await page.locator('#confirmperiod').click();
if(!await page.evaluate(()=>{const c=document.querySelector('heating-planner-card'),e=c.entriesOf(c.dayKey());return assertCover()&&atMinute(e,430)==='comfort'&&atMinute(e,450)==='night'&&atMinute(e,470)==='comfort';}))throw Error('occupied insertion');
// End-of-day insertion and start-of-day insertion.
for(const [start,end,profile] of [[1380,1440,'comfort'],[0,30,'eco']]){
 await page.locator('#addperiod').click();await page.locator('select[data-period="new"][data-field="start"]').selectOption(String(start));await page.locator('select[data-period="new"][data-field="end"]').selectOption(String(end));await page.locator(`[data-new-profile][data-choice="${profile}"]`).click();await page.locator('#confirmperiod').click();
 if(!await page.evaluate(({start,profile})=>{const c=document.querySelector('heating-planner-card'),e=c.entriesOf(c.dayKey());return assertCover()&&atMinute(e,start)===profile&&e[0].time==='00:00'&&e.every(x=>x.time!=='24:00');},{start,profile}))throw Error('day edge insertion');
}
await page.locator('#addperiod').click();await page.locator('select[data-period="new"][data-field="start"]').selectOption('600');await page.locator('select[data-period="new"][data-field="end"]').selectOption('540');await page.locator('#confirmperiod').click();
if(!(await page.locator('.hp-compose .hp-err').textContent()).includes('après'))throw Error('invalid interval');await page.locator('#cancelperiod').click();
// Delete first period: still cover midnight; undo restores it.
await page.locator('[data-select-period]').first().click();await page.locator('[data-delete]').click();
if(!await page.evaluate(()=>assertCover()))throw Error('delete midnight gap');await page.locator('[data-act="undo"]').click();
// Model roundtrips preserve every minute, including custom profiles.
const modelResult=await page.evaluate(()=>{
 const api=HeatingPlannerModel;let seed=31;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 for(let t=0;t<80;t++){
  const cuts=new Set([0]);for(let i=0;i<18;i++)cuts.add(Math.floor(rand()*1440));
  const entries=[...cuts].sort((a,b)=>a-b).map(m=>({time:String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),profile:['night','eco','comfort','custom'][Math.floor(rand()*4)]}));
  const model=api.toModel(entries,'night'),out=api.fromModel(model);
  if(model.periods[0].start!==0||model.periods.at(-1).end!==1440)throw Error('coverage');
  for(let minute=0;minute<1440;minute++)if(atMinute(entries,minute)!==atMinute(out,minute))throw Error('roundtrip '+t+'/'+minute);
 }
 return '80 journées, 115200 minutes vérifiées';
});
// Saving is explicit; home stays on the committed schedule before that.
await page.locator('#taboverview').click();if(!(await page.locator('[data-segment="0"]').getAttribute('title')).includes('00:00–07:00'))throw Error('home draft leak');
await page.locator('#home-exceptions').click();await page.locator('#exceptiondate').fill('2030-01-02');await page.locator('#newexception').click();
await page.evaluate(()=>window.failException=true);await page.locator('[data-act="save"]').click();await page.waitForFunction(()=>!document.querySelector('heating-planner-card')._saving);
if(!await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');return !c._dirty.has('weekly')&&c._dirty.has('exceptions')&&c._saveErr.includes('incomplet')&&JSON.stringify(c._saved.weekly)===JSON.stringify(server.weekly);}))throw Error('partial save loses draft');
await page.evaluate(()=>window.failException=false);await page.locator('[data-act="save"]').click();await page.waitForFunction(()=>document.querySelector('heating-planner-card')._dirty.size===0);
// Family rights stay compatible with v0.9.5.
await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');c._permissions={edit:false,control:true};c._hass.user.is_admin=false;c._tab='weekly';c.render();});
if(!await page.locator('#addperiod').isDisabled())throw Error('readonly add');
await page.locator('.hp-ed [data-segment="0"]').click();if(!await page.locator('.hp-selected [data-choice]').first().isDisabled())throw Error('readonly profile');
// v0.9.7 : plus d'onglet Modes, Boost se lance en un geste depuis l'accueil.
await page.locator('#taboverview').click();await page.locator('[data-qa="boost"]').click();await page.waitForFunction(()=>messages.some(m=>m.type==='heating_planner/set_mode'&&m.override.mode==='boost'));
// Adjust boundaries without inventing a hidden background period.
await page.evaluate(async()=>{server.permissions={edit:true,control:true};server.weekly=Object.fromEntries(Array.from({length:7},(_,i)=>[i,[{time:'00:00',profile:'night'},{time:'07:00',profile:'comfort'},{time:'08:30',profile:'eco'}]]));await resetEditor();});
await page.locator('.hp-ed [data-segment="1"]').click();await page.locator('.hp-selected select[data-field="end"]').selectOption('480');
if(!await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');return c.model(c.dayKey()).periods.length===3&&assertCover()&&atMinute(c.entriesOf(c.dayKey()),485)==='eco';}))throw Error('boundary shortening creates phantom period');
await page.locator('.hp-selected select[data-field="start"]').selectOption('450');
if(!await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');return c.model(c.dayKey()).periods.length===3&&assertCover()&&atMinute(c.entriesOf(c.dayKey()),440)==='night';}))throw Error('start boundary gap');
// Copy to several days remains available behind a simple disclosure.
await page.locator('details[data-dk="copy"] summary').click();
const days=await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');return [(c._day+1)%7,(c._day+2)%7];});
for(const d of days)await page.locator('[data-copyday="'+d+'"]').click();
await page.locator('#copyapply').click();
if(!await page.evaluate(days=>{const c=document.querySelector('heating-planner-card');return days.every(d=>JSON.stringify(c._weekly[d])===JSON.stringify(c._weekly[c._day])&&c._weekly[d]!==c._weekly[c._day]);},days))throw Error('copy several days');
await page.locator('[data-act="save"]').click();await page.waitForFunction(()=>document.querySelector('heating-planner-card')._dirty.size===0);
// Wake touch() must mark its changes; saving retains global save behavior.
await page.locator('#tabwakes').click();await page.locator('#addwake').click();
if(!await page.evaluate(()=>document.querySelector('heating-planner-card')._dirty.has('wakes')))throw Error('wake add not pending');
await page.locator('#wakename').fill('Réveil famille');await page.locator('#wakename').press('Tab');
await page.locator('[data-act="save"]').click();await page.waitForFunction(()=>!document.querySelector('heating-planner-card')._saving);
if(!await page.evaluate(()=>messages.some(m=>m.type==='heating_planner/set_wakes'&&m.events[0].name==='Réveil famille')))throw Error('wake save');
// The backend's 48-transition limit is reported before any schedule is changed.
await page.evaluate(async()=>{server.weekly=Object.fromEntries(Array.from({length:7},(_,i)=>[i,Array.from({length:48},(_,j)=>({time:String(Math.floor(j/2)).padStart(2,'0')+':'+(j%2?'30':'00'),profile:j%2?'comfort':'night'}))]));await resetEditor();});
await page.locator('#addperiod').click();await page.locator('select[data-period="new"][data-field="start"]').selectOption('15');await page.locator('select[data-period="new"][data-field="end"]').selectOption('30');await page.locator('[data-new-profile][data-choice="eco"]').click();await page.locator('#confirmperiod').click();
if(!(await page.locator('.hp-compose .hp-err').textContent()).includes('trop'))throw Error('48-transition limit missing');
if(await page.evaluate(()=>document.querySelector('heating-planner-card')._dirty.size)!==0)throw Error('invalid insert changed data');
await page.locator('#cancelperiod').click();
// Visual mobile/desktop review with a clean schedule and first period selected.
await page.evaluate(async()=>{server.permissions={edit:true,control:true};server.weekly=Object.fromEntries(Array.from({length:7},(_,i)=>[i,[{time:'00:00',profile:'night'},{time:'07:00',profile:'comfort'},{time:'08:30',profile:'eco'},{time:'19:00',profile:'comfort'},{time:'22:30',profile:'night'}]]));await resetEditor();});
await page.addStyleTag({content:'body{margin:0;background:#191919;font-family:Arial;--primary-text-color:#eee;--secondary-text-color:#aaa;--divider-color:#3d3d3d;--card-background-color:#202020;--secondary-background-color:#292929;--primary-color:#029dbc;--text-primary-color:white}ha-card{display:block;border-radius:12px}'});
for(const width of [390,980]){
 await page.setViewportSize({width,height:1050});await page.locator('.hp-ed [data-segment="0"]').click();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow '+width);
 await page.screenshot({path:require("path").join(__dirname,`editor096_${width}.png`),fullPage:true});
}
console.log('PASS : première période visible/sélection sans ajout, insertion libre y compris 00:00/24:00, annulation, erreur, couverture complète, '+modelResult+', accueil enregistré, sauvegarde partielle, droits et mobile');
await browser.close();
})();

