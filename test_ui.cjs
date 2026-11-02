const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
const browser=await chromium.launch({headless:true,channel:"chrome"});
const page=await browser.newPage();
await page.setContent('<body></body>');
await page.addScriptTag({path:require('path').join(__dirname,'www/heating-planner-card.js')});
await page.evaluate(()=>{
const c=document.createElement('heating-planner-card');document.body.append(c);c.setConfig({});
c._loaded=true;c._name='Zone test';c._entry='zone';c._profiles={night:17,comfort:22};
c._weekly=Object.fromEntries(Array.from({length:7},(_,i)=>[i,[{time:'00:00',profile:'night'},{time:'06:30',profile:'comfort'},{time:'22:00',profile:'night'}]]));
c._exceptions={};c._wakes=[];c._zones=[];c._day=0;c._tab='weekly';c._hass={states:{},callWS:async()=>({})};c._effective={target:22,active_mode:'planning',next_target:17,next_change:'2026-11-02T22:00:00+01:00'};c.render();
});
await page.locator('[data-segment="1"]').click();await page.locator('[data-segment="2"]').click();
if(await page.locator('.hp-row-focus').count()!==1)throw Error('selection');
await page.locator('input[data-i="1"]').focus();
await page.evaluate(()=>{const el=document.querySelector('input[data-i="1"]');window.originalInput=el;el.value='07:45';el.dispatchEvent(new Event('change'));});
if(!await page.evaluate(()=>document.activeElement===originalInput && document.querySelector('input[data-i="1"]')===originalInput))throw Error('focus');
// Reorder on leaving the input, without replacing the edited node.
await page.locator('input[data-i="1"]').fill('23:00');
await page.locator('#status').click();
let times=await page.locator('input[data-key="time"]').evaluateAll(xs=>xs.map(x=>x.value));
if(JSON.stringify(times)!==JSON.stringify(['00:00','22:00','23:00']))throw Error('chronological order '+times);
await page.locator('[data-segment="1"]').click();
await page.locator('#add').click();
if(await page.locator('.hp-row-focus input').inputValue()!=='22:30')throw Error('contextual add');
await page.locator('.hp-row-focus select').selectOption('comfort');
if(!await page.evaluate(()=>document.querySelector('heating-planner-card')._weekly['0'].find(e=>e.time==='22:30').profile==='comfort'))throw Error('profile association');
await page.locator('.hp-row-focus [data-remove]').click();
if(await page.locator('input[data-key="time"]').count()!==3)throw Error('remove association');
await page.locator('input[data-i="2"]').fill('22:00');
await page.locator('#status').click();
if(await page.locator('input[data-i="2"]').inputValue()!=='23:00')throw Error('duplicate rejection');
console.log('PASS: tri après saisie, ajout contextuel, profil/suppression après tri, rejet doublon');
await page.locator('#taboverview').click();
if(!(await page.textContent('body')).includes('22,0 °C'))throw Error('effective target');
await page.locator('[data-segment="1"]').click();
if(await page.locator('.hp-row-focus').count()!==1)throw Error('home editing');
await page.locator('#tabmodes').click();
await page.evaluate(()=>{document.querySelector('heating-planner-card')._modeTemperatures={away:15,boost:24};});
await page.locator('#mode').selectOption('away');
if(await page.locator('#temperature').inputValue()!=='15')throw Error('away preset');
await page.locator('#mode').selectOption('boost');
if(await page.locator('#temperature').inputValue()!=='24')throw Error('boost preset');
await page.locator('#temperature').fill('23');
await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');c._hass.callWS=async msg=>{window.sentMode=msg;return {};};});
await page.locator('#apply').click();
if(!await page.evaluate(()=>sentMode.override.temperature===23 && sentMode.override.mode==='boost'))throw Error('manual activation adjustment');
console.log('PASS: Absent 15, Boost configurable 24, activation ajustable 23');
await page.locator('#back').click();
await page.locator('#tabexceptions').click();await page.locator('#tabwakes').click();
console.log('PASS: focus, selection unique, consigne effective, frise accueil, exceptions et reveils');
await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');c.config={name:'Chambre Max',temperature_entity:'climate.chambre'};c._hass.states={'climate.chambre':{state:'heat',attributes:{current_temperature:16.6,hvac_action:'heating'}}};c._tab='overview';c.render();});
if(!(await page.textContent('body')).includes('16,6 °C'))throw Error('climate current_temperature');
if(await page.locator('.hp-heading .hp-badge').textContent()!=='Chauffe')throw Error('hvac action');
await page.locator('[data-home-mode="away"]').click();
if(await page.locator('#mode').inputValue()!=='away' || await page.locator('#temperature').inputValue()!=='15')throw Error('home away button');
await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');c._tab='overview';c.render();});
await page.setViewportSize({width:390,height:900});
await page.addStyleTag({content:'body{margin:0;background:#191919;color:#eee;font-family:Arial;--primary-text-color:#eee;--secondary-text-color:#aaa;--secondary-background-color:#242424;--divider-color:#333;--primary-color:#03a9b9}'});
await page.screenshot({path:require('path').join(__dirname,'home_mobile.png')});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');
await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');c.config={temperature_entity:'sensor.room'};c._hass.states={'sensor.room':{state:'16.6',attributes:{}}};c.render();});
if(await page.locator('.hp-heading .hp-badge').textContent()!=='État de chauffe non renseigné')throw Error('unconfigured state');
await page.evaluate(()=>{const c=document.querySelector('heating-planner-card');c.config={temperature_entity:'climate.room'};c._hass.states={'climate.room':{state:'unavailable',attributes:{current_temperature:20,hvac_action:'heating'}}};c.render();});
if(await page.locator('.hp-heading .hp-badge').textContent()!=='État de chauffe indisponible')throw Error('unavailable');
if(!(await page.locator('.hp-metric').first().textContent()).includes('—'))throw Error('stale temp');
console.log('PASS: climate, état réel, valeurs indisponibles, bouton Absent, largeur mobile');
for(const mode of ['planning','manual','boost','away']){
 await page.evaluate(mode=>{const c=document.querySelector('heating-planner-card');c._effective.active_mode=mode;c._tab='overview';c.render();},mode);
 const selected=await page.locator('[data-home-mode][aria-pressed="true"]').evaluateAll(xs=>xs.map(x=>x.dataset.homeMode));
 if(JSON.stringify(selected)!==JSON.stringify(mode==='planning'?[]:[mode]))throw Error('active button '+mode);
 const colors=await page.locator('[data-home-mode]').evaluateAll(xs=>xs.map(x=>({mode:x.dataset.homeMode,color:getComputedStyle(x).backgroundColor})));
 if(mode==='away' && colors.find(x=>x.mode==='away').color===colors.find(x=>x.mode==='manual').color)throw Error('active color');
}
console.log('PASS : couleur et sélection des modes Planning, Manuel, Boost, Absent');
for(const [state,action,label] of [['off',null,'Arrêté'],['heat',null,'Chauffage activé'],['heat','heating','Chauffe'],['heat','idle','Au repos'],['unavailable','heating','État de chauffe indisponible']]){
 await page.evaluate(({state,action})=>{const c=document.querySelector('heating-planner-card');c.config={temperature_entity:'sensor.temperature_chambre_max',heating_entity:'climate.climate_max_bedroom'};c._hass.states={'sensor.temperature_chambre_max':{state:'16.6',attributes:{}},'climate.climate_max_bedroom':{state,attributes:action?{hvac_action:action}:{preset_mode:'away',temperature:15}}};c._tab='overview';c.render();},{state,action});
 if(await page.locator('.hp-heading .hp-badge').textContent()!==label)throw Error('climate state '+state+'/'+action);
}
console.log('PASS : configuration utilisateur, climate off/heat, priorité hvac_action, indisponibilité');
for(const width of [390,1000]){
 await page.setViewportSize({width,height:900});
 for(const tab of ['overview','weekly']){
 await page.evaluate(tab=>{const c=document.querySelector('heating-planner-card');const rows=[{time:'00:00',profile:'night'},{time:'06:00',profile:'comfort'},{time:'07:00',profile:'eco'},{time:'12:00',profile:'comfort'},{time:'13:00',profile:'eco'},{time:'18:00',profile:'comfort'},{time:'23:59',profile:'night'}];c._weekly=Object.fromEntries(Array.from({length:7},(_,i)=>[i,rows.map(e=>({...e}))]));c._day=0;c._tab=tab;c.render();},tab);
 const errors=await page.evaluate(()=>{
 const bar=document.querySelector('.hp-timeline').getBoundingClientRect(),inner=bar.width-2,left=bar.left+1;
 const expected=[0,360,420,720,780,1080,1439,1440];
 const segments=[...document.querySelectorAll('[data-segment]')];
 const diffs=segments.flatMap((el,i)=>{const r=el.getBoundingClientRect();return [Math.abs(r.left-(left+inner*expected[i]/1440)),Math.abs(r.right-(left+inner*expected[i+1]/1440))];});
 const ticks=[...document.querySelectorAll('.hp-ticks span')];
 for(const i of [1,2,3]){const r=ticks[i].getBoundingClientRect();diffs.push(Math.abs((r.left+r.right)/2-(left+inner*i/4)));}
 return diffs.filter(x=>x>0.2);
 });
 if(errors.length)throw Error('timeline geometry '+width+'/'+tab+' '+errors);
 }
}
console.log('PASS : positions et largeurs exactes des plages et repères, mobile/ordinateur, accueil/éditeur');
await browser.close();
})();






