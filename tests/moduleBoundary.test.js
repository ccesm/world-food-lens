import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";

const output=await build({entryPoints:["src/components/ModuleBoundary.jsx"],bundle:true,write:false,
  platform:"node",format:"cjs",external:["react"],logLevel:"silent"});
const compiled={exports:{}};
new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {default:ModuleBoundary}=compiled.exports;

function failed(props){
  const boundary=new ModuleBoundary(props);
  boundary.state=ModuleBoundary.getDerivedStateFromError(new Error("boom"));
  return renderToStaticMarkup(boundary.render());
}

test("healthy modules render unchanged inside the boundary",()=>{
  const html=renderToStaticMarkup(React.createElement(ModuleBoundary,{name:"x",lang:"zh"},React.createElement("p",null,"ok")));
  assert.equal(html,"<p>ok</p>");
});
test("a failed module says it is unavailable in the page language, with no data",()=>{
  const zh=failed({name:"food-stress",lang:"zh"});
  assert.match(zh,/role="alert"/);assert.match(zh,/data-module="food-stress"/);
  assert.ok(zh.includes("此模块暂时无法显示"));assert.ok(!zh.includes("could not be displayed"));
  const en=failed({name:"food-stress",lang:"en"});
  assert.ok(en.includes("This section could not be displayed"));assert.ok(!en.includes("此模块"));
});
test("the app-level boundary has no language state and shows both languages",()=>{
  const html=failed({name:"app"});
  assert.ok(html.includes("此模块暂时无法显示"));assert.ok(html.includes("This section could not be displayed"));
});
test("retry clears the error so the module renders again",()=>{
  const boundary=new ModuleBoundary({name:"x",lang:"en",children:"ok"});
  boundary.state={error:new Error("boom")};
  boundary.setState=update=>{boundary.state={...boundary.state,...update};};
  boundary.retry();
  assert.equal(boundary.state.error,null);assert.equal(boundary.render(),"ok");
});
