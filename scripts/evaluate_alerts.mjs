#!/usr/bin/env node
import {readFile, writeFile, rename, unlink, mkdir} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {evaluateAutomaticAlerts, validateMonitorBundle} from "../src/services/automaticAlerts.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i++) {
  if (!["--data-dir", "--output", "--now"].includes(args[i]) || !args[i + 1]) throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  options[args[i].slice(2)] = args[++i];
}
const dataDir = resolve(options["data-dir"] ?? resolve(root, "public/data"));
const output = resolve(options.output ?? resolve(dataDir, "monitor-alerts.json"));
const now = options.now ? Date.parse(options.now) : Date.now();
if (!Number.isFinite(now)) throw new Error("Invalid --now timestamp");
const validTimestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);

async function readCache(path, required = false) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
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
if (delivery?.schemaVersion === 1 && ["not-configured", "configured", "sent", "failed"].includes(delivery.status)) {
  result.email = {status:delivery.status, ...(delivery.lastSentAt ? {lastSentAt:delivery.lastSentAt} : {}),
    ...(validTimestamp(delivery.lastAttemptAt) ? {lastAttemptAt:delivery.lastAttemptAt} : {})};
} else if (validTimestamp(previous?.email?.lastAttemptAt)) result.email.lastAttemptAt = previous.email.lastAttemptAt;
if (process.env.WFL_EMAIL_CONFIGURED === "true" && result.email.status === "not-configured") result.email.status = "configured";
if (process.env.WFL_EMAIL_CONFIGURED === "false") result.email.status = "not-configured";
if (!validateMonitorBundle(result)) throw new Error("Invalid output or delivery metadata; previous cache remains unchanged");

await mkdir(dirname(output), {recursive:true});
const temporary = `${output}.${process.pid}.${Date.now()}.tmp`;
try {
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, {flag:"wx"});
  await rename(temporary, output);
} finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
console.log(`Automatic monitor evaluated ${result.active.length} active alerts; ${result.events.length} retained events; ${result.health.filter(row => row.status === "unavailable").length} unavailable checks.`);
