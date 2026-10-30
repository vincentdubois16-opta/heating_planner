/* Heating Planner v0.3 — lightweight Lovelace weekly editor, no external dependencies. */
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
    const rows = this._weekly[String(this._day)].map((row,i)=>`<div class="row">
      <input aria-label="Heure" type="time" value="${this.escape(row.time)}" data-i="${i}" data-key="time" ${i===0?'disabled':''}>
      <select aria-label="Profil" data-i="${i}" data-key="profile">${profiles.map(p=>`<option value="${this.escape(p)}" ${p===row.profile?'selected':''}>${this.escape(p)} (${this._profiles[p]}°C)</option>`).join('')}</select>
      <button data-remove="${i}" ${i===0?'disabled':''} title="Supprimer">✕</button>
    </div>`).join('');
    this.innerHTML = `<ha-card header="Heating Planner · ${this.escape(this._name)}"><div class="wrap">
      <p class="note">Édition des horaires de démonstration · aucun pilotage du chauffage</p>
      <div class="days">${days.map((d,i)=>`<button data-day="${i}" class="${i===this._day?'active':''}">${d}</button>`).join('')}</div>
      <div class="rows">${rows}</div>
      <div class="actions"><button id="add">+ Plage</button><label>Copier vers <select id="copyday">${days.map((d,i)=>i===this._day?'':`<option value="${i}">${d}</option>`).join('')}</select></label><button id="copy">Copier</button></div>
      <div class="actions"><button id="save" class="primary" ${this._dirty?'':'disabled'}>Enregistrer les 7 jours</button><button id="reload">Annuler</button></div>
      <p id="status" role="status"></p>
    </div></ha-card><style>
      .wrap{padding:0 16px 16px}.note{font-size:12px;opacity:.75}.days,.actions{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
      button,select,input{font:inherit;border:1px solid var(--divider-color,#aaa);border-radius:7px;padding:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222)}
      button{cursor:pointer}.active,.primary{background:var(--primary-color,#03a9f4);color:white}.row{display:flex;gap:8px;margin:7px 0}.row select{flex:1;min-width:0}.row input{width:110px;box-sizing:border-box}
      button:disabled{opacity:.45;cursor:default}#status{font-size:13px;min-height:1em}
    </style>`;
    this.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{this._day=Number(b.dataset.day);this.render();});
    this.querySelectorAll('[data-key]').forEach(el=>el.onchange=()=>{this._weekly[String(this._day)][Number(el.dataset.i)][el.dataset.key]=el.value;this._dirty=true;this.render();});
    this.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{this._weekly[String(this._day)].splice(Number(b.dataset.remove),1);this._dirty=true;this.render();});
    this.querySelector('#add').onclick=()=>{const entries=this._weekly[String(this._day)];let minute=60;while(entries.some(e=>e.time===`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`)&&minute<1440)minute+=30;if(minute>=1440)return;entries.push({time:`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`,profile:Object.keys(this._profiles)[0]});entries.sort((a,b)=>a.time.localeCompare(b.time));this._dirty=true;this.render();};
    this.querySelector('#copy').onclick=()=>{const dest=this.querySelector('#copyday').value;this._weekly[dest]=this._weekly[String(this._day)].map(e=>({...e}));this._dirty=true;this.render();};
    this.querySelector('#reload').onclick=()=>{this._loaded=false;this.load();};
    this.querySelector('#save').onclick=async()=>{const status=this.querySelector('#status');try{await this._hass.callWS({type:'heating_planner/set_schedule',entry_id:this._entry,weekly:this._weekly});this._dirty=false;this.render();this.querySelector('#status').textContent='✓ Planning enregistré';}catch(e){status.textContent='Erreur : '+e.message;}};
  }
  getCardSize(){return 6;}
}
customElements.define('heating-planner-card', HeatingPlannerCard);
window.customCards = window.customCards || [];
window.customCards.push({type:'heating-planner-card',name:'Heating Planner',description:'Éditeur hebdomadaire Heating Planner (préversion)'});
