#!/usr/bin/env node
import {readFile, writeFile, rename, unlink, mkdir} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {evaluateAutomaticAlerts, validateMonitorBundle} from "../src/services/automaticAlerts.js";
import {healthState} from "../src/services/sourceHealth.js";
import {buildPhase2} from "./revision_tracking.mjs";
import {qualifyCornHealth} from "../src/services/cornExposure.js";
import {attachCornAlignment} from "./corn_alignment.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i++) {
  if (!["--data-dir", "--output", "--now", "--source-revision"].includes(args[i]) || !args[i + 1]) throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  options[args[i].slice(2)] = args[++i];
}
const dataDir = resolve(options["data-dir"] ?? resolve(root, "public/data"));
const output = resolve(options.output ?? resolve(dataDir, "monitor-alerts.json"));
const now = options.now ? Date.parse(options.now) : Date.now();
if (!Number.isFinite(now)) throw new Error("Invalid --now timestamp");
const validTimestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);
const hash = value => createHash("sha256").update(value).digest("hex");
const inputBytes = new Map();

async function readCache(path, required = false) {
  try {
    const raw = await readFile(path);
    inputBytes.set(path, raw);
    const value = JSON.parse(raw.toString("utf8"));
    if (required && value == null) throw new Error("Invalid required cache");
    return value;
  }
  catch (error) {
    if (required && error.code !== "ENOENT") throw error;
    if (error.code !== "ENOENT") console.warn(`Unavailable cache: ${path.split("/").at(-1)} (${error.name})`);
    return null;
  }
}

const [weather, drought, official, enso, previous, delivery, points] = await Promise.all([
  readCache(resolve(dataDir, "local-weather.json")),
  readCache(resolve(dataDir, "drought-monitor.json")),
  readCache(resolve(dataDir, "official-data.json")),
  readCache(resolve(dataDir, "enso-outlook.json")),
  readCache(output, true),
  readCache(resolve(dataDir, "alert-delivery.json")),
  readCache(resolve(root, "src/data/weatherPoints.json"), true),
]);
if (!Array.isArray(points) || !points.length) throw new Error("Representative-point registry is unavailable");
const result = evaluateAutomaticAlerts({weather, drought, official, enso, previous, points, now});
if (delivery?.schemaVersion === 1 && ["not-configured", "configured", "sent", "failed", "uncertain"].includes(delivery.status)) {
  result.email = {status:delivery.status, ...(delivery.lastSentAt ? {lastSentAt:delivery.lastSentAt} : {}),
    ...(validTimestamp(delivery.lastAttemptAt) ? {lastAttemptAt:delivery.lastAttemptAt} : {})};
} else if (validTimestamp(previous?.email?.lastAttemptAt)) result.email.lastAttemptAt = previous.email.lastAttemptAt;
if (process.env.WFL_EMAIL_CONFIGURED === "true" && result.email.status === "not-configured") result.email.status = "configured";
if (process.env.WFL_EMAIL_CONFIGURED === "false") result.email.status = "not-configured";
const sourceRevision = options["source-revision"] ?? execFileSync("git", ["rev-parse", "HEAD"], {cwd:root, encoding:"utf8"}).trim();
if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error("Invalid source revision");
const inputNames = ["official-data.json", "local-weather.json", "drought-monitor.json", "enso-outlook.json"];
const inputs = inputNames.map(name => [name, inputBytes.has(resolve(dataDir,name)) ? hash(inputBytes.get(resolve(dataDir,name))) : null]);
inputs.push(["previous-alerts", inputBytes.has(output) ? hash(inputBytes.get(output)) : null],
  ["previous-delivery", inputBytes.has(resolve(dataDir,"alert-delivery.json")) ? hash(inputBytes.get(resolve(dataDir,"alert-delivery.json"))) : null]);
for (const path of ["src/data/weatherPoints.json", "src/data/cropCalendars.js", "src/data/releaseSchedule.js", "src/data/cornAlignment.json"])
  inputs.push([path, hash(inputBytes.get(resolve(root,path)) ?? await readFile(resolve(root,path)))]);
const inputsHash = hash(JSON.stringify(inputs));
const releaseId = `release-${hash(JSON.stringify([1,sourceRevision,result.generatedAt,result.rulesVersion,inputsHash]))}`;
result.release = {id:releaseId,sourceRevision,inputsHash};
result.dataHealth.release = releaseId;
for (const row of result.dataHealth.datasets) row.release = releaseId;
result.provenance.release = releaseId;
for (const event of result.events.filter(e=>e.at===result.generatedAt)) if(event.provenance)event.provenance.release=releaseId;
for (const alert of [...result.active,...result.events.filter(e=>e.at===result.generatedAt).map(e=>e.alert)])
  if (alert.state === "active" && alert.provenance?.calculatedAt === result.generatedAt) alert.provenance.release = releaseId;
result.analysis = buildPhase2({official,enso,monitor:result,previous});
attachCornAlignment({official,monitor:result,previous});
result.dataHealth = qualifyCornHealth(result.dataHealth,result.analysis.cornPilot);
if (!validateMonitorBundle(result)) throw new Error("Invalid output or delivery metadata; previous cache remains unchanged");

await mkdir(dirname(output), {recursive:true});
const temporary = `${output}.${process.pid}.${Date.now()}.tmp`;
const snapshot = `${JSON.stringify(result, null, 2)}\n`;
try {
  await writeFile(temporary, snapshot, {flag:"wx"});
  await rename(temporary, output);
} finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
const manifest = {schemaVersion:1,releaseId,sourceRevision,evaluatedAt:result.generatedAt,
  rulesVersion:result.rulesVersion,inputsHash,snapshotSha256:hash(snapshot)};
const manifestPath = resolve(dirname(output), "release-manifest.json"), manifestTemp = `${manifestPath}.${process.pid}.tmp`;
try {
  await writeFile(manifestTemp, `${JSON.stringify(manifest,null,2)}\n`, {flag:"wx"});
  await rename(manifestTemp,manifestPath);
} finally { await unlink(manifestTemp).catch(error=>{if(error.code!=="ENOENT")throw error;}); }
console.log(`Automatic monitor evaluated ${result.active.length} active alerts; ${result.events.length} retained events.`);
for (const row of result.health) console.log(`${row.id}: ${healthState(row)}; evidence: ${row.eligibility}; period: ${row.period ?? "unknown"}`);
