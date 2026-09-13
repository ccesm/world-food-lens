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

// Four overview rows requested for forward agricultural screening. Historical
// tendencies never become current forecasts. Adjacent forecast notes explicitly
// describe why a broader map cannot be assigned to the named crop template.
export const agriculturalExposureProfiles=[
  {id:"australia-wheat",cropId:"australia-wheat",currentSignalId:"australia-aso",
    title:pair("澳大利亚","Australia"),historical:{direction:"dry",source:"Australian Bureau of Meteorology",url:"https://www.bom.gov.au/news-and-media/el-nino-what-it-means-for-australias-climate",detail:pair("厄尔尼诺期间，澳大利亚东部冬春季常见偏干倾向；每次事件不同，强度不决定当地影响。","Eastern Australia often has a drier winter–spring tendency during El Niño; events differ and ENSO strength does not determine local impact.")}},
  {id:"southern-africa-maize",cropId:"south-africa-corn",currentSignalId:"southern-africa-ond",
    title:pair("南部非洲","Southern Africa"),historical:{direction:"dry",source:"NOAA CPC",url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/impacts/enso.html",detail:pair("历史复合资料显示，厄尔尼诺北半球冬季非洲东南部常有偏干倾向。","Historical composites show a drier tendency in southeastern Africa during Northern Hemisphere winter El Niño.")}},
  {id:"brazil-soy",cropId:"brazil-soy",currentSignalId:null,title:pair("巴西中部","Central Brazil"),
    historical:{direction:"mixed",source:"NOAA CPC",url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/impacts/enso.html",detail:pair("厄尔尼诺对巴西的历史影响有明显地域差异：北部偏干、南部偏湿；不能直接套用到巴西中部大豆。","Historical El Niño influence differs across Brazil—drier in the north and wetter in the south—so it cannot be assigned directly to Central Brazil soybeans.")},
    adjacentForecast:{source:"IRI seasonal forecast",url:"https://iri.columbia.edu/our-expertise/climate/forecasts/seasonal-climate-forecasts/",detail:pair("最新公开讨论提到南美北部偏干，但没有给本站巴西中部大豆模板一个可直接匹配的结论。","The latest public discussion highlights dryness in northern South America, not a directly matched Central Brazil soybean outlook.")}},
  {id:"se-asia-rice",cropId:"thailand-rice",currentSignalId:null,title:pair("东南亚","Southeast Asia"),
    historical:{direction:"mixed",source:"NOAA CPC",url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/impacts/enso.html",detail:pair("印度尼西亚和菲律宾常见偏干倾向，但东南亚各地和稻季不同，不能代表泰国全部稻区。","Indonesia and the Philippines often tilt dry, but Southeast Asian regions and rice seasons differ; this does not represent all Thai rice areas.")},
    adjacentForecast:{source:"IRI seasonal forecast",url:"https://iri.columbia.edu/our-expertise/climate/forecasts/seasonal-climate-forecasts/",detail:pair("最新公开讨论提到海洋大陆部分地区偏干；这不是泰国主季稻的直接地区预测。","The latest public discussion highlights dryness in parts of the Maritime Continent; it is not a direct regional forecast for Thailand's main rice season.")}},
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
