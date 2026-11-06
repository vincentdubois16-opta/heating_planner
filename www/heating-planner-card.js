/* Heating Planner v0.9.8 — carte Lovelace sans dépendance externe.
 * Éditeur par périodes couvrant explicitement toute la journée de 00:00 à 24:00,
 * frise cliquable, copie vers plusieurs jours, un seul bouton Enregistrer avec annulation
 * pas à pas. Format de stockage inchangé : liste de points de bascule {time, profile}
 * commençant à 00:00, envoyée telle quelle à heating_planner/set_schedule et set_exceptions.
 * v0.9.7 : modes en un geste sur l'accueil (Boost, Maintenir, Absent, Reprendre), congés par
 * plage de dates, réveils visibles sur la frise du jour, onglet Températures
 * (heating_planner/set_temperatures, composant Python v0.9.7 requis pour enregistrer). */
const HP_DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const HP_SHORT=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const HP_LABELS={night:'Nuit',eco:'Éco',comfort:'Confort'};
const HP_COLORS={night:'#91b7e5',eco:'#9ad9b0',comfort:'#f5bc79'};
const HP_STEP=15;
let hpSeq=0;
const hpId=()=>`p${++hpSeq}`;
const hpMin=t=>{const m=/^(\d{2}):(\d{2})$/.exec(t||'');return m?Math.min(1440,Number(m[1])*60+Number(m[2])):0;};
const hpTime=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

/* ---------- Modèle d'édition (pur, sans DOM) ---------- */

/** Points de bascule → périodes explicites couvrant 00:00–24:00.
 * Le fond est conservé en interne uniquement pour combler une plage dégagée par une édition. */
function hpToModel(entries,fallback){
  const pts=[...(entries||[])].sort((a,b)=>a.time.localeCompare(b.time));
  const segs=[];
  pts.forEach((p,i)=>{
    const start=hpMin(p.time),end=i+1<pts.length?hpMin(pts[i+1].time):1440;
    if(end<=start)return;
    const last=segs[segs.length-1];
    if(last&&last.profile===p.profile&&last.end===start)last.end=end;
    else segs.push({start,end,profile:p.profile});
  });
  if(!segs.length)return {base:fallback,periods:[]};
  const total={};
  for(const s of segs)total[s.profile]=(total[s.profile]||0)+s.end-s.start;
  let base=segs[0].profile;
  if(segs.length>1&&segs[segs.length-1].profile!==base){
    for(const [profile,duration] of Object.entries(total))if(duration>total[base])base=profile;
  }
  return {base,periods:segs.map(s=>({id:hpId(),...s}))};
}

/** {base, periods} → points de bascule canoniques : 00:00 en premier, heures croissantes,
 *  jamais deux points consécutifs avec le même mode. */
function hpFromModel(model){
  const out=[];
  const push=(m,profile)=>{if(out.length&&out[out.length-1].profile===profile)return;out.push({time:hpTime(m),profile});};
  let cursor=0;
  for(const p of [...model.periods].sort((a,b)=>a.start-b.start)){
    if(p.end<=cursor)continue;
    const start=Math.max(p.start,cursor);
    if(start>cursor)push(cursor,model.base);
    push(start,p.profile);
    cursor=p.end;
  }
  if(cursor<1440)push(cursor,model.base);
  return out;
}

/** Plages libres (occupées par le mode de fond). */
function hpGaps(model){
  const gaps=[];let cursor=0;
  for(const p of [...model.periods].sort((a,b)=>a.start-b.start)){
    if(p.start>cursor)gaps.push({start:cursor,end:p.start});
    cursor=Math.max(cursor,p.end);
  }
  if(cursor<1440)gaps.push({start:cursor,end:1440});
  return gaps;
}

/** Trouve une place libre d'environ `len` minutes à partir de `from` (puis 06:00, puis minuit). */
function hpFindGap(model,from,len=60){
  const gaps=hpGaps(model).filter(g=>g.end-g.start>=HP_STEP);
  for(const pivot of [from,360,0]){
    for(const g of gaps){
      if(g.end<=pivot)continue;
      const start=Math.max(g.start,Math.min(pivot,g.end-Math.min(len,g.end-g.start)));
      return {start,end:Math.min(g.end,start+len)};
    }
  }
  return null;
}

/** Applique la période `x` (déjà modifiée) : elle est prioritaire sur ses voisines.
 *  Une voisine qui déborde est raccourcie, coupée en deux si `x` tombe en son milieu,
 *  supprimée si elle est entièrement recouverte. Les voisines contiguës du même mode fusionnent. */
function hpPlace(model,x){
  const report={removed:[],adjusted:[],merged:false};
  const next=[];
  for(const y of model.periods){
    if(y===x||y.end<=x.start||y.start>=x.end){next.push(y);continue;}
    if(y.start>=x.start&&y.end<=x.end){report.removed.push({...y});continue;}
    if(y.start<x.start&&y.end>x.end){
      const tail={...y,id:hpId(),start:x.end};
      y.end=x.start;next.push(y,tail);report.adjusted.push(y,tail);continue;
    }
    if(y.start<x.start)y.end=x.start;else y.start=x.end;
    next.push(y);report.adjusted.push(y);
  }
  model.periods=next.sort((a,b)=>a.start-b.start);
  report.adjusted=report.adjusted.filter(y=>model.periods.includes(y));
  return report;
}

function hpComplete(model,preferredId=null){
  const periods=[];let cursor=0;
  for(const item of [...model.periods].sort((a,b)=>a.start-b.start)){
    const p={...item,start:Math.max(cursor,Math.max(0,item.start)),end:Math.min(1440,item.end)};
    if(p.end<=p.start)continue;
    if(p.start>cursor)periods.push({id:hpId(),start:cursor,end:p.start,profile:model.base});
    periods.push(p);cursor=p.end;
  }
  if(cursor<1440)periods.push({id:hpId(),start:cursor,end:1440,profile:model.base});
  const merged=[];
  for(const period of periods){
    const previous=merged[merged.length-1];
    if(previous&&previous.end===period.start&&previous.profile===period.profile){
      previous.end=period.end;if(period.id===preferredId)previous.id=preferredId;
    }else merged.push(period);
  }
  model.periods=merged;model.base=merged[0]?.profile||model.base;
  return model;
}

window.HeatingPlannerModel={toModel:hpToModel,fromModel:hpFromModel,gaps:hpGaps,findGap:hpFindGap,place:hpPlace,complete:hpComplete};

/* ---------- Styles partagés (limités à la carte) ---------- */
const HP_STYLE=`
heating-planner-card .hp-ed .hp-summary{display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;border:0;background:transparent;padding:2px;min-height:36px;width:100%}
heating-planner-card .hp-summary>span:first-child{min-width:0;overflow-wrap:anywhere}
heating-planner-card .hp-summary small{color:var(--secondary-text-color)}
heating-planner-card .hp-summary>span:last-child{white-space:nowrap;font-size:14px}
heating-planner-card .hp-compose{margin:14px 0;padding:14px;border:1px solid var(--primary-color,#03a9f4);border-radius:12px}
heating-planner-card .hp-period-top{flex-wrap:wrap}

heating-planner-card .hp-ed{padding:0 16px 16px;color:var(--primary-text-color)}
heating-planner-card .hp-ed button,heating-planner-card .hp-ed select,heating-planner-card .hp-ed input{font:inherit;border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px 10px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222);min-height:40px;box-sizing:border-box}
heating-planner-card .hp-ed button{cursor:pointer}
heating-planner-card .hp-ed button:disabled{opacity:.45;cursor:default}
heating-planner-card .hp-ed .active,heating-planner-card .hp-ed .primary,heating-planner-card .hp-ed [aria-pressed="true"]:not(.hp-chip):not(.hp-segment){background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#fff);border-color:transparent}
heating-planner-card .hp-ed h3{font-size:15px;margin:0 0 8px}
heating-planner-card .hp-ed .actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}
heating-planner-card .hp-ed .zone{display:flex;gap:12px;margin:8px 0;align-items:center;flex-wrap:wrap}
heating-planner-card .hp-nav{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 14px}
heating-planner-card .hp-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin:6px 0}
heating-planner-card .hp-days button{padding:8px 0;min-width:0}
heating-planner-card .hp-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
heating-planner-card .hp-note{font-size:13px;color:var(--secondary-text-color);line-height:1.45;margin:8px 0}
heating-planner-card .hp-msg{font-size:13px;margin:10px 0;padding:8px 10px;border-radius:8px;background:var(--secondary-background-color,#f1f1f1);line-height:1.45}
heating-planner-card .hp-legend{font-size:12px;opacity:.85;margin-top:7px}
heating-planner-card .hp-keys{display:flex;gap:12px;flex-wrap:wrap}
heating-planner-card .hp-key{display:inline-flex;align-items:center;gap:5px}
heating-planner-card .hp-sw{width:12px;height:12px;border-radius:3px;display:inline-block}
heating-planner-card .hp-timeline{display:flex;height:48px;overflow:hidden;border-radius:10px;border:1px solid var(--divider-color,#ddd);margin:10px 0 5px}
heating-planner-card .hp-timeline .hp-segment{min-width:0;min-height:0!important;color:#15212c;font-size:11px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer;border-radius:0!important}
heating-planner-card .hp-timeline .hp-segment:disabled{opacity:1;cursor:default}
heating-planner-card .hp-timeline .hp-seg-sel{box-shadow:inset 0 0 0 3px var(--primary-text-color,#222)!important;font-weight:700}
heating-planner-card .hp-segment:focus-visible{outline:3px solid var(--primary-color);outline-offset:-3px}
heating-planner-card .hp-now{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--primary-text-color,#222);pointer-events:none}
heating-planner-card .hp-ticks{font-size:11px;opacity:.7}
heating-planner-card .hp-periods{display:flex;flex-direction:column;gap:8px;margin:12px 0}
heating-planner-card .hp-period{border:1px solid var(--divider-color,#ddd);border-left:6px solid var(--c);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px}
heating-planner-card .hp-selected{outline:2px solid var(--primary-color,#03a9f4);outline-offset:1px}
heating-planner-card .hp-period-top{display:flex;align-items:center;gap:8px}
heating-planner-card .hp-period-top select{min-width:0;flex:0 1 92px}
heating-planner-card .hp-ed .hp-del{margin-left:auto;padding:8px 12px}
heating-planner-card .hp-chips{display:flex;gap:6px;flex-wrap:wrap}
heating-planner-card .hp-ed .hp-chip{display:inline-flex;align-items:center;gap:6px;border-radius:20px}
heating-planner-card .hp-chip .hp-dot{width:10px;height:10px;border-radius:50%;background:var(--c);flex:none}
heating-planner-card .hp-ed .hp-chip[aria-pressed="true"]{background:var(--c);color:#15212c;border-color:var(--c);font-weight:600}
heating-planner-card .hp-chip small{opacity:.75}
heating-planner-card .hp-ed .hp-add{width:100%;border-style:dashed}
heating-planner-card .hp-copy{border-top:1px solid var(--divider-color,#ddd);margin-top:18px;padding-top:14px}
heating-planner-card .hp-quick{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
heating-planner-card .hp-ed .hp-past{opacity:.6}
heating-planner-card details{margin:10px 0}
heating-planner-card summary{cursor:pointer;padding:4px 0}
heating-planner-card .hp-tech{font-size:12px;color:var(--secondary-text-color)}
heating-planner-card .hp-savebar{position:sticky;bottom:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:16px -16px -16px;padding:10px 16px;background:var(--card-background-color,#fff);border-top:1px solid var(--divider-color,#ddd);border-radius:0 0 12px 12px;font-size:13px}
heating-planner-card .hp-savebar:not(.hp-dirty){position:static}
heating-planner-card .hp-savebar.hp-top{position:static;margin:0 0 16px;border:1px solid var(--warning-color,#ff9800);border-radius:12px}
heating-planner-card .hp-dirty .hp-state{color:var(--warning-color,#ff9800);font-weight:600}
heating-planner-card .hp-err{color:var(--error-color,#db4437);font-weight:600}
heating-planner-card .hp-savebtns{display:flex;gap:6px;flex-wrap:wrap}
heating-planner-card .hp-savebar button{font:inherit;border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px 10px;min-height:40px;cursor:pointer;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222)}
heating-planner-card .hp-savebar button.primary{background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#fff);border-color:transparent}
heating-planner-card .hp-savebar button:disabled{opacity:.45;cursor:default}
heating-planner-card .hp-quick-modes{border-top:1px solid var(--divider-color,#ddd);padding-top:18px}
heating-planner-card .hp-mode-buttons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
heating-planner-card .hp-home .hp-mode-buttons button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:12px 6px;border-radius:18px;min-height:84px}
heating-planner-card .hp-mode-buttons b{font-size:15px}
heating-planner-card .hp-mode-buttons small{font-size:11px;color:var(--secondary-text-color);text-align:center;line-height:1.3}
heating-planner-card .hp-qi{font-size:20px;line-height:1;--mdc-icon-size:24px}
heating-planner-card .hp-active{border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:12px;background:var(--secondary-background-color,#f1f1f1);border-left:6px solid var(--c,#03a9f4)}
heating-planner-card .hp-active-text{display:flex;gap:12px;align-items:center}
heating-planner-card .hp-active-text b{display:block;font-size:17px}
heating-planner-card .hp-active-text span{font-size:13px;color:var(--secondary-text-color)}
heating-planner-card .hp-active-actions{display:flex;gap:8px;flex-wrap:wrap}
heating-planner-card .hp-sheet{margin-top:12px;padding:14px;border:1px solid var(--primary-color,#03a9f4);border-radius:16px}
heating-planner-card .hp-sheet h3{margin:0 0 10px;font-size:16px}
heating-planner-card .hp-stepper{display:inline-flex;align-items:center;gap:8px}
heating-planner-card .hp-stepper output{min-width:86px;text-align:center;font-size:21px;font-weight:600;white-space:nowrap}
heating-planner-card .hp-stepper button{width:44px;height:44px;min-height:44px;border-radius:50%!important;font-size:22px;line-height:1;padding:0!important}
heating-planner-card .hp-opt[aria-pressed="true"]{background:var(--primary-color,#03a9f4)!important;color:var(--text-primary-color,#fff)!important;border-color:transparent!important}
heating-planner-card .hp-sub{font-size:13px;color:var(--secondary-text-color);margin:12px 0 6px}
heating-planner-card .hp-timeline .hp-wake{background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.6) 0 3px,transparent 3px 8px)!important}
heating-planner-card .hp-wake-sw{background:repeating-linear-gradient(135deg,#8a8a8a 0 2px,transparent 2px 5px);border:1px solid #8a8a8a;box-sizing:border-box}
heating-planner-card .hp-xgroup{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--divider-color,#ddd);border-radius:12px;margin:8px 0}
heating-planner-card .hp-xgroup small{display:block;color:var(--secondary-text-color);font-size:13px;margin-top:2px}
heating-planner-card .hp-mini{display:flex;height:8px;border-radius:4px;overflow:hidden;width:168px;max-width:100%;margin-top:6px}
heating-planner-card .hp-mini span{height:100%}
heating-planner-card .hp-now-badge{font-size:11px;padding:2px 8px;border-radius:10px;background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#fff);margin-left:6px;vertical-align:middle;font-weight:600}
heating-planner-card .hp-xactions{display:flex;gap:6px}
heating-planner-card .hp-radio{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--divider-color,#ddd);border-radius:12px;margin:8px 0;cursor:pointer}
heating-planner-card .hp-radio.hp-on{border-color:var(--primary-color,#03a9f4);box-shadow:0 0 0 1px var(--primary-color,#03a9f4)}
heating-planner-card .hp-ed .hp-radio input[type=radio]{min-height:0;width:18px;height:18px;margin:0}
heating-planner-card .hp-trow{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--divider-color,#ddd);border-left:6px solid var(--c);border-radius:12px;margin:8px 0}
heating-planner-card .hp-trow b{font-size:16px}
heating-planner-card .hp-trow small{display:block;color:var(--secondary-text-color);font-size:12px}
heating-planner-card .hp-warn{color:var(--warning-color,#ff9800);font-size:13px}
heating-planner-card .hp-ed h3{margin:16px 0 8px}
heating-planner-card .hp-ed .hp-compose h3{margin-top:0}
heating-planner-card .hp-ed .hp-back{border:0;background:transparent;padding:6px 0;color:var(--primary-color,#03a9f4);min-height:0}
`;

class HeatingPlannerCard extends HTMLElement {
  constructor(){
    super();
    this._dirty=new Set();this._undo=[];this._models={};this._copyTo=new Set();this._open={};
    this._msg='';this._copyMsg='';this._saveMsg='';this._saveErr='';this._saved={};
    this._xView='list';this._rangeDates=null;this._sheet=null;this._qaMsg='';
  }
  setConfig(config){this.config=config||{};}
  set hass(hass){
    this._hass=hass;
    if(this._loaded&&this._tab==='overview'){
      // Home Assistant appelle ce setter à chaque changement d'état : on ne redessine l'accueil
      // que si ses entités (ou la minute affichée) changent, et jamais pendant une saisie.
      if(this.overviewSignature()!==this._overviewSig&&!this.sheetBusy())this.renderOverview();
      if(!this._refreshing&&Date.now()-(this._lastRefresh||0)>15000)this.refreshOverview();
    }
    if(!this._loaded&&!this._loading)this.load();
  }
  overviewSignature(){
    const pick=id=>{const s=id&&this._hass?.states?.[id];return s?[s.state,s.attributes?.current_temperature,s.attributes?.hvac_action]:null;};
    return JSON.stringify([pick(this.config?.temperature_entity),pick(this.config?.heating_entity),Math.floor(Date.now()/60000)]);
  }
  sheetBusy(){
    const active=(this.getRootNode?.()||document).activeElement;
    return !!(this._sheet&&active&&this.querySelector('.hp-sheet')?.contains(active));
  }
  async load(){
    this._loading=true;
    try{
      const zones=await this._hass.callWS({type:'heating_planner/list'});
      const room = this.config.room;
      const zone = room ? zones.find(candidate => candidate.name === room) : zones[0];
      this._entry = this.config.entry_id || zone?.entry_id;
      if (!this._entry && room) throw Error('Pièce introuvable : ' + room);
      if(!this._entry)throw Error('Aucune zone Heating Planner');
      const data=await this._hass.callWS({type:'heating_planner/get',entry_id:this._entry});
      this._effective=data.effective||{};
      this._modeTemperatures=data.mode_temperatures||{away:15,boost:21};
      this._permissions=data.permissions;
      this._name=data.name;
      this._override=data.override||{mode:'planning'};
      this._weekly=data.weekly;
      this._exceptions=data.exceptions||{};
      this._tab=this._tab||'overview';
      const wakes=await this._hass.callWS({type:'heating_planner/get_wakes'});
      this._wakes=wakes.events;this._zones=wakes.zones;this._wakeIdx=this._wakeIdx||0;this._wakeDay=this._wakeDay||0;
      this._date=this._date||this.todayIso();
      this._profiles=data.profiles;
      this._temps=this.tempsFrom(data);
      this._preheatMinutes=data.preheat_minutes||0;
      if(this._tab==='modes')this._tab='overview';
      this._saved=this.clone({weekly:this._weekly,exceptions:this._exceptions,wakes:this._wakes,temperatures:this._temps});
      this._day=this._day??(new Date().getDay()+6)%7;
      this._dirty=new Set();this._undo=[];this._models={};this._newPeriod=null;this._newError='';this._sel=null;this._copyTo=new Set();
      this._msg='';this._copyMsg='';this._saveErr='';this._confirmDiscard=false;this._xDraft=null;
      if(this._xView==='new')this._xView='list';
      if(this._rangeDates)this._rangeDates=this._rangeDates.filter(d=>this._exceptions[d]);
      this._loaded=true;
      this.render();
    }catch(e){this.innerHTML=`<ha-card><div style="padding:16px">Heating Planner : ${this.escape(e.message)}</div></ha-card>`;}
    finally{this._loading=false;}
  }
  async refreshOverview(){
    if(this._saving)return;
    const generation=this._savedGeneration||0;
    this._refreshing=true;this._lastRefresh=Date.now();
    try{
      const data=await this._hass.callWS({type:'heating_planner/get',entry_id:this._entry});
      if(generation!==(this._savedGeneration||0))return;
      this._permissions=data.permissions;
      this._override=data.override||{mode:'planning'};
      this._saved.weekly=this.clone(data.weekly);this._saved.exceptions=this.clone(data.exceptions||{});
      if(this._tab==='overview'&&!this._dirty.has('weekly'))this._weekly=this.clone(this._saved.weekly);
      if(this._tab==='overview'&&!this._dirty.has('exceptions'))this._exceptions=this.clone(this._saved.exceptions);
      this._profiles=data.profiles||this._profiles;
      this._saved.temperatures=this.tempsFrom(data);
      if(!this._dirty.has('temperatures'))this._temps=this.clone(this._saved.temperatures);
      this._effective=data.effective||{};
      this._modeTemperatures=data.mode_temperatures||{away:15,boost:21};
      if(this._tab==='overview'&&!this.sheetBusy())this.renderOverview();
    }catch(_){/* Garder le dernier affichage ; Home Assistant réessaiera. */}
    finally{this._refreshing=false;}
  }

  /* ---------- Utilitaires ---------- */
  escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  todayIso(){return new Date().toLocaleDateString('en-CA');}
  weekdayOf(iso){return (new Date(`${iso}T12:00:00`).getDay()+6)%7;}
  formatDate(iso,short){
    const d=new Date(`${iso}T12:00:00`);
    if(Number.isNaN(d.getTime()))return iso;
    const opts=short?{weekday:'short',day:'numeric',month:'short'}:{weekday:'long',day:'numeric',month:'long'};
    if(d.getFullYear()!==new Date().getFullYear())opts.year='numeric';
    return d.toLocaleDateString('fr-BE',opts);
  }
  label(p){return HP_LABELS[p]||p;}
  /** Accueil : températures enregistrées. Éditeurs : températures du brouillon (onglet Températures). */
  temp(p){
    const source=this._tab==='overview'?this._profiles:(this._temps?.profiles||this._profiles);
    const v=Number(source?.[p]);return Number.isFinite(v)?`${v.toLocaleString('fr-BE',{maximumFractionDigits:1})}°`:'';
  }
  degrees(v){return `${Number(v).toLocaleString('fr-BE',{minimumFractionDigits:1,maximumFractionDigits:1})} °C`;}
  tempsFrom(data){
    const profiles=this.clone(data.profiles||{});
    return {profiles,away:Number(data.mode_temperatures?.away??15),boost:Number(data.mode_temperatures?.boost??profiles.comfort??21)};
  }
  icon(mdi,emoji){
    return customElements.get('ha-icon')?`<ha-icon class="hp-qi" icon="${mdi}"></ha-icon>`:`<span class="hp-qi" aria-hidden="true">${emoji}</span>`;
  }
  nextIso(iso){const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+1);return d.toLocaleDateString('en-CA');}
  sortExceptions(){this._exceptions=Object.fromEntries(Object.entries(this._exceptions).sort(([a],[b])=>a.localeCompare(b)));}
  profileClass(profile){
    const p=String(profile).toLowerCase();
    return p.includes('night')||p.includes('nuit')?'hp-night':p.includes('eco')||p.includes('éco')?'hp-eco':'hp-comfort';
  }
  color(p){return HP_COLORS[p]||{'hp-night':HP_COLORS.night,'hp-eco':HP_COLORS.eco,'hp-comfort':HP_COLORS.comfort}[this.profileClass(p)];}
  firstProfile(){return Object.keys(this._profiles||{})[0];}
  defaultProfile(base,avoid=[]){
    const keys=Object.keys(this._profiles||{});
    const order=['comfort','eco','night',...keys].filter(p=>keys.includes(p)&&p!==base);
    return order.find(p=>!avoid.includes(p))||order[0]||base;
  }
  neighbourProfiles(model,start,end){
    return model.periods.filter(p=>p.end===start||p.start===end).map(p=>p.profile);
  }
  isOpen(key){return this._open[key]?'open':'';}
  clone(value){return JSON.parse(JSON.stringify(value));}
  canSave(){return this._permissions?.edit??this._hass?.user?.is_admin??false;}
  canControl(){return this._permissions?.control??this._hass?.user?.is_admin??false;}
  connectedCallback(){this._beforeUnload=e=>{if(this._dirty.size){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',this._beforeUnload);}
  disconnectedCallback(){window.removeEventListener('beforeunload',this._beforeUnload);}
  recomputeDirty(){
    for(const [part,value] of Object.entries({weekly:this._weekly,exceptions:this._exceptions,wakes:this._wakes,temperatures:this._temps})){
      if(JSON.stringify(value)===JSON.stringify(this._saved[part]))this._dirty.delete(part);else this._dirty.add(part);
    }
  }
  applyRights(){
    const editor=['weekly','exceptions','wakes','temps'].includes(this._tab);
    if(editor&&(!this.canSave()||this._saving)){
      this.querySelectorAll('.hp-ed input,.hp-ed select,.hp-ed [data-choice],.hp-ed [data-delete],.hp-ed [data-insert],.hp-ed [data-tstep],.hp-ed [data-xdel],#addperiod,#confirmperiod,#newexception,#deleteexception,#clearpast,#copyapply,#addwake,#deletewake,#savedate,#disabledate,#clearwakedate,#xnew,#xconfirm,#xsingle').forEach(el=>el.disabled=true);
      for(const id of ['exceptiondate','xopendate','xopen']){const el=this.querySelector('#'+id);if(el)el.disabled=!!this._saving;}
    }
    if(this._tab==='overview'&&(!this.canControl()||this._modeBusy))this.querySelectorAll('.hp-quick-modes button:not([data-qa="close"]),.hp-quick-modes input,.hp-quick-modes select').forEach(el=>el.disabled=true);
  }

  /* ---------- Brouillon, annulation, enregistrement unique ---------- */
  dayKey(){return this._tab==='exceptions'?`x${this._date}`:`w${this._day}`;}
  entriesOf(key){return key[0]==='x'?this._exceptions[key.slice(1)]:this._weekly[key.slice(1)];}
  setEntries(key,entries){
    if(key[0]!=='x'){this._weekly[key.slice(1)]=entries;return;}
    // Une plage de congés ouverte depuis la liste se modifie d'un bloc (tous ses jours).
    const date=key.slice(1),dates=this._rangeDates?.includes(date)?this._rangeDates:[date];
    for(const d of dates)this._exceptions[d]=d===date?entries:this.clone(entries);
  }
  partOf(key){return key[0]==='x'?'exceptions':'weekly';}
  model(key){
    const src=JSON.stringify(this.entriesOf(key)||[]);
    const cached=this._models[key];
    if(cached&&cached.src===src)return cached;
    return (this._models[key]={...hpToModel(this.entriesOf(key),this.firstProfile()),src});
  }
  snapshot(){return JSON.stringify({w:this._weekly,x:this._exceptions,k:this._wakes,t:this._temps,m:this._models,d:[...this._dirty]});}
  restore(s){const o=JSON.parse(s);this._weekly=o.w;this._exceptions=o.x;this._wakes=o.k;this._temps=o.t;this._models=o.m;this._dirty=new Set(o.d);this.recomputeDirty();}
  mutate(part,fn){
    if(this._saving||!this.canSave())return;
    this._undo.push(this.snapshot());
    if(this._undo.length>50)this._undo.shift();
    this._msg='';this._copyMsg='';this._saveMsg='';this._saveErr='';this._confirmDiscard=false;
    fn();
    this._dirty.add(part);
  }
  edit(key,fn){
    if(this._saving||!this.canSave())return;
    this._msg='';
    const candidate=this.clone(this.model(key));fn(candidate);hpComplete(candidate,this._sel);
    const entries=hpFromModel(candidate),feedback=this._msg;
    if(entries.length>48){this._msg='Cette journée contient trop de changements de température. La modification n’a pas été appliquée.';this.render();return;}
    this.mutate(this.partOf(key),()=>{
      this.setEntries(key,entries);candidate.src=JSON.stringify(entries);this._models[key]=candidate;this._msg=feedback;
    });
    this.render();
  }
  undo(){
    if(this._saving||!this.canSave())return;
    const s=this._undo.pop();
    if(!s)return;
    this.restore(s);
    this._msg='Dernière modification annulée.';this._copyMsg='';this._saveErr='';this._confirmDiscard=false;
    this.render();
  }
  discard(){
    if(this._saving)return;
    if(!this._confirmDiscard){this._confirmDiscard=true;this.render();return;}
    this._confirmDiscard=false;this._loaded=false;this.load();
  }
  async saveAll(){
    if(this._newPeriod){this._saveErr='Ajoutez ou fermez la période en préparation avant d’enregistrer.';this.render();return;}
    if(this._saving||!this.canSave()||!this._dirty.size)return;
    this._saving=true;this._saveErr='';this._confirmDiscard=false;this._savedGeneration=(this._savedGeneration||0)+1;
    const captured=this.clone({weekly:this._weekly,exceptions:this._exceptions,wakes:this._wakes,temperatures:this._temps});
    const parts=['temperatures','weekly','exceptions','wakes'].filter(part=>this._dirty.has(part));
    this.render();
    try{
      for(const part of parts){
        const t=captured.temperatures;
        const message=part==='temperatures'?{type:'heating_planner/set_temperatures',entry_id:this._entry,profiles:t.profiles,away_temperature:t.away,boost_temperature:t.boost}
          :part==='weekly'?{type:'heating_planner/set_schedule',entry_id:this._entry,weekly:captured.weekly}:part==='exceptions'?{type:'heating_planner/set_exceptions',entry_id:this._entry,exceptions:captured.exceptions}:{type:'heating_planner/set_wakes',events:captured.wakes};
        await this._hass.callWS(message);
        this._saved[part]=this.clone(captured[part]);this.recomputeDirty();
        if(part==='temperatures'){this._profiles=this.clone(t.profiles);this._modeTemperatures={away:t.away,boost:t.boost};}
        this._undo=[];
      }
      this._saveMsg='✓ Modifications enregistrées';
    }catch(e){
      const reason=e?.code==='unknown_command'?'le composant Python doit être en v0.9.7 (puis redémarrer Home Assistant) pour enregistrer les températures':String(e?.message||e);
      this._saveErr='Enregistrement incomplet : '+reason+'. Les changements restants sont conservés.';
    }finally{
      this._saving=false;this._savedGeneration++;this.render();this.refreshOverview();
    }
  }
  saveBar(top=false){
    const names={temperatures:'températures',weekly:'semaine',exceptions:'jours spéciaux',wakes:'réveils'};
    const parts=['temperatures','weekly','exceptions','wakes'].filter(p=>this._dirty.has(p)).map(p=>names[p]);
    if(!parts.length){
      return `<div class="hp-savebar${top?' hp-top':''}" role="status"><span class="hp-state">${this.escape(this._newPeriod?'Une période est en préparation — validez avec Ajouter':this._saveMsg||'✓ Tout est enregistré')}</span></div>`;
    }
    const can=this.canSave();
    const state=this._saveErr?`<span class="hp-err">${this.escape(this._saveErr)}</span>`
      :`<span class="hp-state">● Non enregistré : ${parts.join(', ')}</span>${can?'':'<span class="hp-note"> Seul un administrateur peut enregistrer.</span>'}`;
    return `<div class="hp-savebar hp-dirty${top?' hp-top':''}" role="status"><div>${state}</div><div class="hp-savebtns">
      <button type="button" data-act="undo" data-fk="act-undo" ${this._undo.length&&!this._saving?'':'disabled'}>↶ Annuler</button>
      <button type="button" data-act="discard" data-fk="act-discard" ${this._saving?"disabled":""}>${this._confirmDiscard?'Confirmer l’abandon':'Abandonner les changements'}</button>
      <button type="button" data-act="save" data-fk="act-save" class="primary" ${can&&!this._saving?'':'disabled'}>${this._saving?'Enregistrement…':'Enregistrer'}</button></div></div>`;
  }
  bindSaveBar(){
    const actions={undo:()=>this.undo(),discard:()=>this.discard(),save:()=>this.saveAll()};
    this.querySelectorAll('.hp-savebar [data-act]').forEach(b=>b.onclick=()=>actions[b.dataset.act]());
  }
  refreshSaveBar(){
    const old=this.querySelector('.hp-savebar');
    if(!old)return;
    const holder=document.createElement('div');
    holder.innerHTML=this.saveBar(old.classList.contains('hp-top'));
    old.replaceWith(holder.firstElementChild);
    this.bindSaveBar();
  }
  touch(part){this.mutate(part,()=>{});}

  /* ---------- Rendu commun ---------- */
  render(){
    const root=this.getRootNode?.()||document;
    const active=root.activeElement;
    const fk=active&&this.contains(active)?active.dataset?.fk:null;
    if(this._tab==='modes')this._tab='overview';
    if(this._tab==='overview')this.renderOverview();
    else if(this._tab==='wakes')this.renderWakes();
    else if(this._tab==='temps')this.renderTemps();
    else if(this._tab==='exceptions'&&this._xView!=='edit')this.renderSpecial();
    else this.renderEditor();
    this.applyRights();
    if(fk)this.querySelector(`[data-fk="${CSS.escape(fk)}"]`)?.focus({preventScroll:true});
  }
  nav(current){
    const tabs=[['overview','Accueil'],['weekly','Semaine'],['exceptions','Jours spéciaux'],['wakes','Réveils'],['temps','Températures']];
    return `<nav class="hp-nav">${tabs.map(([t,l])=>`<button type="button" id="tab${t}" class="${t===current?'active':''}" ${t===current?'aria-current="page"':''}>${l}</button>`).join('')}</nav>`;
  }
  bindCommon(){
    for(const t of ['overview','weekly','exceptions','wakes','temps']){
      const b=this.querySelector(`#tab${t}`);
      if(b)b.onclick=()=>{this._newPeriod=null;this._tab=t;this._sel=null;this._msg='';this._copyMsg='';this._confirmDiscard=false;this._sheet=null;if(t==='exceptions'){this._xView='list';this._xDraft=null;}this.render();};
    }
    this.querySelectorAll('details[data-dk]').forEach(d=>d.ontoggle=()=>{this._open[d.dataset.dk]=d.open;});
    this.bindSaveBar();this.applyRights();
  }
  timeline(entries,label,opts={}){
    const ordered=[...(entries||[])].sort((a,b)=>a.time.localeCompare(b.time));
    // opts.segments : plages déjà calculées (accueil : planning + réveils), sinon dérivées des points.
    const list=opts.segments||ordered.map((e,i)=>({start:hpMin(e.time),end:i+1<ordered.length?hpMin(ordered[i+1].time):1440,profile:e.profile}));
    const sel=opts.selected;
    const segments=list.map((s,i)=>{
      const {start,end}=s,duration=Math.max(0,end-start);
      const on=sel&&start>=sel.start&&end<=sel.end;
      const name=this.label(s.profile),wake=s.wake?this.escape(s.wake.name):'';
      const title=`${hpTime(start)}–${hpTime(end)} · ${s.wake?`${wake} · `:''}${this.escape(name)} ${this.temp(s.profile)}`;
      const aria=s.wake?`Réveil ${wake} : ${this.escape(name)} de ${hpTime(start)} à ${hpTime(end)}`:`${this.escape(name)} de ${hpTime(start)} à ${hpTime(end)}`;
      return `<button type="button" class="hp-segment ${this.profileClass(s.profile)}${on?' hp-seg-sel':''}${s.wake?' hp-wake':''}" data-segment="${i}" ${s.wake?`data-wake="${s.wake.idx}"`:''} data-fk="segment-${start}" data-start="${start}" data-end="${end}" ${opts.readonly?'disabled tabindex="-1"':''} style="position:absolute;left:${start/1440*100}%;width:${duration/1440*100}%;height:100%;box-sizing:border-box;padding:0;border:0;min-width:0;box-shadow:inset -1px 0 #ffffff55;background:${this.color(s.profile)}" title="${title}" aria-label="${aria}">${duration>=100?(s.wake?'Réveil':this.escape(name)):''}</button>`;
    }).join('');
    const now=opts.now!=null?`<div class="hp-now" style="left:${opts.now/1440*100}%" aria-hidden="true"></div>`:'';
    const keys=Object.keys(this._profiles||{}).map(p=>`<span class="hp-key"><span class="hp-sw" style="background:${this.color(p)}"></span>${this.escape(this.label(p))} ${this.temp(p)}</span>`).join('')
      +(list.some(s=>s.wake)?'<span class="hp-key"><span class="hp-sw hp-wake-sw"></span>Réveil</span>':'');
    return `<div class="hp-legend"><b>${this.escape(label)}</b>${opts.hint?` · ${this.escape(opts.hint)}`:''}</div><div class="hp-timeline" style="position:relative">${segments}${now}</div><div class="hp-ticks" style="position:relative;height:16px;display:block;margin:0 1px"><span style="position:absolute;left:0">00:00</span><span style="position:absolute;left:25%;transform:translateX(-50%)">06:00</span><span style="position:absolute;left:50%;transform:translateX(-50%)">12:00</span><span style="position:absolute;left:75%;transform:translateX(-50%)">18:00</span><span style="position:absolute;right:0">24:00</span></div><div class="hp-legend hp-keys">${keys}</div>`;
  }
  scrollToSelection(){this.querySelector('.hp-period.hp-selected')?.scrollIntoView({block:'nearest',behavior:'smooth'});}

  /* ---------- Éditeur Semaine / Jours spéciaux ---------- */
  chips(selected,attrs,fkPrefix){
    return `<div class="hp-chips" role="group" aria-label="Température souhaitée">${Object.keys(this._profiles).map(p=>`<button type="button" class="hp-chip" ${attrs} data-choice="${this.escape(p)}" data-fk="${fkPrefix}:${this.escape(p)}" aria-pressed="${p===selected}" style="--c:${this.color(p)}"><span class="hp-dot"></span>${this.escape(this.label(p))} <small>${this.temp(p)}</small></button>`).join('')}</div>`;
  }
  timeSelect(value,field,id,locked=false){
    const values=new Set([value]);
    const [lo,hi]=field==='start'?[0,1440-HP_STEP]:[HP_STEP,1440];
    for(let m=lo;m<=hi;m+=HP_STEP)values.add(m);
    return `<select ${locked?'disabled':''} data-period="${id}" data-field="${field}" data-fk="${id}:${field}" aria-label="${field==='start'?'Heure de début':'Heure de fin'}">${[...values].sort((a,b)=>a-b).map(m=>`<option value="${m}" ${m===value?'selected':''}>${hpTime(m)}</option>`).join('')}</select>`;
  }
  newPeriodHtml(key){
    const draft=this._newPeriod;
    if(!draft||draft.key!==key)return '';
    return `<section class="hp-compose" aria-label="Ajouter une période"><h3>Nouvelle période</h3>
      <div class="hp-row"><span>De</span>${this.timeSelect(draft.start,'start','new')}<span>à</span>${this.timeSelect(draft.end,'end','new')}</div>
      ${this.chips(draft.profile,'data-new-profile="1"','new')}
      <p class="hp-note">Cette période remplacera les horaires entre ces deux heures. Vous pourrez annuler.</p>
      ${this._newError?`<p class="hp-err" role="alert">${this.escape(this._newError)}</p>`:''}
      <div class="actions"><button id="cancelperiod" type="button">Fermer</button><button id="confirmperiod" type="button" class="primary">Ajouter</button></div></section>`;
  }
  dayEditorHtml(key,title){
    const m=this.model(key),selected=m.periods.find(p=>p.id===this._sel);
    const rows=m.periods.map(p=>`<div class="hp-period${p.id===this._sel?' hp-selected':''}" data-period-row="${p.id}" style="--c:${this.color(p.profile)}">
      <button class="hp-summary" data-select-period="${p.id}" data-fk="select-${p.id}" aria-expanded="${p.id===this._sel&&!this._newPeriod}" type="button"><span><b>${this.escape(this.label(p.profile))}</b> <small>${this.temp(p.profile)}</small></span><span>${hpTime(p.start)} – ${hpTime(p.end)}</span></button>
      ${p.id===this._sel&&!this._newPeriod?`<div class="hp-period-top"><span>De</span>${this.timeSelect(p.start,'start',p.id,p.start===0)}<span>à</span>${this.timeSelect(p.end,'end',p.id,p.end===1440)}</div>
      ${this.chips(p.profile,`data-period="${p.id}"`,p.id)}
      <div class="actions"><button type="button" data-insert="${p.id}">+ Ajouter dans cette période</button><button type="button" data-delete="${p.id}" ${m.periods.length===1?'disabled':''}>Supprimer</button></div>`:''}</div>`).join('');
    return `${this.timeline(this.entriesOf(key),title,{selected,hint:'choisissez une période pour la modifier'})}
      ${this._msg?`<p class="hp-msg" role="status">${this.escape(this._msg)}</p>`:''}
      ${this.newPeriodHtml(key)}<div class="hp-periods">${rows}</div><button type="button" id="addperiod" class="hp-add">+ Ajouter une période</button>`;
  }
  copyHtml(){
    const n=this._copyTo.size;
    return `<details class="hp-copy" data-dk="copy" ${this.isOpen('copy')}><summary>Copier le ${HP_DAYS[this._day].toLowerCase()} vers d’autres jours</summary>
      <div class="hp-days">${HP_SHORT.map((d,i)=>`<button type="button" data-copyday="${i}" data-fk="copy${i}" aria-label="${HP_DAYS[i]}" aria-pressed="${this._copyTo.has(i)}" ${i===this._day?'disabled':''}>${d}</button>`).join('')}</div>
      <div class="hp-quick"><button type="button" data-quick="week">Lun–Ven</button><button type="button" data-quick="weekend">Week-end</button><button type="button" data-quick="all">Toute la semaine</button>${n?'<button type="button" data-quick="none">Aucun</button>':''}</div>
      <button type="button" id="copyapply" class="primary" data-fk="copyapply" ${n?'':'disabled'}>${n?`Copier vers ${n} jour${n>1?'s':''}`:'Choisissez les jours'}</button>
      ${this._copyMsg?`<p class="hp-msg" role="status">${this.escape(this._copyMsg)}</p>`:''}</details>`;
  }
  describe(report){
    const fmt=y=>`${this.label(y.profile)} ${hpTime(y.start)}–${hpTime(y.end)}`;
    const parts=[];
    if(report.adjusted.length)parts.push(`Ajusté pour éviter un chevauchement : ${report.adjusted.map(fmt).join(', ')}.`);
    if(report.removed.length)parts.push(`Remplacé : ${report.removed.map(fmt).join(', ')}.`);
    if(report.merged)parts.push('Fusionné avec la période voisine du même mode.');
    return parts.join(' ');
  }
  addPeriod(key,from){
    if(this._saving||!this.canSave())return;
    const model=this.model(key),host=model.periods.find(p=>p.start<=from&&from<p.end);
    const start=Math.max(0,Math.min(1440-HP_STEP,Number.isFinite(from)?from:420));
    this._newPeriod={key,start,end:Math.min(1440,start+60),profile:this.defaultProfile(host?.profile||model.base)};
    this._newError='';this.render();this.querySelector('.hp-compose')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  confirmPeriod(key){
    const draft=this._newPeriod;if(!draft||draft.key!==key||this._saving||!this.canSave())return;
    if(!Number.isInteger(draft.start)||!Number.isInteger(draft.end)||draft.start<0||draft.end>1440||draft.start>=draft.end){this._newError='L’heure de fin doit être après l’heure de début.';this.render();return;}
    const candidate=this.clone(this.model(key));
    const period={id:hpId(),start:draft.start,end:draft.end,profile:draft.profile};candidate.periods.push(period);hpPlace(candidate,period);hpComplete(candidate,period.id);
    if(JSON.stringify(hpFromModel(candidate))===JSON.stringify(hpFromModel(this.model(key)))){this._newPeriod=null;this._msg='Cette température est déjà prévue pour ces heures.';this.render();return;}
    if(hpFromModel(candidate).length>48){this._newError='Cette journée contient trop de changements de température.';this.render();return;}
    this._newPeriod=null;this._sel=period.id;
    this.edit(key,m=>{m.periods=candidate.periods;m.base=candidate.base;this._msg='Période ajoutée. Vous pouvez encore modifier ses heures ou sa température.';});
    this.scrollToSelection();
  }
  renderEditor(){
    const isX=this._tab==='exceptions';
    if(isX&&!/^\d{4}-\d{2}-\d{2}$/.test(this._date||''))this._date=this.todayIso();
    const key=this.dayKey();
    const dayIdx=isX?this.weekdayOf(this._date):this._day;
    const dayName=HP_DAYS[dayIdx].toLowerCase();
    const entries=this.entriesOf(key);
    let head,main,tail='';
    if(isX){
      const range=(this._rangeDates||[]).filter(d=>this._exceptions[d]);
      const multi=!!entries&&range.length>1&&range.includes(this._date);
      const span=multi?this.rangeText(range[0],range[range.length-1]):'';
      head=`<button type="button" class="hp-back" id="xback">← Tous les jours spéciaux</button>
        ${multi?`<p class="hp-msg">Vous modifiez les ${range.length} jours ${this.escape(span)} en une seule fois.</p>
        <div class="actions"><button type="button" id="xsingle">Ne modifier que le ${this.escape(this.formatDate(this._date,true))}</button><button type="button" id="deleteexception" data-fk="xdel">Supprimer ces ${range.length} jours</button></div>`
        :`<div class="hp-row"><label>Date <input type="date" id="exceptiondate" data-fk="xdate" value="${this.escape(this._date)}"></label>
        ${entries?'<button type="button" id="deleteexception" data-fk="xdel">Revenir au planning habituel</button>':'<button type="button" id="newexception" class="primary" data-fk="xnew">Personnaliser cette date</button>'}</div>
        <p class="hp-note">${entries?`Le ${this.escape(this.formatDate(this._date))}, l’horaire ci-dessous remplace celui du ${dayName}.`:`Le ${this.escape(this.formatDate(this._date))}, le planning habituel du ${dayName} s’applique.`}</p>`}`;
      main=entries?this.dayEditorHtml(key,multi?this.cap(span):this.formatDate(this._date)):this.timeline(this._weekly[String(dayIdx)],`Aperçu : ${dayName} habituel`,{readonly:true});
    }else{
      head=`<div class="hp-days" role="group" aria-label="Jour">${HP_SHORT.map((d,i)=>`<button type="button" data-day="${i}" data-fk="day${i}" class="${i===this._day?'active':''}" aria-pressed="${i===this._day}" aria-label="${HP_DAYS[i]}">${d}</button>`).join('')}</div>`;
      main=this.dayEditorHtml(key,HP_DAYS[this._day]);
      tail=this.copyHtml();
    }
    const strategy=this._effective?.preheat_strategy;
    const minutes=this.escape(this._preheatMinutes);
    const tech=strategy==='dynamic'?`Préchauffage dynamique (secours fixe : ${minutes} min).`
      :strategy==='fixed_fallback'?`Préchauffage dynamique, secours fixe utilisé : ${minutes} min (température ou vitesse indisponible/invalide).`
      :`Préchauffage fixe : ${minutes} min.`;
    this.innerHTML=`<ha-card header="${this.escape(this._name)}"><div class="hp-ed">${this.nav(this._tab)}${this.canSave()?'':'<p class="hp-note">Lecture seule : un administrateur peut modifier ces horaires.</p>'}${head}${main}${tail}
      <details class="hp-tech" data-dk="tech" ${this.isOpen('tech')}><summary>Préchauffage</summary><p>${tech} Les températures Nuit, Éco et Confort se règlent dans l’onglet Températures ; le préchauffage dans Paramètres → Appareils et services → Heating Planner → Configurer.</p></details>
      ${this.saveBar()}</div></ha-card><style>${HP_STYLE}</style>`;
    this.bindCommon();
    if(isX)this.bindExceptions(dayIdx);
    else this.bindWeekly();
    if(entries)this.bindDayEditor(key);
  }
  bindWeekly(){
    this.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{
      this._newPeriod=null;this._day=Number(b.dataset.day);this._sel=null;this._msg='';this._copyMsg='';this._copyTo=new Set();this.render();
    });
    this.querySelectorAll('[data-copyday]').forEach(b=>b.onclick=()=>{
      const d=Number(b.dataset.copyday);
      if(this._copyTo.has(d))this._copyTo.delete(d);else this._copyTo.add(d);
      this._copyMsg='';this.render();
    });
    const presets={week:[0,1,2,3,4],weekend:[5,6],all:[0,1,2,3,4,5,6],none:[]};
    this.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{
      this._copyTo=new Set(presets[b.dataset.quick].filter(d=>d!==this._day));this._copyMsg='';this.render();
    });
    this.querySelector('#copyapply').onclick=()=>{
      const targets=[...this._copyTo].sort();
      if(!targets.length)return;
      this.mutate('weekly',()=>{
        for(const d of targets)this._weekly[String(d)]=this._weekly[String(this._day)].map(e=>({...e}));
        this._copyMsg=`${HP_DAYS[this._day]} copié vers ${targets.map(d=>HP_DAYS[d].toLowerCase()).join(', ')}.`;
      });
      this._copyTo=new Set();this.render();
    };
  }
  bindExceptions(dayIdx){
    const $=id=>this.querySelector(`#${id}`);
    $('xback').onclick=()=>{this._newPeriod=null;this._xView='list';this._rangeDates=null;this._sel=null;this._msg='';this.render();};
    if($('xsingle'))$('xsingle').onclick=()=>{this._newPeriod=null;this._rangeDates=[this._date];this._msg=`Seul le ${this.formatDate(this._date)} sera modifié.`;this.render();};
    if($('exceptiondate'))$('exceptiondate').onchange=e=>{if(!e.target.value)return;this._newPeriod=null;this._date=e.target.value;this._rangeDates=[e.target.value];this._sel=null;this._msg='';this.render();};
    if($('newexception'))$('newexception').onclick=()=>{
      this.mutate('exceptions',()=>{
        this._exceptions[this._date]=this._weekly[String(dayIdx)].map(e=>({...e}));this.sortExceptions();
        this._msg=`Horaire personnalisé créé à partir du ${HP_DAYS[dayIdx].toLowerCase()}. Modifiez-le ci-dessous.`;
      });
      this._rangeDates=[this._date];this.render();
    };
    if($('deleteexception'))$('deleteexception').onclick=()=>{
      const range=(this._rangeDates||[]).filter(d=>this._exceptions[d]);
      if(range.length>1&&range.includes(this._date)){
        this.mutate('exceptions',()=>{for(const d of range)delete this._exceptions[d];
          this._msg=`${this.cap(this.rangeText(range[0],range[range.length-1]))} : ${range.length} jours supprimés, le planning de la semaine s’applique de nouveau. « ↶ Annuler » pour revenir en arrière.`;});
        this._newPeriod=null;this._xView='list';this._rangeDates=null;this._sel=null;this.render();return;
      }
      this.mutate('exceptions',()=>{delete this._exceptions[this._date];this._msg='Cette date suit de nouveau le planning habituel.';});
      this._sel=null;this.render();
    };
  }

  /* ---------- Jours spéciaux : liste groupée par plages et ajout « du… au… » ---------- */
  cap(text){return text?text[0].toUpperCase()+text.slice(1):text;}
  dot(text){return /\.$/.test(text)?text:`${text}.`;}
  rangeText(a,b){return a===b?`le ${this.formatDate(a,true)}`:`du ${this.formatDate(a,true)} au ${this.formatDate(b,true)}`;}
  datesBetween(from,to){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||to<from)return [];
    const out=[];for(let d=from;d<=to&&out.length<=400;d=this.nextIso(d))out.push(d);
    return out;
  }
  describeDay(entries){
    if(!entries?.length)return '';
    if(entries.length===1)return `Toute la journée en ${this.label(entries[0].profile)} ${this.temp(entries[0].profile)}`;
    const json=JSON.stringify(entries);
    const same=[6,5,0,1,2,3,4].find(i=>JSON.stringify(this._weekly[String(i)])===json);
    return same!==undefined?`Comme un ${HP_DAYS[same].toLowerCase()}`:'Horaire personnalisé';
  }
  /** Jours consécutifs ayant exactement le même horaire = une plage. */
  specialGroups(){
    const groups=[];
    for(const d of Object.keys(this._exceptions).sort()){
      const json=JSON.stringify(this._exceptions[d]),last=groups[groups.length-1];
      if(last&&last.json===json&&this.nextIso(last.end)===d){last.end=d;last.dates.push(d);}
      else groups.push({start:d,end:d,dates:[d],json});
    }
    return groups;
  }
  miniBar(entries){
    const ordered=[...(entries||[])].sort((a,b)=>a.time.localeCompare(b.time));
    return `<div class="hp-mini" aria-hidden="true">${ordered.map((e,i)=>{const s=hpMin(e.time),end=i+1<ordered.length?hpMin(ordered[i+1].time):1440;return `<span style="width:${(end-s)/1440*100}%;background:${this.color(e.profile)}"></span>`;}).join('')}</div>`;
  }
  specialDraft(){
    const d=this._xDraft,dates=this.datesBetween(d.from,d.to);
    const replaced=dates.filter(x=>this._exceptions[x]).length;
    const entries=d.kind==='all'?[{time:'00:00',profile:d.profile}]:this.clone(this._weekly[String(d.like)]);
    const total=Object.keys(this._exceptions).length-replaced+dates.length;
    const error=!d.from||!d.to?'Choisissez la date de début et la date de fin.'
      :d.to<d.from?'La date de fin doit être le même jour ou après la date de début.'
      :dates.length>366?'Une plage peut compter 366 jours au maximum.'
      :total>366?'Pas plus de 366 jours spéciaux au total : retirez d’abord les jours passés.':'';
    return {dates,replaced,entries,error};
  }
  specialFormHtml(){
    const d=this._xDraft,{dates,replaced,entries,error}=this.specialDraft(),n=dates.length;
    return `<section class="hp-compose" aria-label="Ajouter des jours spéciaux"><h3>Ajouter des congés ou jours spéciaux</h3>
      <div class="hp-row"><label>Du <input type="date" id="xfrom" data-fk="xfrom" value="${this.escape(d.from)}"></label><label>au <input type="date" id="xto" data-fk="xto" value="${this.escape(d.to)}" min="${this.escape(d.from)}"></label></div>
      <p class="hp-sub">Ces jours-là, chauffer…</p>
      <label class="hp-radio${d.kind==='like'?' hp-on':''}"><input type="radio" name="xkind" value="like" ${d.kind==='like'?'checked':''}> comme un <select id="xlike" data-fk="xlike" aria-label="Jour de référence">${HP_DAYS.map((name,i)=>`<option value="${i}" ${i===d.like?'selected':''}>${name.toLowerCase()}</option>`).join('')}</select></label>
      <div class="hp-radio${d.kind==='all'?' hp-on':''}"><label><input type="radio" name="xkind" value="all" ${d.kind==='all'?'checked':''}> toute la journée en</label>${this.chips(d.kind==='all'?d.profile:null,'data-xprofile="1"','xprofile')}</div>
      <p class="hp-sub">Aperçu d’une journée</p>${this.miniBar(entries)}
      ${error?`<p class="hp-err" role="alert">${this.escape(error)}</p>`:`<p class="hp-note"><b>${n} jour${n>1?'s':''}</b> : ${this.escape(this.dot(this.rangeText(dates[0],dates[n-1])))}${replaced?` ${replaced} jour${replaced>1?'s':''} déjà personnalisé${replaced>1?'s seront remplacés':' sera remplacé'}.`:''}</p>`}
      <p class="hp-note">${d.kind==='like'?`L’horaire du ${HP_DAYS[d.like].toLowerCase()} est recopié : le modifier plus tard ne changera pas ces jours. `:''}Vous partez ? Utilisez plutôt « Absent » sur l’accueil : le chauffage baisse, puis reprend pour votre retour.</p>
      <div class="actions"><button type="button" id="xcancel">Annuler</button><button type="button" id="xconfirm" class="primary" ${error?'disabled':''}>Ajouter ${n} jour${n>1?'s':''}</button></div></section>`;
  }
  renderSpecial(){
    const today=this.todayIso(),groups=this.specialGroups();
    const upcoming=groups.filter(g=>g.end>=today),past=groups.filter(g=>g.end<today);
    const pastDays=past.reduce((n,g)=>n+g.dates.length,0);
    const row=g=>{
      const n=g.dates.length,current=g.start<=today&&today<=g.end,span=this.cap(this.rangeText(g.start,g.end));
      return `<div class="hp-xgroup${g.end<today?' hp-past':''}"><div><b>${this.escape(span)}</b>${current?'<span class="hp-now-badge">en cours</span>':''}
        <small>${n} jour${n>1?'s':''} · ${this.escape(this.describeDay(this._exceptions[g.start]))}</small>${this.miniBar(this._exceptions[g.start])}</div>
        <div class="hp-xactions"><button type="button" data-xedit="${g.start}">Modifier</button><button type="button" data-xdel="${g.start}" aria-label="Supprimer : ${this.escape(span)}">Supprimer</button></div></div>`;
    };
    const body=this._xView==='new'?this.specialFormHtml():`
      <button type="button" id="xnew" class="primary hp-add">+ Ajouter des congés ou jours spéciaux</button>
      ${this._msg?`<p class="hp-msg" role="status">${this.escape(this._msg)}</p>`:''}
      <h3>À venir</h3>${upcoming.map(row).join('')||'<p class="hp-note">Aucun jour spécial prévu : le planning de la semaine s’applique.</p>'}
      ${past.length?`<details data-dk="xpast" ${this.isOpen('xpast')}><summary>Jours passés (${pastDays})</summary>${past.map(row).join('')}<div class="actions"><button type="button" id="clearpast">Retirer les jours passés</button></div></details>`:''}
      <h3>Un seul jour</h3><div class="hp-row"><label>Date <input type="date" id="exceptiondate" data-fk="xdate" value="${this.escape(this._date)}"></label><button type="button" id="newexception">${this._exceptions[this._date]?'Modifier ce jour':'Personnaliser ce jour'}</button></div>`;
    this.innerHTML=`<ha-card header="${this.escape(this._name)}"><div class="hp-ed">${this.nav('exceptions')}${this.canSave()?'':'<p class="hp-note">Lecture seule : un administrateur peut modifier les jours spéciaux.</p>'}
      <p class="hp-note">Un jour spécial remplace le planning de la semaine à cette date : congés à la maison, jours fériés…</p>
      ${body}${this.saveBar()}</div></ha-card><style>${HP_STYLE}</style>`;
    this.bindCommon();
    this.bindSpecial(groups);
  }
  bindSpecial(groups){
    const $=id=>this.querySelector(`#${id}`);
    const find=start=>groups.find(g=>g.start===start);
    if($('xnew'))$('xnew').onclick=()=>{
      const today=this.todayIso();
      this._xDraft={from:today,to:today,kind:'like',like:6,profile:'comfort' in this._profiles?'comfort':this.firstProfile()};
      this._xView='new';this._msg='';this.render();
    };
    this.querySelectorAll('[data-xedit]').forEach(b=>b.onclick=()=>{
      const g=find(b.dataset.xedit);this._date=g.start;this._rangeDates=[...g.dates];this._xView='edit';this._sel=null;this._msg='';this.render();
    });
    this.querySelectorAll('[data-xdel]').forEach(b=>b.onclick=()=>{
      const g=find(b.dataset.xdel),n=g.dates.length;
      this.mutate('exceptions',()=>{for(const d of g.dates)delete this._exceptions[d];
        this._msg=`${this.cap(this.rangeText(g.start,g.end))} supprimé${n>1?` (${n} jours)`:''} : le planning de la semaine s’applique de nouveau. « ↶ Annuler » pour revenir en arrière.`;});
      this.render();
    });
    if($('clearpast'))$('clearpast').onclick=()=>{
      const today=this.todayIso();
      this.mutate('exceptions',()=>{for(const d of Object.keys(this._exceptions))if(d<today)delete this._exceptions[d];this._msg='Jours passés retirés.';});
      this.render();
    };
    if($('exceptiondate'))$('exceptiondate').onchange=e=>{if(e.target.value){this._date=e.target.value;this.render();}};
    if($('newexception'))$('newexception').onclick=()=>{
      const date=this._date;if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return;
      if(!this._exceptions[date]){
        const idx=this.weekdayOf(date);
        this.mutate('exceptions',()=>{this._exceptions[date]=this._weekly[String(idx)].map(e=>({...e}));this.sortExceptions();
          this._msg=`Horaire personnalisé créé à partir du ${HP_DAYS[idx].toLowerCase()}. Modifiez-le ci-dessous.`;});
      }
      this._rangeDates=[date];this._xView='edit';this._sel=null;this.render();
    };
    if(this._xView!=='new')return;
    const d=this._xDraft;
    $('xfrom').onchange=e=>{d.from=e.target.value;if(d.to<d.from)d.to=d.from;this.render();};
    $('xto').onchange=e=>{d.to=e.target.value;this.render();};
    this.querySelectorAll('input[name="xkind"]').forEach(r=>r.onchange=()=>{d.kind=r.value;this.render();});
    $('xlike').onchange=e=>{d.like=Number(e.target.value);d.kind='like';this.render();};
    this.querySelectorAll('[data-xprofile]').forEach(b=>b.onclick=()=>{d.profile=b.dataset.choice;d.kind='all';this.render();});
    $('xcancel').onclick=()=>{this._xView='list';this._xDraft=null;this.render();};
    $('xconfirm').onclick=()=>{
      const {dates,entries,error}=this.specialDraft();
      if(error||!dates.length)return;
      this.mutate('exceptions',()=>{
        for(const x of dates)this._exceptions[x]=this.clone(entries);
        this.sortExceptions();
        this._msg=`${dates.length} jour${dates.length>1?'s':''} ajouté${dates.length>1?'s':''} ${this.dot(this.rangeText(dates[0],dates[dates.length-1]))} Pensez à enregistrer.`;
      });
      this._xView='list';this._xDraft=null;this.render();
    };
  }
  bindDayEditor(key){
    const select=id=>{this._newPeriod=null;this._sel=id;this._msg='';this.render();this.scrollToSelection();};
    this.querySelectorAll('.hp-ed .hp-timeline .hp-segment').forEach(b=>b.onclick=ev=>{
      const start=Number(b.dataset.start),hit=this.model(key).periods.find(p=>p.start<=start&&start<p.end);
      if(!hit)return;
      const bar=this.querySelector('.hp-ed .hp-timeline').getBoundingClientRect();
      this._cursorMinute=ev.detail&&ev.clientX?Math.max(hit.start,Math.min(hit.end-1,Math.floor((ev.clientX-bar.left)/bar.width*1440/HP_STEP)*HP_STEP)):hit.start;
      select(hit.id);
    });
    this.querySelectorAll('[data-select-period]').forEach(b=>b.onclick=()=>{this._cursorMinute=null;select(b.dataset.selectPeriod);});
    this.querySelectorAll('[data-insert]').forEach(b=>b.onclick=()=>{const p=this.model(key).periods.find(p=>p.id===b.dataset.insert);this.addPeriod(key,this._cursorMinute??p.start);});
    this.querySelectorAll('.hp-ed [data-choice]').forEach(b=>b.onclick=()=>{
      if(b.dataset.newProfile){this._newPeriod.profile=b.dataset.choice;this.render();return;}
      const id=b.dataset.period;this._sel=id;if(this.model(key).periods.find(p=>p.id===id)?.profile===b.dataset.choice)return;
      this.edit(key,m=>{m.periods.find(p=>p.id===id).profile=b.dataset.choice;});
    });
    this.querySelectorAll('.hp-ed select[data-field]').forEach(s=>s.onchange=()=>{
      const value=Number(s.value),id=s.dataset.period;
      if(id==='new'){this._newPeriod[s.dataset.field]=value;this._newError='';return;}
      this._sel=id;
      this.edit(key,m=>{const i=m.periods.findIndex(p=>p.id===id),p=m.periods[i];const duration=Math.max(HP_STEP,p.end-p.start);
        const oldStart=p.start,oldEnd=p.end;let adjacent=false;
        if(s.dataset.field==='start'){
          if(value>oldStart&&value<oldEnd&&i>0){m.periods[i-1].end=value;adjacent=true;}
          p.start=value;if(p.end<=value)p.end=Math.min(1440,value+duration);
        }else{
          if(value<oldEnd&&value>oldStart&&i+1<m.periods.length){m.periods[i+1].start=value;adjacent=true;}
          p.end=value;if(p.start>=value)p.start=Math.max(0,value-duration);
        }
        const report=hpPlace(m,p);this._msg=adjacent||report.removed.length||report.adjusted.length?'Les périodes voisines ont été ajustées. Vous pouvez annuler cette modification.':'';
      });
    });
    this.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.delete;this._sel=null;
      this.edit(key,m=>{const i=m.periods.findIndex(p=>p.id===id),p=m.periods[i];if(m.periods.length===1)return;
        if(i>0)m.periods[i-1].end=p.end;else m.periods[1].start=0;
        m.periods.splice(i,1);this._msg='Période supprimée. La période voisine reprend ces heures.';
      });
    });
    const close=this.querySelector('#cancelperiod');if(close)close.onclick=()=>{this._newPeriod=null;this.render();};
    const confirm=this.querySelector('#confirmperiod');if(confirm)confirm.onclick=()=>this.confirmPeriod(key);
    this.querySelector('#addperiod').onclick=()=>{const p=this.model(key).periods.find(p=>p.id===this._sel);this.addPeriod(key,p?this._cursorMinute??p.start:420);};
    this.applyRights();
  }

  /* ---------- Accueil ---------- */
  renderOverview() {
    const esc=v=>this.escape(v??'—');
    const names={planning:'Planning',manual:'Manuel',boost:'Boost',away:'Absent'};
    const today=(new Date().getDay()+6)%7;
    const iso=this.todayIso();
    const rows=(this._saved.exceptions||this._exceptions)[iso]||(this._saved.weekly||this._weekly)[String(today)]||[];
    const now=new Date();const nowMinute=now.getHours()*60+now.getMinutes();
    const effective=this._effective||{};
    const temp=effective.target;
    const actual=this._hass.states[this.config.temperature_entity];
    const valid=entity=>entity && !['unknown','unavailable'].includes(entity.state);
    const raw=valid(actual)?(this.config.temperature_attribute?actual.attributes?.[this.config.temperature_attribute]:this.config.temperature_entity?.startsWith('climate.')?actual.attributes?.current_temperature:actual.state):null;
    const format=value=>value!==null && value!==undefined && value!=='' && Number.isFinite(Number(value))?Number(value).toLocaleString('fr-BE',{minimumFractionDigits:1,maximumFractionDigits:1}):'—';
    const heatId=this.config.heating_entity || (this.config.temperature_entity?.startsWith('climate.')?this.config.temperature_entity:null);
    const heat=this._hass.states[heatId];
    const action=valid(heat)?heat.attributes?.hvac_action:null;
    const heating=action || (valid(heat)?(heat.state==='off'?'off':heatId?.startsWith('climate.')?(heat.state==='heat'?'enabled':null):(heat.state==='on'?'heating':null)):null);
    const stateLabel=!heatId?'État de chauffe non renseigné':!valid(heat)?'État de chauffe indisponible':({heating:'Chauffe',idle:'Au repos',off:'Arrêté',enabled:'Chauffage activé'}[heating]||'État de chauffe inconnu');
    const modeLabel=names[effective.active_mode]||'Indisponible';
    const subtitles={planning:'Planning automatique',manual:'Mode manuel',boost:'Mode Boost',away:'Mode Absent'};
    const change=effective.next_change?new Date(effective.next_change):null;
    const when=change && !Number.isNaN(change.getTime())?(change.toLocaleDateString('en-CA')===iso?'':change.toLocaleDateString('fr-BE')+' · ')+change.toLocaleTimeString('fr-BE',{hour:'2-digit',minute:'2-digit'}):null;
    const next=when?when+' → '+format(effective.next_target)+' °C':'Aucun changement annoncé';
    this.innerHTML=`<ha-card><div class="hp-home">
      ${this._dirty.size?this.saveBar(true):''}
      <div class="hp-heading"><div><h2>${esc(this.config.name||this._name)}</h2><p class="hp-subtitle">Chauffage · ${esc(subtitles[effective.active_mode]||'Mode indisponible')}</p></div><span class="hp-badge ${heating==='heating'?'hp-heating':''}" role="status">${esc(stateLabel)}</span></div>
      <div class="hp-grid"><div class="hp-metric"><span>Température actuelle</span><strong>${format(raw)} °C</strong></div><div class="hp-metric hp-setpoint"><span>Consigne effective</span><strong>${format(temp)} °C</strong></div></div>
      <div class="hp-next"><div><span>Prochain changement</span><strong>${esc(next)}</strong></div><span class="hp-badge">${esc(modeLabel)}${effective.preheat_active?' · Préchauffage':''}</span></div>
      ${effective.away_return_deadline || effective.preheat_strategy?`<p class="hp-help" id="dynamic-preheat">${effective.active_mode==='away' && effective.away_return_deadline?'Retour d’absence · objectif '+format(effective.away_return_target)+' °C le '+esc(new Date(effective.away_return_deadline).toLocaleString('fr-BE'))+' · '+(effective.away_return_start?'préchauffage '+(effective.preheat_active?'en cours depuis le ':'prévu à partir du ')+esc(new Date(effective.away_return_start).toLocaleString('fr-BE'))+' · '+esc(effective.away_return_minutes)+' min':'aucune anticipation nécessaire ou durée désactivée')+(effective.away_return_strategy==='fixed_fallback'?' · secours fixe':effective.away_return_strategy==='fixed'?' · durée fixe':' · dynamique'):effective.active_mode!=='planning'?'Préchauffage suspendu pendant le mode temporaire.':effective.preheat_strategy==='fixed_fallback'?'Préchauffage fixe de secours : température ou vitesse indisponible/invalide.':effective.dynamic_start?'Préchauffage dynamique '+(effective.preheat_active?'en cours':'prévu')+' · début '+esc(new Date(effective.dynamic_start).toLocaleString('fr-BE'))+' · '+esc(effective.dynamic_minutes)+' min · objectif '+format(effective.dynamic_target)+' °C · vitesse '+esc(Number(effective.dynamic_slope).toLocaleString('fr-BE',{maximumFractionDigits:3}))+' °C/h':'Préchauffage dynamique : aucune hausse prévue.'}</p>`:''}
      ${this.quickModesHtml(effective)}
      <div class="hp-buttons"><button id="home-week">Planning</button><button id="home-exceptions">Jours spéciaux</button><button id="home-wakes">Réveils</button><button id="home-temps">Températures</button></div>
      <h3>Planning du jour</h3>${this.timeline(rows,'Aujourd’hui',{now:nowMinute,segments:this.todaySegments(),hint:'touchez une période pour la modifier'})}
      </div></ha-card><style>${HP_STYLE}
      .hp-home{padding:20px;color:var(--primary-text-color);font-family:inherit}.hp-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}.hp-home h2{margin:0;font-size:26px}.hp-subtitle{margin:4px 0 0;font-size:14px;color:var(--secondary-text-color)}.hp-home h3{font-size:16px;margin-top:24px}.hp-badge{border-radius:20px;padding:5px 10px;font-size:12px;background:var(--secondary-background-color,#eee);white-space:normal}.hp-heating{color:var(--success-color,#4caf50);background:#4caf5020}.hp-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:10px;align-items:stretch}.hp-metric{border-radius:18px;background:var(--secondary-background-color,#f4f5f7);padding:18px 14px;display:flex;flex-direction:column;gap:12px}.hp-metric span,.hp-next>div>span{font-size:14px;color:var(--secondary-text-color)}.hp-metric strong{font-size:clamp(24px,6vw,40px)}.hp-setpoint{justify-content:center}.hp-setpoint strong{font-size:clamp(20px,4vw,28px);font-weight:500}.hp-setpoint span{font-size:13px}.hp-next{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:18px 0 22px}.hp-next>div{display:flex;flex-direction:column;gap:6px}.hp-next strong{font-size:15px}.hp-home .hp-quick-modes button,.hp-home .hp-buttons button{font:inherit;cursor:pointer;color:var(--primary-text-color);background:var(--secondary-background-color,#eee);border:1px solid var(--divider-color,#ddd);padding:10px 14px;border-radius:24px;min-height:44px}.hp-home .hp-quick-modes button.primary{background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#fff);border-color:transparent}.hp-home .hp-quick-modes button:disabled{opacity:.45;cursor:default}.hp-home .hp-sheet input,.hp-home .hp-sheet select{font:inherit;border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px 10px;background:var(--card-background-color,#fff);color:var(--primary-text-color);min-height:40px;box-sizing:border-box}.hp-home .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.hp-home .hp-chips{display:flex;gap:6px;flex-wrap:wrap}.hp-buttons{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.hp-help{font-size:12px;color:var(--secondary-text-color);line-height:1.5}.hp-home button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}</style>`;
    this.querySelectorAll('.hp-home .hp-segment').forEach(b=>b.onclick=()=>{
      this._sheet=null;
      if(b.dataset.wake!==undefined){this._tab='wakes';this._wakeIdx=Number(b.dataset.wake);this._wakeDay=today;this.render();return;}
      this._day=today;this._date=iso;this._tab=(this._saved.exceptions||this._exceptions)[iso]?'exceptions':'weekly';
      if(this._tab==='exceptions'){this._xView='edit';this._rangeDates=[iso];}
      const m=this.model(this.dayKey()),start=Number(b.dataset.start);
      const hit=m.periods.find(p=>p.start<=start&&start<p.end);
      this._sel=hit?hit.id:null;this._msg='';
      this.render();this.scrollToSelection();
    });
    this.bindQuickModes(effective);
    for(const [id,tab] of [['home-week','weekly'],['home-exceptions','exceptions'],['home-wakes','wakes'],['home-temps','temps']])this.querySelector('#'+id).onclick=()=>{this._tab=tab;this._sheet=null;this._sel=null;this._msg='';if(tab==='exceptions')this._xView='list';this.render();};
    this.bindSaveBar();
    this._overviewSig=this.overviewSignature();
  }

  /** Plages réelles du jour : planning enregistré (jour spécial ou semaine) + réveils de cette zone,
   *  avec la même règle que le serveur (un réveil prime ; à chevauchement, le dernier commencé gagne). */
  todaySegments(){
    const iso=this.todayIso(),wd=(new Date().getDay()+6)%7,saved=this._saved||{};
    const entries=[...((saved.exceptions||this._exceptions||{})[iso]||(saved.weekly||this._weekly||{})[String(wd)]||[])].sort((a,b)=>a.time.localeCompare(b.time));
    const base=entries.map((e,i)=>({start:hpMin(e.time),end:i+1<entries.length?hpMin(entries[i+1].time):1440,profile:e.profile}));
    const wakes=(saved.wakes||this._wakes||[]).map((w,idx)=>{
      const profile=w.zones?.[this._entry];if(!profile)return null;
      const slot=w.dates&&iso in w.dates?w.dates[iso]:w.times?.[String(wd)];
      return slot?{start:hpMin(slot.start),end:hpMin(slot.end),profile,name:w.name,idx}:null;
    }).filter(w=>w&&w.end>w.start);
    if(!wakes.length)return base;
    const cuts=[...new Set([0,1440,...base.map(s=>s.start),...wakes.flatMap(w=>[w.start,w.end])])].sort((a,b)=>a-b);
    const out=[];
    for(let i=0;i+1<cuts.length;i++){
      const a=cuts[i],b=cuts[i+1];
      const wake=wakes.filter(w=>w.start<=a&&a<w.end).reduce((x,y)=>!x||y.start>x.start||(y.start===x.start&&y.end>x.end)?y:x,null);
      const profile=wake?wake.profile:base.find(s=>s.start<=a&&a<s.end)?.profile;
      const last=out[out.length-1];
      if(last&&last.profile===profile&&last.wake?.idx===wake?.idx)last.end=b;
      else out.push(wake?{start:a,end:b,profile,wake:{idx:wake.idx,name:wake.name}}:{start:a,end:b,profile});
    }
    return out;
  }

  /* ---------- Modes en un geste (accueil) ---------- */
  activeOverride(){
    const ov=this._override||{mode:'planning'};
    const until=ov.until?new Date(ov.until):null;
    return ov.mode!=='planning'&&until&&until>new Date()?{...ov,untilDate:until}:null;
  }
  whenText(date){
    const time=date.toLocaleTimeString('fr-BE',{hour:'2-digit',minute:'2-digit'});
    const day=date.toDateString(),now=new Date();
    if(day===now.toDateString())return `à ${time}`;
    if(day===new Date(now.getTime()+86400000).toDateString())return `demain à ${time}`;
    return `le ${date.toLocaleDateString('fr-BE',{weekday:'short',day:'numeric',month:'short'})} à ${time}`;
  }
  remainingText(ov){
    if(ov.mode==='away')return `Retour prévu ${this.whenText(ov.untilDate)}`;
    const minutes=Math.max(1,Math.round((ov.untilDate-Date.now())/60000));
    const left=minutes<60?`${minutes} min`:`${Math.floor(minutes/60)} h${minutes%60?` ${String(minutes%60).padStart(2,'0')}`:''}`;
    return `Encore ${left} · ${this.untilText(ov.untilDate)}`;
  }
  untilText(date){
    const time=date.toLocaleTimeString('fr-BE',{hour:'2-digit',minute:'2-digit'});
    const day=date.toDateString(),now=new Date();
    if(day===now.toDateString())return `jusqu’à ${time}`;
    if(day===new Date(now.getTime()+86400000).toDateString())return `jusqu’à demain ${time}`;
    return `jusqu’au ${date.toLocaleDateString('fr-BE',{weekday:'short',day:'numeric',month:'short'})} ${time}`;
  }
  nextChange(effective){
    const next=effective?.next_change?new Date(effective.next_change):null;
    return next&&!Number.isNaN(next.getTime())&&next>new Date()&&(effective.active_mode||'planning')==='planning'?next:null;
  }
  quickModesHtml(effective){
    const ov=this.activeOverride();
    const mode={boost:['mdi:fire','🔥','Boost','#f5a25d'],manual:['mdi:hand-back-right','✋','Maintenu','#b39ddb'],away:['mdi:bag-suitcase','🧳','Absent','#90a4ae']};
    let html;
    if(ov){
      const [mdi,emoji,title,color]=mode[ov.mode]||mode.manual;
      html=`<div class="hp-active" style="--c:${color}" role="status"><div class="hp-active-text">${this.icon(mdi,emoji)}<div><b>${title} · ${this.degrees(ov.temperature)}</b><span>${this.escape(this.remainingText(ov))}</span></div></div>
        <div class="hp-active-actions">${ov.mode==='away'?'<button type="button" data-qa="away">Changer le retour</button>':'<button type="button" data-qa="extend">+1 h</button>'}<button type="button" class="primary" data-qa="resume">${ov.mode==='away'?'Je suis rentré · reprendre le planning':'Reprendre le planning'}</button></div></div>`;
    }else{
      html=`<div class="hp-mode-buttons">
        <button type="button" data-qa="boost">${this.icon('mdi:fire','🔥')}<b>Boost</b><small>1 h à ${this.degrees(this._modeTemperatures?.boost??21)}</small></button>
        <button type="button" data-qa="keep">${this.icon('mdi:hand-back-right','✋')}<b>Maintenir</b><small>une température</small></button>
        <button type="button" data-qa="away">${this.icon('mdi:bag-suitcase','🧳')}<b>Absent</b><small>jusqu’à mon retour</small></button></div>`;
    }
    return `<section class="hp-quick-modes" aria-label="Commandes rapides">${html}${this.sheetHtml(effective)}
      ${this._qaMsg?`<p class="hp-msg" role="status">${this.escape(this._qaMsg)}</p>`:''}
      ${this.canControl()?'':'<p class="hp-note">Vous ne pouvez pas commander cette zone.</p>'}</section>`;
  }
  sheetHtml(effective){
    const s=this._sheet,d=this._sheetDraft;
    if(!s||!d)return '';
    const stepper=`<div class="hp-stepper" role="group" aria-label="Température"><button type="button" data-qa="minus" data-fk="qa-minus" aria-label="Baisser de 0,5 °C">−</button><output id="qa-temp">${this.degrees(d.temperature)}</output><button type="button" data-qa="plus" data-fk="qa-plus" aria-label="Monter de 0,5 °C">+</button></div>`;
    const option=(attr,value,label,current)=>`<button type="button" class="hp-opt" ${attr}="${value}" data-fk="${attr}-${value}" aria-pressed="${String(current)===String(value)}">${this.escape(label)}</button>`;
    if(s==='keep'){
      const next=this.nextChange(effective);
      const choices=[...(next?[['next',`Jusqu’au prochain changement (${next.toLocaleTimeString('fr-BE',{hour:'2-digit',minute:'2-digit'})})`]]:[]),['60','1 h'],['120','2 h'],['240','4 h']];
      return `<div class="hp-sheet" aria-label="Maintenir une température"><h3>Maintenir une température</h3>${stepper}
        <p class="hp-sub">Pendant</p><div class="hp-chips">${choices.map(([v,l])=>option('data-keep',v,l,d.until)).join('')}</div>
        <div class="actions"><button type="button" data-qa="close">Fermer</button><button type="button" class="primary" data-qa="apply-keep">Appliquer</button></div></div>`;
    }
    const now=new Date(),tonight=now.getHours()<17;
    const choices=[...(tonight?[['tonight','Ce soir à 18:00']]:[]),['tomorrow','Demain à 18:00'],['date','Autre date…']];
    const times=Array.from({length:96},(_,i)=>i*15);
    return `<div class="hp-sheet" aria-label="Absent"><h3>Absent : quand rentrez-vous ?</h3>
      <div class="hp-chips">${choices.map(([v,l])=>option('data-away',v,l,d.choice)).join('')}</div>
      ${d.choice==='date'?`<div class="hp-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input type="date" id="qa-date" data-fk="qa-date" aria-label="Date du retour" min="${this.todayIso()}" value="${this.escape(d.date)}"><select id="qa-time" data-fk="qa-time" aria-label="Heure du retour">${times.map(m=>`<option value="${m}" ${m===d.time?'selected':''}>${hpTime(m)}</option>`).join('')}</select></div>`:''}
      <p class="hp-sub">Température pendant l’absence</p>${stepper}
      <p class="hp-note">À votre retour, le planning reprend tout seul ; le chauffage anticipe la remontée selon le préchauffage réglé.</p>
      ${d.error?`<p class="hp-err" role="alert">${this.escape(d.error)}</p>`:''}
      <div class="actions"><button type="button" data-qa="close">Fermer</button><button type="button" class="primary" data-qa="apply-away">${this.activeOverride()?.mode==='away'?'Modifier le retour':'Partir'}</button></div></div>`;
  }
  awayUntil(d){
    const base=new Date();
    if(d.choice==='tonight'){base.setHours(18,0,0,0);return base;}
    if(d.choice==='tomorrow'){base.setDate(base.getDate()+1);base.setHours(18,0,0,0);return base;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||''))return null;
    const [y,m,day]=d.date.split('-').map(Number);
    return new Date(y,m-1,day,Math.floor(d.time/60),d.time%60,0,0);
  }
  async sendMode(value,success){
    if(!this.canControl()||this._modeBusy)return;
    this._modeBusy=true;this.renderOverview();
    try{
      await this._hass.callWS({type:'heating_planner/set_mode',entry_id:this._entry,override:value});
      this._override=value;this._sheet=null;this._sheetDraft=null;this._qaMsg=success;
    }catch(e){this._qaMsg=`Erreur : ${e?.message||e}`;}
    finally{this._modeBusy=false;this._lastRefresh=0;if(this._tab==='overview')this.renderOverview();this.refreshOverview();}
  }
  bindQuickModes(effective){
    const round=v=>Math.min(35,Math.max(5,Math.round(Number(v)*2)/2));
    const actions={
      boost:()=>{const t=Number(this._modeTemperatures?.boost??21),until=new Date(Date.now()+3600000);
        this.sendMode({mode:'boost',temperature:t,until:until.toISOString()},`Boost activé : ${this.degrees(t)} ${this.untilText(until)}.`);},
      keep:()=>{this._qaMsg='';this._sheet='keep';this._sheetDraft={temperature:round(effective.target??this._profiles?.comfort??20),until:this.nextChange(effective)?'next':'120'};this.renderOverview();},
      away:()=>{const ov=this.activeOverride();this._qaMsg='';this._sheet='away';
        const until=ov?.mode==='away'?ov.untilDate:null;
        this._sheetDraft=until?{temperature:Number(ov.temperature),choice:'date',date:until.toLocaleDateString('en-CA'),time:until.getHours()*60+Math.floor(until.getMinutes()/15)*15}
          :{temperature:Number(this._modeTemperatures?.away??15),choice:new Date().getHours()<17?'tonight':'tomorrow',date:this.nextIso(this.todayIso()),time:1080};
        this.renderOverview();},
      close:()=>{this._sheet=null;this._sheetDraft=null;this.renderOverview();},
      minus:()=>{this._sheetDraft.temperature=round(this._sheetDraft.temperature-0.5);this.renderOverview();},
      plus:()=>{this._sheetDraft.temperature=round(this._sheetDraft.temperature+0.5);this.renderOverview();},
      'apply-keep':()=>{const d=this._sheetDraft,next=this.nextChange(effective);
        const until=d.until==='next'&&next?next:new Date(Date.now()+Number(d.until==='next'?120:d.until)*60000);
        this.sendMode({mode:'manual',temperature:d.temperature,until:until.toISOString()},`Température maintenue à ${this.degrees(d.temperature)} ${this.untilText(until)}.`);},
      'apply-away':()=>{const d=this._sheetDraft,until=this.awayUntil(d);
        if(!until||until<=new Date(Date.now()+60000)){d.error='Choisissez un retour dans le futur.';this.renderOverview();return;}
        this.sendMode({mode:'away',temperature:d.temperature,until:until.toISOString()},`Absent ${this.untilText(until)} : ${this.degrees(d.temperature)} pendant votre absence.`);},
      extend:()=>{const ov=this.activeOverride();if(!ov)return;const until=new Date(Math.max(Date.now(),ov.untilDate.getTime())+3600000);
        this.sendMode({mode:ov.mode,temperature:Number(ov.temperature),until:until.toISOString()},`Prolongé ${this.untilText(until)}.`);},
      resume:()=>this.sendMode({mode:'planning'},'Le planning a repris.'),
    };
    this.querySelectorAll('.hp-quick-modes [data-qa]').forEach(b=>b.onclick=()=>actions[b.dataset.qa]?.());
    this.querySelectorAll('[data-keep]').forEach(b=>b.onclick=()=>{this._sheetDraft.until=b.dataset.keep;this.renderOverview();});
    this.querySelectorAll('[data-away]').forEach(b=>b.onclick=()=>{this._sheetDraft.choice=b.dataset.away;this._sheetDraft.error='';this.renderOverview();});
    const date=this.querySelector('#qa-date'),time=this.querySelector('#qa-time');
    if(date)date.onchange=()=>{this._sheetDraft.date=date.value;this._sheetDraft.error='';this.renderOverview();};
    if(time)time.onchange=()=>{this._sheetDraft.time=Number(time.value);this._sheetDraft.error='';};
    this.applyRights();
  }

  /* ---------- Températures (enregistrées avec le reste, administrateurs) ---------- */
  renderTemps(){
    const t=this._temps||{profiles:{}},p=t.profiles,keys=Object.keys(p);
    const hints={night:'Pour dormir',eco:'Maison vide ou en journée',comfort:'Quand on est là'};
    const row=(key,label,value,hint,color)=>`<div class="hp-trow" style="--c:${color}"><div><b>${this.escape(label)}</b>${hint?`<small>${this.escape(hint)}</small>`:''}</div>
      <div class="hp-stepper" role="group" aria-label="${this.escape(label)}"><button type="button" data-tstep="${key}:-0.5" data-fk="t-${key}-minus" aria-label="${this.escape(label)} : baisser de 0,5 °C">−</button><output data-tvalue="${key}">${this.degrees(value)}</output><button type="button" data-tstep="${key}:0.5" data-fk="t-${key}-plus" aria-label="${this.escape(label)} : monter de 0,5 °C">+</button></div></div>`;
    const ordered=['night','eco','comfort'].every(k=>k in p)?p.night<=p.eco&&p.eco<=p.comfort:true;
    const values=Object.values(p).map(Number);
    const awayWarn=values.length&&t.away>=Math.min(...values)?'Absent est aussi chaud qu’un mode du planning : une absence n’économisera pas d’énergie.':'';
    this.innerHTML=`<ha-card header="${this.escape(this._name)}"><div class="hp-ed">${this.nav('temps')}${this.canSave()?'':'<p class="hp-note">Lecture seule : un administrateur peut modifier les températures.</p>'}
      <p class="hp-note">Ces températures s’appliquent partout où le mode est utilisé : semaine, jours spéciaux et réveils.</p>
      <h3>Planning</h3>${keys.map(k=>row(k,this.label(k),p[k],hints[k]||'',this.color(k))).join('')}
      ${ordered?'':'<p class="hp-warn">D’habitude, Nuit ≤ Éco ≤ Confort : vérifiez que ce n’est pas une erreur.</p>'}
      <h3>Commandes rapides</h3>${row('away','Absent',t.away,'Pendant une absence','#90a4ae')}${row('boost','Boost',t.boost,'Pendant 1 h, sur demande','#f5a25d')}
      ${awayWarn?`<p class="hp-warn">${awayWarn}</p>`:''}
      <details class="hp-tech" data-dk="ttech" ${this.isOpen('ttech')}><summary>Réglages avancés</summary><p>Préchauffage, sonde de température et vitesse de chauffe : Paramètres → Appareils et services → Heating Planner → Configurer. Les températures enregistrées ici y apparaissent aussi.</p></details>
      ${this.saveBar()}</div></ha-card><style>${HP_STYLE}</style>`;
    this.bindCommon();
    this.querySelectorAll('[data-tstep]').forEach(b=>b.onclick=()=>{
      const [key,delta]=b.dataset.tstep.split(':'),mode=key==='away'||key==='boost';
      this.mutate('temperatures',()=>{
        const value=Math.min(35,Math.max(5,Math.round((Number(mode?this._temps[key]:this._temps.profiles[key])+Number(delta))*2)/2));
        if(mode)this._temps[key]=value;else this._temps.profiles[key]=value;
      });
      this.recomputeDirty();this.render();
    });
  }

  /* ---------- Réveils (enregistrés avec le reste) ---------- */
  renderWakes() {
    if(this._wakeIdx>=this._wakes.length)this._wakeIdx=Math.max(0,this._wakes.length-1);
    const e=this._wakes[this._wakeIdx];
    const day=String(this._wakeDay);
    const slot=e?.times[day];
    const esc=v=>this.escape(v);
    const zoneRows=e?this._zones.map(z=>{
      const chosen=e.zones[z.entry_id];
      return `<div class="zone"><label><input type="checkbox" data-zone="${esc(z.entry_id)}" ${chosen?'checked':''}> ${esc(z.name)}</label> <select data-profile="${esc(z.entry_id)}">${z.profiles.map(p=>`<option value="${esc(p)}" ${chosen===p?'selected':''}>${esc(this.label(p))}</option>`).join('')}</select></div>`;
    }).join(''):'';
    this.innerHTML=`<ha-card header="${esc(this._name)}"><div class="hp-ed">${this.nav('wakes')}${this.canSave()?'':'<p class="hp-note">Lecture seule : un administrateur peut modifier les réveils.</p>'}
      <p class="hp-note">Pendant sa plage horaire, un réveil remplace le planning (semaine et jours spéciaux) des pièces choisies.</p>
      <div class="actions"><button id="addwake">+ Réveil</button>${e?'<button id="deletewake">Supprimer ce réveil</button>':''}</div>
      ${this._wakes.length?`<div class="actions">${this._wakes.map((x,i)=>`<button data-wake="${i}" class="${i===this._wakeIdx?'active':''}">${esc(x.name)}</button>`).join('')}</div>`:'<p>Aucun réveil défini.</p>'}
      ${e?`<label>Nom <input id="wakename" value="${esc(e.name)}"></label>
        <p>Jours habituels (désactiver un jour pour ne pas appliquer le réveil)</p>
        <div class="hp-days">${HP_SHORT.map((d,i)=>`<button data-wday="${i}" class="${i===this._wakeDay?'active':''}" aria-label="${HP_DAYS[i]}">${d}</button>`).join('')}</div>
        <label><input type="checkbox" id="wakeenabled" ${slot?'checked':''}> Réveil actif le ${HP_DAYS[this._wakeDay].toLowerCase()}</label>
        <div class="actions"><label>Début <input id="wakestart" data-fk="wakestart" type="time" value="${slot?.start||'06:30'}"></label><label>Fin <input id="wakeend" data-fk="wakeend" type="time" value="${slot?.end||'08:00'}"></label></div>
        <details data-dk="zones" ${this.isOpen('zones')}><summary>Pièces et modes (${Object.keys(e.zones).length})</summary>${zoneRows}</details>
        <details data-dk="wakedates" ${this.isOpen('wakedates')}><summary>Modifier un réveil pour une date précise</summary>
        <div class="actions"><input type="date" id="wakedate" value="${esc(this._wakeDate||'')}"><button id="loadwakedate">Voir la date</button><button id="clearwakedate">Revenir au planning habituel</button></div>
        <p id="datehint" class="hp-note"></p><div class="actions"><label>Début <input id="datestart" type="time"></label><label>Fin <input id="dateend" type="time"></label><button id="savedate">Définir cette date</button><button id="disabledate">Pas de réveil à cette date</button></div>
        <p class="hp-note">Dates personnalisées : ${Object.keys(e.dates).sort().map(d=>esc(this.formatDate(d,true))).join(', ')||'aucune'}</p></details>`:''}
      ${this.saveBar()}</div></ha-card><style>${HP_STYLE}</style>`;
    this.bindCommon();
    const $=id=>this.querySelector('#'+id);
    $('addwake').onclick=()=>{this.touch('wakes');this._wakes.push({id:'wake_'+Date.now().toString(36),name:'Nouveau réveil',times:Object.fromEntries(Array.from({length:7},(_,i)=>[String(i),i<5?{start:'06:30',end:'08:00'}:{start:'08:00',end:'09:30'}])),dates:{},zones:{[this._entry]:this.defaultProfile(null)}});this._wakeIdx=this._wakes.length-1;this.render();};
    if (!e)return;
    $('deletewake').onclick=()=>{this.touch('wakes');this._wakes.splice(this._wakeIdx,1);this._wakeIdx=0;this.render();};
    this.querySelectorAll('[data-wake]').forEach(b=>b.onclick=()=>{this._wakeIdx=Number(b.dataset.wake);this.render();});
    this.querySelectorAll('[data-wday]').forEach(b=>b.onclick=()=>{this._wakeDay=Number(b.dataset.wday);this.render();});
    $('wakename').onchange=ev=>{this.touch('wakes');e.name=ev.target.value;this.render();};
    $('wakeenabled').onchange=ev=>{this.touch('wakes');e.times[day]=ev.target.checked?{start:$('wakestart').value,end:$('wakeend').value}:null;this.render();};
    for(const key of ['start','end']) $('wake'+key).onchange=ev=>{this.touch('wakes');if(!e.times[day])e.times[day]={start:$('wakestart').value,end:$('wakeend').value};else e.times[day][key]=ev.target.value;$('wakeenabled').checked=true;this.refreshSaveBar();};
    this.querySelectorAll('[data-zone]').forEach(b=>b.onchange=()=>{this.touch('wakes');const id=b.dataset.zone;if(b.checked)e.zones[id]=this.querySelector(`[data-profile="${id}"]`).value;else delete e.zones[id];this.refreshSaveBar();});
    this.querySelectorAll('[data-profile]').forEach(b=>b.onchange=()=>{if(!e.zones[b.dataset.profile])return;this.touch('wakes');e.zones[b.dataset.profile]=b.value;this.refreshSaveBar();});
    $('loadwakedate').onclick=()=>{const d=$('wakedate').value;this._wakeDate=d;const v=e.dates[d]===undefined?e.times[String((new Date(d+'T12:00:00').getDay()+6)%7)]:e.dates[d];$('datestart').value=v?.start||'06:30';$('dateend').value=v?.end||'08:00';$('datehint').textContent=d in e.dates?'Exception de réveil enregistrée':'Horaire habituel (pas encore d’exception)';};
    $('savedate').onclick=()=>{const d=$('wakedate').value;if(!d)return;this.touch('wakes');e.dates[d]={start:$('datestart').value,end:$('dateend').value};this._wakeDate=d;this.render();};
    $('disabledate').onclick=()=>{const d=$('wakedate').value;if(!d)return;this.touch('wakes');e.dates[d]=null;this._wakeDate=d;this.render();};
    $('clearwakedate').onclick=()=>{const d=$('wakedate').value;if(!d)return;this.touch('wakes');delete e.dates[d];this._wakeDate=d;this.render();};
    if(this._wakeDate){$('loadwakedate').click();}
  }
  getCardSize(){return 6;}
}
customElements.define('heating-planner-card', HeatingPlannerCard);
window.customCards = window.customCards || [];
window.customCards.push({type:'heating-planner-card',name:'Heating Planner',description:'Planning de chauffage Heating Planner (préversion)'});