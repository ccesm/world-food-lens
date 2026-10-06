import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

test("historical provider regressions use immutable accepted baseline bytes",()=>{
  const expected={
    "enso-outlook-baseline.json":"6df109b67cfec459d679c078f06163e76f1a42b032e201ded5aca825b4003ede",
    "drought-monitor-baseline.json":"9bfa18b39b3103b6c756cbb9059da97708064081a057d7eeb96304ecc116de2e",
    "official-data-baseline.json":"f01374a4b5bf8d0049ae852a86193603bdcd481a4d0c77850b219eec31622696",
  };
  for(const [name,hash] of Object.entries(expected)){
    const raw=readFileSync(new URL(`./fixtures/${name}`,import.meta.url));
    assert.equal(createHash("sha256").update(raw).digest("hex"),hash);
    assert.equal(JSON.parse(raw).schemaVersion,1);
  }
  // The immutable data must not be silently consumed by a frontend build.
  const config=readFileSync(new URL("../vite.config.js",import.meta.url),"utf8");
  assert.match(config,/public\/data\/official-data\.json/);
  assert.doesNotMatch(config,/fixtures/);
});
