#!/usr/bin/env node
import {readFileSync,writeFileSync,renameSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {evaluateHistory} from "./corn_history.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const input=resolve(process.argv[2]??resolve(root,"research/corn-history-inputs.json"));
const output=resolve(process.argv[3]??resolve(root,"src/data/cornHistory.json"));
const raw=readFileSync(input),result=evaluateHistory(JSON.parse(raw));
const hash=x=>createHash("sha256").update(x).digest("hex");
result.replay={inputBytesSha256:hash(raw),sourceFiles:Object.fromEntries([
  "scripts/corn_history.mjs","src/services/cornExposure.js","src/data/cornPilot.json",
  "src/services/cornData.js","src/services/dataContract.js","src/data/dataContract.json",
  "scripts/revision_tracking.mjs","scripts/evaluate_corn_history.mjs",
].map(p=>[p,hash(readFileSync(resolve(root,p)))]))};
result.artifactId=`research-${hash(JSON.stringify([result.artifactId,result.replay]))}`;
mkdirSync(dirname(output),{recursive:true});
const tmp=output+".tmp";
writeFileSync(tmp,JSON.stringify(result)+"\n");renameSync(tmp,output);
console.log(JSON.stringify({artifactId:result.artifactId,summary:result.summary,seasons:result.seasons.map(s=>({year:s.season,...s.stats,revision:s.outcome.revision,spatial:s.spatial.map(x=>({point:x.point,discordant:x.discordantWeeks,paired:x.pairedWeeks}))}))},null,2));
