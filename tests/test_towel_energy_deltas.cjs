/* Regression checks for VIPERA selected-period electricity estimates.
 * Run without Home Assistant and never touch real devices.
 */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

class Element {
  constructor(name="div"){this.name=name;this.children=[];this.attributes={};this.style={};}
  attachShadow(){this.shadowRoot=new Element("shadow");return this.shadowRoot;}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(){}
}
const classes=new Map();
const filepath=path.resolve(__dirname,"../custom_components/tuya_local/www/towel-dryers-managed-panel.js");
let code=fs.readFileSync(filepath,"utf8");
assert.ok(code.includes('types:["mean","change"]'),
  "Request Recorder change, not cumulative sum, for energy series");
assert.ok(code.includes('field:"change"'),
  "Plot the energy change returned by HA");
assert.ok(!code.includes('field:"sum"'),
  "Do not graph the cumulative meter reading");

code=code.replace(/^import\s+\{attachRecorderChartTooltip\}\s+from\s+[^\n]+\n/m,"");
code=code.replaceAll("import.meta.url",
  JSON.stringify("http://localhost/tuya_local/assets/2026.11.7/managed-panel.js"));
const env={
  HTMLElement:Element,URL,Math,Number,Date,String,JSON,Object,
  document:{
    createElement:tag=>new Element(tag),
    createElementNS:(_ns,tag)=>new Element(tag)
  },
  attachRecorderChartTooltip(){},
  customElements:{get:key=>classes.get(key),define:(key,cls)=>classes.set(key,cls)}
};
vm.runInNewContext(code,env,{filename:filepath});
const Panel=classes.get("towel-dryers-managed-v2026-11-7");
assert.ok(Panel,"New version-tagged panel registers");
const panel=new Panel();
panel._range={
  start:"2026-11-01T00:00:00.000Z",
  end:"2026-11-02T00:00:00.000Z"
};
panel._stats={
  "sensor.vipera_energy":[
    {start:1793491200000,sum:90.0,change:0.12},
    {start:1793494800000,sum:90.0,change:0},
    {start:1793498400000,sum:90.0,change:0.31},
    {start:1793502000000,sum:90.0,change:null}
  ]
};
assert.ok(Math.abs(panel._energyChanges("sensor.vipera_energy")-0.43)<1e-9,
  "Sum interval changes, not the unchanged/raw sum meter");
assert.equal(panel._energyChanges("sensor.missing"),null,
  "Unknown history must never be presented as zero consumption");
panel._stats["sensor.vipera_energy"].push(
  {start:1793505600000,change:-0.05}
);
assert.ok(Math.abs(panel._energyChanges("sensor.vipera_energy")-0.38)<1e-9,
  "Do not silently hide Recorder statistics corrections");

const tile=new Element();
panel._tab="overview";
panel._devices=[{energy:"sensor.vipera_energy"}];
panel.shadowRoot.querySelector=key=>
  key==='[data-period-energy="0"]'?tile:null;
panel._syncPeriodEnergy();
assert.match(tile.textContent,/kWh$/,"Summary includes kWh");
assert.ok(!tile.textContent.includes("90"),"Summary is not the lifetime meter");

const chart=new Element();
panel._statsError="";
panel._chart(chart,[{
  id:"sensor.vipera_energy",label:"Consumed",
  field:"change",color:"#57995d"
}],"kWh");
const svg=chart.children.find(n=>n.name==="svg");
assert.ok(svg,"Energy chart rendered");
assert.equal(svg.children.filter(n=>n.name==="polyline").length,0,
  "Consumption uses interval bars, not a cumulative line");
assert.equal(svg.children.filter(n=>n.name==="rect").length,3,
  "Plot non-zero positive and negative changes as bars");
console.log("Towel dryer per-interval delta and selected-period total tests passed");
