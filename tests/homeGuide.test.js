import test from "node:test";
import assert from "node:assert/strict";
import {guideCopy,logicNodes,guideExamples} from "../src/data/homeGuide.js";

const targets=new Set(["home","how-it-works","food-stress","crop-windows","grain-inventory","food-history","s1","s2","s3","s4","s5","s6","climate","price-outlook","release-calendar"]);

test("homepage flow has ten unique bilingual steps and existing module targets",()=>{
  assert.equal(logicNodes.length,10);
  assert.equal(new Set(logicNodes.map(n=>n.id)).size,10);
  for(const node of logicNodes){
    assert.ok(targets.has(node.target),node.target);
    for(const lang of ["zh","en"]){
      assert.equal(node[lang].length,3);
      assert.ok(node[lang].every(text=>typeof text==="string"&&text.trim().length>0));
    }
  }
});

test("both languages provide five questions and a matching reading route",()=>{
  assert.deepEqual(Object.keys(guideCopy.zh).sort(),Object.keys(guideCopy.en).sort());
  for(const lang of ["zh","en"]){
    const t=guideCopy[lang];
    assert.equal(t.questions.length,5);
    assert.equal(t.steps.length,t.stepTargets.length);
    assert.ok(t.stepTargets.every(target=>targets.has(target)));
    assert.ok(t.unknown&&t.coverage&&t.caveat&&t.primary&&t.secondary);
  }
});

test("expanded learning examples have matching bilingual entries",()=>{
  for(const [id,example] of Object.entries(guideExamples)){
    assert.ok(logicNodes.some(node=>node.id===id));
    assert.equal(example.zh.items.length,example.en.items.length);
    for(const lang of ["zh","en"]){
      assert.ok(example[lang].title);
      assert.ok(example[lang].items.every(item=>typeof item==="string"&&item.length>0));
    }
  }
});

test("guide discloses missing integrations instead of advertising live monitors",()=>{
  const find=id=>logicNodes.find(node=>node.id===id).en[2];
  assert.match(find("weather"),/local weather not yet connected/);
  assert.match(find("importance"),/weights are not yet connected/);
  assert.match(find("importers"),/not connected/);
  assert.match(find("trade"),/historical, not live/);
  assert.match(find("stocks"),/no total-cereal/);
});
