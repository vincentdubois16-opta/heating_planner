// Nouveautés v0.9.7 : `node test_ui_v097.cjs` (Node.js + Playwright ; Chrome s'il est installé, sinon Chromium).
// Modes en un geste, réveils sur la frise d'accueil, congés du… au…, onglet Températures.
const {chromium}=require('playwright');
const path=require('path');
const assert=(cond,msg)=>{if(!cond)throw Error(msg);};

(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'}).catch(()=>chromium.launch({headless:true}));
const page=await browser.newPage({viewport:{width:1000,height:900}});
const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
await page.setContent('<body></body>');
await page.addScriptTag({path:path.join(__dirname,'www/heating-planner-card.js')});

const setup=async({permissions={edit:true,control:true},override={mode:'planning'},events=null,exceptions={}}={})=>{
  await page.evaluate(({permissions,override,events,exceptions})=>{
    document.body.innerHTML='';
    const day=[{time:'00:00',profile:'night'},{time:'06:30',profile:'comfort'},{time:'08:00',profile:'eco'},{time:'17:30',profile:'comfort'},{time:'22:00',profile:'night'}];
    const we=[{time:'00:00',profile:'night'},{time:'08:30',profile:'comfort'},{time:'23:00',profile:'night'}];
    const clone=x=>JSON.parse(JSON.stringify(x));
    window.server={name:'Chambre Max',weekly:Object.fromEntries([0,1,2,3,4,5,6].map(i=>[String(i),clone(i<5?day:we)])),exceptions:clone(exceptions),
      profiles:{night:17,eco:18,comfort:21},mode_temperatures:{away:15,boost:22},preheat_minutes:30,override:clone(override),permissions,
      effective:{target:18,active_mode:'planning',next_change:new Date(Date.now()+2*3600000).toISOString(),next_target:21}};
    window.events=events||[];window.sent=[];window.failTemps=null;
    const c=document.createElement('heating-planner-card');c.setConfig({temperature_entity:'sensor.t',heating_entity:'climate.c'});document.body.append(c);
    c.hass={states:{'sensor.t':{state:'17.4',attributes:{}},'climate.c':{state:'heat',attributes:{hvac_action:'idle'}},'light.x':{state:'off',attributes:{}}},user:{is_admin:permissions.edit},callWS:async m=>{
      sent.push(clone(m));
      switch(m.type){
        case 'heating_planner/list':return [{entry_id:'z1',name:'Chambre Max'}];
        case 'heating_planner/get':return clone(server);
        case 'heating_planner/get_wakes':return {events:clone(window.events),zones:[{entry_id:'z1',name:'Chambre Max',profiles:['night','eco','comfort']}]};
        case 'heating_planner/set_mode':server.override=clone(m.override);return {ok:true};
        case 'heating_planner/set_exceptions':server.exceptions=clone(m.exceptions);return {ok:true};
        case 'heating_planner/set_schedule':server.weekly=clone(m.weekly);return {ok:true};
        case 'heating_planner/set_temperatures':
          if(window.failTemps)throw window.failTemps;
          server.profiles=clone(m.profiles);server.mode_temperatures={away:m.away_temperature,boost:m.boost_temperature};return {ok:true};
      }
      return {ok:true};
    }};
  },{permissions,override,events,exceptions});
  await page.waitForFunction(()=>document.querySelector('heating-planner-card')._loaded);
};
const card=fn=>page.evaluate(fn);
const lastMode=()=>card(()=>[...sent].reverse().find(m=>m.type==='heating_planner/set_mode')?.override);
const modeCount=()=>card(()=>sent.filter(m=>m.type==='heating_planner/set_mode').length);
const waitIdle=()=>page.waitForFunction(()=>{const c=document.querySelector('heating-planner-card');return !c._modeBusy&&!c._saving;});
const iso=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.toLocaleDateString('en-CA');};

/* ---------- 1. Modes en un geste ---------- */
await setup();
assert(await page.locator('#tabmodes').count()===0,'l’onglet Modes doit avoir disparu');
const before=Date.now();
await page.click('[data-qa="boost"]');await waitIdle();
let ov=await lastMode();
assert(ov.mode==='boost'&&ov.temperature===22,'Boost en un geste avec la température Boost : '+JSON.stringify(ov));
let minutes=(new Date(ov.until)-before)/60000;
assert(minutes>59&&minutes<61.5,'Boost pendant 1 h : '+minutes);
assert((await page.locator('.hp-active').textContent()).includes('Boost · 22,0 °C'),'bandeau Boost actif');
assert((await page.locator('.hp-active').textContent()).includes('Encore'),'temps restant');
const firstUntil=new Date(ov.until);
await page.click('[data-qa="extend"]');await waitIdle();
ov=await lastMode();
assert(ov.mode==='boost'&&Math.abs(new Date(ov.until)-firstUntil-3600000)<2000,'+1 h prolonge l’échéance');
await page.click('[data-qa="resume"]');await waitIdle();
assert((await lastMode()).mode==='planning','Reprendre le planning');
assert(await page.locator('[data-qa="boost"]').count()===1,'retour aux trois boutons');
console.log('PASS Boost : 1 h en un toucher, bandeau et temps restant, +1 h, reprendre le planning');

await page.click('[data-qa="keep"]');
assert(await page.locator('.hp-sheet output').textContent()==='18,0 °C','Maintenir part de la consigne actuelle');
await page.click('[data-qa="plus"]');await page.click('[data-qa="plus"]');await page.click('[data-qa="minus"]');await page.click('[data-qa="plus"]');
assert(await page.locator('.hp-sheet output').textContent()==='19,0 °C','réglage ±0,5 °C');
assert(await page.locator('[data-keep="next"][aria-pressed="true"]').count()===1,'par défaut : jusqu’au prochain changement');
await page.click('[data-qa="apply-keep"]');await waitIdle();
ov=await lastMode();
const nextChange=await card(()=>server.effective.next_change);
assert(ov.mode==='manual'&&ov.temperature===19&&Math.abs(new Date(ov.until)-new Date(nextChange))<1000,'Maintenir jusqu’au prochain changement : '+JSON.stringify(ov));
assert((await page.locator('.hp-active').textContent()).includes('Maintenu · 19,0 °C'),'bandeau Maintenu');
await page.click('[data-qa="resume"]');await waitIdle();
await page.click('[data-qa="keep"]');await page.click('[data-keep="240"]');await page.click('[data-qa="apply-keep"]');await waitIdle();
minutes=(new Date((await lastMode()).until)-Date.now())/60000;
assert(minutes>238&&minutes<241,'Maintenir 4 h');
await page.click('[data-qa="resume"]');await waitIdle();
console.log('PASS Maintenir : ±0,5 °C, jusqu’au prochain changement, durée fixe');

await page.click('[data-qa="away"]');
assert(await page.locator('.hp-sheet output').textContent()==='15,0 °C','Absent part de la température Absent');
await page.click('[data-away="date"]');
await page.locator('#qa-date').fill(iso(-1));await page.locator('#qa-date').dispatchEvent('change');
const count=await modeCount();
await page.click('[data-qa="apply-away"]');
assert((await page.locator('.hp-sheet .hp-err').textContent()).includes('futur')&&await modeCount()===count,'retour passé refusé sans envoi');
await page.locator('#qa-date').fill(iso(3));await page.locator('#qa-date').dispatchEvent('change');
await page.locator('#qa-time').selectOption('1140');
await page.click('[data-qa="minus"]');
await page.click('[data-qa="apply-away"]');await waitIdle();
ov=await lastMode();
const [y,m,d]=iso(3).split('-').map(Number);
assert(ov.mode==='away'&&ov.temperature===14.5&&new Date(ov.until).getTime()===new Date(y,m-1,d,19,0).getTime(),'Absent jusqu’à une date : '+JSON.stringify(ov));
const awayText=await page.locator('.hp-active').textContent();
assert(awayText.includes('Absent · 14,5 °C')&&awayText.includes('Retour prévu')&&awayText.includes('19:00'),'bandeau Absent : '+awayText);
await page.click('.hp-active [data-qa="away"]');
assert(await page.locator('#qa-date').inputValue()===iso(3)&&await page.locator('#qa-time').inputValue()==='1140','modifier le retour reprend la date prévue');
await page.click('[data-qa="close"]');
await page.click('[data-qa="resume"]');await waitIdle();
assert((await lastMode()).mode==='planning','je suis rentré');
console.log('PASS Absent : retour ce soir/demain/date, refus d’un retour passé, température réglable, modifier le retour');

// La feuille ouverte survit aux mises à jour Home Assistant ; une entité étrangère ne redessine rien.
await page.click('[data-qa="keep"]');await page.locator('[data-qa="plus"]').focus();
const kept=await card(()=>{const c=document.querySelector('heating-planner-card');const node=c.querySelector('.hp-sheet');
  c.hass={...c._hass,states:{...c._hass.states,'sensor.t':{state:'17.9',attributes:{}}}};
  return node.isConnected&&(c.getRootNode().activeElement?.dataset?.qa==='plus');});
assert(kept,'la saisie en cours n’est pas effacée par une mise à jour');
await page.click('[data-qa="close"]');
const stable=await card(()=>{const c=document.querySelector('heating-planner-card');const node=c.querySelector('.hp-home');
  c.hass={...c._hass,states:{...c._hass.states,'light.x':{state:'on',attributes:{}}}};return node.isConnected;});
assert(stable,'une entité sans rapport ne redessine pas l’accueil');
const redrawn=await card(()=>{const c=document.querySelector('heating-planner-card');const node=c.querySelector('.hp-home');
  c.hass={...c._hass,states:{...c._hass.states,'sensor.t':{state:'18.2',attributes:{}}}};return !node.isConnected&&c.textContent.includes('18,2 °C');});
assert(redrawn,'la température mesurée se met à jour');
console.log('PASS accueil : feuille préservée pendant la saisie, pas de redessin inutile, mesure à jour');

await setup({permissions:{edit:false,control:false}});
assert(await page.locator('[data-qa="boost"]').isDisabled()&&await page.locator('[data-qa="away"]').isDisabled(),'commandes désactivées sans droit');
assert((await page.locator('.hp-quick-modes').textContent()).includes('Vous ne pouvez pas commander'),'explication des droits');
console.log('PASS droits : commandes rapides désactivées sans droit de contrôle');

/* ---------- 2. Réveils sur la frise d'accueil ---------- */
const wd=await card(()=>(new Date().getDay()+6)%7);
const all=slot=>Object.fromEntries([0,1,2,3,4,5,6].map(i=>[String(i),slot]));
await setup({events:[
  {id:'a',name:'Réveil école',times:all({start:'06:00',end:'07:15'}),dates:{},zones:{z1:'comfort'}},
  {id:'b',name:'Sieste',times:all({start:'13:00',end:'14:00'}),dates:{[iso(0)]:null},zones:{z1:'comfort'}},
  {id:'c',name:'Autre pièce',times:all({start:'10:00',end:'11:00'}),dates:{},zones:{z9:'comfort'}},
  {id:'d',name:'Chevauche',times:all({start:'07:00',end:'07:30'}),dates:{},zones:{z1:'eco'}},
]});
const segs=await card(()=>document.querySelector('heating-planner-card').todaySegments().map(s=>`${s.start}-${s.end}:${s.profile}${s.wake?'@'+s.wake.name:''}`));
const isWeekend=wd>=5;
const expected=isWeekend
  ?['0-360:night','360-420:comfort@Réveil école','420-450:eco@Chevauche','450-510:night','510-1380:comfort','1380-1440:night']
  :['0-360:night','360-420:comfort@Réveil école','420-450:eco@Chevauche','450-480:comfort','480-1050:eco','1050-1320:comfort','1320-1440:night'];
assert(JSON.stringify(segs)===JSON.stringify(expected),'superposition des réveils : '+JSON.stringify(segs));
assert(!segs.some(s=>s.includes('Sieste')||s.includes('Autre pièce')),'réveil désactivé ce jour / autre zone ignorés');
assert(await page.locator('.hp-home .hp-wake').count()===2,'réveils hachurés sur la frise');
assert((await page.locator('.hp-home .hp-keys').textContent()).includes('Réveil'),'légende Réveil');
await page.click('.hp-home .hp-wake[data-start="420"]');
assert(await page.locator('#tabwakes.active').count()===1&&await card(()=>document.querySelector('heating-planner-card')._wakeIdx)===3,'toucher un réveil ouvre ce réveil');
console.log('PASS frise d’accueil : réveils superposés comme le serveur, dernier commencé prioritaire, jour désactivé et autre zone ignorés, accès au réveil');

/* ---------- 3. Congés du… au… ---------- */
await setup({exceptions:{[iso(5)]:[{time:'00:00',profile:'night'},{time:'09:00',profile:'comfort'},{time:'23:00',profile:'night'}],[iso(-3)]:[{time:'00:00',profile:'eco'}]}});
await page.click('#home-exceptions');
assert((await page.locator('.hp-ed').textContent()).includes('Jours passés (1)'),'jours passés repliés');
await page.click('#xnew');
await page.locator('#xfrom').fill(iso(4));await page.locator('#xfrom').dispatchEvent('change');
assert(await page.locator('#xto').inputValue()===iso(4),'la fin suit le début si elle était avant');
await page.locator('#xto').fill(iso(3));await page.locator('#xto').dispatchEvent('change');
assert((await page.locator('.hp-compose .hp-err').textContent()).includes('après')&&await page.locator('#xconfirm').isDisabled(),'fin avant début refusée');
await page.locator('#xto').fill(iso(10));await page.locator('#xto').dispatchEvent('change');
assert((await page.locator('.hp-compose').textContent()).includes('1 jour déjà personnalisé sera remplacé'),'avertissement de remplacement');
await page.click('[data-xprofile][data-choice="eco"]');
assert(await page.locator('#xconfirm').textContent()==='Ajouter 7 jours','7 jours du J+4 au J+10');
await page.click('#xconfirm');
const ex=await card(()=>document.querySelector('heating-planner-card')._exceptions);
for(let i=4;i<=10;i++)assert(JSON.stringify(ex[iso(i)])==='[{"time":"00:00","profile":"eco"}]','jour '+i);
assert(JSON.stringify(Object.keys(ex))===JSON.stringify(Object.keys(ex).sort()),'dates triées');
const groupText=await page.locator('.hp-xgroup').first().textContent();
assert(groupText.includes('7 jours')&&groupText.includes('Toute la journée en Éco 18°'),'groupe affiché : '+groupText);
console.log('PASS ajout d’une plage : dates, refus fin < début, remplacement annoncé, toute la journée en Éco, groupe unique');

await page.click('[data-act="undo"]');
await page.click('#xnew');
await page.locator('#xfrom').fill(iso(20));await page.locator('#xfrom').dispatchEvent('change');
await page.locator('#xto').fill(iso(22));await page.locator('#xto').dispatchEvent('change');
await page.locator('#xlike').selectOption('6');
await page.click('#xconfirm');
const sunday=await card(()=>JSON.stringify(document.querySelector('heating-planner-card')._weekly['6']));
assert(await card(new Function(`const e=document.querySelector('heating-planner-card')._exceptions;return [${[20,21,22].map(i=>`'${iso(i)}'`)}].every(d=>JSON.stringify(e[d])===${JSON.stringify(sunday)});`)),'comme un dimanche');
const sundayGroup=page.locator('.hp-xgroup',{hasText:'Comme un dimanche'});
assert(await sundayGroup.count()===1&&(await sundayGroup.textContent()).includes('3 jours'),'description « comme un dimanche »');
await sundayGroup.locator('[data-xedit]').click();
assert((await page.locator('.hp-ed .hp-msg').first().textContent()).includes('les 3 jours'),'édition de la plage entière');
await page.locator('.hp-ed [data-segment="1"]').click();
await page.locator('.hp-selected [data-choice="eco"]').click();
assert(await card(new Function(`const e=document.querySelector('heating-planner-card')._exceptions;const a=[${[20,21,22].map(i=>`'${iso(i)}'`)}].map(d=>JSON.stringify(e[d]));return a[0]===a[1]&&a[1]===a[2]&&a[0].includes('"eco"');`)),'modifier la plage modifie ses 3 jours');
await page.click('#xsingle');
await page.locator('.hp-ed [data-segment="1"]').click();
await page.locator('.hp-selected [data-choice="comfort"]').click();
assert(await card(new Function(`const e=document.querySelector('heating-planner-card')._exceptions;return JSON.stringify(e['${iso(20)}'])!==JSON.stringify(e['${iso(21)}'])&&JSON.stringify(e['${iso(21)}'])===JSON.stringify(e['${iso(22)}']);`)),'ne modifier qu’un jour');
await page.click('#xback');
assert(await page.locator('.hp-xgroup').count()>=3,'la plage se scinde en deux groupes');
const groupCount=await page.locator('.hp-xgroup').count();
await page.locator('.hp-xgroup').first().locator('[data-xdel]').click();
assert(await page.locator('.hp-xgroup').count()===groupCount-1&&(await page.locator('.hp-msg').textContent()).includes('supprimé'),'supprimer une plage');
await page.locator('details[data-dk="xpast"] summary').click();await page.click('#clearpast');
assert(!(await card(()=>Object.keys(document.querySelector('heating-planner-card')._exceptions))).includes(iso(-3)),'retirer les jours passés');
await page.locator('#exceptiondate').fill(iso(30));await page.locator('#exceptiondate').dispatchEvent('change');
await page.click('#newexception');
assert(await card(new Function(`return !!document.querySelector('heating-planner-card')._exceptions['${iso(30)}']`))&&await page.locator('#xback').count()===1,'un seul jour personnalisé depuis la liste');
await card(()=>{const c=document.querySelector('heating-planner-card');for(let i=0;i<370;i++){const d=new Date();d.setDate(d.getDate()+100+i);c._exceptions[d.toLocaleDateString('en-CA')]=[{time:'00:00',profile:'eco'}];}c._xView='list';c.render();return true;});
await page.click('#xnew');
assert((await page.locator('.hp-compose .hp-err').textContent()).includes('366'),'limite de 366 jours spéciaux');
await page.click('#xcancel');
console.log('PASS plages : comme un dimanche, modifier toute la plage ou un seul jour, scission, suppression, jours passés, un seul jour, limite 366');

/* ---------- 4. Températures ---------- */
await setup();
await page.click('#home-temps');
await page.click('[data-tstep="comfort:0.5"]');await page.click('[data-tstep="comfort:0.5"]');
await page.click('[data-tstep="night:-0.5"]');await page.click('[data-tstep="away:-0.5"]');await page.click('[data-tstep="boost:0.5"]');
assert(await page.locator('[data-tvalue="comfort"]').textContent()==='22,0 °C','Confort +1 °C');
assert((await page.locator('.hp-savebar').textContent()).includes('températures'),'brouillon températures');
await page.click('#tabweekly');
assert((await page.locator('.hp-ed .hp-keys').textContent()).includes('Confort 22°'),'la semaine montre la nouvelle température');
await page.click('#taboverview');
assert((await page.locator('.hp-home .hp-keys').textContent()).includes('Confort 21°'),'l’accueil reste sur l’enregistré');
await page.click('#home-temps');
for(let i=0;i<14;i++)await page.click('[data-tstep="eco:0.5"]');
assert((await page.locator('.hp-warn').first().textContent()).includes('Nuit ≤ Éco ≤ Confort'),'avertissement d’ordre');
for(let i=0;i<14;i++)await page.click('[data-tstep="eco:-0.5"]');
assert(await page.locator('.hp-warn').count()===0,'plus d’avertissement');
await card(()=>{window.failTemps={code:'unknown_command',message:'Unknown command.'};});
await page.click('[data-act="save"]');await waitIdle();
assert((await page.locator('.hp-savebar').textContent()).includes('v0.9.7'),'message clair si le composant Python est ancien');
await card(()=>{window.failTemps=null;});
await page.click('[data-act="save"]');await waitIdle();
const temps=await card(()=>[...sent].reverse().find(m=>m.type==='heating_planner/set_temperatures'));
assert(JSON.stringify(temps.profiles)==='{"night":16.5,"eco":18,"comfort":22}'&&temps.away_temperature===14.5&&temps.boost_temperature===22.5,'envoi des températures : '+JSON.stringify(temps));
assert(await card(()=>document.querySelector('heating-planner-card')._dirty.size)===0,'tout enregistré');
await page.click('#taboverview');
assert((await page.locator('.hp-home .hp-keys').textContent()).includes('Confort 22°')&&(await page.locator('[data-qa="boost"]').textContent()).includes('22,5 °C'),'accueil à jour après enregistrement');
await page.click('#home-temps');
for(let i=0;i<30;i++)await page.click('[data-tstep="night:-0.5"]');
assert(await page.locator('[data-tvalue="night"]').textContent()==='5,0 °C','borne basse 5 °C');
await page.click('[data-act="undo"]');
console.log('PASS températures : ±0,5 °C, brouillon visible dans la semaine, accueil sur l’enregistré, ordre vérifié, composant ancien signalé, envoi, bornes');

// Un seul Enregistrer : températures + jours spéciaux ensemble.
await page.click('[data-tstep="eco:0.5"]');
await page.click('#tabexceptions');await page.click('#xnew');await page.click('#xconfirm');
await card(()=>{window.sent=[];});
await page.click('[data-act="save"]');await waitIdle();
const types=await card(()=>sent.filter(m=>m.type.includes('/set_')).map(m=>m.type.split('/')[1]));
assert(JSON.stringify(types)==='["set_temperatures","set_exceptions"]','un seul Enregistrer : '+JSON.stringify(types));
await setup({permissions:{edit:false,control:true}});
await page.click('#home-temps');
assert(await page.locator('[data-tstep="night:0.5"]').isDisabled()&&(await page.locator('.hp-ed').textContent()).includes('Lecture seule'),'températures en lecture seule');
console.log('PASS enregistrement commun températures + jours spéciaux, lecture seule sans droit d’édition');

/* ---------- 5. Mobile ---------- */
await setup({events:[{id:'a',name:'Réveil',times:all({start:'06:00',end:'07:15'}),dates:{},zones:{z1:'comfort'}}],exceptions:{[iso(2)]:[{time:'00:00',profile:'eco'}]}});
await page.setViewportSize({width:390,height:900});
for(const step of ['overview','sheet-away','sheet-keep','active','weekly','exceptions','xnew','xedit','wakes','temps']){
  await page.evaluate(step=>{const c=document.querySelector('heating-planner-card');c._sheet=null;c._xView='list';
    if(step==='sheet-away'||step==='sheet-keep'){c._tab='overview';c._sheet=step.slice(6);c._sheetDraft={temperature:15,choice:'date',date:'2030-01-01',time:1080,until:'60'};}
    else if(step==='active'){c._tab='overview';c._override={mode:'away',temperature:15,until:new Date(Date.now()+86400000*3).toISOString()};}
    else if(step==='xnew'){c._tab='exceptions';c._xView='new';c._xDraft={from:'2030-01-01',to:'2030-01-15',kind:'all',like:6,profile:'eco'};}
    else if(step==='xedit'){c._tab='exceptions';c._xView='edit';c._date=Object.keys(c._exceptions)[0];c._rangeDates=[c._date];}
    else c._tab=step;
    c.render();},step);
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'débordement mobile : '+step);
}
console.log('PASS mobile 390 px : accueil, feuilles Absent/Maintenir, mode actif, semaine, jours spéciaux (liste, ajout, édition), réveils, températures');

assert(!pageErrors.length,'erreurs JavaScript : '+pageErrors.join(' / '));
await browser.close();
console.log('TOUS LES TESTS v0.9.7 : OK');
})().catch(e=>{console.error('ÉCHEC :',e.message);process.exit(1);});
