import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {evaluateAutomaticAlerts, validateMonitorBundle} from "../src/services/automaticAlerts.js";
import {validateAlertFeed} from "../src/services/alertFeed.js";
import {validReleaseIdentity} from "../src/services/releaseIdentity.js";

const now = Date.parse("2026-10-04T12:00:00Z");
const digest = raw => createHash("sha256").update(raw).digest("hex");

test("present malformed identity fails closed while legacy feeds remain readable",()=>{
  const feed = evaluateAutomaticAlerts({now, points:[]});
  assert.ok(validateMonitorBundle(feed));
  assert.ok(validateAlertFeed(feed,now));
  feed.release = {id:`release-${"a".repeat(64)}`,sourceRevision:"b".repeat(40),inputsHash:"c".repeat(64)};
  feed.dataHealth.release = feed.release.id;
  for(const row of feed.dataHealth.datasets)row.release=feed.release.id;
  feed.email.status = "uncertain";
  assert.ok(validReleaseIdentity(feed.release));
  assert.ok(validateMonitorBundle(feed));
  assert.ok(validateAlertFeed(feed,now));
  for(const malformed of [null,{}, {...feed.release,id:"timestamp-only"}, {...feed.release,sourceRevision:"short"},
      {...feed.release,inputsHash:null}, {...feed.release,id:[feed.release.id]}]) {
    assert.equal(validateMonitorBundle({...feed,release:malformed}),null);
    assert.equal(validateAlertFeed({...feed,release:malformed},now),null);
  }
});

test("evaluation identity is deterministic, source/input-bound and hashes exact snapshot bytes", async()=>{
  const dir = await mkdtemp(join(tmpdir(),"wfl-identity-"));
  try {
    const run = source => {
      const result = spawnSync(process.execPath,["scripts/evaluate_alerts.mjs","--data-dir",dir,
        "--now",new Date(now).toISOString(),"--source-revision",source],{encoding:"utf8"});
      assert.equal(result.status,0,result.stderr);
    };
    const snapshotPath = join(dir,"monitor-alerts.json"), manifestPath = join(dir,"release-manifest.json");
    run("a".repeat(40));
    const raw = await readFile(snapshotPath), first = JSON.parse(await readFile(manifestPath));
    assert.equal(first.snapshotSha256,digest(raw));
    assert.equal(JSON.parse(raw).release.id,first.releaseId);
    assert.equal(JSON.parse(raw).dataHealth.release,first.releaseId);
    assert.ok(JSON.parse(raw).dataHealth.datasets.every(row=>row.release===first.releaseId));
    assert.equal(JSON.parse(raw).provenance.release,first.releaseId);
    assert.equal(JSON.parse(raw).analysis.releaseId,first.releaseId);
    assert.equal(JSON.parse(raw).analysis.changeSet.releaseId,first.releaseId);
    assert.equal(first.releaseId,`release-${digest(JSON.stringify([1,first.sourceRevision,first.evaluatedAt,first.rulesVersion,first.inputsHash]))}`);
    await rm(snapshotPath);
    run("a".repeat(40));
    assert.deepEqual(JSON.parse(await readFile(manifestPath)),first);
    await rm(snapshotPath);
    run("b".repeat(40));
    const differentSource = JSON.parse(await readFile(manifestPath));
    assert.notEqual(differentSource.releaseId,first.releaseId);
    assert.equal(differentSource.inputsHash,first.inputsHash);
    await rm(snapshotPath);
    await writeFile(join(dir,"official-data.json"),"{}\n");
    run("a".repeat(40));
    const input = JSON.parse(await readFile(manifestPath));
    assert.notEqual(input.inputsHash,first.inputsHash);
    assert.notEqual(input.releaseId,first.releaseId);
    const before = await readFile(snapshotPath);
    const failed = spawnSync(process.execPath,["scripts/evaluate_alerts.mjs","--data-dir",dir,
      "--source-revision","short"],{encoding:"utf8"});
    assert.notEqual(failed.status,0);
    assert.deepEqual(await readFile(snapshotPath),before);
  } finally {await rm(dir,{recursive:true,force:true});}
});
