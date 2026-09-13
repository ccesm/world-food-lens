// Curated forecast text, separate from NOAA ENSO probabilities and observed weather.
// These records are NOT generated from typical ENSO teleconnections.
export const SIGNAL_REVIEWED="2026-09-13";
const pair=(zh,en)=>({zh,en});
// Frozen September 2026 USDA PSD production context in 1000 MT. National
// output is not the area/tonnage exposed within each broad forecast polygon.
const indiaRice={crop:pair("精米","milled rice"),scope:pair("印度全国；大于展望中的具体稻田","all India; broader than the forecast-exposed rice fields"),production:147000,worldProduction:533852,precision:1};
const australiaWheat={crop:pair("小麦","wheat"),scope:pair("澳大利亚全国；大于南部／东部展望区","all Australia; broader than the southern/eastern outlook area"),production:31000,worldProduction:822432,precision:1};
const southAfricaMaize={crop:pair("玉米","maize"),scope:pair("仅南非全国；展望还覆盖其他南部非洲国家","South Africa only; the outlook spans other Southern African countries"),production:16500,worldProduction:1290952,precision:1};
export const seasonalClimateSignals=[
  {id:"india-aso",region:pair("印度次大陆","Indian subcontinent"),cropId:"india-rice",start:"2026-08",end:"2026-10",signal:"dry",issuedAt:"2026-07-31",source:"WMO GSCU",url:"https://wmo.int/news/media-centre/strong-el-nino-expected-intensify",productionContext:indiaRice,detail:pair("8–10 月降雨低于常年的概率倾向；地区范围大，不能当作印度每块稻田的预报。","August–October tilt toward below-normal rain; a broad region, not a field-level rice forecast.")},
  {id:"australia-aso",region:pair("澳大利亚南部与东部","Southern and eastern Australia"),cropId:"australia-wheat",start:"2026-08",end:"2026-10",signal:"dry",issuedAt:"2026-07-31",source:"WMO GSCU",url:"https://wmo.int/news/media-centre/strong-el-nino-expected-intensify",productionContext:australiaWheat,detail:pair("8–10 月降雨偏少概率倾向；该展望于 7 月发布，需持续核对后续区域预报。","August–October tilt toward below-normal rain; issued in July, so check later regional outlooks.")},
  {id:"southern-africa-ond",region:pair("南部非洲（含南非）","Southern Africa, including South Africa"),cropId:"south-africa-corn",start:"2026-10",end:"2026-12",signal:"dry",issuedAt:"2026-09-03",source:"JRC ASAP / Copernicus",url:"https://joint-research-centre.ec.europa.eu/jrc-news-and-updates/el-nino-drives-crop-failure-central-america-and-east-africa-and-threatens-next-season-southern-2026-09-03_en",productionContext:southAfricaMaize,detail:pair("10–12 月播种季多国降雨可能低于常年；2026 年已收获谷物总量却高于五年平均。","October–December planting season may be drier across several countries; the completed 2026 harvest was above its five-year average.")},
  {id:"horn-ond",region:pair("非洲之角部分地区","Parts of the Greater Horn of Africa"),cropId:null,start:"2026-10",end:"2026-12",signal:"wet",issuedAt:"2026-08-19",source:"WMO / ICPAC",url:"https://wmo.int/media/news/el-nino-impacts-greater-horn-of-africa",detail:pair("10–12 月局部降雨偏多概率升高；部分地区可能发生洪涝，但本站没有匹配的作物日历，不能量化产量影响。","Higher odds of wet October–December conditions in specific areas; flood risk exists, but no matched crop calendar supports a yield estimate.")},
];

// Historical associations only. NOAA CPC describes these seasons/regions.
export const typicalTeleconnections=[
  {id:"indonesia",region:pair("印度尼西亚／澳大利亚北部","Indonesia / northern Australia"),season:"DJF",elNino:"dry",laNina:"wet",url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/impacts/enso.html"},
  {id:"southern-africa",region:pair("非洲南部","Southern Africa"),season:"DJF",elNino:"dry",laNina:"wet",url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/impacts/enso.html"},
  {id:"east-africa",region:pair("东非赤道地区","Equatorial East Africa"),season:"DJF",elNino:"wet",laNina:null,url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensocycle/elninosfc.shtml"},
  {id:"southern-us",region:pair("美国南部","Southern United States"),season:"DJF",elNino:"wet",laNina:"dry",url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/impacts/enso.html"},
  {id:"central-america",region:pair("中美洲","Central America"),season:"DJF",elNino:"dry",laNina:null,url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensocycle/elninosfc.shtml"},
  {id:"india-monsoon",region:pair("印度夏季季风区","Indian summer monsoon zone"),season:"JJA",elNino:"dry",laNina:"wet",url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/impacts/enso.html"},
];
