import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {evaluateAutomaticAlerts} from "../src/services/automaticAlerts.js";
import {buildPhase2} from "../scripts/revision_tracking.mjs";

const output=await build({entryPoints:["src/components/LatestChanges.jsx"],bundle:true,write:false,
  platform:"node",format:"cjs",external:["react"],define:{"import.meta.env":"{}"},logLevel:"silent"});
const compiled={exports:{}};
new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const LatestChanges=compiled.exports.default;
test("Latest Changes renders bilingual legacy, health-only and archive states without market claims",()=>{
  const monitor=evaluateAutomaticAlerts({now:Date.parse("2026-09-20T12:00:00Z")});
  monitor.release={id:`release-${"a".repeat(64)}`};
  const analysis=buildPhase2({monitor});
  for(const lang of ["zh","en"]) {
    const legacy=renderToStaticMarkup(React.createElement(LatestChanges,{lang}));
    assert.ok(legacy.includes(lang==="zh"?"基线":"baseline"));
    const html=renderToStaticMarkup(React.createElement(LatestChanges,{lang,analysis,archive:true}));
    for(const wording of lang==="zh"?["不是市场信号","历史发布记录","记录窗口不完整","不代表当前状态"]:
      ["not market signals","Historical release record","Incomplete window","not current conditions"])
      assert.ok(html.includes(wording),wording);
    assert.ok(!html.includes("bullish"));assert.ok(!html.includes("看涨"));
  }
});
