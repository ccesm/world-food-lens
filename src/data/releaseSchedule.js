// Manually checked against the linked official pages on 2026-09-12.
// Exact dates are never carried into a new year without a new official schedule.
export const scheduleCheckedAt = "2026-09-12";
export const releaseSources = [
  {id:"fao", name:"FAO · Food Price Index", url:"https://www.fao.org/worldfoodsituation/foodpricesindex/en/",
    cadenceZh:"每月月初，公布上月指数", cadenceEn:"Early each month; prior month's index",
    impactZh:"粮价模型在本站取得新版指数后更新。", impactEn:"The price model updates when the new index reaches this site.",
    dates2026:[9,6,6,3,8,5,3,7,4,2,6,4], window:[1,10]},
  {id:"usda", name:"USDA · WASDE / PSD", url:"https://www.usda.gov/about-usda/general-information/staff-offices/office-chief-economist/commodity-markets/wasde-report",
    cadenceZh:"每月约 9–12 日；WASDE 为美国东部 12:00", cadenceEn:"Around the 9th–12th monthly; WASDE at 12:00 US Eastern",
    impactZh:"更新年度产量、消费和库存估计；历史汇总文件可能次日更新。", impactEn:"Revises annual supply, use and stocks; consolidated historical files may update the next day.",
    dates2026:[12,10,10,9,12,11,10,12,11,9,10,10], window:[8,15]},
  {id:"noaa", name:"NOAA · ENSO Diagnostic Discussion", url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
    cadenceZh:"通常每月第二个星期四；RONI 数据文件发布时间另计", cadenceEn:"Usually the second Thursday; RONI data-file timing is separate",
    impactZh:"提供气候背景判断；不会自动换算成粮价涨跌。", impactEn:"Adds climate context; no automatic conversion into a price change.",
    ruleUrl:"https://www.coralreefwatch.noaa.gov/satellite/analyses_guidance/enso_current_conditions.php",
    confirmed:{"2026-09":"2026-09-10","2026-10":"2026-10-08"}, window:[8,14]},
  {id:"worldBank", name:"World Bank · Pink Sheet", url:"https://www.worldbank.org/en/research/commodity-markets",
    cadenceZh:"每月更新上月商品均价；本站预留月初观察窗口", cadenceEn:"Monthly prior-month averages; early-month planning window",
    impactZh:"更新化肥、农产品与能源基准；具体日期请核对官网。", impactEn:"Updates fertilizer, crop and energy benchmarks; verify the date at source.",
    window:[1,10]}
];
