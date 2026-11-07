import {attachRecorderChartTooltip} from "./chart-hover-tooltip.js";
/* Integration-managed Towel Dryers dashboard for the Vipera Tuya Local profile.
 * Uses the same tabs and date picker as tado X. No manual Lovelace resources.
 * Versions have separate element names so the loader can hot-swap without reload.
 */
const TD_VERSION=(new URL(import.meta.url).pathname.match(/\/assets\/([^/]+)\//)||[])[1]||"dev";
const TD_TAG="towel-dryers-managed-v"+TD_VERSION.replace(/\./g,"-");
const TD_PICKER_TAG="towel-dryers-date-range-picker-v"+TD_VERSION.replace(/\./g,"-");
const TD_SCHEDULE_TAG="vipera-schedule-card-v"+TD_VERSION.replace(/\./g,"-");
let tdPresetRange=null;
class TowelDryersManagedPanel extends HTMLElement{
  constructor(){
    super();
    this.attachShadow({mode:"open"});
    this._hass=null;this._route=null;this._tab="overview";
    this._devices=[];this._deviceSignature="";
    this._assetsReady=false;this._loadingAssets=null;this._assetRetries=0;this._assetError="";
    this._range=null;this._stats={};this._statsError="";this._statsAt=0;this._request=0;
    this._energyHistory={};this._energyHistoryError="";
    this._schedule=null;this._rendered=false;
    this._entityRegistry=null;this._registryPromise=null;this._registryAttempted=false;
  }
  set hass(value){
    this._hass=value;
    if(!this.isConnected)return;
    if(!this._assetsReady){this._ensureAssets();this._render();return;}
    this._ensureRegistry();
    const devices=this._getDevices();
    const signature=devices.map(d=>d.schedule_entity).join("|");
    if(!this._rendered||this._deviceSignature!==signature){
      this._devices=devices;this._deviceSignature=signature;this._render();
    }else{
      this._syncLive();
      if(this._schedule)this._schedule.hass=value;
      if(this._tab==="overview"&&Date.now()-this._statsAt>15*60*1000)this._loadHistory();
    }
  }
  set panel(value){this._panel=value;}
  set narrow(value){this._narrow=Boolean(value);}
  set route(value){
    this._route=value;
    const tab=(value?.path||"").split("/").filter(Boolean)[0];
    const selected=tab==="schedules"?"schedules":"overview";
    if(selected!==this._tab){
      if(this.hasUnsavedSchedule()){
        // Back/forward navigation may not present a confirmation dialog.
        window.history.replaceState(null,"","/tuya-local-towel-dryers/schedules");
        return;
      }
      this._tab=selected;
      if(this._assetsReady&&this._hass&&this.isConnected)this._render();
    }
  }
  connectedCallback(){this._ensureAssets();this._ensureRegistry();if(this._hass)this._render();}
  disconnectedCallback(){this._request++;}
  hasUnsavedSchedule(){
    return Boolean(this._schedule&&(this._schedule._dirty?.()||
      this._schedule._busy||this._schedule._pendingWrites?.size));
  }
  _ensureAssets(){
    if(this._assetsReady||this._loadingAssets||!this.isConnected)return;
    const retry=this._assetRetries?"&retry="+this._assetRetries:"";
    this._assetError="";
    this._loadingAssets=(async()=>{
      const version=encodeURIComponent(TD_VERSION);
      const picker=await import("./towel-dryers-date-range-picker.js?v="+version+retry);
      // Preserve the original card and all its confirmation, conflict and write checks.
      await import("./vipera-schedule-card.js?v="+version+retry);
      if(!customElements.get(TD_SCHEDULE_TAG)||
        !customElements.get(TD_PICKER_TAG))
        throw Error("Versioned Towel Dryers dashboard modules were not registered");
      tdPresetRange=picker.twPresetRange;
      if(typeof tdPresetRange!=="function")throw Error("Date picker not available");
      this._range??=tdPresetRange("last7");
      this._assetsReady=true;
    })().catch(e=>{
      this._assetError=e?.message||String(e);
    }).finally(()=>{
      this._loadingAssets=null;
      if(this.isConnected&&this._hass)this._render();
    });
  }
  _el(tag,text,cls){
    const e=document.createElement(tag);if(text!==null&&text!==undefined)e.textContent=String(text);
    if(cls)e.className=cls;return e;
  }
  _button(label,click,cls){
    const b=this._el("button",label,cls);b.type="button";b.addEventListener("click",click);return b;
  }
  _name(prefix){
    if(/laundry/i.test(prefix))return "−1 floor · Laundry";
    if(/(?:^|_)1fl(?:_|$)/i.test(prefix))return "1st floor · Bathroom";
    if(/2fl.*bathroom/i.test(prefix))return "2nd floor · Bathroom";
    return prefix.replace(/_+/g," ").replace(/\b[a-z]/g,x=>x.toUpperCase());
  }
  _ensureRegistry(){
    if(!this._hass?.callWS||this._registryAttempted||!this.isConnected)return;
    this._registryAttempted=true;
    this._registryPromise=this._hass.callWS({type:"config/entity_registry/list"})
      .then(entries=>{
        if(!Array.isArray(entries))return;
        this._entityRegistry=new Map(entries.map(e=>[e.entity_id,e.device_id]));
        if(this.isConnected&&this._hass&&this._tab==="overview")this._render();
      }).catch(()=>{/* use existing entity names when registry is unavailable */})
      .finally(()=>{this._registryPromise=null;});
  }
  _deviceId(id){
    return this._entityRegistry?.get(id)||this._hass?.entities?.[id]?.device_id||null;
  }
  _getDevices(){
    const states=this._hass?.states||{};
    const suffix="_weekly_schedule_raw";
    const ids=Object.keys(states).filter(id=>id.startsWith("text.")&&id.endsWith(suffix));
    const allIds=Object.keys(states);
    return ids.map(id=>{
      const prefix=id.slice(5,-suffix.length);
      const deviceId=this._deviceId(id);
      const members=deviceId?allIds.filter(candidate=>this._deviceId(candidate)===deviceId):[];
      const resolve=(domain,name)=>{
        const exact=domain+"."+prefix+"_"+name;
        if(states[exact])return exact;
        const candidates=members.filter(candidate=>candidate.startsWith(domain+".")&&
          candidate.endsWith("_"+name));
        return candidates.length===1?candidates[0]:null;
      };
      const fallback=(name)=>{
        const floor=/laundry|basement/i.test(prefix)?"basement":
          /(?:^|_)2fl(?:_|$)/.test(prefix)?"second_floor":
          /(?:^|_)1fl(?:_|$)/.test(prefix)?"first_floor":null;
        const alias=floor&&"sensor.vipera_"+floor+"_"+name+"_temperature";
        return alias&&states[alias]?alias:null;
      };
      return {
        key:prefix,name:this._name(prefix),schedule_entity:id,
        climate:resolve("climate","heating_element"),
        actual:resolve("sensor","actual_temperature")||fallback("actual"),
        target:resolve("sensor","target_temperature")||fallback("target"),
        effective:resolve("sensor","effective_target_temperature"),
        heating:resolve("binary_sensor","heating_requested"),
        energy:resolve("sensor","estimated_energy"),
        cost:resolve("sensor","estimated_energy_cost"),
        timer:resolve("sensor","timer_remaining")
      };
    }).sort((a,b)=>{
      const order=x=>/laundry|basement|(^|_)-1fl(_|$)/i.test(x.key)?0:
        /(^|_)1fl(_|$)/i.test(x.key)?1:/\b2fl\b|(^|_)2fl(_|$)/i.test(x.key)?2:3;
      return order(a)-order(b)||a.name.localeCompare(b.name);
    });
  }
  _state(id){return id?this._hass?.states?.[id]:null;}
  _numeric(id){const s=this._state(id)?.state;const n=Number(s);return s!=null&&s!==""&&Number.isFinite(n)?n:null;}
  _read(d,key){
    const climate=this._state(d.climate);
    switch(key){
      case "actual":return this._numeric(d.actual)??climate?.attributes?.current_temperature??null;
      case "target":return this._numeric(d.target)??climate?.attributes?.temperature??null;
      case "effective":return this._numeric(d.effective);
      case "heating":return this._state(d.heating)?.state==="on"?"Requested":this._state(d.heating)?.state==="off"?"Idle":"Unknown";
      case "mode":return climate?.attributes?.preset_mode||climate?.state||"Unavailable";
      case "energy":return this._numeric(d.energy);
      case "cost":return this._numeric(d.cost);
      case "timer":return this._numeric(d.timer);
      default:return null;
    }
  }
  _display(d,key){
    const value=this._read(d,key);
    if(value===null||value===undefined||value==="unknown"||value==="unavailable")return "—";
    if(["actual","target","effective"].includes(key))return Number(value).toLocaleString(undefined,{maximumFractionDigits:1})+" °C";
    if(key==="energy")return Number(value).toLocaleString(undefined,{maximumFractionDigits:2})+" kWh";
    if(key==="cost")return Number(value).toLocaleString(undefined,{maximumFractionDigits:2})+" €";
    if(key==="timer")return Number(value)+" min";
    return String(value);
  }
  _live(d,key){
    const el=this._el("strong",this._display(d,key));
    el.dataset.device=d.key;el.dataset.live=key;return el;
  }
  _syncLive(){
    const map=new Map(this._devices.map(d=>[d.key,d]));
    for(const e of this.shadowRoot.querySelectorAll("[data-live]")){
      const d=map.get(e.dataset.device);if(d)e.textContent=this._display(d,e.dataset.live);
    }
  }
  _details(id){
    if(!id)return;
    this.dispatchEvent(new CustomEvent("hass-more-info",{
      detail:{entityId:id},bubbles:true,composed:true
    }));
  }
  _navigate(tab){
    if(tab===this._tab)return;
    if(this.hasUnsavedSchedule()){
      if(!window.confirm("Leave Schedules? Unsaved edits or unconfirmed writes could be lost."))return;
      // Pending confirmation is managed by the card; keep it visible until acknowledged.
      if(this._schedule?._pendingWrites?.size||this._schedule?._busy)return;
    }
    this._tab=tab;
    window.history.pushState(null,"",tab==="overview"?"/tuya-local-towel-dryers":"/tuya-local-towel-dryers/"+tab);
    this._render();
  }
  _overview(shell){
    const filter=this._el("section",null,"period");
    filter.append(this._el("span","Shared history period","label"));
    const picker=this._el(TD_PICKER_TAG);
    picker.range=this._range;
    picker.addEventListener("date-range-changed",event=>{
      this._range=event.detail;
      this._loadHistory();
    });
    filter.append(picker);
    shell.append(filter);
    const grid=this._el("main",null,"grid");
    for(const [i,d] of this._devices.entries()){
      const card=this._el("section",null,"card");
      card.append(this._el("h2",d.name));
      const content=this._el("div",null,"device-overview");
      const details=this._el("div",null,"reading-column");
      const metric=this._el("div",null,"metrics");
      for(const [key,title] of [["actual","Actual temperature"],["target","Target temperature"],
        ["heating","Heating"],["mode","Mode"],
        ["period_energy","Energy used in selected period"],
        ["energy","Total estimated energy"],["cost","Total estimated cost"]]){
        const item=this._el("div",null,"metric");
        item.append(this._el("span",title,"label"));
        if(key==="period_energy"){
          const amount=this._el("strong","—");
          amount.dataset.periodEnergy=String(i);
          item.append(amount);
          const status=this._el("small",null,"energy-audit");
          status.dataset.energyAudit=String(i);
          item.append(status);
        }else item.append(this._live(d,key));
        metric.append(item);
      }
      details.append(metric);
      const actions=this._el("div",null,"actions");
      if(d.climate)actions.append(this._button("Open heating controls",()=>this._details(d.climate)));
      if(d.energy)actions.append(this._button("Energy sensor details",()=>this._details(d.energy)));
      details.append(actions);
      content.append(details);
      const graphs=this._el("div",null,"graph-column");
      graphs.append(this._el("h3","Actual and target temperature"));
      const temperature=this._el("div",null,"plot");
      temperature.dataset.plot=String(i)+":temperature";
      graphs.append(temperature);
      if(d.energy){
        const heading=this._el("h3","Estimated electricity consumed (kWh)");
        heading.dataset.energyHeading=String(i);
        graphs.append(heading);
        const energy=this._el("div",null,"plot");
        energy.dataset.plot=String(i)+":energy";
        graphs.append(energy);
      }
      content.append(graphs);
      card.append(content);
      grid.append(card);
    }
    shell.append(grid);
    shell.append(this._el("p","Period energy totals use the same Home Assistant Recorder statistics as the Energy dashboard. Exact meter-reading timestamps are shown only when raw device increments reconcile with Recorder; otherwise the chart uses Recorder interval totals and flags the disagreement. All values are device estimates, not independent electrical measurements.","foot"));
  }
  _schedules(shell){
    const card=this._el(TD_SCHEDULE_TAG);
    card.setConfig({
      title:"Vipera native weekly schedules",
      devices:this._devices.map(d=>({name:d.name,schedule_entity:d.schedule_entity}))
    });
    card.hass=this._hass;
    this._schedule=card;
    shell.append(card);
    shell.append(this._el("p","Saving and copying keep the original confirmation prompts and reported-state conflict checks. DP105 experimental energy reset is not exposed here.","foot"));
  }
  _period(){
    const days=(Date.parse(this._range.end)-Date.parse(this._range.start))/86400000;
    return days<=2?"5minute":days<=21?"hour":days<=120?"day":days<=550?"week":"month";
  }
  _periodLabel(){
    return ({"5minute":"5-minute",hour:"hourly",day:"daily",week:"weekly",month:"monthly"})[this._period()];
  }
  _useDetailedEnergy(){
    // Raw state history is usually retained for 10 days. Avoid downloading
    // unbounded years of events; longer ranges use Recorder's reset-safe
    // interval changes instead.
    const duration=Date.parse(this._range.end)-Date.parse(this._range.start);
    return Number.isFinite(duration)&&duration>0&&duration<=7*86400000;
  }
  _historyTime(row){
    const raw=row?.lu??row?.last_updated??row?.lc??row?.last_changed;
    if(typeof raw==="number")return raw<1e11?raw*1000:raw;
    return typeof raw==="string"?Date.parse(raw):NaN;
  }
  _meterDeltas(id){
    const rows=this._energyHistory[id];
    if(!Array.isArray(rows)||rows.length<2)return null;
    const from=Date.parse(this._range.start),until=Math.min(Date.parse(this._range.end),Date.now());
    const states=rows.map(row=>({
      x:this._historyTime(row),
      value:Number(row.s??row.state),
      raw:row.s??row.state,
    })).filter(p=>Number.isFinite(p.x)).sort((a,b)=>a.x-b.x);
    const intervals=[];
    let previous=null;
    for(const reading of states){
      if(reading.raw==null||String(reading.raw).trim()===""||
        !Number.isFinite(reading.value)||reading.value<0){
        previous=null;continue;
      }
      if(previous&&reading.x>previous.x&&reading.x>=from&&reading.x<=until){
        const difference=reading.value-previous.value;
        // HA's total_increasing resets after a large drop. Preserve
        // smaller negative corrections, not fabricated positive usage.
        const change=difference<0&&
          difference < -previous.value*.1 ? reading.value : difference;
        intervals.push({x:reading.x,y:change,from:previous.x});
      }
      previous=reading;
    }
    return intervals.length?intervals:null;
  }
  _energyChanges(id){
    // HA Energy uses Recorder's sum/change statistics, NOT a hand-built sum
    // of DP102 raw readings. Preserve that as the sole period-total source.
    const rows=id?this._stats[id]:null;
    if(!Array.isArray(rows))return null;
    const changes=rows.map(p=>p.change).filter(v=>v!=null&&Number.isFinite(Number(v)));
    return changes.length?changes.reduce((total,v)=>total+Number(v),0):null;
  }
  _energyComparison(id){
    const recorder=this._energyChanges(id);
    const raw=this._meterDeltas(id);
    if(recorder===null)return {recorder,raw,rawTotal:null,trusted:false,discrepancy:false};
    if(!raw)return {recorder,raw,rawTotal:null,trusted:false,discrepancy:false};
    const rawTotal=raw.reduce((total,p)=>total+p.y,0);
    const difference=Math.abs(rawTotal-recorder);
    // With independent Recorder bucket rounding, a few hundredths of kWh
    // are normal. Large differences are diagnostic, not consumption.
    const tolerance=Math.max(0.1,Math.abs(recorder)*.05);
    const trusted=difference<=tolerance;
    return {recorder,raw,rawTotal,trusted,discrepancy:!trusted,difference};
  }
  _kwh(value){
    return Number(value).toLocaleString(undefined,{
      minimumFractionDigits:2,maximumFractionDigits:3
    })+" kWh";
  }
  _syncPeriodEnergy(){
    if(this._tab!=="overview")return;
    for(const [i,d] of this._devices.entries()){
      const target=this.shadowRoot.querySelector('[data-period-energy="'+i+'"]');
      if(!target)continue;
      const comparison=this._energyComparison(d.energy);
      target.textContent=comparison.recorder==null?"—":this._kwh(comparison.recorder);
      const note=this.shadowRoot.querySelector('[data-energy-audit="'+i+'"]');
      if(note){
        note.classList.toggle("warning",comparison.discrepancy);
        if(comparison.discrepancy){
          note.textContent="Raw device counter changes: "+this._kwh(comparison.rawTotal)+
            " (differs by "+this._kwh(comparison.difference)+
            "). Chart uses Recorder, as HA Energy does. Check source entity and DP102 counter.";
        }else if(comparison.recorder===null){
          note.textContent="No Recorder energy statistics for this sensor. "+
            (comparison.raw?"Raw counter changes are unverified; not used as consumption.":"");
        }else note.textContent=comparison.raw?
          "Raw counter changes agree with Recorder (within 5% or 0.1 kWh).":
          "Based on HA Recorder energy statistics.";
        note.textContent+=" Source: "+(d.energy||"no matching energy sensor")+".";
      }
    }
  }
  async _loadHistory(){
    if(!this._hass||!this._range||this._tab!=="overview")return;
    const token=++this._request;
    const ids=[...new Set(this._devices.flatMap(d=>[d.actual,d.target,d.energy])
      .filter(id=>id&&["measurement","total","total_increasing"].includes(
        this._state(id)?.attributes?.state_class)))];
    this._statsAt=Date.now();
    this._stats={};this._energyHistory={};this._energyHistoryError="";
    this._statsError=ids.length?"Loading Recorder statistics…":"No statistics-enabled temperature or energy entities found.";
    this._drawHistory();
    if(!ids.length)return;
    const detailedIds=this._useDetailedEnergy()
      ? [...new Set(this._devices.map(d=>d.energy).filter(Boolean))] : [];
    // The two queries are independent. If detailed history was purged, the
    // chart falls back to HA's aggregated Recorder change statistics.
    const [statistics,detailed]=await Promise.allSettled([
      this._hass.callWS({
        type:"recorder/statistics_during_period",start_time:this._range.start,
        end_time:this._range.end,statistic_ids:ids,period:this._period(),
        types:["mean","change"]
      }),
      detailedIds.length
        ? this._hass.callWS({
            type:"history/history_during_period",
            start_time:this._range.start,end_time:this._range.end,
            entity_ids:detailedIds,
            include_start_time_state:true,significant_changes_only:true,
            minimal_response:true,no_attributes:true
          })
        : Promise.resolve({})
    ]);
    if(token!==this._request||this._tab!=="overview")return;
    if(statistics.status==="fulfilled"){
      this._stats=statistics.value||{};this._statsError="";
    }else{
      this._stats={};
      this._statsError="Recorder statistics unavailable: "+
        (statistics.reason?.message||String(statistics.reason));
    }
    if(detailed.status==="fulfilled"){
      const result=detailed.value||{};
      if(Array.isArray(result)){
        // Compatible with legacy Recorder responses which return arrays.
        this._energyHistory=Object.fromEntries(detailedIds.map((id,i)=>[id,result[i]||[]]));
      }else this._energyHistory=result;
    }else{
      this._energyHistoryError=String(detailed.reason?.message||detailed.reason);
    }
    this._drawHistory();
  }
  _drawHistory(){
    if(this._tab!=="overview")return;
    this._syncPeriodEnergy();
    for(const [i,d] of this._devices.entries()){
      const heading=this.shadowRoot.querySelector('[data-energy-heading="'+i+'"]');
      const comparison=this._energyComparison(d.energy);
      const detailed=comparison.trusted?comparison.raw:null;
      if(heading)heading.textContent=detailed
        ? "Estimated consumption between verified meter readings (kWh)"
        : "Estimated consumption (kWh) — "+this._periodLabel()+" Recorder totals";
      const temperature=this.shadowRoot.querySelector('[data-plot="'+i+':temperature"]');
      if(temperature)this._chart(temperature,[
        {id:d.actual,label:"Actual",field:"mean",color:"#2196a1"},
        {id:d.target,label:"Target",field:"mean",color:"#d18b38"}
      ],"°C");
      const energy=this.shadowRoot.querySelector('[data-plot="'+i+':energy"]');
      if(energy)this._chart(energy,[
        {id:d.energy,label:"Consumed",field:"change",color:"#57995d"}
      ],"kWh",{detailed});
    }
  }
  _timestamp(value){
    // Recorder statistics send numeric Unix milliseconds. Never Date.parse()
    // them: interpreting milliseconds as date strings drops all valid points.
    if(value==null)return NaN;
    if(typeof value==="number"||/^\\d+$/.test(String(value))){
      const number=Number(value);
      return number>0&&number<1e11?number*1000:number;
    }
    return Date.parse(value);
  }
  _chart(host,series,unit,{detailed=null}={}){
    host.replaceChildren();
    if(this._statsError){
      host.append(this._el("p",this._statsError,"foot"));return;
    }
    const isEnergy=series.length===1&&series[0].field==="change";
    const graphs=series.filter(s=>s.id).map(s=>({
      ...s,points:isEnergy&&detailed!==null?detailed:
        (Array.isArray(this._stats[s.id])?this._stats[s.id]:[])
        .filter(p=>p.start!=null&&p[s.field]!=null)
        .map(p=>({x:this._timestamp(p.start),y:Number(p[s.field])}))
        .filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))
        .sort((a,b)=>a.x-b.x)
    })).filter(s=>s.points.length);
    if(!graphs.length){
      const names=series.map(item=>item.id).filter(Boolean);
      host.append(this._el("p",
        names.length?
          "No Recorder samples in this period for "+names.join(", ")+". Check Developer Tools → Statistics.":
          "No matching sensor entity was found for this dryer. Check its Tuya Local entity names.",
        "foot"));return;
    }
    const all=graphs.flatMap(s=>s.points);
    // The chart's horizontal axis always represents the selected date range,
    // not the first/last available sample (which can be sparse).
    const left=Date.parse(this._range.start),right=Date.parse(this._range.end);
    let lo=Math.min(...all.map(p=>p.y)),hi=Math.max(...all.map(p=>p.y));
    if(isEnergy){
      // Interval energy is a quantity, not a meter reading. Include the
      // zero baseline and retain negative statistics corrections if present.
      lo=Math.min(0,lo);hi=Math.max(0,hi);
      const scale=hi-lo||1;hi+=scale*.08;
      if(lo<0)lo-=scale*.08;
    }else{
      const pad=(hi-lo||Math.max(Math.abs(hi),1))*.1;lo-=pad;hi+=pad;
    }
    const doc="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(doc,"svg");
    svg.setAttribute("viewBox","0 0 720 195");
    svg.setAttribute("role","img");svg.setAttribute("aria-label",
      (series.length===1&&series[0].field==="change"?"Energy consumed per interval":"Recorder statistics")+" in "+unit);
    const x=p=>50+620*(right===left?.5:(p-left)/(right-left));
    const y=v=>154-126*(v-lo)/(hi-lo);
    for(let n=0;n<4;n++){
      const level=28+42*n;
      const line=document.createElementNS(doc,"line");
      for(const [k,v] of Object.entries({x1:50,x2:670,y1:level,y2:level,stroke:"var(--divider-color,#ddd)","stroke-width":"1"}))line.setAttribute(k,v);
      svg.append(line);
      const text=document.createElementNS(doc,"text");
      text.setAttribute("x","45");text.setAttribute("y",String(level+4));text.setAttribute("text-anchor","end");
      text.setAttribute("font-size","12");text.setAttribute("fill","var(--secondary-text-color,#777)");
      text.textContent=(hi-(level-28)/126*(hi-lo)).toFixed(1);svg.append(text);
    }
    for(const s of graphs){
      if(isEnergy){
        const baseline=y(0);
        const spacing=620/Math.max(1,s.points.length);
        const barWidth=Math.max(1,Math.min(26,spacing*.8));
        for(const p of s.points){
          if(p.y===0)continue;
          const top=Math.min(baseline,y(p.y));
          const bar=document.createElementNS(doc,"rect");
          for(const [k,v] of Object.entries({
            x:(x(p.x)-barWidth/2).toFixed(1),y:top.toFixed(1),
            width:barWidth.toFixed(1),
            height:Math.max(1,Math.abs(y(p.y)-baseline)).toFixed(1),
            fill:p.y<0?"var(--warning-color,#c27a30)":s.color
          }))bar.setAttribute(k,String(v));
          const tooltip=document.createElementNS(doc,"title");
          tooltip.textContent=p.y.toLocaleString(undefined,{maximumFractionDigits:3})+
            " kWh"+(p.from!=null?" from "+new Date(p.from).toLocaleString():"")+
            " to "+new Date(p.x).toLocaleString();
          bar.append(tooltip);svg.append(bar);
        }
      }else{
        const path=document.createElementNS(doc,"polyline");
        path.setAttribute("points",s.points.map(p=>x(p.x).toFixed(1)+","+y(p.y).toFixed(1)).join(" "));
        path.setAttribute("fill","none");path.setAttribute("stroke",s.color);
        path.setAttribute("stroke-width","2.5");path.setAttribute("stroke-linejoin","round");
        path.setAttribute("stroke-linecap","round");svg.append(path);
        if(s.points.length===1){
          const circle=document.createElementNS(doc,"circle");
          circle.setAttribute("cx",String(x(s.points[0].x)));
          circle.setAttribute("cy",String(y(s.points[0].y)));
          circle.setAttribute("r","4");circle.setAttribute("fill",s.color);svg.append(circle);
        }
      }
    }
    for(const [t,anchor,at] of [[left,"start",50],[right,"end",670]]){
      const label=document.createElementNS(doc,"text");
      label.setAttribute("x",String(at));label.setAttribute("y","182");
      label.setAttribute("text-anchor",anchor);label.setAttribute("font-size","12");
      label.setAttribute("fill","var(--secondary-text-color,#777)");
      label.textContent=new Date(t).toLocaleDateString();svg.append(label);
    }
    host.append(svg);
    attachRecorderChartTooltip(host,svg,
      graphs.map(s=>({label:s.label,color:s.color,points:s.points})),
      {start:left,end:right,width:720,height:195,left:50,right:50,
        top:28,bottom:41,yFor:y,period:this._period(),unit});
    const legend=this._el("div",null,"legend");
    for(const s of graphs){
      // Show actual physical quantities, not the internal Recorder sample count.
      // Temperature is the most recent plotted bucket's average, while energy
      // represents all available consumption changes within the chosen dates.
      const value=isEnergy
        ? s.points.reduce((total,p)=>total+p.y,0)
        : s.points[s.points.length-1].y;
      const digits=isEnergy?3:1;
      const amount=value.toLocaleString(undefined,{
        minimumFractionDigits:isEnergy?2:1,maximumFractionDigits:digits
      });
      const detail=isEnergy
        ? amount+" kWh consumed in selected period"
        : amount+" °C (latest recorded)";
      const item=this._el("span",s.label+" · "+detail);
      item.style.borderLeft="4px solid "+s.color;
      legend.append(item);
    }
    host.append(legend);
  }
  _mobileMenuButton(){
    // A custom panel owns its header on narrow screens; HA does not supply one.
    const button=document.createElement("button");
    button.type="button";
    button.className="ha-mobile-menu";
    button.title="Open Home Assistant menu";
    button.setAttribute("aria-label","Open Home Assistant menu");
    const icon=document.createElement("ha-icon");
    icon.setAttribute("icon","mdi:menu");
    icon.setAttribute("aria-hidden","true");
    button.append(icon);
    button.addEventListener("click",()=>this.dispatchEvent(
      new Event("hass-toggle-menu",{bubbles:true,composed:true})
    ));
    return button;
  }
  _render(){
    if(!this.isConnected||!this._hass)return;
    const root=this.shadowRoot;root.replaceChildren();this._rendered=false;this._schedule=null;
    const style=this._el("style");style.textContent=[
      ":host{display:block;color:var(--primary-text-color);font:var(--primary-font-family,Roboto,Arial,sans-serif)}",
      "*{box-sizing:border-box}",
      ".ha-mobile-menu{display:none;align-items:center;justify-content:center;width:40px;height:40px;flex:0 0 40px;padding:8px;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}",
      ".ha-mobile-menu:focus-visible{outline:2px solid var(--primary-color,#03a9f4);outline-offset:2px}",
      ".heading-group{display:flex;align-items:center;gap:10px;min-width:0}",
      "@media(max-width:870px){.ha-mobile-menu{display:inline-flex}}",
      ".shell{max-width:1280px;margin:0 auto;padding:16px 18px 32px}",
      ".title{font-size:24px;font-weight:600;margin:0 0 4px}",
      ".subtitle,.foot,.label{font-size:13px;color:var(--secondary-text-color,#777)}",
      ".subtitle{margin:0 0 16px}",
      ".tabs{display:flex;gap:7px;border-bottom:1px solid var(--divider-color,#ddd);padding-bottom:10px;margin:0 0 16px;flex-wrap:wrap}",
      "button{font:inherit;border:1px solid var(--divider-color,#ccc);color:var(--primary-text-color);background:var(--card-background-color,#fff);border-radius:9px;padding:9px 13px;cursor:pointer}",
      "button:disabled{opacity:.5;cursor:default}",
      ".tab.selected{background:var(--primary-color,#1976d2);border-color:var(--primary-color,#1976d2);color:white}",
      ".grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}",
      ".device-overview{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,2fr);gap:18px}",
      ".reading-column,.graph-column{min-width:0}",
      ".graph-column h3{font-size:14px;font-weight:600;margin:4px 0 8px}",
      ".card{border:1px solid var(--divider-color,#ddd);border-radius:12px;background:var(--card-background-color,#fff);padding:17px;margin-bottom:14px;min-width:0}",
      ".card h2{font-size:17px;font-weight:600;margin:0 0 14px}",
      ".card h3{font-size:14px;font-weight:600;margin:16px 0 8px}",
      ".metrics{display:grid;grid-template-columns:1fr 1fr;gap:16px}",
      ".metric{display:flex;flex-direction:column;gap:5px;min-width:0}",
      ".metric strong{font-size:18px;font-weight:600;overflow-wrap:anywhere}",
      ".actions{margin-top:17px;display:flex;gap:7px;flex-wrap:wrap}",
      ".period{display:flex;flex-direction:column;align-items:start;gap:8px;margin-bottom:18px}",
      ".plot{min-height:100px}.plot svg{display:block;width:100%;max-height:280px}",
      ".legend{display:flex;flex-wrap:wrap;gap:15px;font-size:12px;color:var(--secondary-text-color,#777)}",
      ".legend span{padding-left:6px}",
      ".energy-audit{display:block;font-size:11px;color:var(--secondary-text-color,#777);line-height:1.45;margin-top:4px}",
      ".energy-audit.warning{color:var(--warning-color,#c38320);font-weight:600}",
      ".chart-card{margin-bottom:15px}",
      ".foot{line-height:1.6;margin:10px 0}",
      ".error{border-left:3px solid var(--error-color,#d44);padding:10px 12px}",
      "@media(max-width:850px){.device-overview{grid-template-columns:minmax(0,1fr)}}",
      "@media(max-width:650px){.shell{padding:12px}.metrics{gap:10px}}"
    ].join("\n");root.append(style);
    const shell=this._el("main",null,"shell");
    const headingGroup=this._el("div",null,"heading-group");
    headingGroup.append(this._mobileMenuButton(),this._el("h1","Towel Dryers","title"));
    shell.append(headingGroup);
    shell.append(this._el("p","Vipera NEX HOME · Tuya Local integration-managed dashboard","subtitle"));
    if(!this._assetsReady){
      const message=this._el("div",this._assetError?
        "Dashboard modules could not load: "+this._assetError:
        "Loading dashboard modules…","card"+(this._assetError?" error":""));
      shell.append(message);
      if(this._assetError)shell.append(this._button("Retry loading",()=>{
        this._assetRetries++;this._assetError="";this._ensureAssets();this._render();
      }));
      root.append(shell);return;
    }
    this._devices=this._getDevices();this._deviceSignature=this._devices.map(d=>d.schedule_entity).join("|");
    const tabs=this._el("nav",null,"tabs");
    for(const [title,key] of [["Overview","overview"],["Schedules","schedules"]]){
      const b=this._button(title,()=>this._navigate(key),"tab"+(this._tab===key?" selected":""));
      b.setAttribute("aria-current",this._tab===key?"page":"false");
      tabs.append(b);
    }
    shell.append(tabs);
    if(!this._devices.length){
      shell.append(this._el("p","No Vipera weekly schedule entities detected. Check that the towel dryers and their Weekly schedule raw text entities are enabled in Tuya Local.","card"));
    }else if(this._tab==="schedules")this._schedules(shell);
    else this._overview(shell);
    root.append(shell);this._rendered=true;
    if(this._tab==="overview"){
      this._drawHistory();
      if(Date.now()-this._statsAt>15*60*1000)this._loadHistory();
    }
  }
}
if(!customElements.get(TD_TAG))customElements.define(TD_TAG,TowelDryersManagedPanel);
