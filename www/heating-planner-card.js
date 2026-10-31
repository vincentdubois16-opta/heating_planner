/* Heating Planner v0.7 — lightweight Lovelace weekly editor, no external dependencies. */
class HeatingPlannerCard extends HTMLElement {
  setConfig(config) { this.config = config; }
  set hass(hass) {
    this._hass = hass;
    if (!this._loaded && !this._loading) this.load();
  }
  async load() {
    this._loading = true;
    try {
      const zones = await this._hass.callWS({type:'heating_planner/list'});
      this._entry = this.config.entry_id || zones[0]?.entry_id;
      if (!this._entry) throw Error('Aucune zone Heating Planner');
      const data = await this._hass.callWS({type:'heating_planner/get', entry_id:this._entry});
      this._name = data.name;
      this._override = data.override || {mode:"planning"};
      this._weekly = data.weekly;
      this._exceptions = data.exceptions || {};
      this._tab = "weekly";
      const wakes = await this._hass.callWS({type:"heating_planner/get_wakes"});
      this._wakes = wakes.events; this._zones = wakes.zones; this._wakeIdx = 0; this._wakeDay = 0;
      this._date = new Date().toLocaleDateString("en-CA");
      this._profiles = data.profiles;
      this._preheatMinutes = data.preheat_minutes || 0;
      this._day = 0;
      this._loaded = true;
      this._dirty = false;
      this.render();
    } catch(e) { this.innerHTML = `<ha-card><div style="padding:16px">Heating Planner : ${this.escape(e.message)}</div></ha-card>`; }
    finally { this._loading = false; }
  }
  escape(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  render() {
    if (this._tab === "wakes") { this.renderWakes(); return; }
    if (this._tab === "modes") { this.renderModes(); return; }
    const days = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
    const profiles = Object.keys(this._profiles);
    const isException = this._tab === 'exceptions';
    const source = isException ? (this._exceptions[this._date] || []) : this._weekly[String(this._day)];
    const rows = source.map((row,i)=>`<div class="row">
      <input aria-label="Heure" type="time" value="${this.escape(row.time)}" data-i="${i}" data-key="time" ${i===0?'disabled':''}>
      <select aria-label="Profil" data-i="${i}" data-key="profile">${profiles.map(p=>`<option value="${this.escape(p)}" ${p===row.profile?'selected':''}>${this.escape(p)} (${this._profiles[p]}°C)</option>`).join('')}</select>
      <button data-remove="${i}" ${i===0?'disabled':''} title="Supprimer">✕</button>
    </div>`).join('');
    this.innerHTML = `<ha-card header="Heating Planner · ${this.escape(this._name)}"><div class="wrap">
      <p class="note">Édition des horaires de démonstration · aucun pilotage du chauffage · Préchauffage : ${this._preheatMinutes} min (réglage dans les options de l’intégration)</p>
      <div class="actions"><button id="tabweekly" class="${!isException?'active':''}">Semaine</button><button id="tabexceptions" class="${isException?'active':''}">Exceptions datées</button><button id="tabwakes">Réveils</button><button id="tabmodes">Modes</button></div>
      ${isException ? `<div class="actions"><label>Date <input id="exceptiondate" type="date" value="${this.escape(this._date)}"></label><button id="newexception">Créer depuis la semaine</button><button id="deleteexception" ${this._exceptions[this._date]?'':'disabled'}>Supprimer l'exception</button></div><p class="note">${this._exceptions[this._date]?'Exception active : les horaires ci-dessous remplacent ceux du jour habituel.':'Aucune exception pour cette date : le planning hebdomadaire s’applique.'}</p><p class="note">Dates enregistrées : ${Object.keys(this._exceptions).sort().map(d=>`<button data-exceptiondate="${this.escape(d)}">${this.escape(d)}</button>`).join(' ') || 'aucune'}</p>` : ''}
      <div class="days" style="${isException?'display:none':''}">${days.map((d,i)=>`<button data-day="${i}" class="${i===this._day?'active':''}">${d}</button>`).join('')}</div>
      <div class="rows">${rows}</div>
      <div class="actions"><button id="add" ${isException&&!this._exceptions[this._date]?'disabled':''}>+ Plage</button><label style="${isException?'display:none':''}">Copier vers <select id="copyday">${days.map((d,i)=>i===this._day?'':`<option value="${i}">${d}</option>`).join('')}</select></label><button id="copy" style="${isException?'display:none':''}">Copier</button></div>
      <div class="actions"><button id="save" class="primary" ${this._dirty?'':'disabled'}>${isException?"Enregistrer les exceptions":"Enregistrer les 7 jours"}</button><button id="reload">Annuler</button></div>
      <p id="status" role="status"></p>
    </div></ha-card><style>
      .wrap{padding:0 16px 16px}.note{font-size:12px;opacity:.75}.days,.actions{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
      button,select,input{font:inherit;border:1px solid var(--divider-color,#aaa);border-radius:7px;padding:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222)}
      button{cursor:pointer}.active,.primary{background:var(--primary-color,#03a9f4);color:white}.row{display:flex;gap:8px;margin:7px 0}.row select{flex:1;min-width:0}.row input{width:110px;box-sizing:border-box}
      button:disabled{opacity:.45;cursor:default}#status{font-size:13px;min-height:1em}
    </style>`;
    this.querySelector('#tabweekly').onclick=()=>{this._tab='weekly';this._dirty=false;this.render();};
    this.querySelector('#tabexceptions').onclick=()=>{this._tab='exceptions';this._dirty=false;this.render();};
    this.querySelector('#tabwakes').onclick=()=>{this._tab="wakes";this.render();};
    this.querySelector('#tabmodes').onclick=()=>{this._tab="modes";this.render();};
    if (isException) {
      this.querySelector('#exceptiondate').onchange=e=>{this._date=e.target.value;this.render();};
      this.querySelectorAll('[data-exceptiondate]').forEach(b=>b.onclick=()=>{this._date=b.dataset.exceptiondate;this.render();});
      this.querySelector('#newexception').onclick=()=>{
        if (!/^\d{4}-\d{2}-\d{2}$/.test(this._date)) return;
        const day=new Date(`${this._date}T12:00:00`).getDay();
        const idx=(day+6)%7;
        this._exceptions[this._date]=this._weekly[String(idx)].map(e=>({...e}));
        this._dirty=true;this.render();
      };
      this.querySelector('#deleteexception').onclick=()=>{delete this._exceptions[this._date];this._dirty=true;this.render();};
    }
    this.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{this._day=Number(b.dataset.day);this.render();});
    this.querySelectorAll('[data-key]').forEach(el=>el.onchange=()=>{(isException?this._exceptions[this._date]:this._weekly[String(this._day)])[Number(el.dataset.i)][el.dataset.key]=el.value;this._dirty=true;this.render();});
    this.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{(isException?this._exceptions[this._date]:this._weekly[String(this._day)]).splice(Number(b.dataset.remove),1);this._dirty=true;this.render();});
    this.querySelector('#add').onclick=()=>{const entries=isException?this._exceptions[this._date]:this._weekly[String(this._day)];let minute=60;while(entries.some(e=>e.time===`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`)&&minute<1440)minute+=30;if(minute>=1440)return;entries.push({time:`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`,profile:Object.keys(this._profiles)[0]});entries.sort((a,b)=>a.time.localeCompare(b.time));this._dirty=true;this.render();};
    this.querySelector('#copy').onclick=()=>{const dest=this.querySelector('#copyday').value;this._weekly[dest]=this._weekly[String(this._day)].map(e=>({...e}));this._dirty=true;this.render();};
    this.querySelector('#reload').onclick=()=>{this._loaded=false;this.load();};
    this.querySelector('#save').onclick=async()=>{const status=this.querySelector('#status');try{await this._hass.callWS(isException?{type:'heating_planner/set_exceptions',entry_id:this._entry,exceptions:this._exceptions}:{type:'heating_planner/set_schedule',entry_id:this._entry,weekly:this._weekly});this._dirty=false;this.render();this.querySelector('#status').textContent='✓ Planning enregistré';}catch(e){status.textContent='Erreur : '+e.message;}};
  }
  renderModes() {
    const ov=this._override||{mode:'planning'};
    const active=ov.mode!=='planning' && ov.until && new Date(ov.until)>new Date();
    const mode=active?ov.mode:'planning';
    const labels={planning:'Planning',manual:'Manuel',boost:'Boost',away:'Absent'};
    const dateLocal=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}T${String(x.getHours()).padStart(2,'0')}:${String(x.getMinutes()).padStart(2,'0')}`;};
    const tomorrow=new Date(Date.now()+86400000);
    this.innerHTML=`<ha-card header="Heating Planner · Modes temporaires"><div class="wrap">
      <p>Mode actif : <b>${labels[mode]}</b>${active?' — jusqu’au '+this.escape(new Date(ov.until).toLocaleString('fr-BE')):''}</p>
      <p class="note">Un seul mode temporaire à la fois. Aucun pilotage du chauffage.</p>
      <div class="actions"><label>Mode <select id="mode"><option value="planning">Planning</option><option value="manual">Manuel</option><option value="boost">Boost</option><option value="away">Absent</option></select></label></div>
      <div id="temporary"><div class="actions"><label>Température (°C) <input id="temperature" type="number" min="5" max="35" step="0.5" value="${this.escape(active?ov.temperature:this._profiles.comfort||21)}"></label>
      <label id="durationlabel">Durée <select id="duration"><option value="30">30 min</option><option value="60">1 h</option><option value="120" selected>2 h</option><option value="240">4 h</option></select></label>
      <label id="untillabel">Jusqu’au <input id="until" type="datetime-local" value="${this.escape(active?dateLocal(ov.until):dateLocal(tomorrow))}"></label></div></div>
      <div class="actions"><button id="apply" class="primary">Appliquer</button><button id="cancel">Retour au planning</button><button id="back">← Semaine</button></div><p id="status" role="status"></p>
    </div></ha-card><style>.wrap{padding:0 16px 16px}.note{font-size:12px;opacity:.75}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}button,input,select{font:inherit;border:1px solid var(--divider-color,#aaa);border-radius:7px;padding:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222)}button{cursor:pointer}.primary{background:var(--primary-color,#03a9f4);color:white}</style>`;
    const $=id=>this.querySelector('#'+id);
    $('mode').value=mode;
    const toggle=()=>{$('temporary').style.display=$('mode').value==='planning'?'none':'';$('durationlabel').style.display=$('mode').value==='away'?'none':'';$('untillabel').style.display=$('mode').value==='away'?'':'none';};
    $('mode').onchange=()=>{if($('mode').value==='boost')$('temperature').value=this._profiles.comfort||21;if($('mode').value==='away')$('temperature').value=this._profiles.night||17;toggle();};toggle();
    const send=async value=>{try{await this._hass.callWS({type:'heating_planner/set_mode',entry_id:this._entry,override:value});this._override=value;this.renderModes();$('status').textContent='✓ Mode enregistré';}catch(e){$('status').textContent='Erreur : '+e.message;}};
    $('apply').onclick=()=>{const m=$('mode').value;if(m==='planning'){send({mode:'planning'});return;}const temperature=Number($('temperature').value);let until;if(m==='away'){until=new Date($('until').value);}else{until=new Date(Date.now()+Number($('duration').value)*60000);}if(!Number.isFinite(temperature)||Number.isNaN(until.getTime())){$('status').textContent='Température ou échéance invalide';return;}send({mode:m,temperature,until:until.toISOString()});};
    $('cancel').onclick=()=>send({mode:'planning'});
    $('back').onclick=()=>{this._tab='weekly';this.render();};
  }
  renderWakes() {
    const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
    const e=this._wakes[this._wakeIdx];
    const day=String(this._wakeDay);
    const slot=e?.times[day];
    const zoneRows=e?this._zones.map(z=>{
      const chosen=e.zones[z.entry_id];
      return `<div class="zone"><label><input type="checkbox" data-zone="${this.escape(z.entry_id)}" ${chosen?'checked':''}> ${this.escape(z.name)}</label> <select data-profile="${this.escape(z.entry_id)}">${z.profiles.map(p=>`<option value="${this.escape(p)}" ${chosen===p?'selected':''}>${this.escape(p)}</option>`).join('')}</select></div>`;
    }).join(''):'';
    this.innerHTML=`<ha-card header="Heating Planner · Réveils"><div class="wrap">
      <p class="note">Réveils partagés entre plusieurs zones, sans commande du chauffage. Un réveil prime sur la semaine et les exceptions.</p>
      <div class="actions"><button id="back">← Semaine</button><button id="addwake">+ Réveil</button>${e?'<button id="deletewake">Supprimer ce réveil</button>':''}</div>
      ${this._wakes.length?`<div class="actions">${this._wakes.map((x,i)=>`<button data-wake="${i}" class="${i===this._wakeIdx?'active':''}">${this.escape(x.name)}</button>`).join('')}</div>`:'<p>Aucun réveil défini.</p>'}
      ${e?`<label>Nom <input id="wakename" value="${this.escape(e.name)}"></label>
        <p>Jours habituels (désactiver un jour pour ne pas appliquer le réveil)</p>
        <div class="days">${days.map((d,i)=>`<button data-wday="${i}" class="${i===this._wakeDay?'active':''}">${d}</button>`).join('')}</div>
        <label><input type="checkbox" id="wakeenabled" ${slot?'checked':''}> Réveil actif ce jour</label>
        <div class="actions"><label>Début <input id="wakestart" type="time" value="${slot?.start||'06:30'}"></label><label>Fin <input id="wakeend" type="time" value="${slot?.end||'08:00'}"></label></div>
        <p>Pièces concernées et profil de chaque pièce :</p>${zoneRows}
        <h4>Modification pour une date précise</h4>
        <div class="actions"><input type="date" id="wakedate" value="${this.escape(this._wakeDate||'')}"><button id="loadwakedate">Voir la date</button><button id="clearwakedate">Revenir au planning habituel</button></div>
        <p id="datehint" class="note"></p><div class="actions"><label>Début <input id="datestart" type="time"></label><label>Fin <input id="dateend" type="time"></label><button id="savedate">Définir cette date</button><button id="disabledate">Pas de réveil à cette date</button></div>
        <p class="note">Dates personnalisées : ${Object.keys(e.dates).sort().join(', ')||'aucune'}</p>`:''}
      <div class="actions"><button id="savewakes" class="primary">Enregistrer les réveils</button><button id="cancelwakes">Annuler</button></div><p id="status" role="status"></p>
      </div></ha-card><style>.wrap{padding:0 16px 16px}.note{font-size:12px;opacity:.75}.days,.actions{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.zone{display:flex;gap:12px;margin:8px 0;align-items:center;flex-wrap:wrap}button,input,select{font:inherit;border:1px solid var(--divider-color,#aaa);border-radius:7px;padding:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222)}button{cursor:pointer}.active,.primary{background:var(--primary-color,#03a9f4);color:white}</style>`;
    const $=id=>this.querySelector('#'+id);
    $('back').onclick=()=>{this._tab='weekly';this.render();};
    $('addwake').onclick=()=>{this._wakes.push({id:'wake_'+Date.now().toString(36),name:'Nouveau réveil',times:Object.fromEntries(Array.from({length:7},(_,i)=>[String(i),i<5?{start:'06:30',end:'08:00'}:{start:'08:00',end:'09:30'}])),dates:{},zones:{[this._entry]:Object.keys(this._profiles)[0]}});this._wakeIdx=this._wakes.length-1;this.render();};
    $('savewakes').onclick=async()=>{try{await this._hass.callWS({type:'heating_planner/set_wakes',events:this._wakes});$('status').textContent='✓ Réveils enregistrés';}catch(err){$('status').textContent='Erreur : '+err.message;}};
    $('cancelwakes').onclick=()=>{this._loaded=false;this.load();};
    if (!e)return;
    $('deletewake').onclick=()=>{this._wakes.splice(this._wakeIdx,1);this._wakeIdx=0;this.render();};
    this.querySelectorAll('[data-wake]').forEach(b=>b.onclick=()=>{this._wakeIdx=Number(b.dataset.wake);this.render();});
    this.querySelectorAll('[data-wday]').forEach(b=>b.onclick=()=>{this._wakeDay=Number(b.dataset.wday);this.render();});
    $('wakename').onchange=ev=>{e.name=ev.target.value;};
    $('wakeenabled').onchange=ev=>{e.times[day]=ev.target.checked?{start:$('wakestart').value,end:$('wakeend').value}:null;this.render();};
    for(const key of ['start','end']) $('wake'+key).onchange=ev=>{if(!e.times[day])e.times[day]={start:$('wakestart').value,end:$('wakeend').value};else e.times[day][key]=ev.target.value;};
    this.querySelectorAll('[data-zone]').forEach(b=>b.onchange=()=>{const id=b.dataset.zone;if(b.checked)e.zones[id]=this.querySelector(`[data-profile="${id}"]`).value;else delete e.zones[id];});
    this.querySelectorAll('[data-profile]').forEach(b=>b.onchange=()=>{if(e.zones[b.dataset.profile])e.zones[b.dataset.profile]=b.value;});
    $('loadwakedate').onclick=()=>{const d=$('wakedate').value;this._wakeDate=d;const v=e.dates[d]===undefined?e.times[String((new Date(d+'T12:00:00').getDay()+6)%7)]:e.dates[d];$('datestart').value=v?.start||'06:30';$('dateend').value=v?.end||'08:00';$('datehint').textContent=d in e.dates?'Exception de réveil enregistrée':'Horaire habituel (pas encore d’exception)';};
    $('savedate').onclick=()=>{const d=$('wakedate').value;if(!d)return;e.dates[d]={start:$('datestart').value,end:$('dateend').value};this._wakeDate=d;this.render();};
    $('disabledate').onclick=()=>{const d=$('wakedate').value;if(!d)return;e.dates[d]=null;this._wakeDate=d;this.render();};
    $('clearwakedate').onclick=()=>{const d=$('wakedate').value;if(!d)return;delete e.dates[d];this._wakeDate=d;this.render();};
    if(this._wakeDate){$('loadwakedate').click();}
  }
  getCardSize(){return 6;}
}
customElements.define('heating-planner-card', HeatingPlannerCard);
window.customCards = window.customCards || [];
window.customCards.push({type:'heating-planner-card',name:'Heating Planner',description:'Éditeur hebdomadaire Heating Planner (préversion)'});
