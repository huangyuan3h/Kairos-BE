# 量化交易：日度数据同步与进攻/防守信号（可执行计划）

> 本清单仅含“计划与验收标准”，不包含实现代码；用于驱动日度 ETL、指标计算与对外输出。

## 🎯 目标与产出

- **目标**: 每日同步核心资产的日线数据（OHLCV 等），计算“进攻/防守”信号并对外提供查询。
- **产出**:
  - 每日 ETL 成功记录与覆盖率报告
  - 当日信号（含简要理由：趋势/波动）可查询/可回溯
  - 简单回测统计（命中率、稳定性、切换频率）

## 📌 范围与默认值（待确认）

- **资产覆盖（优先级）**:
  - P0（已完成）：基准指数/ETF（CN：沪深300/上证综指/中证500；US：SPX/NDX/R2000；ETF：SPY/QQQ/IWM）
  - P1（进行中）：CN 全量 A 股（剔除已退市）
  - P2：US 主板全量（NASDAQ/NYSE/AMEX，剔除已退市）
- **数据源**:
  - CN：`akshare`
  - US：`yfinance`
  - 可后续切换至 IEX/Polygon/Tiingo/Tushare Pro（不改变输出 schema）
- **调度时间（本地时区）**:
  - CN：交易日收市后 16:10
  - US：美东收市后 16:20
- **回填策略**：每日回填近 5 个交易日（容错、补漏）
- **信号形态**：默认二分类（进攻/防守），可扩展至五档（强进/轻进/中性/轻守/强守）

## 🧱 架构基线（与现有表设计对齐）

- 表：`MarketData`（SST 单表，继续复用，强化 stock 时间序列查询能力）
- 主键：`pk=STOCK#<symbol>`；排序键：
  - 日线：`sk=QUOTE#YYYY-MM-DD`（使用 `core.database.keys.make_sk_quote_date`）
  - 信号：`sk=META#SIGNAL#YYYY-MM-DD`
- GSI：
  - `bySymbol`（保留）：`gsi1pk=SYMBOL#<symbol>`，`gsi1sk=ENTITY#<TYPE>#<timestamp>`（按符号时间线）
  - `byDate`（新增）：`gsi2pk=DATE#YYYY-MM-DD`，`gsi2sk=STOCK#<symbol>`（按交易日批量检索全市场或子集）
  - `byMonth`（可选）：`gsi3pk=MONTH#YYYY-MM`，`gsi3sk=STOCK#<symbol>#DATE#YYYY-MM-DD`（提升跨日窗口聚合效率）
  - `byMarketStatus`：维持现有用于目录查询
  - 说明：复杂时间段查询以 `pk` 的范围（`between`）为主，跨标的/跨日场景通过 `byDate/byMonth` 分片并行拉取

## 📆 分阶段执行计划（带验收标准）

### Phase 0｜范围澄清（P0 必须）

- [x] 确认 P0 资产清单（指数/ETF 列表与符号标准）
- [x] 确认数据源与限速策略（CN：`akshare`，US：`yfinance`）
- [x] 确认调度时间与回填窗口（默认 5 日）
- 验收：有版本化的资产清单与调度配置（代码配置/环境变量说明）

### Phase 0.5｜范围更新与设计决策（Stock 全量化）

- [ ] 决策：沿用 `MarketData` 单表并新增 `byDate/byMonth` GSI（优先）或新建 `StockData` 表
- [ ] 定义复杂时间段查询的接口约定（单标的区间、跨标的同日、跨日跨标的）
- [ ] 评估日级分片策略与并发度（避免热分区、控制读写峰值）
- 验收：设计决策记录 + 查询样例通过小规模演练

### Phase 1｜数据模型与键设计（Stock 强化）

- [ ] 定义日线 `OHLCV` schema：`date, open, high, low, close, adj_close, volume, currency, source, ingested_at, corporate_action_flags`
- [ ] 确认键位：`QUOTE#YYYY-MM-DD`，信号：`META#SIGNAL#YYYY-MM-DD`
- [ ] 新增 `byDate`、可选 `byMonth` GSI 与访问模式（扫描窗口与批量聚合）
- [ ] 批量写入与读并发策略（批次大小、重试、幂等覆盖）
- 验收：通过单元测试的 schema 校验与键位生成（`make_sk_quote_date`），并通过查询用例覆盖三类复杂时间段

### Phase 2｜数据源与覆盖清单

- [ ] 列出并落盘 CN 全量 A 股清单（过滤退市），并维护符号规范映射
- [ ] 评估并记录 `akshare/yfinance` 字段、时区、复权/拆分处理
- [ ] 规划 US 主板全量清单的获取方式与限速策略
- 验收：资产映射表 + 源字段对照表（文档化）

### Phase 3｜每日同步作业（ETL）

- [ ] 任务拆分：`sync_daily_quotes_cn_all`（CN 全量 A 股）、`sync_daily_quotes_us_all`（US 主板全量）、`sync_benchmarks`
- [ ] 支持“增量+回填”窗口（默认近 5 日）与幂等写入（覆盖同键）
- [ ] 交易日历：非交易日跳过；源异常自动重试与降级；限速与并发控制
- [ ] Lambda：`ingest_cn_stocks` 与 `ingest_us_stocks`（分别处理 CN/US 全量同步）
- 验收：
  - [ ] 每日跑通，覆盖率 ≥ 95%
  - [ ] 回填机制验证通过（删除后重跑可恢复）

### Phase 4｜数据质量（DQ）

- [ ] 完整性：目标符号覆盖率阈值与报警
- [ ] 异常检测：0/负值、跳变、停牌、缺失补齐策略
- [ ] 公司行为：优先存 `adj_close`；补充 `corporate_action_flags`
- 验收：DQ 日报 + 报警规则在监控可见

### Phase 5｜指标/因子流水线与首版信号

- [ ] 基础指标：`SMA/EMA/N日收益/历史波动率/分位`（针对基准与 ETF 优先）
- [ ] 信号规则（V1 二分类）：
  - 趋势为正且波动处于低/中位 ⇒ 进攻
  - 趋势转负或波动高位 ⇒ 防守
- [ ] 阈值配置化（环境变量/配置文件），可随阶段迭代
- 验收：对给定回测区间可稳定产出信号与解释字段

### Phase 6｜回测与门槛微调

- [ ] 计算命中率、稳定性、切换频率、最大回撤差异等
- [ ] 输出混淆矩阵与关键窗口表现
- [ ] 根据指标微调阈值并固化配置
- 验收：回测报告（自动生成摘要）

### Phase 7｜存储与对外输出

- [ ] 将当日信号以 `META#SIGNAL#YYYY-MM-DD` 写入 `MarketData`
- [ ] 在 `src/reporting`：新增业务查询（当日/最近N日信号）与脚本 `debug_daily_signal`
- [ ] 暴露 REST/GraphQL 读端（先内部使用，后续对外）
- [ ] Lambda：`query_stock_timeseries`（复杂时间段查询读端）
- 验收：
  - [ ] 通过用例可查询到最新信号
  - [ ] 报告页可渲染“进攻/防守 + 理由”

### Phase 8｜调度、重试与监控

- [ ] `SST cron` 配置 CN/US 定时任务，带超时/重试/告警
- [ ] 覆盖率看板与失败任务告警（CloudWatch/第三方）
- [ ] 可选：每日信号摘要推送（邮件/IM）
- 验收：
  - [ ] 失败有报警，恢复后自动补数
  - [ ] 每日生成简要运行报告

## 🔧 技术约束与复用

- 复用 `MarketData` 现有单表与 `make_sk_quote_date` 键位函数；若新表，则保持相同键位与事件模型
- 业务逻辑放入 `business/` 层并配套单元测试，支持未来 GraphQL 接入
- 首版以免费源快速闭环，后续可热切换到付费源

## ✅ 快速检查清单（执行用）

- [ ] 资产清单与调度配置已确认（含 CN 全量 A 股、US 主板全量）
- [ ] Schema 与键位/新 GSI 单测通过（含复杂时间段查询用例）
- [ ] ETL 跑通且覆盖率达标（CN→US 分阶段）
- [ ] DQ 报表生成
- [ ] 信号生成与解释字段产出
- [ ] 回测报告生成并固化阈值
- [ ] 查询/API/报告联调通过（含 `query_stock_timeseries`）
- [ ] 定时、重试、报警生效

---

**维护**: 团队
**更新**: 以阶段完成为节点滚动更新
