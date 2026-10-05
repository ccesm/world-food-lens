import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {datasetHealth} from "../src/services/dataHealth.js";

// Compile the real JSX in memory: no network server, browser driver, cache write,
// deployment, or simulated successful provider fetch is required for this check.
const output=await build({entryPoints:["src/components/SourceDesk.jsx"],bundle:true,write:false,
  platform:"node",format:"cjs",external:["react"],define:{"import.meta.env":"{}"},logLevel:"silent"});
const compiled={exports:{}};
new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {default:SourceDesk,HealthDetails}=compiled.exports;
const bundle=JSON.parse(readFileSync(new URL("../public/data/official-data.json",import.meta.url)));
const recovered=JSON.parse(readFileSync(new URL("../public/data/recovered-snapshot.json",import.meta.url)));

test("SourceDesk renders both languages and clearly discloses legacy health availability",()=>{
  for(const lang of ["zh","en"]) {
    const html=renderToStaticMarkup(React.createElement(SourceDesk,{bundle,lang,recovered}));
    assert.match(html,/data-desk/);assert.match(html,/USDA/);assert.match(html,/NOAA/);
    assert.ok(html.includes(lang==="zh"?"旧格式":"legacy feed"));
    assert.ok(html.includes(lang==="zh"?"资料健康与可用性":"Dataset health &amp; usability"));
  }
});
test("health details label assessment snapshots and retained caches without claiming current evidence",()=>{
  const record={...bundle.sources.fao,status:"error",failureKind:"retrieval"};
  const row=datasetHealth(record,{key:"fao",now:Date.parse("2026-10-04T18:00:00Z")});
  for(const lang of ["zh","en"]) {
    const html=renderToStaticMarkup(React.createElement(HealthDetails,{row,lang,snapshot:true}));
    assert.ok(html.includes(lang==="zh"?"评估时可分析":"Analysis at assessment"));
    assert.ok(html.includes(lang==="zh"?"保留有效缓存":"Cache retained after retrieval failure"));
  }
});
