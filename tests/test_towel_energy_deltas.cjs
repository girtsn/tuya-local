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
    {start:1793502000000,sum:90.0,change:null},
    // Recorder has zero-usage buckets too. Include the final bucket so the
    // initial test genuinely covers the whole selected day.
    {start:Date.parse("2026-11-01T23:55:00Z"),change:0}
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
assert.ok(Math.abs(panel._energyChanges("sensor.vipera_energy")-.38)<1e-9,
  "Selected-period consumption must agree with the Recorder, not raw meter jumps");
const comparison=panel._energyComparison("sensor.vipera_energy");
assert.ok(comparison.discrepancy);
assert.equal(comparison.trusted,false);
assert.ok(Math.abs(comparison.rawTotal-.65)<1e-9);
assert.ok(Math.abs(comparison.recorder-.38)<1e-9);
const report=new Element();
panel.shadowRoot.querySelector=key=>{
  if(key==='[data-period-energy="0"]')return tile;
  if(key==='[data-energy-audit="0"]')return report;
  return null;
};
report.classList={toggle(key,active){report.warning=key==="warning"&&active;}};
panel._syncPeriodEnergy();
assert.equal(report.warning,true,"Alert on unreconciled raw counter changes");
assert.match(report.textContent,/Raw counter changes/);
assert.ok(tile.textContent.startsWith("0.38"),"Use Recorder-derived total, not raw sum");

// Detailed increments are diagnostic only when totals disagree.
const statChart=new Element();
panel._chart(statChart,[{
  id:"sensor.vipera_energy",label:"Consumed",
  field:"change",color:"#57995d"
}],"kWh");
const statSvg=statChart.children.find(x=>x.name==="svg");
assert.ok(statSvg);
assert.equal(statSvg.children.filter(x=>x.name==="rect").length,3,
  "Use reset-corrected Recorder interval changes for unreliable meters");

panel._energyHistory["sensor.vipera_energy"]=[
  {s:"90.00",lu:Date.parse("2026-10-31T22:00:00Z")/1000},
  {s:"90.12",lu:Date.parse("2026-11-01T02:00:00Z")/1000},
  {s:"90.43",lu:Date.parse("2026-11-01T04:00:00Z")/1000},
  {s:"90.38",lu:Date.parse("2026-11-01T08:00:00Z")/1000}
];
const consistent=panel._energyComparison("sensor.vipera_energy");
assert.ok(consistent.trusted, "Allow detailed timestamp plot when it reconciles");
assert.ok(!consistent.discrepancy);

// Real-world case: the meter states exist for all 7 days, but Recorder
// statistics only started shortly before the end of the selection.
panel._range={
  start:"2026-11-01T00:00:00Z",
  end:"2026-11-08T00:00:00Z"
};
panel._stats["sensor.vipera_energy"]=[
  {start:Date.parse("2026-11-07T19:00:00Z"),change:0.9},
  {start:Date.parse("2026-11-07T20:00:00Z"),change:0.7},
  {start:Date.parse("2026-11-07T21:00:00Z"),change:0.49}
];
panel._energyHistory["sensor.vipera_energy"]=[
  {s:"10.00",lu:Date.parse("2026-10-31T23:00:00Z")/1000},
  {s:"12.00",lu:Date.parse("2026-11-03T02:00:00Z")/1000},
  {s:"14.00",lu:Date.parse("2026-11-05T02:00:00Z")/1000},
  {s:"15.90",lu:Date.parse("2026-11-07T20:00:00Z")/1000},
  {s:"16.90",lu:Date.parse("2026-11-07T21:00:00Z")/1000}
];
const incomplete=panel._energyComparison("sensor.vipera_energy");
assert.equal(incomplete.incomplete,true);
assert.equal(incomplete.coverage.partialStart,true);
assert.equal(incomplete.discrepancy,false,
  "Do not accuse meter of faulty readings when Recorder covers less history");
assert.equal(incomplete.trusted,false,
  "Do not assert that the complete raw timeline matches partial statistics");
assert.ok(incomplete.rawTotal>incomplete.recorder);
panel._syncPeriodEnergy();
assert.ok(tile.textContent.startsWith("2.09"),
  "Report only the portion that is actually in Recorder");
assert.match(report.textContent,/Partial Recorder coverage/);
assert.match(report.textContent,/NOT a full-period total/);
assert.match(report.textContent,/not directly comparable/);

// In a partial week, the daily audit must not conflate statistics
// coverage with successful energy increments. Show exact zero/missing.
const evidence=panel._dailyEnergyAudit("sensor.vipera_energy");
assert.equal(evidence.length,7);
const day3=evidence.find(d=>d.day==="2026-11-03");
const day5=evidence.find(d=>d.day==="2026-11-05");
const day7=evidence.find(d=>d.day==="2026-11-07");
assert.ok(day3&&day5&&day7);
assert.equal(day3.recorder,null,"No Recorder buckets, not fabricated zero");
assert.ok(day3.raw>0,"Raw counter change exists before usable statistics");
assert.equal(day7.statBuckets,3);
assert.ok(Math.abs(day7.recorder-2.09)<1e-9);
assert.ok(day7.raw>0);
assert.equal(evidence.find(d=>d.day==="2026-11-02").raw,null,
  "No raw increment is missing, not zero");

panel._range={start:"2026-08-01T00:00:00Z",end:"2026-10-01T00:00:00Z"};
assert.equal(panel._dailyEnergyAudit("sensor.vipera_energy").length,0,
  "Long range must not show a misleading truncated partial-month table");

// Distinguish significant meter resets from downward corrections.
panel._range={start:"2026-11-01T00:00:00Z",end:"2026-11-02T00:00:00Z"};
panel._energyHistory["sensor.vipera_energy"]=[
  {s:"100.00",lu:Date.parse("2026-10-31T23:00:00Z")/1000},
  {s:"99.50",lu:Date.parse("2026-11-01T02:00:00Z")/1000},
  {s:"0.20",lu:Date.parse("2026-11-01T08:00:00Z")/1000},
  {s:"0.30",lu:Date.parse("2026-11-01T14:00:00Z")/1000}
];
const anomaly=panel._dailyEnergyAudit("sensor.vipera_energy")[0];
assert.equal(anomaly.corrections,1);
assert.equal(anomaly.resets,1);
assert.equal(anomaly.rawChanges,3);
assert.ok(anomaly.raw<0,
  "Retain negative corrections so diagnostic does not imply only increases");

console.log("Towel dryer kWh intervals, Recorder coverage, and source comparison tests passed");
