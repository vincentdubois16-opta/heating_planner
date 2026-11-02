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
if(!(await page.textContent('body')).includes('22 °C'))throw Error('effective target');
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
await browser.close();
})();


