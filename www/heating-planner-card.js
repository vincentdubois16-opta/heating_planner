/* Heating Planner v0.4 — lightweight Lovelace weekly editor, no external dependencies. */
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
      this._weekly = data.weekly;
      this._exceptions = data.exceptions || {};
      this._tab = "weekly";
      this._date = new Date().toLocaleDateString("en-CA");
      this._profiles = data.profiles;
      this._day = 0;
      this._loaded = true;
      this._dirty = false;
      this.render();
    } catch(e) { this.innerHTML = `<ha-card><div style="padding:16px">Heating Planner : ${this.escape(e.message)}</div></ha-card>`; }
    finally { this._loading = false; }
  }
  escape(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  render() {
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
      <p class="note">Édition des horaires de démonstration · aucun pilotage du chauffage</p>
      <div class="actions"><button id="tabweekly" class="${!isException?'active':''}">Semaine</button><button id="tabexceptions" class="${isException?'active':''}">Exceptions datées</button></div>
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
  getCardSize(){return 6;}
}
customElements.define('heating-planner-card', HeatingPlannerCard);
window.customCards = window.customCards || [];
window.customCards.push({type:'heating-planner-card',name:'Heating Planner',description:'Éditeur hebdomadaire Heating Planner (préversion)'});
