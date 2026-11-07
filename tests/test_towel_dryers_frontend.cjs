/* Offline regression tests for the integration-managed Towel Dryers frontend.
 * Never contacts Home Assistant or sends a Tuya device command.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const folder=path.resolve(__dirname,"../custom_components/tuya_local/www");
const read=(name)=>fs.readFileSync(path.join(folder,name),"utf8");
const version="2026.11.2";

async function main(){
  const classes=new Map();
  class Element {
    constructor(){this.isConnected=true;this.children=[];this.textContent="";}
    attachShadow(){this.shadowRoot=new Element();return this.shadowRoot;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
  }
  const window={customCards:[]};
  const env={
    HTMLElement:Element,
    URL,
    document:{createElement:()=>new Element()},
    customElements:{
      get:key=>classes.get(key),
      define:(key,cls)=>{assert.ok(!classes.has(key),"Duplicate tag "+key);classes.set(key,cls);}
    },
    window,
    console,
  };

  // Evaluate the actual helper modules with their real registry code, giving
  // import.meta.url a versioned URL like Home Assistant's HTTP server does.
  function evalComponent(name,installed){
    let js=read(name);
    js=js.replaceAll("import.meta.url",
      JSON.stringify("/tuya_local/assets/"+installed+"/"+name+"?v="+installed));
    js=js.replace(/^export\s*\{[^\n]*\};?\s*$/gm,"");
    vm.runInNewContext("(()=>{\n"+js+"\n})()",env,{filename:name});
  }
  evalComponent("towel-dryers-date-range-picker.js",version);
  evalComponent("vipera-schedule-card.js",version);
  const legacyPicker=classes.get("towel-dryers-date-range-picker");
  const legacySchedule=classes.get("vipera-schedule-card");
  assert.ok(legacyPicker&&legacySchedule,"Old standalone component names retained");
  assert.ok(classes.has("towel-dryers-date-range-picker-v2026-11-2"));
  assert.ok(classes.has("vipera-schedule-card-v2026-11-2"));

  // Hot loading another release keeps the old standalone card unchanged but
  // defines NEW custom element classes for both managed dependencies.
  evalComponent("towel-dryers-date-range-picker.js","2026.11.3");
  evalComponent("vipera-schedule-card.js","2026.11.3");
  assert.equal(classes.get("towel-dryers-date-range-picker"),legacyPicker);
  assert.equal(classes.get("vipera-schedule-card"),legacySchedule);
  assert.notEqual(classes.get("towel-dryers-date-range-picker-v2026-11-2"),
                  classes.get("towel-dryers-date-range-picker-v2026-11-3"));
  assert.notEqual(classes.get("vipera-schedule-card-v2026-11-2"),
                  classes.get("vipera-schedule-card-v2026-11-3"));
  assert.equal(window.customCards.filter(c=>c.type==="vipera-schedule-card").length,1,
    "Never add duplicate Lovelace card catalog entries");

  const panelText=read("towel-dryers-managed-panel.js");
  assert.ok(panelText.includes('this._el(TD_PICKER_TAG)'));
  assert.ok(panelText.includes('this._el(TD_SCHEDULE_TAG)'));
  assert.ok(panelText.includes('customElements.get(TD_PICKER_TAG)'));
  assert.ok(panelText.includes('customElements.get(TD_SCHEDULE_TAG)'));
  assert.ok(panelText.includes('hasUnsavedSchedule()'));
  assert.ok(panelText.includes('this._schedule._pendingWrites?.size'));

  // Verify the real stable loader's update lifecycle in a minimal browser.
  let current=version,online=true,timer=null;
  const events={};
  window.setInterval=(fn,ms)=>{assert.equal(ms,60000);timer=fn;return 11;};
  window.clearInterval=id=>{assert.equal(id,11);timer=null;};
  window.addEventListener=(key,fn)=>{events["win-"+key]=fn;};
  window.removeEventListener=key=>{delete events["win-"+key];};
  const doc={
    hidden:false,
    createElement:tag=>{
      const C=classes.get(tag);
      return C?new C():new Element();
    },
    addEventListener:(key,fn)=>{events["doc-"+key]=fn;},
    removeEventListener:key=>{delete events["doc-"+key];},
  };
  const loaderEnv={
    ...env,document:doc,
    fetch:async(url,opts)=>{
      assert.ok(url.startsWith("/tuya_local/manifest.json?_="));
      assert.equal(opts.cache,"no-store");
      if(!online)throw Error("HA is restarting");
      return {ok:true,json:async()=>({version:current})};
    },
  };
  vm.runInNewContext(read("towel-dryers-loader.js"),loaderEnv,
    {filename:"towel-dryers-loader.js"});
  const Loader=classes.get("towel-dryers-loader-panel");
  assert.ok(Loader);
  const loader=new Loader();
  loader.hass={states:{}};
  loader.panel={config:{}};
  loader.route={path:"schedules"};
  loader.narrow=true;
  let loaded=[];
  loader._loadModule=async v=>{
    loaded.push(v);
    class Child extends Element {
      constructor(){super();this.unsaved=false;}
      hasUnsavedSchedule(){return this.unsaved;}
    }
    classes.set(loader._tag(v),Child);
  };
  await loader._check();
  assert.equal(loader._version,version);
  assert.equal(loader._active.route.path,"schedules");
  assert.equal(loader._active.narrow,true);
  assert.equal(loader._active.hass,loader._hass);
  const first=loader._active;

  // Unsaved edits, pending writes and running actions all flow through
  // hasUnsavedSchedule() and must prevent a hot swap.
  current="2026.11.3";first.unsaved=true;
  await loader._check();
  assert.equal(loader._active,first);
  assert.equal(loaded.length,1);
  first.unsaved=false;
  await loader._check();
  assert.equal(loader._version,"2026.11.3");
  assert.notEqual(loader._active,first);

  // If HACS replaces files before HA registers routes, keep the working view.
  const previous=loader._active;
  current="2026.11.4";online=false;
  await loader._check();
  assert.equal(loader._active,previous);
  online=true;
  await loader._check();
  assert.equal(loader._version,"2026.11.4");

  loader.connectedCallback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(timer&&events["win-focus"]&&events["doc-visibilitychange"]);
  current="2026.11.5";
  await events["win-focus"]();
  assert.equal(loader._version,"2026.11.5");
  loader.disconnectedCallback();
  assert.equal(timer,null);

  console.log("Towel Dryers frontend hot-update and safety smoke tests passed");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
