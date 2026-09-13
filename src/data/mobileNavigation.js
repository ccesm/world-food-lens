const pair=(zh,en)=>({zh,en});

export const mobilePrimaryNavigation=[
  {id:"home",href:"#home",label:pair("首页","Home")},
  {id:"risk",href:"#food-stress",label:pair("粮食风险","Food risk")},
  {id:"crops",href:"#crop-windows",label:pair("作物","Crops")},
  {id:"climate",panel:"climate",label:pair("气候","Climate")},
  {id:"more",panel:"more",label:pair("更多","More")},
];

export const mobileClimateNavigation=[
  {href:"#enso-outlook",label:pair("ENSO 状态与概率","ENSO state & odds")},
  {href:"#seasonal-outlook",label:pair("地区季节展望","Seasonal outlook")},
  {href:"#local-crop-weather",label:pair("产区天气","Crop weather")},
  {label:pair("干旱监测","Drought"),status:pair("尚未接通","Not connected")},
  {label:pair("土壤水分","Soil moisture"),status:pair("尚未接通","Not connected")},
];

export const mobileMoreNavigation=[
  {href:"#grain-inventory",label:pair("三谷物库存","Grain inventories")},
  {href:"#s1",label:pair("价格与成本","Prices & costs")},
  {href:"#s2",label:pair("产量与库存","Supply & stocks")},
  {href:"#s3",label:pair("全球政策库","Global policy")},
  {href:"#s4",label:pair("传导路径","Transmission")},
  {href:"#s5",label:pair("成本实验室","Cost lab")},
  {href:"#s6",label:pair("投资标的","Investments")},
  {href:"#price-outlook",label:pair("价格展望","Price outlook")},
  {href:"#release-calendar",label:pair("发布日历","Release calendar")},
  {href:"#data-desk",label:pair("数据来源","Data sources")},
];
