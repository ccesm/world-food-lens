// Manually reviewed official reports. WFL colors are NOT official weather warnings.
export const ALERT_REVIEWED = "2026-09-13";
const mars={name:"JRC MARS",date:"2026-08-24",url:"https://joint-research-centre.ec.europa.eu/jrc-news-and-updates/exceptionally-dry-and-hot-weather-threatens-summer-crops-2026-08-24_en"};
const asap={name:"JRC ASAP",date:"2026-09-03",url:"https://joint-research-centre.ec.europa.eu/jrc-news-and-updates/el-nino-drives-crop-failure-central-america-and-east-africa-and-threatens-next-season-southern-2026-09-03_en"};
const pair=(zh,en)=>({zh,en});
export const productionSource={name:"USDA PSD · September 2026 snapshot",date:"2026-09-13",url:"https://apps.fas.usda.gov/psdonline/app/index.html#/app/downloads",unit:"1000 metric tons",period:"2026/27"};
// Country/area output is context, never reported damaged production. No official
// event-specific affected hectares or loss tonnage was provided in either JRC report.
const euMaize={crop:pair("玉米","maize"),scope:pair("欧盟整体（大于报告中的局部受灾区）","entire EU (broader than the affected subregions)"),production:50600,worldProduction:1290952,precision:1};
const corridorMaize={crop:pair("玉米","maize"),scope:pair("仅洪都拉斯＋萨尔瓦多；不覆盖整个干旱走廊","Honduras + El Salvador only; not the entire Dry Corridor"),production:1340,worldProduction:1290952,precision:2};
const pakistanRice={crop:pair("精米","milled rice"),scope:pair("巴基斯坦全国；预警仅涉及部分雨季水稻","all Pakistan; warning concerns part of kharif rice"),production:9600,worldProduction:533852,precision:1};
export const cropWeatherAlerts=[
  {id:"europe-heat",level:"red",year:2026,source:mars,productionContext:euMaize,
    region:pair("法国、德国南部、意大利中北部及中欧部分产区","France, southern Germany, north/central Italy and parts of central Europe"),
    crop:pair("夏季作物（含玉米）","Summer crops including maize"),
    period:pair("2026 年夏季；报告截至 8 月","Summer 2026; August assessment"),
    hazard:pair("持续高温与缺水","Persistent heat and water deficits"),
    impact:pair("报告评估严重影响；部分地区单产预计明显下降，局地可能绝收。并非全部欧洲农田。","Severe impacts assessed; substantial yield losses expected, with local crop failure possible—not all European farmland."),
    evidence:pair("官方影响评估；最终产量未确认","Official impact assessment; final production unconfirmed")},
  {id:"europe-moderate",level:"yellow",year:2026,source:mars,productionContext:euMaize,
    region:pair("比荷卢、斯洛文尼亚、克罗地亚","Benelux, Slovenia and Croatia"),crop:pair("夏季作物，尤其玉米","Summer crops, particularly maize"),period:pair("2026 年 6 月下旬至 8 月","Late June–August 2026"),hazard:pair("热旱","Heat and dryness"),impact:pair("报告评估中等影响，单产预期下调；无灌溉地区局地影响更大。","Moderate impacts and lower yield expectations; some unirrigated areas more affected."),evidence:pair("官方影响评估；未录入减产百分比","Official impact assessment; no loss percentage assigned")},
  {id:"europe-dry-watch",level:"yellow",year:2026,source:mars,productionContext:euMaize,
    region:pair("爱尔兰南部、德国北部、丹麦","Southern Ireland, northern Germany and Denmark"),crop:pair("夏季作物","Summer crops"),period:pair("2026 年 8 月评估","August 2026 assessment"),hazard:pair("土壤水分不足","Low soil moisture"),impact:pair("报告尚未发现显著作物影响；若干燥持续，风险可能增加。","No significant crop impacts detected in the report; continued dryness could raise risk."),evidence:pair("风险提示；不是已确认减产","Risk watch; not confirmed yield loss")},
  {id:"central-america-drought",level:"red",year:2026,source:asap,productionContext:corridorMaize,
    region:pair("中美洲干旱走廊（含洪都拉斯、萨尔瓦多）","Central American Dry Corridor, including Honduras and El Salvador"),crop:pair("玉米、豆类","Maize and beans"),period:pair("2026 年 8 月全球评估","August 2026 global assessment"),hazard:pair("严重干旱","Severe drought"),impact:pair("报告指出收成遭严重破坏；未提供可用于本站的统一减产幅度。","Report describes severely damaged harvests; no comparable loss estimate assigned here."),evidence:pair("官方报告描述收成损害","Harvest damage described in official report")},
  {id:"east-africa-heat",level:"red",year:2026,source:asap,
    region:pair("东非（报告为区域级，非逐国产区定位）","East Africa (regional assessment, not country-level crop mapping)"),crop:pair("农作物及牧草；报告未细分作物","Crops and rangelands; crop breakdown unavailable"),period:pair("2026 年 8 月全球评估","August 2026 global assessment"),hazard:pair("严重高温、持续干旱","Severe heat and prolonged drought"),impact:pair("报告指出作物单产下降及牧场退化；不能据此给每个国家相同损失率。","Reduced crop yields and degraded rangelands reported; not a uniform country loss rate."),evidence:pair("区域影响报告；地域精度有限","Regional impact report; limited geographic precision")},
  {id:"west-africa-rain",level:"yellow",year:2026,source:asap,
    region:pair("尼日利亚中部带、马里、布基纳法索、贝宁、乍得","Nigeria’s Middle Belt, Mali, Burkina Faso, Benin and Chad"),crop:pair("生长中的作物；报告未逐地细分","Growing crops; no local crop breakdown"),period:pair("2026 年 8 月中旬","Mid-August 2026"),hazard:pair("降雨分布异常","Highly variable rainfall"),impact:pair("报告指出部分作物状况不佳；不能将其转换为已确认全国减产。","Poor crop conditions reported; not evidence of a confirmed national production decline."),evidence:pair("作物状况偏弱；产量影响待确认","Poor crop conditions; production impact unconfirmed")},
  {id:"pakistan-monsoon",level:"yellow",year:2026,source:asap,productionContext:pakistanRice,
    region:pair("巴基斯坦","Pakistan"),crop:pair("雨季水稻（kharif）","Kharif rice"),period:pair("2026 年 8 月全球评估","August 2026 global assessment"),hazard:pair("季风延迟","Delayed monsoon"),impact:pair("报告指出水稻状况分化；尚不能判断全国收成损失。","Mixed rice conditions reported; national harvest loss remains unconfirmed."),evidence:pair("风险提示；产量影响待确认","Risk watch; production impact unconfirmed")},
];
