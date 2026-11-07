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

// Short-range history must use the ACTUAL reading change at each timestamp,
// not an artificial kWh/hour value. The first pre-period reading is a baseline.
panel._energyHistory["sensor.vipera_energy"]=[
  {s:"12.00",lu:Date.parse("2026-10-31T22:00:00Z")/1000},
  {s:"12.10",lu:Date.parse("2026-11-01T02:00:00Z")/1000},
  {s:"12.45",lu:Date.parse("2026-11-01T04:00:00Z")/1000},
  {s:"0.20",lu:Date.parse("2026-11-01T08:00:00Z")/1000},
  {s:"unavailable",lu:Date.parse("2026-11-01T10:00:00Z")/1000},
  {s:"0.45",lu:Date.parse("2026-11-01T14:00:00Z")/1000},
];
const meter=panel._meterDeltas("sensor.vipera_energy");
assert.deepEqual(Array.from(meter,x=>Math.round(x.y*100)),
  [10,35,20],"Use exact reading deltas; large counter drop is a reset");
assert.equal(meter[0].x,Date.parse("2026-11-01T02:00:00Z"),
  "Place usage at the actual meter update time");
assert.equal(meter[0].from,Date.parse("2026-10-31T22:00:00Z"),
  "Retain previous reading timestamp for the chart tooltip");
assert.ok(Math.abs(panel._energyChanges("sensor.vipera_energy")-.65)<1e-9,
  "Selected-period consumption matches the detailed bars");

const actualChart=new Element();
panel._chart(actualChart,[{
  id:"sensor.vipera_energy",label:"Consumed",
  field:"change",color:"#57995d"
}],"kWh",{detailed:meter});
const actualSvg=actualChart.children.find(x=>x.name==="svg");
assert.equal(actualSvg.children.filter(x=>x.name==="rect").length,3,
  "Short-period chart includes one energy bar for each actual meter increase");
assert.equal(actualSvg.children.filter(x=>x.name==="polyline").length,0,
  "Real reading deltas are not a cumulative curve");

console.log("Towel dryer per-interval delta and selected-period total tests passed");
