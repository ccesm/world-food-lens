# Phase 4B-2.2a 报告 — VPD 描述性分布

状态：**已上线（PR #10，2026-10-07）**。只生成数据，不设阈值；页面展示放在 4B-2.5（目前 Deferred）。
规格：`PHASE4B2_2_VPD_SPEC.md` 第 2、3、4a 节。实现：`scripts/corn_vpd.py`；输出：`public/data/corn-vpd-screen.json`。

## 1. 九项完成标准

| # | 标准 | 结果 |
| --- | --- | --- |
| 1 | 方法写成文档 | VPD 规格第 2、3、4a 节（PR #8、#9） |
| 2 | 实现 | `corn_vpd.py`；`refresh_corn_spatial.build_vpd`；`release_pipeline.ALL_GENERATED` |
| 3 | 自动化测试 | `tests/test_corn_vpd.py`（标准测试集）；`tests/spatial/test_corn_vpd_runtime.py`（GIS 运行环境） |
| 4 | 失败与缺数据 | 以下情况都判为不可用：变量名、单位、几何、日期或数值范围不符；州没有通过验证的地理数据；下载失败；窗口内有缺失日。缺失面积留在分母里 |
| 5 | 真实数据合理性检查 | 见第 2 节 |
| 6 | 来源记录和版本 | `methodVersion: mapped-corn-vpd-screen/1`；每个州都记录 `weatherVersions`，包括原始文件哈希、版本文本、下载地址；用 `baseArtifact.analysisHash` 绑定 Level C |
| 7 | 证据登记表 | `atmospheric_demand_vpd` 改为 `reviewed`，`heat_vpd_overlap` 仍是 `draft` |
| 8 | 文档 | 本报告；VPD 规格第 4a 节；README 和 PROJECT_CONTEXT |
| 9 | 告警和邮件不受影响 | 新文件不是告警输入。VPD 在 Level C 之后运行，并使用独立的网络预算 |

## 2. 真实数据检查（分支验证运行）

运行 [37691777941](https://github.com/ccesm/world-food-lens/actions/runs/37691777941)，用 `validation_only` 模式，不部署，也不发邮件。
数据来自 gridMET 实时下载，窗口为 2026-09-22 至 2026-10-05。

- **变量核对通过**：`mean_vapor_pressure_deficit`，单位 `kPa`。坐标、日期、几何都与年度作物格网一致，没有触发失败即停。
- 覆盖率为 0.99999999，十个州全部可用，`reasons` 为空。
- 面积加权平均：14 天日均 VPD 为 **0.575 kPa**，期内最大 VPD 为 **1.122 kPa**。
  这个量级与秋季玉米带湿润、凉爽的天气相符。这只是合理性检查，不是准确性验证。
- 同一次运行中，热量指标的平均值为 EDD29 0.136、EDD30 0.066，与已上线的生产数据一致。
  Level C 和 2.1 的结果都没有受到影响。
- 运行的构建、冷启动和热启动都通过了，新文件也通过了本地发布检查（`save_data`、`verify_release`）。

## 2b. 第一份生产数据

数据来自生产运行 [37695381676](https://github.com/ccesm/world-food-lens/actions/runs/37695381676)，合并 PR #10 后触发，发布时间为 2026-10-07T22:20Z。
十个州全部可用，覆盖率与 Level C 相同；数值与分支验证运行一致。

| 州 | 14 天日均 VPD 的面积加权平均（kPa） | 期内最大 VPD 的最大值（kPa） |
| --- | --- | --- |
| IL | 0.787 | 2.68 |
| MO | 0.775 | 2.68 |
| IN | 0.710 | 2.23 |
| KS | 0.685 | 1.88 |
| OH | 0.643 | 1.82 |
| NE | 0.535 | 2.05 |
| SD | 0.495 | 1.85 |
| WI | 0.468 | 1.04 |
| MN | 0.428 | 1.12 |
| IA | 0.417 | 1.25 |

偏南、偏暖的州 VPD 较高，这与同一窗口的热量指标一致（IL、MO 的 EDD 最高）。这只是合理性检查，不是准确性验证。

## 3. 已知局限

- 提供方没有公开日均 VPD 的推算方法（例如用日均温度还是用最高、最低温计算饱和水汽压）。
  FAO-56 指出不同做法会有偏差，所以这一点作为局限写进了登记表。
- 不区分生育期；2023 年地图是替代；不区分灌溉与雨养。
- VPD 的原始下载文件不放进 Level C 的输入存档，只记录哈希和版本。
- 2.2a 不设阈值。高 VPD 和同现判断（2.2b）依赖 VPD 气候缓存（D1–D8），这两项目前都是 **Deferred — Advanced US Corn Research**。
