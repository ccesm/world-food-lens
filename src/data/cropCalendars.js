// Editorial month-level seasonal templates, NOT measured current crop progress.
// P=planting, V=vegetative, W=overwintering, F=flowering/pollination,
// G=grain/seed fill, H=harvest, -=outside this selected crop season.
export const CALENDAR_REVIEWED = "2026-09-13";
export const CALENDAR_SOURCE = "https://ipad.fas.usda.gov/pdfs/crop_cal.pdf";
export const CROP_NAMES = {
  maize:{zh:"玉米",en:"Maize"}, soybeans:{zh:"大豆",en:"Soybeans"}, winterWheat:{zh:"冬小麦",en:"Winter wheat"},
  springWheat:{zh:"春小麦",en:"Spring wheat"}, rice:{zh:"稻米",en:"Rice"}, barley:{zh:"大麦",en:"Barley"}, canola:{zh:"油菜",en:"Canola"},
};
export const STAGES = {
  P:{zh:"播种 / 出苗",en:"Planting / emergence",sensitivity:40},
  V:{zh:"营养生长",en:"Vegetative",sensitivity:45},
  W:{zh:"越冬",en:"Overwintering",sensitivity:70},
  F:{zh:"开花 / 授粉",en:"Flowering / pollination",sensitivity:95},
  G:{zh:"灌浆 / 籽粒形成",en:"Grain / seed fill",sensitivity:85},
  H:{zh:"成熟 / 收获",en:"Maturity / harvest",sensitivity:25},
  "-":{zh:"所选季节之外",en:"Outside selected season",sensitivity:0},
};
const rows = [
  ["us-corn","美国玉米带","US Corn Belt","maize","---PPVFGHH--"],
  ["us-soy","美国中西部","US Midwest","soybeans","----PVFGHH--"],
  ["us-wheat","美国大平原","US Great Plains","winterWheat","WWVFGHH-PPVW"],
  ["canada-wheat","加拿大草原省","Canadian Prairies","springWheat","----PVFGHH--"],
  ["canada-canola","加拿大草原省","Canadian Prairies","canola","----PVFGHH--"],
  ["eu-wheat","法国 / 德国代表季节","France / Germany season","winterWheat","WWVVFGHHPPVW"],
  ["eu-barley","欧洲春大麦代表季节","European spring barley season","barley","--PPVFGHH---"],
  ["russia-wheat","俄罗斯南部冬麦区","Southern Russia","winterWheat","WWWVFGHHPPVW"],
  ["ukraine-wheat","乌克兰冬麦区","Ukraine winter crop","winterWheat","WWWVFGHHPPVW"],
  ["brazil-soy","巴西中部主季","Central Brazil main season","soybeans","FGHH----PPVV"],
  ["brazil-safrinha","巴西中部二季玉米","Central Brazil safrinha","maize","-PPVFGHH----"],
  ["argentina-corn","阿根廷主季早播","Argentina early main crop","maize","FGHHH---PPVV"],
  ["argentina-soy","阿根廷潘帕斯","Argentina Pampas","soybeans","VFGHH----PPV"],
  ["argentina-wheat","阿根廷潘帕斯","Argentina Pampas","winterWheat","H---PPVVFGHH"],
  ["china-wheat","中国华北平原","North China Plain","winterWheat","WWVVFH--PPVW"],
  ["china-corn","中国东北","Northeast China","maize","---PPVFGHH--"],
  ["india-rice","印度季风稻主季","India kharif rice","rice","-----PVVFGHH"],
  ["india-wheat","印度北部冬季麦","Northern India rabi wheat","winterWheat","VFGHH-----PP"],
  ["thailand-rice","泰国主季雨养稻","Thailand main wet-season rice","rice","----PPVVFGHH"],
  ["australia-wheat","澳大利亚南部冬作","Southern Australia winter crop","winterWheat","H---PPVVFGHH"],
  ["south-africa-corn","南非主季玉米","South Africa main maize","maize","VFGHHH---PPV"],
];
export const cropCalendars=rows.map(([id,zh,en,crop,months])=>({id,region:{zh,en},crop,months:months.split(""),
  sourceType:"estimated",source:CALENDAR_SOURCE,confidence:"medium",reviewedAt:CALENDAR_REVIEWED}));
// The detailed Brazilian second-season timing is a WFL approximation informed by
// the USDA Brazil calendar, not a direct official month-by-month stage series.
cropCalendars.find(row=>row.id==="brazil-safrinha").source="https://ipad.fas.usda.gov/highlights/2013/05/br_15may2013/BrazilCornCropCalendar.htm";
