# 简明主线 TODO（线性）

➡️ 下一任务：创建并部署 `company` 表（含 GSI）

- [x] P0 基线确认（资产清单/数据源/回填窗口）
- [x] 架构决策：新建 `company` 单表（替代复用 `MarketData`）
- [ ] 创建 `company` 表与 GSI（`byDate`/`byType`/`byFiscalPeriod`）
- [ ] CN 全量 A 股清单落盘与字段映射（进行中）
- [ ] 日线同步：CN 日线 `OHLCV` + 回填/幂等（含复杂查询单测）
- [ ] 公司信息同步：`PROFILE/ANNOUNCEMENT/KPI` → `company`（季度同步 + 近 6 个月回填）
- [ ] 新增同步 Lambda（Python）：`@stock/company_sync`（由 jobs 调用），幂等/限速/重试；业务逻辑位于 `core/src/core/data_collector/stock/`
- [ ] 新增 Cron：季度同步（Asia/Shanghai 06:00）
  - 建议时间：每年 02-01、05-01、09-01、11-01 的下一个交易日 06:00
  - 运行参数：`lookback_days=200`（覆盖 FY/Q1/H1/Q3 披露窗口）、`batch_size`、`concurrency`
- [ ] 数据质量校验与报警（覆盖率/合法性/一致性）
- [ ] 特征工程：基于行情 + 公司信息抽取策略所需特征
- [ ] 策略假设定义：规则/参数空间/约束
- [ ] 回测框架搭建：样本区间/基准/交易成本/评估指标
- [ ] 运行策略测试：在“已同步数据”上批量回测与对比分析
- [ ] 阈值与参数固化：基于结果确定默认配置
- [ ] 报告与接口：报告页集成 + 读端 API（含最近信号/解释字段）
- [ ] 调度与监控：SST cron、重试、失败告警与运行报告

说明：已完成项用 [x]，进行中在条目后标注“（进行中）”。


