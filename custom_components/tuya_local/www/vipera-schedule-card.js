/* Vipera NEX HOME weekly schedule Lovelace card, experimental v0.9.
 * Seven days x 24 one-hour slots; 0xff=unset, 30=reserved idle sentinel, 31..60=allowed targets.
 * Reads/writes each dryer's native DP26 via Tuya Local text entities.
 * All writes require explicit confirmation and the card checks state conflicts.
 */
class ViperaScheduleCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._deviceIndex = 0;
    this._day = 0;
    // Persist selected destinations across Home Assistant state updates / redraws.
    // Previously these were stored only in native <select> elements; when HA
    // rebuilt the card, the choices silently reverted to their defaults.
    this._copyLocalDestDay = 1;
    this._copyWeekTargetIndex = null;
    this._copyDayTargetIndex = null;
    this._copyDayTargetDay = 0;
    this._edited = null;
    this._baseline = "";
    this._notice = "";
    this._busy = false;
    this._loaded = false;
    // Rebuilding the DOM while a native <select> is open closes its menu.
    // Home Assistant updates hass very frequently for unrelated entities.
    this._scheduleSignature = null;
    this._pendingScheduleRender = false;
    this._pendingWrites = new Map();
    this.shadowRoot.addEventListener('focusout', (event) => {
      if (event.target?.tagName !== 'SELECT') return;
      queueMicrotask(() => {
        if (this._pendingScheduleRender && this.shadowRoot.activeElement?.tagName !== 'SELECT') {
          this._pendingScheduleRender = false;
          this._render();
        }
      });
    });
  }
  setConfig(config) {
    if (!Array.isArray(config.devices) || !config.devices.length ||
        config.devices.some((d) => !d.name || !d.schedule_entity)) {
      throw new Error("vipera-schedule-card needs devices with name and schedule_entity");
    }
    this._cfg = config;
    this._loaded = false;
    this._edited = null;
    this._scheduleSignature = null;
    this._pendingWrites = new Map();
    this._copyWeekTargetIndex = null;
    this._copyDayTargetIndex = null;
    this._copyLocalDestDay = 1;
    this._copyDayTargetDay = 0;
    if (this._hass) this._render();
  }
  set hass(value) {
    this._hass = value;
    if (!this._cfg) return;
    // The HA frontend may call this setter many times each second as unrelated
    // entities update. Never recreate an open radiator dropdown on every update.
    const state = this._getState();
    const wasLoaded = this._loaded;
    if (!this._loaded && state) this._load(state);
    // Only changes to the three configured schedule entities need a new view.
    const signature = JSON.stringify(this._cfg.devices.map(d => this._getState(d)));
    if (signature === this._scheduleSignature && wasLoaded === this._loaded) return;
    this._scheduleSignature = signature;
    if (this.shadowRoot.activeElement?.tagName === 'SELECT') {
      // Let the user finish choosing a radiator before replacing its menu.
      this._pendingScheduleRender = true;
      return;
    }
    this._pendingScheduleRender = false;
    // A completed HA text.set_value call is NOT proof that the destination
    // has reported the new week. The backend can retain the prior DP26.
    // Keep the destination locked until the reported state matches the write.
    for (const [entity, pending] of this._pendingWrites) {
      if (this._hass?.states?.[entity]?.state === pending.expected) {
        this._pendingWrites.delete(entity);
        if (entity === this._current().schedule_entity && this._edited && ViperaScheduleCard.encode(this._edited) === pending.expected) {
          this._baseline = pending.expected;
        }
        this._notice = `HA reports the intended schedule for ${pending.targetName} (${pending.operation}). Verify persistence in Smart Life; this is not independent device confirmation.`;
      }
    }
    this._render();
  }
  getCardSize() { return 8; }
  _current() { return this._cfg.devices[this._deviceIndex]; }
  _getState(device = this._current()) {
    const state = this._hass?.states?.[device.schedule_entity]?.state;
    return (!state || ["unknown", "unavailable", "none"].includes(state)) ? null : state;
  }
  static decode(raw) {
    if (typeof raw !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) {
      throw new Error('Invalid Base64 schedule');
    }
    const bin = atob(raw);
    // For safety, require FULL 7-day schedule before editing or copying.
    if (bin.length !== 168) throw new Error(`Expected 168 bytes (7 days), got ${bin.length}. Populate all 7 days in Smart Life first.`);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    if (bytes.some(b => b !== 255 && (b < 30 || b > 60))) {
      throw new Error('Schedule contains unknown temperature codes. Writing disabled to preserve them.');
    }
    return bytes;
  }
  static encode(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length !== 168 ||
        bytes.some(b => b !== 255 && (b < 30 || b > 60))) throw new Error('Invalid hourly schedule');
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  // Protect the DP2=30 schedule-idle convention: never write a week
  // that contains an explicit scheduled 30C hour. Read old schedules
  // without modifying them so the user can repair them deliberately.
  static assertNoReserved30(bytes) {
    const first=bytes.indexOf(30);
    if (first!==-1) {
      const day=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][Math.floor(first/24)];
      const hour=first%24;
      throw new Error(`Schedule has 30°C at ${day} ${String(hour).padStart(2,'0')}:00. Replace every scheduled 30°C slot with OFF or 31–60°C before writing.`);
    }
  }
  _load(raw) {
    try {
      this._edited = ViperaScheduleCard.decode(raw);
      this._baseline = raw;
      this._notice = '';
    } catch (e) {
      this._edited = null;
      this._baseline = raw;
      this._notice = `Read-only: ${e.message}`;
    }
    this._loaded = true;
  }
  _dirty() { return !!this._edited && ViperaScheduleCard.encode(this._edited) !== this._baseline; }
  _notify(message) { this._notice = message; this._render(); }
  _node(tag, text, attrs={}) {
    const el = document.createElement(tag);
    if (text !== null && text !== undefined) el.textContent = text;
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, String(v)));
    return el;
  }
  _button(text, handler, opts={}) {
    const b=this._node('button',text);
    b.disabled=!!opts.disabled || this._busy;
    if (opts.warn) b.className='warn';
    b.addEventListener('click',handler);
    return b;
  }
  _select(items,selected,onChange) {
    const el=this._node('select');
    items.forEach((item,i)=>{
      const o=this._node('option',typeof item==='string'?item:item.label);
      o.value=String(typeof item==='string'?i:item.value);
      el.append(o);
    });
    el.value=String(selected);
    // Keep selections synced on both keyboard and pointer changes. Some
    // browsers only commit native select 'change' after it loses focus.
    el.addEventListener('input',()=>onChange(el.value));
    el.addEventListener('change',()=>onChange(el.value));
    return el;
  }
  _switchDevice(index) {
    if (this._dirty()&&!confirm('Discard unsaved schedule changes?')) return;
    this._deviceIndex=index; this._loaded=false; this._day=0;
    this._copyLocalDestDay=1;
    this._copyDayTargetDay=0;
    this._copyWeekTargetIndex=null;
    this._copyDayTargetIndex=null;
    const state=this._getState();
    if(state) this._load(state);
    this._render();
  }
  _setHour(hour) {
    if(!this._edited || this._busy || this._pendingWrites.has(this._current().schedule_entity)) return;
    if (this._getState() !== this._baseline) return this._notify('Reported schedule changed. Reload before editing again.');
    const old=this._edited[this._day*24+hour];
    const answer=prompt(`Set ${this._current().name} / ${this._dayName(this._day)} ${String(hour).padStart(2,'0')}:00–${String(hour+1).padStart(2,'0')}:00\nEnter 31–60°C or OFF. 30°C is reserved for inactive Schedule mode:`,old===255?'OFF':String(old));
    if(answer===null)return;
    const val=answer.trim().toUpperCase()==='OFF' ? 255 : Number(answer.trim());
    if(!Number.isInteger(val)||val!==255&&(val<31||val>60)) {alert('Enter 31–60°C or OFF. 30°C is reserved for inactive Schedule mode.');return;}
    this._edited[this._day*24+hour]=val;
    this._render();
  }
  _dayName(i) { return ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]; }
  _shortDayName(i) { return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]; }
  _chooseDay(day) {
    this._day=day;
    this._copyDayTargetDay=day;
    this._copyLocalDestDay=(day+1)%7;
    this._render();
  }
  _otherDevices() {
    return this._cfg.devices.map((d,i)=>({d,i})).filter(x=>x.i!==this._deviceIndex);
  }
  _ensureCopyTargets(others) {
    const valid=others.map(x=>x.i);
    if (!valid.includes(this._copyWeekTargetIndex)) this._copyWeekTargetIndex=valid[0] ?? null;
    if (!valid.includes(this._copyDayTargetIndex)) this._copyDayTargetIndex=valid[0] ?? null;
  }
  _copyDay(dest) {
    if (!this._edited || dest===this._day || this._dirty() || this._pendingWrites.has(this._current().schedule_entity)) return;
    const source=this._edited.slice(this._day*24,this._day*24+24);
    this._edited.set(source,dest*24);
    this._notify(`Copied ${this._shortDayName(this._day)} to ${this._shortDayName(dest)} in the local draft. Press Save week to write it.`);
  }
  _copyDayToAllLocal() {
    if (!this._edited || this._dirty() || this._pendingWrites.has(this._current().schedule_entity)) return;
    if (!confirm(`Copy ${this._dayName(this._day)} to all other days on ${this._current().name}?\nThis creates a local draft; press Save week to write it.`)) return;
    const source=this._edited.slice(this._day*24,this._day*24+24);
    for (let day=0;day<7;day++) if (day!==this._day) this._edited.set(source,day*24);
    this._notify(`Copied ${this._shortDayName(this._day)} to all days in the local draft. Press Save week to write it.`);
  }
  _checkChangedSinceLoad(target) {
    const state=this._getState(target);
    if(!state)throw new Error(`${target.name}: device schedule entity is unavailable`);
    const pending=this._pendingWrites.get(target.schedule_entity);
    if (pending) {
      throw new Error(`${target.name}: previous ${pending.operation} has not appeared in Home Assistant's DP26. ` +
        'Do not copy another day over stale destination data. Check the schedule in Smart Life and the Weekly schedule raw entity.');
    }
    // Validate reported destination schedule before building a replacement.
    ViperaScheduleCard.decode(state);
    if(target===this._current() && state!==this._baseline)
      throw new Error('Schedule changed externally since loading. Reload instead of overwriting.');
    return state;
  }
  async _write(target,bytes,expected,operation='schedule write') {
    if (this._pendingWrites.has(target.schedule_entity)) {
      throw new Error(`${target.name}: previous write still awaiting Home Assistant DP26 update`);
    }
    if (this._getState(target)!==expected) throw new Error(`${target.name}: schedule changed during operation`);
    ViperaScheduleCard.assertNoReserved30(bytes);
    const encoded=ViperaScheduleCard.encode(bytes);
    if (encoded === expected) return {encoded, changed:false, reported:true};
    await this._hass.callService('text','set_value',{entity_id:target.schedule_entity,value:encoded});
    const reported=this._getState(target)===encoded;
    if (!reported) {
      this._pendingWrites.set(target.schedule_entity, {
        expected: encoded, operation, targetName: target.name
      });
    }
    return {encoded, changed:true, reported};
  }
  async _save() {
    if (!this._edited || !this._dirty() || this._busy)return;
    try {
      const target=this._current();
      const expected=this._checkChangedSinceLoad(target);
      if(!confirm(`Write the edited weekly schedule to ${target.name}? This changes the heater's stored program.`))return;
      this._busy=true;this._render();
      const result=await this._write(target,this._edited,expected,'Save edited week');
      // Do not treat an unacknowledged write as the new baseline.
      if (result.reported) this._baseline=result.encoded;
      this._notify(result.reported
        ? 'HA reports the edited week. Verify persistence in Smart Life (not an independent physical read).'
        : `Save command sent to ${target.name}, but its HA DP26 still shows the old week. Further writes are blocked until it updates.`);
    }catch(e){this._notify(`Not saved: ${e.message}`)}
    finally{this._busy=false;this._render();}
  }
  async _copyToDevice(index) {
    if(!this._edited || this._busy)return;
    if (this._dirty()) return this._notify('Save the current dryer’s unsaved edits before copying to another dryer.');
    if (this._getState() !== this._baseline) return this._notify('Reload the current dryer before copying: its reported schedule changed.');
    if (this._pendingWrites.has(this._current().schedule_entity)) return this._notify('The source dryer has an unconfirmed write. Resolve it before copying.');
    const target=this._cfg.devices[index];
    try {
      const old=this._checkChangedSinceLoad(target);
      if(!confirm(`REPLACE ALL 7 DAYS on ${target.name} with the displayed schedule from ${this._current().name}?\nThis overwrites the entire target schedule.`)) return;
      this._busy=true;this._render();
      const result=await this._write(target,this._edited,old,'Copy whole week');
      this._notify(!result.changed
        ? `${target.name}: destination already has the same 7-day schedule; no write necessary.`
        : result.reported
          ? `Home Assistant reports the new full week on ${target.name}. Verify in Smart Life.`
          : `Whole-week command SENT to ${target.name}, but Home Assistant still reports its OLD schedule. `+
            'Do not copy individual days to this dryer yet; that would use stale destination data. Verify in Smart Life.');
    }catch(e){this._notify(`Not copied: ${e.message}`)}
    finally{this._busy=false;this._render();}
  }
  async _copyDayToDevice(index, destDay) {
    if(!this._edited || this._busy)return;
    if (this._dirty()) return this._notify('Save the current dryer’s unsaved edits before copying to another dryer.');
    if (this._getState() !== this._baseline) return this._notify('Reload the current dryer before copying: its reported schedule changed.');
    if (this._pendingWrites.has(this._current().schedule_entity)) return this._notify('The source dryer has an unconfirmed write. Resolve it before copying.');
    const source=this._current();
    const sourceDay=this._day;
    const target=this._cfg.devices[index];
    try {
      if (!target || index===this._deviceIndex) throw new Error('Select another dryer');
      if (!Number.isInteger(destDay) || destDay<0 || destDay>6) throw new Error('Invalid destination day');
      const old=this._checkChangedSinceLoad(target);
      const next=ViperaScheduleCard.decode(old);
      // Clone the destination's schedule, then replace ONLY its selected 24h.
      // Never overwrite its other six days or use its default dropdown choice.
      const start=destDay*24;
      const dayBytes=this._edited.slice(sourceDay*24,sourceDay*24+24);
      if (next.slice(start,start+24).every((v,i)=>v===dayBytes[i])) {
        this._notify(`${target.name} / ${this._dayName(destDay)} already matches ${source.name} / ${this._dayName(sourceDay)}; nothing to copy.`);
        return;
      }
      next.set(dayBytes,start);
      if(!confirm(`Copy ${this._dayName(sourceDay)} from ${source.name} to ${this._dayName(destDay)} on ${target.name}?\nOnly that one day will be replaced; the other 6 days are preserved.`))return;
      this._busy=true;this._render();
      const result=await this._write(target,next,old,'Copy day');
      const label=`${this._dayName(sourceDay)} (${source.name}) → ${this._dayName(destDay)} (${target.name})`;
      this._notify(result.reported
        ? `Home Assistant reports day copy: ${label}; the other six days were preserved.`
        : `Day-copy command SENT: ${label}, but HA still reports the old destination schedule. `+
          'Further copies to this dryer are blocked until its DP26 changes.');
    }catch(e){this._notify(`Day not copied: ${e.message}`)}
    finally{this._busy=false;this._render();}
  }
  async _resetMeter() {
    const reset=this._current().reset_entity;
    if(!reset)return;
    if(!confirm(`Reset the estimated energy meter for ${this._current().name}?\nThis resets the DEVICE counter; HA historical statistics are normally retained.\nDP105 reset is EXPERIMENTAL and has not been write-tested.`)) return;
    try {
      this._busy=true;this._render();
      await this._hass.callService('button','press',{entity_id:reset});
      this._notify('Experimental reset command sent. Verify the energy counter in Smart Life.');
    }catch(e){this._notify(`Reset not sent: ${e.message}`)}
    finally{this._busy=false;this._render();}
  }
  _render() {
    if(!this._cfg || !this._hass)return;
    const sh=this.shadowRoot; sh.replaceChildren();
    const style=this._node('style');
    style.textContent=`
      :host{display:block;font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif);color:var(--primary-text-color,#222)}
      ha-card{display:block;padding:16px;border-radius:12px;background:var(--card-background-color,#fff);box-shadow:var(--ha-card-box-shadow,0 1px 4px #0002)}
      h2{font-size:19px;margin:0 0 14px}h3{font-size:14px;margin:16px 0 10px}p{margin:8px 0;font-size:13px}
      .bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:9px 0}
      .device-tabs{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
      .device-tab{white-space:normal;text-align:center;flex:1 1 125px;min-width:105px}
      .device-tab.active{background:var(--primary-color,#1985c7);color:white;border-color:var(--primary-color,#1985c7)}
      button,select{border:1px solid var(--divider-color,#ccc);background:var(--secondary-background-color,#f6f7f8);color:var(--primary-text-color,#222);border-radius:7px;padding:7px 9px;cursor:pointer;font:inherit;font-size:13px}
      button:hover{filter:brightness(.95)}button:disabled{opacity:.45;cursor:not-allowed}.warn{color:var(--error-color,#b33)}
      .scroll{width:100%;max-width:100%;overflow-x:visible}
      /* Keep the entire 7 x 24 week visible even in a narrow Sections card.
         40px for day labels, 24 flexible columns for hours; never force a
         minimum width that would push 17:00–23:00 off the screen. */
      .week{display:grid;grid-template-columns:40px repeat(24,minmax(0,1fr));gap:1px;width:100%;min-width:0;box-sizing:border-box}
      .weekday{font-size:10px;padding:2px 0;text-align:right;cursor:pointer;border:0;min-width:0}
      .hourlabel{text-align:center;font-size:8px;min-width:0;overflow:hidden;color:var(--secondary-text-color,#777)}
      .slot{border:0;border-radius:2px;min-width:0;min-height:21px;padding:0;overflow:hidden;background:var(--secondary-background-color,#eee);font-size:8px;line-height:1;white-space:nowrap;cursor:pointer}
      .slot.active{background:#24865b;color:white}.slot.reserved{background:var(--error-color,#b33);color:white}.slot.selected{outline:1.5px solid var(--primary-color,#1985c7)}
      .editgrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
      .editgrid button{padding:9px 4px;line-height:1.5;white-space:normal}.editgrid .active{background:#24865b;color:white}.editgrid .reserved{background:var(--error-color,#b33);color:white}
      .info{font-size:12px;color:var(--secondary-text-color,#666)}.note{font-size:12px;padding:8px;border-radius:6px;background:var(--secondary-background-color,#eee)}
      .section-title{margin:13px 0 6px;font-size:13px;font-weight:650}
      .action-panel{border-top:1px solid var(--divider-color,#ddd);margin-top:13px;padding-top:9px}
      .action-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:5px 0;min-width:0}
      .action-row .prompt{font-size:12px;white-space:nowrap}
      .action-row select{min-width:0;max-width:100%;flex:1 1 110px}
      .action-row .day-select{flex:0 1 76px}
      .action-row button{white-space:nowrap}
      .save-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:7px 0}
      .save-row .primary{background:var(--primary-color,#1985c7);border-color:var(--primary-color,#1985c7);color:white}
      .status{padding:7px 9px;background:var(--secondary-background-color,#eee);border-radius:6px;font-size:12px;margin:7px 0}
      .status.waiting{border-left:3px solid var(--warning-color,#db8c20)}
      .status.error{border-left:3px solid var(--error-color,#b33)}
      .status.success{border-left:3px solid var(--success-color,#24865b)}
    `;
    sh.append(style);
    const card=this._node('ha-card');sh.append(card);
    card.append(this._node('h2',this._cfg.title||'Vipera native weekly schedule'));
    const top=this._node('div',null,{class:'bar'});
    top.append(this._node('span','Towel dryer: '));
    // Three radiator tabs are more robust than a native select inside a card
    // that may be refreshed by Home Assistant's live state updates.
    const deviceTabs=this._node('div',null,{class:'device-tabs'});
    this._cfg.devices.forEach((d,i)=>{
      const tab=this._button(d.name,()=>this._switchDevice(i));
      tab.className='device-tab'+(i===this._deviceIndex?' active':'');
      tab.setAttribute('aria-pressed',String(i===this._deviceIndex));
      deviceTabs.append(tab);
    });
    top.append(deviceTabs);
    card.append(top);
    if(!this._loaded || !this._edited){card.append(this._node('p',this._notice||'Schedule unavailable. Check text entity availability and that DP26 contains 168 bytes.'));return;}
    const state=this._getState();
    const pending=this._pendingWrites.get(this._current().schedule_entity);
    const changedExternally=!!(state && state!==this._baseline && !pending);
    const legacy30=this._edited.reduce((n,value)=>n+(value===30?1:0),0);
    if (legacy30) {
      card.append(this._node('p',`WARNING: ${legacy30} scheduled slot(s) contain 30°C, now reserved for standby. The card will not write a week containing 30°C. Edit each such hour to OFF or an allowed target.`,{class:'note warn'}));
    }
    const grid=this._node('div',null,{class:'week'});
    const head=this._node('div','Hour', {class:'hourlabel'});grid.append(head);
    for(let h=0;h<24;h++)grid.append(this._node('div',String(h).padStart(2,'0'),{class:'hourlabel'}));
    for(let d=0;d<7;d++){
      const db=this._button(this._dayName(d).slice(0,3),()=>this._chooseDay(d));db.className='weekday';grid.append(db);
      for(let h=0;h<24;h++){
        const temp=this._edited[d*24+h];
        const cell=this._node('button',temp===255?'':String(temp));
        cell.className='slot'+(temp===255?'':temp===30?' reserved':' active')+(d===this._day?' selected':'');
        cell.title=`${this._dayName(d)} ${h}:00 – ${temp===255?'Unset':temp+'°C'}`;
        cell.disabled=!!pending || changedExternally || this._busy;
        cell.addEventListener('click',()=>{this._day=d;this._copyDayTargetDay=d;this._setHour(h)});
        grid.append(cell);
      }
    }
    const scroll=this._node('div',null,{class:'scroll'});scroll.append(grid);card.append(scroll);
    card.append(this._node('p','Green = heating target (31–60°C); grey = OFF; red 30°C = old schedule entry that must be corrected.',{class:'info'}));
    card.append(this._node('h3',`${this._dayName(this._day)} — click an hour to edit`));
    const eg=this._node('div',null,{class:'editgrid'});
    for(let h=0;h<24;h++){
      const t=this._edited[this._day*24+h];
      const b=this._button(`${String(h).padStart(2,'0')}:00\n${t===255?'—':t+'°C'}`,()=>this._setHour(h));
      b.style.whiteSpace='pre-line';b.disabled=!!pending || changedExternally || this._busy;
      if(t!==255)b.classList.add(t===30?'reserved':'active');eg.append(b);
    }
    card.append(eg);
    // The save form comes FIRST, then each copy operation gets its own row.
    const panel=this._node('div',null,{class:'action-panel'});card.append(panel);
    panel.append(this._node('div','Save current dryer',{class:'section-title'}));
    const saveRow=this._node('div',null,{class:'save-row'});
    const saveBtn=this._button('Save week',()=>this._save(),{
      disabled:!this._dirty() || !state || changedExternally || !!pending
    });
    saveBtn.classList.add('primary');saveRow.append(saveBtn);
    saveRow.append(this._button('Reload',()=>{
      if (this._pendingWrites.has(this._current().schedule_entity)) return;
      if (this._dirty()&&!confirm('Discard unsaved edits and reload the last HA-reported schedule?')) return;
      this._loaded=false;
      const raw=this._getState();if(raw)this._load(raw);
      this._render();
    },{disabled:!!pending || !state}));
    panel.append(saveRow);
    const status= pending
      ? 'Write sent — waiting for HA to report the updated week. Further edits/copies to this dryer are blocked.'
      : changedExternally
        ? 'Reported schedule changed — reload required before saving or copying.'
        : this._dirty()
          ? 'Unsaved changes — press Save week before copying.'
          : 'No unsaved changes. Schedule shown is the last value reported to Home Assistant.';
    panel.append(this._node('div',status,{class:'status'+(pending?' waiting':changedExternally?' error':this._dirty()?' waiting':'')}));
    if (this._notice) panel.append(this._node('div',this._notice,{class:'status'}));
    // Outstanding copies to OTHER dryers are also shown here, to avoid
    // mistakenly treating a service-call response as a successful device write.
    for (const [entity,check] of this._pendingWrites) {
      const row=this._node('div',null,{class:'status waiting'});
      row.append(this._node('span',`Unconfirmed: ${check.operation} → ${check.targetName}. HA still reports a different DP26 schedule. Check Smart Life before clearing.`));
      row.append(this._button('Clear pending check',()=>{
        if (!confirm(`Clear unconfirmed ${check.operation} for ${check.targetName}?\nThis DOES NOT save, retry, or fix the dryer schedule.\nOnly clear after checking its reported schedule in Smart Life.`)) return;
        this._pendingWrites.delete(entity);
        this._notice=`Pending check cleared for ${check.targetName}; no command sent. Reload before trying again.`;
        this._render();
      }));
      panel.append(row);
    }
    const sourceReady=!this._dirty() && !changedExternally && !pending && !!state;
    panel.append(this._node('div','Copy within this dryer',{class:'section-title'}));
    const localRow=this._node('div',null,{class:'action-row'});
    localRow.append(this._node('span',`Copy ${this._shortDayName(this._day)} →`,{class:'prompt'}));
    const localDay=this._select(Array.from({length:7},(_,d)=>({label:this._shortDayName(d),value:d})),
      this._copyLocalDestDay,value=>{this._copyLocalDestDay=Number(value)});
    localDay.classList.add('day-select');localRow.append(localDay);
    localRow.append(this._button('Copy',()=>this._copyDay(Number(localDay.value)),{
      disabled:!sourceReady || Number(this._copyLocalDestDay)===this._day
    }));
    panel.append(localRow);
    const allRow=this._node('div',null,{class:'action-row'});
    allRow.append(this._node('span',`Copy ${this._shortDayName(this._day)} → all other days`,{class:'prompt'}));
    allRow.append(this._button('Copy',()=>this._copyDayToAllLocal(),{disabled:!sourceReady}));
    panel.append(allRow);
    const others=this._otherDevices();this._ensureCopyTargets(others);
    if(others.length){
      panel.append(this._node('div','Copy to another dryer',{class:'section-title'}));
      const weekRow=this._node('div',null,{class:'action-row'});
      weekRow.append(this._node('span','Week →',{class:'prompt'}));
      const dst=this._select(others.map(x=>({label:x.d.name,value:x.i})),this._copyWeekTargetIndex,
        value=>{this._copyWeekTargetIndex=Number(value)});
      weekRow.append(dst);
      weekRow.append(this._button('Copy',()=>{
        this._copyWeekTargetIndex=Number(dst.value);
        return this._copyToDevice(this._copyWeekTargetIndex);
      },{disabled:!sourceReady || this._pendingWrites.has(this._cfg.devices[this._copyWeekTargetIndex]?.schedule_entity)}));
      panel.append(weekRow);
      const dayRow=this._node('div',null,{class:'action-row'});
      dayRow.append(this._node('span',`${this._shortDayName(this._day)} →`,{class:'prompt'}));
      const target=this._select(others.map(x=>({label:x.d.name,value:x.i})),this._copyDayTargetIndex,
        value=>{this._copyDayTargetIndex=Number(value)});
      dayRow.append(target);
      const targetDay=this._select(Array.from({length:7},(_,d)=>({label:this._shortDayName(d),value:d})),
        this._copyDayTargetDay,value=>{this._copyDayTargetDay=Number(value)});
      targetDay.classList.add('day-select');dayRow.append(targetDay);
      dayRow.append(this._button('Copy',()=>{
        // The visible controls are authoritative at click time.
        this._copyDayTargetIndex=Number(target.value);
        this._copyDayTargetDay=Number(targetDay.value);
        return this._copyDayToDevice(this._copyDayTargetIndex,this._copyDayTargetDay);
      },{disabled:!sourceReady || this._pendingWrites.has(this._cfg.devices[this._copyDayTargetIndex]?.schedule_entity)}));
      panel.append(dayRow);
    }
    if(this._current().reset_entity){
      const resetRow=this._node('div',null,{class:'action-row'});
      resetRow.append(this._button('Reset estimated energy meter (experimental)',()=>this._resetMeter(),{warn:true}));
      card.append(resetRow);
    }
    card.append(this._node('p','DP26 schedules are reported by the dryer through Tuya Local. Scheduled 30°C is reserved for standby. A sent command is not a verified device write; after copying, wait for the destination DP26 to update before further edits.',{class:'info'}));
  }
}
customElements.define('vipera-schedule-card',ViperaScheduleCard);
window.customCards=window.customCards||[];
window.customCards.push({type:'vipera-schedule-card',name:'Vipera weekly schedule',description:'Native seven-day schedule editor and copy tool for Vipera Tuya Local devices'});
