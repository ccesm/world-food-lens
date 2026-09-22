import React,{useEffect,useState} from "react";
import {alertOverview,loadAlertFeed} from "../services/alertFeed.js";
import "../alerts.css";

const COPY={
  zh:{eyebrow:"DAILY MONITOR",title:"自动预警中心",intro:"每天检查已接入的官方资料，记录新增、升级与解除的信号。",refresh:"检查更新",refreshing:"检查中…",loading:"正在读取最近一次检查…",unavailable:"暂时无法读取预警资料，当前风险状态未知。",archive:"预警资料未及时更新，或本次读取失败。以下为历史记录，当前状态待核实。",evaluated:"最近评估",schedule:"计划每天 06:23 UTC 自动检查；任务排队及官方资料发布可能造成延迟。页面每 5 分钟检查已发布结果。",red:"红色关注",yellow:"黄色关注",missing:"资料缺口",unknown:"待核实",none:"本次检查没有触发已接入规则；覆盖范围和资料缺口仍需关注。",emptyFiltered:"没有符合此筛选的记录。",filter:"显示信号",all:"全部",crop:"作物与气候",market:"市场",system:"数据运行",alerts:"查看信号与证据",history:"最近变化",noHistory:"暂时没有记录到状态变化。",evidence:"依据与判定规则",rule:"本站规则",period:"资料期",first:"首次发现",last:"最近检查",detail:"查看相关模块",unverified:"证据待核实",archiveTag:"历史状态",definition:"颜色表示 World Food Lens 规则触发的关注等级，不代表官方发布的预警等级，也不能直接换算为减产。",health:"数据覆盖与运行状态",automatic:"自动检查范围",manual:"仍需人工整理",healthOk:"可用",healthMissing:"未完成核实",email:"邮件提醒",emailStatus:{"not-configured":"尚未配置",configured:"已配置",sent:"邮件服务器已接收",failed:"发送失败"},emailNote:"邮件用于提醒新增或升级的预警；服务器接收不等于已投递到收件箱。",sent:"最近接收",attempt:"最近发送尝试",events:{new:"新增",escalated:"升级",resolved:"解除","verification-lost":"核实中断",reconfirmed:"恢复核实"}},
  en:{eyebrow:"DAILY MONITOR",title:"Automatic alert center",intro:"Daily checks of connected official sources, with a record of new, escalated and resolved signals.",refresh:"Check for updates",refreshing:"Checking…",loading:"Loading the latest evaluation…",unavailable:"Alert data is unavailable. The current risk status is unknown.",archive:"The feed is overdue or the latest request failed. Records below are historical; current conditions need verification.",evaluated:"Last evaluation",schedule:"Scheduled daily at 06:23 UTC; job queues and source publication can delay updates. This page checks for published results every 5 minutes.",red:"Red signals",yellow:"Yellow signals",missing:"Data gaps",unknown:"Unverified",none:"No connected rule was triggered in this evaluation. Check coverage and data gaps before interpreting this result.",emptyFiltered:"No records match this filter.",filter:"Filter signals",all:"All",crop:"Crops & climate",market:"Markets",system:"Data operations",alerts:"Signals and evidence",history:"Recent changes",noHistory:"No state changes have been recorded yet.",evidence:"Evidence and decision rule",rule:"WFL rule",period:"Source period",first:"First detected",last:"Last checked",detail:"Open related module",unverified:"Evidence unverified",archiveTag:"Historical state",definition:"Colors indicate attention levels triggered by World Food Lens rules. They are not official warning levels and cannot be converted directly to yield losses.",health:"Coverage and source health",automatic:"Automatically checked",manual:"Still curated manually",healthOk:"Available",healthMissing:"Unverified",email:"Email alerts",emailStatus:{"not-configured":"Not configured",configured:"Configured",sent:"Accepted by mail server",failed:"Send failed"},emailNote:"Email is used for new or escalated alerts. Server acceptance does not confirm inbox delivery.",sent:"Last accepted",attempt:"Last send attempt",events:{new:"New",escalated:"Escalated",resolved:"Resolved","verification-lost":"Verification lost",reconfirmed:"Reconfirmed"}}
};

function dateLabel(value,lang){
  return new Intl.DateTimeFormat(lang==="zh"?"zh-CN":"en-GB",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"}).format(new Date(value))+" UTC";
}

function AlertCard({alert,lang,t,archive}){
  const unverified=alert.state!=="active";
  return <article className={`monitor-card ${archive||unverified?"monitor-unverified":`monitor-${alert.severity}`}`}>
    <div className="monitor-card-heading"><span>{archive?t.archiveTag:unverified?t.unverified:t[alert.severity]}</span><small>{t[alert.category]}</small></div>
    <h3>{alert.title[lang]}</h3><p>{alert.summary[lang]}</p>
    <small className="monitor-period">{t.period}: {alert.sourcePeriod}</small>
    <details className="monitor-evidence"><summary>{t.evidence}</summary>
      <p><strong>{t.rule}:</strong> {alert.rule[lang]}</p>
      <ul>{alert.sources.map((source,i)=><li key={`${source.url}-${i}`}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a><span>{source.period}</span></li>)}</ul>
      <p className="monitor-dates">{t.first}: {dateLabel(alert.firstSeenAt,lang)}<br/>{t.last}: {dateLabel(alert.lastEvaluatedAt,lang)}</p>
    </details><a className="monitor-related" href={alert.target}>{t.detail} ↗</a>
  </article>;
}

export default function AlertCenter({lang="zh"}){
  const locale=lang==="en"?"en":"zh",t=COPY[locale];
  const [feed,setFeed]=useState(null),[failed,setFailed]=useState(false),[loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0),[filter,setFilter]=useState("all"),[clock,setClock]=useState(Date.now);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);
    loadAlertFeed(controller.signal).then(result=>{setFeed(result);setFailed(false);}).catch(error=>{
      if(error.name!=="AbortError")setFailed(true);
    }).finally(()=>{if(!controller.signal.aborted){setLoading(false);setClock(Date.now());}});
    return ()=>controller.abort();
  },[revision]);
  useEffect(()=>{
    const timer=setInterval(()=>{setClock(Date.now());setRevision(value=>value+1);},5*60*1000);
    return ()=>clearInterval(timer);
  },[]);
  const overview=alertOverview(feed,{now:clock,failed});
  const alerts=(feed?.active??[]).filter(alert=>filter==="all"||alert.category===filter)
    .sort((a,b)=>(a.state===b.state?0:a.state==="active"?-1:1)||(a.severity===b.severity?0:a.severity==="red"?-1:1));
  const events=[...(feed?.events??[])].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,12);
  return <section id="automatic-alerts" className="automatic-alerts food-system" aria-labelledby="monitor-title">
    <div className="monitor-heading"><div><span className="eyebrow">{t.eyebrow}</span><h2 id="monitor-title">{t.title}</h2><p>{t.intro}</p></div>
      <button className="monitor-refresh" type="button" disabled={loading} onClick={()=>setRevision(value=>value+1)}>{loading?t.refreshing:t.refresh}</button></div>
    <div role="status" aria-live="polite">{!feed&&<p className="monitor-notice">{loading?t.loading:t.unavailable}</p>}
      {feed&&overview.archive&&<p className="monitor-notice">{t.archive}</p>}</div>
    {feed&&<>
      <div className="monitor-counts" aria-label={t.title}>
        <div className={overview.archive?"":"monitor-count-red"}><strong>{overview.archive?"—":overview.red}</strong><span>{t.red}</span></div>
        <div className={overview.archive?"":"monitor-count-yellow"}><strong>{overview.archive?"—":overview.yellow}</strong><span>{t.yellow}</span></div>
        <div><strong>{overview.archive?"—":overview.unavailable}</strong><span>{t.missing}</span></div>
        <div><strong>{overview.archive?"—":overview.unverified}</strong><span>{t.unknown}</span></div>
      </div>
      <p className="monitor-updated">{t.evaluated}: <time dateTime={feed.generatedAt}>{dateLabel(feed.generatedAt,locale)}</time></p>
      {!overview.archive&&feed.active.length===0&&<p className="monitor-empty">{t.none}</p>}
      {feed.active.length>0&&<details className="monitor-detail"><summary>{t.alerts} <span>{feed.active.length}</span></summary>
        <label className="monitor-filter">{t.filter}<select value={filter} onChange={event=>setFilter(event.target.value)}>{["all","crop","market","system"].map(key=><option key={key} value={key}>{t[key]}</option>)}</select></label>
        <div className="monitor-card-grid">{alerts.slice(0,6).map(alert=><AlertCard key={alert.id} alert={alert} lang={locale} t={t} archive={overview.archive}/>)}</div>
        {alerts.length===0&&<p>{t.emptyFiltered}</p>}
        {alerts.length>6&&<details className="monitor-more"><summary>{locale==="zh"?`还有 ${alerts.length-6} 条信号`:`${alerts.length-6} more signals`}</summary><div className="monitor-card-grid">{alerts.slice(6).map(alert=><AlertCard key={alert.id} alert={alert} lang={locale} t={t} archive={overview.archive}/>)}</div></details>}
      </details>}
      <details className="monitor-detail"><summary>{t.history} <span>{feed.events.length}</span></summary>
        {events.length===0?<p>{t.noHistory}</p>:<ol className="monitor-events">{events.map(event=><li key={event.id}><span>{t.events[event.type]}</span><div><a href={event.alert.target}>{event.alert.title[locale]}</a><time dateTime={event.at}>{dateLabel(event.at,locale)}</time></div></li>)}</ol>}
      </details>
      <details className="monitor-detail"><summary>{t.health}</summary>
        <p><strong>{t.automatic}:</strong> {feed.coverage.automatic[locale]}</p><p><strong>{t.manual}:</strong> {feed.coverage.manual[locale]}</p>
        <ul className="monitor-health">{feed.health.map(source=><li key={source.id}><div><strong>{source.label[locale]}</strong><span>{overview.archive?t.unknown:source.status==="ok"?t.healthOk:t.healthMissing}</span></div><p>{source.reason[locale]}</p>{source.period&&<small>{t.period}: {source.period}</small>}{source.fetchedAt&&<small>{dateLabel(source.fetchedAt,locale)}</small>}</li>)}</ul>
      </details>
      <div className="monitor-email"><strong>{t.email}: {t.emailStatus[feed.email.status]}</strong>{feed.email.lastSentAt&&<small>{t.sent}: {dateLabel(feed.email.lastSentAt,locale)}</small>}{feed.email.lastAttemptAt&&<small>{t.attempt}: {dateLabel(feed.email.lastAttemptAt,locale)}</small>}<p>{t.emailNote}</p></div>
    </>}
    <p className="monitor-footnote">{t.schedule}</p><p className="monitor-footnote">{t.definition}</p>
  </section>;
}
