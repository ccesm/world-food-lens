# World Food Lens — Global Food Intelligence Roadmap

状态：**项目主路线（2026-10-07 起）**。本文件取代 `PHASE4B2_PLAN.md`，成为最高级的开发路线。
Phase 4B-2 文档保留，作为美国玉米深度模块的记录。

---

## 1. New mission — 新使命

> **World Food Lens is a global food-market intelligence system that combines official production,
> inventory, trade, weather, input-cost, policy and market evidence to identify emerging global
> food-supply risks.**
>
> World Food Lens 是一个全球粮食市场情报系统，整合官方的产量、库存、贸易、天气、投入成本、政策和市场证据，
> 用来发现正在形成的全球粮食供应风险。

它要回答的核心问题是：**全球粮食体系现在是在收紧（tightening），还是在放松（easing）？是哪些作物、哪些地区、哪类证据在推动？**

## 2. Why the strategy changed — 为什么转向

- 4B-1 和 4B-2 已经证明，在美国玉米上做"作物面积 × 格点天气"的高分辨率筛查是可行的，也能稳定运行。
  这套能力包括 CDL × gridMET、EDD、高温日、VPD、数据健康、缓存和失败隔离。
- 但要把这种精度推广到全球，成本过高。各国在作物地图、物候、灌溉、土壤、历史天气、官方产量和数据开放程度上差异很大，
  无法保证全球都达到美国玉米 Level C 的水平。
- 对市场情报来说，**覆盖面、及时性和可解释性**比单一地区的格点精度更有价值。
  例如，一次官方产量下调、一个出口禁令、一次大范围的降水异常，往往比美国某个格点的 EDD 更早、更直接地反映供应变化。
- 所以主线转向**可扩展的全球监测**。美国玉米的工作完整保留，定位为高分辨率深度案例，不删除，也不回退。

## 3. Three-layer architecture — 三层架构

```
GLOBAL MACRO LAYER            全球体系是收紧还是放松？
  价格 · 产量 · 库存 · 库存消费比 · 贸易 · 能源 · 化肥 · 运费 · 美元 · 利率 · ENSO · 政策 · 地缘
        ↓
CROP / REGION SUPPLY LAYER    哪些作物、哪些主产区在变化？
  玉米 · 小麦 · 大豆 · 稻米 × 主要生产国和出口国
  官方估计与修订 · 播种和收获进度 · 降水和温度异常 · 干旱 · 土壤水分 · 植被 · 出口进度 · 季节气候
        ↓
ADVANCED REGIONAL DEEP DIVES  少数数据好、市场重要的地区
  第一个：US Corn — Advanced Spatial Monitor（Level C，已上线）
  以后视价值而定：巴西大豆、美国大豆、黑海小麦
```

- 第 2 层**不要求** Level C 精度，可以使用区域级的证据。
- 第 3 层的高分辨率要求**不强制推广到全球**。

## 4. G1–G5 roadmap

| 阶段 | 名称 | 目标 | 核心输出 |
| --- | --- | --- | --- |
| **G0** | Architecture + data inventory | 盘点现有能力，统一路线 | 本文件 |
| **G1** | Global Crop Supply Monitor（**最高优先级**） | 统一监测四大作物的全球供需 | 按作物 × 国家给出产量、单产、面积、期末库存、库存消费比、出口、进口、国内消费，并突出**修订和方向** |
| **G2** | Global Weather Risk Monitor | 主产区的天气异常，不做到每块农田 | 温度和降水异常、干旱、土壤水分、ENSO、季节展望，按区域给出 |
| **G3** | Agricultural Input Cost Monitor | 独立的投入成本压力证据 | 原油、天然气、尿素、DAP、钾肥、运费、美元、利率 |
| **G4** | Trade & Policy Monitor | 对供应真正重要的政策变化 | 结构化的政策记录，含生效和到期时间、影响渠道、状态 |
| **G5** | Market Confirmation Layer | 看市场是否已经确认这些供应证据 | 各维度独立显示状态，**不汇总成一个分数** |

**G1 的展示原则**：重点是**变化、修订和方向**，不只是绝对数值。例如：

```
Brazil soybean production
Previous estimate: X   Current estimate: Y   Revision: −2.4%   Direction: tightening
```

**G2 的措辞**：只用"天气异常"、"天气关注升高"、"偏干 / 偏湿"、"数据缺口 / 未知"。
不能自动写成"作物受损"或"减产"，除非官方来源自己给出了损失估计。

**G3**：只形成"投入成本压力"证据，不推导出"粮价将上涨 X%"。

**G4**：每条政策记录都包括：国家、商品、政策类型、宣布日期、生效日期、来源、预期影响的供应渠道、状态、到期或复审日期（如已知）。

**G5**：按维度独立显示，每个维度都必须可以解释：

| 维度 | 状态取值 |
| --- | --- |
| SUPPLY | tightening / stable / easing / unknown |
| WEATHER | elevated / normal / unknown |
| INVENTORY | tightening / stable / easing / unknown |
| INPUT COSTS | rising / stable / falling / unknown |
| TRADE / POLICY | disrupted / neutral / easing / unknown |
| MARKET CONFIRMATION | present / mixed / absent / unknown |

## 5. Existing capability inventory — 现有能力清单（核对代码和数据，2026-10-07）

状态取值：production-ready / usable but incomplete / prototype / stale / missing / deferred

### G1 — Crop supply

| 所需证据 | 现有来源或模块 | 状态 | 数据质量 | 自动化 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 世界产量、消费、期末库存、库存消费比（小麦、玉米、稻米） | `scripts/macro_sources.py` `parse_usda`：USDA PSD 谷物与豆类批量 CSV，2000 年至今 | **production-ready** | Tier 1；有国家贡献度和覆盖率审计（`usda_coverage.py`），欧盟和英国分开处理 | 每日下载，保留上次可用数据 | 只解析了 Production、Domestic Consumption、Ending Stocks 三项 |
| 分国家数据 | 同一份文件的 `coverage.contributors`（每个国家的产量、消费、库存） | usable but incomplete | Tier 1 | 每日 | 只用于覆盖率审计和修订追踪，没有面向用户的国家视图 |
| 出口、进口、收获面积、单产 | **同一份 PSD 批量 CSV 里有这些字段，但没有解析** | missing（数据已下载） | Tier 1 | — | 需要扩展 `parse_usda`，不需要新数据源 |
| 大豆 | PSD 的油籽文件（`psd_oilseeds_csv.zip`），同一提供方、同一格式 | missing | Tier 1 | — | 需要新增一个下载 |
| 修订（相对上一期估计） | `scripts/revision_tracking.mjs` 和 `src/services/changeSet.js`（Phase 2 变更追踪）：按发布对比世界和国家数据（最近两个市场年度） | usable but incomplete | 有完整性哈希和发布绑定 | 每次发布 | 只有产量、消费、库存三项；没有"方向"标签和作物 × 国家的展示 |
| 同比变化 | `GrainInventory`、`SupplyHistory` 组件（历史与比较） | usable but incomplete | — | — | 是世界总量层面，没有国家分解 |
| 主要生产国和出口国的贡献 | contributors 里有产量份额 | prototype | — | — | 缺出口份额（需要出口字段） |
| 美国玉米播种和发育进度 | `scripts/refresh_corn.py`：USDA NASS Crop Progress | production-ready（只限美国玉米） | Tier 1 | 每日 | 其他国家和作物没有 |
| 官方发布日历 | `src/data/releaseSchedule.js`、`releaseCalendar.js`（FAO、USDA、NOAA、World Bank） | usable but incomplete | 人工审核 | 静态 | 缺 WASDE 的具体日期、AMIS、CONAB 等 |
| AMIS、CONAB、各国官方机构 | — | missing | — | — | 暂不爬网页；先用 PSD |

### G2 — Weather risk

| 所需证据 | 现有来源或模块 | 状态 | 数据质量 | 自动化 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 主产区点位天气（温度、降水） | `refresh_weather.py`：NASA POWER，16 个代表点；G2 首批 8 个主产区（美国玉米带、巴西中西部、阿根廷潘帕斯、黑海、欧洲小麦带、印度季风区、澳大利亚小麦带、华北平原）都至少有一个代表点；2024 年至今 | production-ready（点位级） | Tier 1，但只是代表点，不是区域面平均 | 每日 | 没有温度和降水的**距平**；是点，不是区域 |
| 土壤水分 | 同上，NASA POWER 根区和表层湿度，并与 1991–2020 同月点位气候比较 | production-ready（点位级） | 模型产品，0–1 无量纲 | 每日 | 只有点位 |
| 干旱（相当于降水异常的 SPI） | `refresh_drought.py`：Copernicus GDO 1 个月和 6 个月 SPI、RDrI-Agri，16 个点位和地图期次 | production-ready | Tier 1 | 每日，有期次核验 | 是点位取样，不是区域统计 |
| ENSO 和季节展望 | `refresh_enso.py`：NOAA CPC 概率、RONI；NOAA RONI 观测（official-data `noaa`） | production-ready | Tier 1 | 每日 | — |
| 区域季节预报（WMO、JRC） | `src/data/seasonalClimateSignals.js`（人工审核） | **stale** 风险 | 人工整理 | 有 45 天过期保护（2026-09-13 审核，10 月下旬到期） | 需要定期人工复审，或改为自动来源 |
| 作物天气报告（JRC） | `src/data/cropWeatherAlerts.js`（7 组，人工审核） | **stale** 风险 | 人工整理 | 有 30 天过期保护（2026-09-13 审核，10 月 13 日到期） | 同上 |
| 作物生长窗口 | `cropCalendars.js`（21 个模板，人工估计） | usable but incomplete | 编辑模板，不是观测 | 静态 | — |
| 植被指数（NDVI 等） | — | missing | — | — | — |
| 区域面平均的异常 | — | missing | — | — | G2 的核心缺口 |
| 美国玉米 Level C（面积 × 格点） | `corn-spatial`、`corn-heat-screen`、`corn-vpd-screen` | production-ready（深度模块） | 高 | 每日 | 不推广到全球 |

### G3 — Input costs

| 所需证据 | 现有来源或模块 | 状态 | 数据质量 | 自动化 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| Brent 原油 | EIA 月度和 World Bank Pink Sheet | production-ready | Tier 1，月度 | 每日检查 | 没有日度数据；WTI 没有接入 |
| 尿素、DAP、TSP、钾肥 | World Bank Pink Sheet | production-ready | Tier 1，月度 | 每日检查 | — |
| 天然气 | World Bank Pink Sheet **有这列，但没有解析** | missing（数据已下载） | Tier 1 | — | 扩展 `parse_world_bank` |
| 运费 | — | missing | — | — | 需要寻找可自动化的权威来源 |
| 美元、利率 | — | missing | — | — | 候选：美联储 FRED 等官方数据 |
| 价格变动告警 | `marketRules.js`：FAO、Brent、四种化肥的月环比阈值 | production-ready | WFL 启发式（明确标注） | 每日 | — |

### G4 — Trade & policy

| 所需证据 | 现有来源或模块 | 状态 | 数据质量 | 自动化 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 政策事件 | `src/data/policyEvents.json`：9 条编辑记录，有国家、类型、商品、日期、法律状态、影响渠道、来源 | **stale** / prototype | 人工审核（2026-09-12），有官方引用 | 无自动化 | 数量少；缺到期或复审日期；缺"当前是否有效"的维护流程 |
| 贸易流量（出口、进口） | PSD 里有，但没有解析 | missing（数据已下载） | Tier 1 | — | 和 G1 共用 |
| FAO FAPDA 同步 | 旧站的接口位置保留着 | missing | — | — | 需要授权或可用的接口 |

### G5 — Market confirmation

| 所需证据 | 现有来源或模块 | 状态 | 数据质量 | 自动化 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| FAO 食品价格指数 | FAO CSV，1990 年至今的月度数据 | production-ready | Tier 1 | 每日检查 | — |
| 粮食月度现货基准（小麦、玉米、稻米、大豆） | World Bank Pink Sheet | production-ready | Tier 1，月度 | 每日检查 | 不是期货 |
| CBOT 期货 | TradingView 嵌入图表（只用于展示） | prototype | 第三方、有延迟 | 不是数据 | 没有可以分析的期货数据 |
| 价格展望 | `priceForecast.js`：FAO 价格动量模型，带历史误差，明确标注为实验 | prototype | 实验性 | 每次加载时计算 | 定位需要在 G5 中复审 |
| 综合"粮食压力"分数 | `foodStress.js` 和 `GlobalFoodStress`：加权综合分（RISK_WEIGHTS），缺因子时不给总分 | **与新不变量冲突** | — | — | 见第 8 节；建议在 G5 改为各维度独立状态 |

### 跨层基础设施

| 能力 | 模块 | 状态 |
| --- | --- | --- |
| 数据契约和元数据 | `dataContract.json`、`data_contract.py`、`dataContract.js` | production-ready |
| 数据健康 | `centralDataHealth.js`、`dataHealth.js`、`sourceHealth.js`、`SourceDesk` | production-ready |
| 发布身份和不可变发布 | `release_pipeline.py`、`releaseIdentity.js`、`release-manifest.json` | production-ready |
| 变更和修订追踪 | `revision_tracking.mjs`、`changeSet.js`、`LatestChanges` | production-ready |
| 自动告警和邮件 | `automaticAlerts.js`、`evaluate_alerts.mjs`、`send_alert_email.py`；覆盖市场月环比、点位高温、SPI 偏干、数据源掉线 | production-ready（范围窄） |
| 证据登记表 | `evidenceRegistry.json`、`evidenceRegistry.js`（目前只覆盖美国玉米 Level C） | production-ready；需要扩展到 G 层 |
| 每日定时流程、缓存、失败隔离 | `deploy-pages.yml` | production-ready |
| 双语页面、手机导航 | `main.jsx`、`MobileNavigation`、`ModuleBoundary` | production-ready |
| **前端数据体积** | `official-data.json`（3.6 MB）在构建时被打进主 JS | **扩展瓶颈**：G1 数据不能再走这条路 |

## 6. Major missing datasets — 主要缺失数据（按重要性排序）

1. **四大作物的国家级供需和贸易**：出口、进口、面积、单产都在已下载的 PSD 文件里，只是没有解析；大豆需要下载 PSD 油籽文件。
2. **按国家和作物给出修订与方向**：修订追踪已有基础，但字段不全，也没有面向用户的展示。
3. **区域级天气异常**：温度和降水相对气候的距平，按区域汇总（目前只有点位）。另外缺植被指数。
4. **投入成本缺项**：天然气（已在 Pink Sheet 里，未解析）、运费、美元、利率。
5. **政策监测的覆盖和维护**：只有 9 条编辑记录，最后审核是 9 月 12 日，缺到期日期和维护流程。
6. **可分析的期货市场数据**：目前只有展示用的图表。
7. **人工审核的天气层会过期**：JRC 作物天气报告和季节信号即将超过各自的过期保护期。

## 7. Source-quality hierarchy — 数据来源分级

| 等级 | 范围 | 用途 |
| --- | --- | --- |
| **Tier 1 — 官方或权威** | USDA（PSD、WASDE、NASS、FAS）、FAO、AMIS、World Bank、NOAA、NASA、Copernicus、EIA、各国农业部和统计机构（如 CONAB） | 主要证据 |
| **Tier 2 — 机构数据** | 可信的研究机构和国际组织的数据集（如 JRC MARS、WMO） | 补充证据，必须注明来源 |
| **Tier 3 — 次级信息** | 新闻、研究报告 | 只用于背景、发现政策事件、交叉核对 |

**新闻不能覆盖 Tier 1 官方数据。** 来源之间有冲突时，两个都显示，并标为"来源冲突"。

## 8. Scientific / interpretation invariants — 科学与解读不变量

1. **不做综合风险分数。** 不把天气、供应、库存、化肥、原油、政策、期货机械加权成一个总分，例如 "Food Risk Score = 76"。
   除非将来有独立验证证明这样的模型有价值。现在的做法是多个独立证据维度，保持透明。
   - 现有的 `GlobalFoodStress` 加权综合分与此冲突。它暂时保留，因为不删除正在运行的功能，
     但不再扩展；计划在 G5 改为各维度独立状态。**这一点需要用户确认。**
2. **全球系统可以降低空间精度，但不能降低证据质量。**
   - 可以用区域级的降水异常，不要求"精确作物面积 × 4 km 天气"。
   - 可以直接用官方产量修订，不需要自己重新预测国家产量。
   - 不允许因为全球数据粗，就随意填补缺失数据。**Unknown 仍然是 Unknown。**
3. 除非来源本身给出了官方估计，否则不声称作物受损或减产。
4. 天气、供应、库存、成本、政策、市场是各自独立的证据维度。
5. 不从投入成本推导出粮价涨幅；价格展望只能作为明确标注的实验结果。
6. 来源冲突、数据过期、修订都要显式标注，不能悄悄选一个。
7. 美国玉米 Level C 的不变量继续有效（见 `PHASE4B2_PLAN.md` 第 2 节）。

## 9. Automation principles — 自动化原则

- 优先使用**可自动下载的官方批量文件或 API**；本阶段不新增脆弱的网页爬取。
- 每个新数据源都要有：数据契约、单位和格式校验、保留上次可用数据、数据健康、发布绑定、修订追踪。
- **新的全球数据写进单独的 `public/data/*.json`，在页面运行时读取，不打进主 JS 包。**
- 测试不得依赖线上数据（见 `tests/liveDataOutage.test.js`）。
- 先只生成数据，再做页面；页面不能先于数据契约。
- 告警是否接入，在每个维度单独决定，并且要先有验证。
- 来源停止更新或格式变化时，显示为"过时"或"不可用"，不能靠人工改日期掩盖。

## 10. Prioritized implementation order — 实施顺序（按现有模块调整后）

默认顺序是 G0 → G1.0 → G1.1 玉米 → G1.2 小麦 → G1.3 大豆 → G1.4 稻米 → G2 → G3 → G4 → G5。
根据盘点结果，建议做以下调整：

| 顺序 | 内容 | 调整理由 |
| --- | --- | --- |
| **G0** | 本文件：盘点和路线 | — |
| **G1.0** | 统一的全球作物供需数据契约，以及现有数据能支持的字段的审计 | 先定数据契约，后写代码 |
| **G1.1** | PSD 谷物扩展：**玉米、小麦、稻米三种一起做**，按国家解析面积、单产、出口、进口和期初库存，并接入修订和方向；写入单独的数据文件 | 三种谷物在同一个已下载的文件里，用同一个解析器，分开做成本更高。**需要用户决定**（见第 13 节） |
| **G1.2** | 大豆：PSD 油籽文件 | 同一提供方、同一格式，只多一次下载 |
| **G1.3** | G1 页面：作物 × 国家的修订与方向视图 | 数据稳定后再做 |
| G3.0 | 顺手补上 Pink Sheet 里已有的天然气等列 | 成本很低 |
| G2 | 区域天气异常：先在现有 16 个点位上加温度和降水距平，再考虑区域面平均 | 复用 NASA POWER 和 GDO |
| G3 | 运费、美元、利率 | 需要寻找新来源 |
| G4 | 政策记录结构化（到期、状态、维护流程），扩大覆盖 | 编辑工作为主 |
| G5 | 各维度状态面板，替换综合分数 | 依赖 G1 到 G4 |

## 11. Deferred — Advanced US Corn Research

> **Deferred because the project is prioritizing scalable global food-market monitoring over further
> high-resolution US-only crop-weather refinement.** 这不是技术失败，也不是废弃。

**继续在生产中运行，不改动**：Level C（`corn-spatial.json`）、热量筛查（`corn-heat-screen.json`）、
VPD 分布（`corn-vpd-screen.json`）、定时刷新、缓存、数据健康、来源记录、失败隔离。

**暂停，但保留文档和规格**：
- VPD 1991–2020 同期 P90 气候缓存（规格见 `PHASE4B2_2_VPD_SPEC.md` 的 D1–D8，已批准）。
- 热 × VPD 同现（2.2b）；登记表规则 `heat_vpd_overlap` 保持 `draft`。
- 30 年 VPD 气候缓存的构建器。
- 降水气候缓存，以及 4B-2.3 的空间降水距平。
- 湿涝面板（4B-2.4）、页面展示（4B-2.5）、方法冻结与 4C 验证（4B-2.6）。
- 为 2027 年生长季赶出完整的 Level C 危害模型。

以后如果恢复，从 `PHASE4B2_PLAN.md` 和 VPD 规格继续，九项完成标准仍然适用。

## 12. Long-term expansion — 长期扩展

- 更多作物：植物油（棕榈油、葵花籽油、菜籽油）、大麦、高粱、糖。
- 更多来源：AMIS 月报、CONAB、阿根廷布交所（BAGE）、欧盟 MARS 公报。只在可以自动化、并且属于 Tier 1 或 Tier 2 时加入。
- 需求侧：主要进口国的依赖度、人口和收入。
- 第 3 层深度模块：只在数据好、市场重要的地区，按单独的方案加入（候选：巴西大豆、美国大豆、黑海小麦）。
- 告警：在某个维度通过验证之后，才考虑把它纳入告警。

## 13. Open decisions — 需要用户确认

1. G1.1 是三种谷物一起做（推荐），还是按"先玉米、再小麦、再稻米"分三个 PR？
2. 现有的 `GlobalFoodStress` 综合分数：暂时保留但冻结、不再扩展，等 G5 时改为各维度独立状态（推荐）；
   还是现在就在页面上降级或隐藏？
3. G1 的"方向"规则（tightening、stable、easing）：建议先采用简单、透明的启发式，并登记为 C 级，
   例如"修订或同比的符号，以及一个死区"。具体规则在 G1.0 的数据契约中提出，交你审阅。

---

## 附：G1 统一数据契约草案（概念）

每一条观测是"作物 × 国家或地区 × 市场年度 × 发布期"：

| 字段 | 含义 | 现有 PSD 能否支持 |
| --- | --- | --- |
| `commodity` | corn / wheat / soybean / rice | 能（玉米、小麦、稻米）；大豆需要油籽文件 |
| `geography` | 国家 ID（`usda-psd:XX`）、欧盟、世界 | 能 |
| `marketingYear` | 例如 2026/27 | 能（注意各国的市场年度不同） |
| `production`、`domesticUse`、`endingStocks` | 千公吨 | **已解析** |
| `harvestedArea`、`yield`、`exports`、`imports`、`beginningStocks` | 千公顷、公吨/公顷、千公吨 | 文件里有，**未解析** |
| `stocksToUse` | 期末库存 ÷ 国内消费 | 可以计算（已有世界层面） |
| `previousEstimate`、`revision`、`revisionPct` | 相对上一期发布 | 修订追踪有基础，需要扩展字段 |
| `yoyChange` | 相对上一市场年度 | 可以计算 |
| `direction` | tightening / stable / easing / unknown | 新增；规则需要另行规定，并登记为启发式 |
| `source`、`sourceDate`（发布期）、`provenance` | 来源、发布期、哈希 | 能 |
| `freshness`、`status` | ok / stale / missing / not-applicable / conflicting | 数据健康已有 ok、stale、missing；`not-applicable` 和 `conflicting` 是新增 |

数据契约必须允许 missing、not applicable、stale、revision 和 conflicting sources 五种情况，并且**不能用 0 去填补缺失值**。
