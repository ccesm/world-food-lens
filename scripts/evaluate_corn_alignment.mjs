#!/usr/bin/env node
/** Diagnostic comparison ONLY: no outcomes, holdouts, parameter search or email.
 * Read legacy artifacts; write a distinct new artifact. Never overwrite Phase 4A.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {buildAlignment,alignment,addDay,validAlignment} from "../src/services/cornAlignment.js";
import {asOfOfficial} from "./corn_history.mjs";
import {config,cropStage,estimatedStage} from "../src/services/cornExposure.js";
import {digest} from "./revision_tracking.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
// Fixed-order attribution: legacy -> publication-aligned legacy stage gate ->
// new cumulative stage semantics. This counterfactual retains legacy calendar
// fallback ONLY for attribution, never in the published new-method artifact.
// No future progress enters even this intermediate diagnostic.
function temporalOnlyScreen(r) {
  if(!r.mapping||!r.weatherCovered||r.productionWeight===null)return {heat:null,moisture:null};
  const region=config.regions.find(x=>x.id===r.state);
  const relevant=r.daily.map(d=>{
    const report=d.stage&&d.edition?{weekEnding:d.edition.weekEnding,regions:{[r.state]:{progress:d.stage.cumulative}}}:null;
    const s=cropStage(region,d.date,report),p=s.officialProgress,week=s.weekEnding;
    if(p&&(p.mature===100||p.harvested===100)&&d.date>=week)return false;
    if(p?.silking===0&&d.date<=week)return false;
    if(d.date===week&&s.reproductiveRelevant!==null)return s.reproductiveRelevant;
    return ["silking","grainFill"].includes(estimatedStage(region,d.date));
  });
  return {heat:r.weather.days.filter((d,i)=>relevant[i]&&d.max>=35).length>=3,
    moisture:relevant.every(Boolean)&&r.weather.rainTotal<r.weather.normal.rainP20&&r.weather.rootMean<r.weather.normal.rootP20};
}
export function compareAlignment(input,legacy) {
  if(input?.schemaVersion!==1||input.protocol!=="corn-history/1"||legacy?.methodologyVersion!=="us-corn-point-exposure/v1"||
    digest(input)!==legacy.inputHash||JSON.stringify(input.seasons)!==JSON.stringify([2012,2013,2014,2015,2016,2017,2018,2019]))
    throw new Error("Historical inputs must match the frozen Phase 4A artifact and 2012–2019 protocol");
  const states=r=>({heat:r.joint?r.screen.heat:null,moisture:r.joint?r.screen.moisture:null});
  const inputVersions={};
  const remember=v=>{const id=`${v.datasetId}/${v.contentHash}`;inputVersions[id]=v;return id;};
  const seasons=legacy.seasons.map(old=>{
    const production=asOfOfficial(input.annual,`${old.season}-04-01`,{year:old.season-1});
    const timeline=old.timeline.map(w=>{
      const at=`${addDay(w.end,4)}T00:00:00.000Z`,id=`release-${digest([alignment.methodVersion,input.schemaVersion,old.season,w.end,legacy.inputHash])}`;
      const a=buildAlignment({production,progress:input.progress,weather:input.weather,baselines:input.baselines,
        end:w.end,evaluatedAt:at,releaseId:id});
      if(!validAlignment(a,id,at))throw new Error(`Invalid historical alignment ${w.end}`);
      const comparisons=a.regions.map(r=>{
        const p=w.regions.find(x=>x.id===r.state),current=states(r),prior={heat:p?.eligible?p.weather.heat:null,moisture:p?.eligible?p.weather.moisture:null};
        const temporalOnly=temporalOnlyScreen(r),different=(x,y)=>x.heat!==y.heat||x.moisture!==y.moisture;
        const changed=different(prior,current);
        const spatialCoverageChanged=p?.eligible!==!!(r.mapping&&r.weatherCovered&&r.productionWeight!==null);
        return {state:r.state,prior,temporalOnly,current,changed,spatialCoverageChanged,
          temporalAlignmentChanged:!spatialCoverageChanged&&different(prior,temporalOnly),
          stageInterpretationChanged:!spatialCoverageChanged&&different(temporalOnly,current),
          stageOrTimeChanged:changed&&!spatialCoverageChanged,temporalDays:r.daily.filter(d=>d.status==="aligned-held-observation").length,
          stageBounds:r.daily.map(d=>d.stage?.relevant??null),
          progressEditions:r.daily.map(d=>d.edition?{weekEnding:d.edition.weekEnding,publishedDate:d.edition.publishedDate,
            rawHash:d.edition.rawHash,contentHash:d.edition.parentVersion.contentHash}:null),
          inputVersions:r.inputVersions.map(remember)};
      });
      return {end:w.end,asOf:at,releaseId:id,methodVersion:a.methodVersion,coverage:a.coverage,
        legacyAssessed:w.coverage?.assessed??null,jointCoverageDelta:a.coverage&&w.coverage?a.coverage.joint-w.coverage.assessed:null,
        exposure:a.exposure,classificationChanged:comparisons.some(r=>r.changed),
        changedBecauseSpatialCoverage:comparisons.some(r=>r.changed&&r.spatialCoverageChanged),
        changedBecauseTemporalAlignment:comparisons.some(r=>r.temporalAlignmentChanged),
        changedBecauseStageInterpretation:comparisons.some(r=>r.stageInterpretationChanged),
        changedBecauseStageOrTime:comparisons.some(r=>r.stageOrTimeChanged),regions:comparisons};
    });
    return {season:old.season,weightYear:production?.data.year??null,weightVersion:production?.metadata.version??null,timeline};
  });
  const windows=seasons.flatMap(s=>s.timeline),deltas=windows.map(w=>w.jointCoverageDelta).filter(Number.isFinite);
  const result={schemaVersion:1,protocol:"corn-spatial-stage-diagnostic/1",methodVersion:alignment.methodVersion,
    legacyMethodVersion:legacy.methodologyVersion,legacyArtifactId:legacy.artifactId,inputHash:legacy.inputHash,
    validationMode:"retrospective-semantics-only-not-point-in-time-validation",
    summary:{weeklyWindows:windows.length,classificationChanged:windows.filter(w=>w.classificationChanged).length,
      changedBecauseSpatialCoverage:windows.filter(w=>w.changedBecauseSpatialCoverage).length,
      changedBecauseTemporalAlignment:windows.filter(w=>w.changedBecauseTemporalAlignment).length,
      changedBecauseStageInterpretation:windows.filter(w=>w.changedBecauseStageInterpretation).length,
      changedBecauseStageOrTime:windows.filter(w=>w.changedBecauseStageOrTime).length,
      meanJointCoverageDelta:deltas.length?deltas.reduce((s,v)=>s+v,0)/deltas.length:null,
      minJointCoverageDelta:deltas.length?Math.min(...deltas):null,maxJointCoverageDelta:deltas.length?Math.max(...deltas):null,
      zeroJointCoverageWindows:windows.filter(w=>!w.coverage?.joint).length,
      attributionOrder:"legacy -> publication-aligned legacy stage gate -> cumulative-stage screen; diagnostic intermediate only",
      note:"changed includes unknown transitions; sequential cause categories overlap and can cancel, not additive; no accuracy claim"},
    limitations:["one-point-per-state","prior-year-production-not-current-crop-geography","held-weekly-acreage-progress-production-proxy",
      "revised-weather-not-delivery-time-vintages","1991-2020-baseline-hindsight","no-outcome-evaluation-no-threshold-selection"],inputVersions,seasons};
  result.artifactId=`research-${digest(result)}`;return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const inputPath=resolve(process.argv[2]??resolve(root,"research/corn-history-inputs.json"));
  const output=resolve(process.argv[3]??resolve(root,"research/corn-alignment-history.json"));
  const legacyPath=resolve(root,"src/data/cornHistory.json");
  if(output===legacyPath||output===inputPath)throw new Error("Refusing to overwrite historical inputs or legacy artifact");
  const input=JSON.parse(readFileSync(inputPath)),legacy=JSON.parse(readFileSync(legacyPath)),result=compareAlignment(input,legacy);
  const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
  result.replay={inputBytesSha256:hash(readFileSync(inputPath)),legacyBytesSha256:hash(readFileSync(legacyPath)),
    sourceFiles:Object.fromEntries(["src/services/cornAlignment.js","src/data/cornAlignment.json","scripts/evaluate_corn_alignment.mjs"]
      .map(p=>[p,hash(readFileSync(resolve(root,p)))]))};
  result.artifactId=`research-${digest([result.artifactId,result.replay])}`;
  mkdirSync(dirname(output),{recursive:true});const tmp=`${output}.${process.pid}.tmp`;
  writeFileSync(tmp,JSON.stringify(result)+"\n",{flag:"wx"});renameSync(tmp,output);
  console.log(JSON.stringify({artifactId:result.artifactId,summary:result.summary}));
}
