# Phase 4B-2.0 — 证据登记表与方法规格

状态：**4B-2.0 已合并（PR #4）；C 节的热量指标已在 4B-2.1 实现**。4B-2.0 本身只新增了文档、数据契约和测试。
依据：`PHASE4B0_CORN_AGRONOMIC_SPECIFICATION.md`（以下简称 4B-0），计划见 `PHASE4B2_PLAN.md`。

## A. 证据登记表

文件：`src/data/evidenceRegistry.json`；校验：`src/services/evidenceRegistry.js`。

- 每条规则一条记录，字段按 4B-0 M 节。规则写明三件事：
  - 测量什么（`concept`）
  - 可以声称什么（`intendedClaim`）
  - 不能声称什么（`prohibitedClaims`）
  三项都需要中英双语。
- 概念的可信程度（`conceptTier`）和具体数值实现的可信程度（`implementationTier`）分开记录。
  概念强（A 级）不代表具体阈值也是 A 级。
- 文献只记录 4B-0 S 节的编号，例如 `E1`、`M1`，不复制文献条目。测试会检查每个编号都能在 S 节找到。
- 每次运行都会变化的时间信息（来源发布、观测期、修订标识、可得时间）不写进登记表。
  登记表在 `chronology` 字段里说明这些信息在输出元数据的哪个字段中。
- `outputs` 列出该规则对外发布的指标键名。一个指标键名只能属于一条规则。

### 审核状态与发布闸门

| `reviewStatus` | 含义 | 能否对外发布 |
| --- | --- | --- |
| `draft` | 规格已写，未经用户审核 | 否 |
| `reviewed` | 用户已批准规格 | 是，只作信息层 |
| `frozen` | 按 4B-0 R 节冻结，必须有 `freezeIdentifier` | 是 |
| `superseded` | 已被新版本替代 | 否 |

测试强制执行两条规则：
1. 已发布的 Level C 指标（Python 的 `METRICS`、JS 的 `cornSpatial` 指标、`public/data/corn-spatial.json` 里的键）都必须属于 `reviewed` 或 `frozen` 的规则。
2. `draft` 规则的输出不能出现在任何已发布的文件中。

以后 4B-2 每个子阶段在合并时，把相关规则从 `draft` 改成 `reviewed`。这个改动本身就是用户批准的记录。

现有 Level C 的 5 个指标记为 `reviewed`，因为它们已在 4B-1.9 和 4B-1.10 通过审核并上线。
4B-2 新增的规则全部是 `draft`。

## B. 共同约定（4B-2 全部指标）

- **空间**：与 Level C 共用 9 km 格网（`cornbelt-iowa-anchored-9km/1`）和 2023 年 CDL 原生 30 m 玉米面积权重。
  2023 年地图是明确标注的替代，不代表当年实际种植。
- **先在格点上计算，再做面积加权**。EDD、高温日数这类指标对温度是非线性的，所以必须先在每个
  gridMET 格点上算出逐日值，再按玉米面积加权。不能先对温度加权平均，再算指标。
- **时间窗口**：与 Level C 相同的 14 天。日界、每日最高最低温都直接使用 gridMET 发布的日值，不重新聚合。
- **缺失值**：沿用 Level C 已有的规则（`corn_spatial_geo.summarize`）。一个格点只有在窗口内 14 天、
  Level C 的全部变量（`tmmx`、`tmmn`、`pr`）都有效时，才参与计算；否则它的面积计为缺失面积，不按比例放大。
  这样 4B-2 的覆盖面积和 Level C 完全一致，不会出现两套分母。覆盖率照常用 `variableCoveredAreaM2`
  和 `missingWeatherCellsWithCorn` 报告。即便 Level C 本身成功，某个州的 4B-2 指标计算失败时，
  该州在 4B-2 文件里也记为不可用，它的面积从分子中去掉，但仍留在分母里。
- **汇总格式**：与现有的 `weatherSummary` 完全相同，即面积加权的 `mean/min/max/p10/p50/p90`，
  每州一份，十州合并一份。
- **生育期**：Level C 的 `localStageEligibility` 现在是 `insufficient`。因此所有 4B-2 指标都覆盖全部已制图的
  玉米面积，**不做生育期加权**。页面必须写明"未区分生育期"。
- **版本隔离**：4B-2 的输出写入新的独立文件，各自有方法版本号。现有的 `corn-spatial.json`
  （`mapped-corn-weather-production/1`）及其 `analysisHash` 保持逐字节不变。

## C. 4B-2.1 热量指标（精确定义）

### C1. 极端度日 EDD（`heat_extreme_degree_days`）

在每个格点、每一天上，用 single-sine 方法近似气温的日变化（Baskerville–Emin 型）。
设日最低温为 `Tn`，日最高温为 `Tx`（单位 °C），基准为 `b`：

```
M = (Tx + Tn) / 2,   A = (Tx − Tn) / 2
若 Tx ≤ b：          EDD = 0
若 Tn ≥ b：          EDD = M − b
否则：               θ = arcsin((b − M) / A)
                    EDD = [ (M − b)(π/2 − θ) + A·cos θ ] / π
```

- 单位是 °C·日。窗口值等于 14 天之和，再按面积加权汇总。
- **两个基准预先同时声明**：`b = 29°C` 和 `b = 30°C`。两个都输出，以后不能根据结果挑一个。
  输出键名：`edd29Window14DayCDay`、`edd30Window14DayCDay`。
- 这是由日最高、最低温重建的近似值，不是逐时积分。页面和元数据都要写明"近似方法"。
- 测试只用解析或合成的天气数据：
  - `Tx ≤ b` 时结果为 0。
  - 全天高于基准时，结果等于 `M − b`。
  - `M = b` 时，结果等于 `A/π`。
  - 结果随 `Tx` 单调不减。
  - 29°C 的结果不小于 30°C 的结果。
  - 与数值积分的结果一致（误差小于 1e-9）。
  - 先算后加权与先加权后算的结果不同，以证明顺序正确。

### C2. 高温日筛查（`hot_day_tmax35`，C 级，WFL 自定的启发式）

- 在每个格点上，统计窗口内日最高温 ≥ 35.0°C 的天数，以及最长连续天数。
  输出键名：`hotDays35Count`、`hotDays35LongestRun`。单位为天。
- 35°C 是项目自定的筛查阈值，不是生理伤害界限（见 4B-0 O 节）。不设"几天算严重"之类的天数阈值。
- 键名中的 35 必须与登记表中的数值一致，测试会检查这一点。

### C3. 输出文件（`public/data/corn-heat-screen.json`）

- 文件由 `scripts/refresh_corn_spatial.py` 在同一次运行中写出，计算逻辑在 `scripts/corn_heat.py`。
  基准温度、阈值和指标键名都从登记表读取，代码里不写死。
- `baseArtifact` 记录同一次运行的 `corn-spatial.json` 的方法版本和 `analysisHash`。
  两个文件的哈希对不上，就说明它们来自不同的运行。
- 每个州有 `status`、`heatSummary`（格式与 `weatherSummary` 相同）和 `reasons`。
  合并部分重新计算覆盖率，只把 4B-2 指标计算成功的州算进分子。
- 计算失败时写出"全部不可用"的文件；如果连这一步也失败，就删除旧文件。
  这样旧的 4B-2 文件永远不会和新的 Level C 结果配在一起。
- 这个文件进入每日数据发布（`release_pipeline.ALL_GENERATED`），但**不是告警的输入**，
  不参与 `inputsHash`，也不影响邮件。

## D. 4B-2.2 以后（只列出必须通过的关卡，定义在各子阶段再补）

- **VPD**：只能使用和温度同一来源、同一格网的湿度类变量（候选是 gridMET 的 `vpd`）。
  上线前必须先核对该变量的定义（日均值还是其他）、单位和可得的历史。缺数据就保持缺失，不能用温度推算。
- **热和 VPD 同现**：每个格点只有三种结果：同时出现、未同时出现、未知。任一输入缺失时为未知。
  不做加权求和，不输出风险分数。
- **降水距平**：在使用前必须写明基准期、基线版本、基线文件的哈希，以及冷启动的成本。
- **湿涝面板**：只能把降水持续性、NASS 官方播种进度相对同期的偏离、可作业天数并排展示，不推断因果。

## E. 措辞规则（所有 4B-2 页面文案）

- 可以这样写："在 2023 年制图的玉米面积上，14 天窗口内日最高温 ≥ 35°C 的天数中位数为 X。未区分生育期。"
- 禁止的写法：受影响面积或产量、减产、授粉失败、"作物安全"、"风险低"（筛查未触发时）、"损害确认"。
- 每条规则的 `prohibitedClaims` 会在 4B-2.5 中直接用于页面的说明文字。
