import test from "node:test";
import assert from "node:assert/strict";
import {ALERT_FEED_MAX_AGE,alertOverview,validateAlertFeed} from "../src/services/alertFeed.js";

const now=Date.parse("2026-09-21T08:00:00Z");
const b={zh:"资料",en:"Evidence"};
const alert={id:"soil-iowa",category:"crop",severity:"yellow",title:b,summary:b,rule:b,sourcePeriod:"2026-09-18",sources:[{label:"NASA POWER",url:"https://power.larc.nasa.gov/",period:"2026-09-18"}],target:"#soil-moisture",firstSeenAt:"2026-09-20T06:23:00Z",lastEvaluatedAt:"2026-09-21T06:23:00Z",state:"active"};
const feed={schemaVersion:1,rulesVersion:"1",generatedAt:"2026-09-21T06:23:00Z",active:[alert],events:[{id:"soil-iowa-new",alertId:alert.id,type:"new",at:alert.firstSeenAt,alert}],health:[{id:"soil",label:b,status:"ok",reason:b}],coverage:{automatic:b,manual:b},email:{status:"not-configured"}};

test("valid feed distinguishes active signals, unverified evidence and source gaps",()=>{
  const input={...feed,active:[alert,{...alert,id:"wheat",severity:"red",state:"unverified"}],health:[...feed.health,{id:"rain",label:b,status:"unavailable",reason:b}]};
  assert.ok(validateAlertFeed(input,now));
  assert.deepEqual(alertOverview(input,{now}),{archive:false,red:0,yellow:1,unverified:1,unavailable:1});
});

test("stale data and a failed refresh never become current all-clear counts",()=>{
  assert.equal(validateAlertFeed(feed,now+ALERT_FEED_MAX_AGE).stale,true);
  for(const options of [{now:now+ALERT_FEED_MAX_AGE},{now,failed:true}]){
    const result=alertOverview(feed,options);
    assert.equal(result.archive,true);
    assert.equal(result.red,0);
    assert.equal(result.yellow,0);
  }
  assert.equal(alertOverview(null,{now}).archive,true);
  assert.equal(validateAlertFeed({...feed,generatedAt:"2026-09-22T06:23:00Z"},now).stale,true);
});

test("malformed rules, evidence URLs, states, duplicate ids and dates fail closed",()=>{
  for(const input of [
    {...feed,schemaVersion:2},
    {...feed,rulesVersion:"unknown"},
    {...feed,generatedAt:"not a date"},
    {...feed,generatedAt:"2026-02-30T00:00:00Z"},
    {...feed,active:[alert,alert]},
    {...feed,active:[{...alert,title:{en:"Missing translation"}}]},
    {...feed,active:[{...alert,severity:"green"}]},
    {...feed,active:[{...alert,target:"javascript:alert(1)"}]},
    {...feed,active:[{...alert,sources:[{label:"Unsafe",url:"javascript:alert(1)",period:"2026-09"}]}]},
    {...feed,active:[{...alert,lastEvaluatedAt:"2026-09-22T00:00:00Z"}]},
    {...feed,events:[{...feed.events[0],alertId:"different"}]},
    {...feed,events:Array.from({length:201},()=>feed.events[0])},
    {...feed,health:[{...feed.health[0],status:"probably-ok"}]},
    {...feed,email:{status:"sent",lastSentAt:"invalid"}},
    {...feed,email:{status:"failed",lastAttemptAt:"invalid"}}
  ])assert.equal(validateAlertFeed(input,now),null);
});

test("email timestamps may follow evaluation because notification happens afterward",()=>{
  const input={...feed,email:{status:"sent",lastSentAt:"2026-09-21T06:25:00Z",lastAttemptAt:"2026-09-21T06:24:00Z"}};
  assert.ok(validateAlertFeed(input,now));
});
