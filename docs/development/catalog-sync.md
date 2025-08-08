# 资产目录同步（Catalog Sync）与任务调度

本文档描述如何从各数据源抓取资产目录、规范化为主表 Schema，并以任务方式定时或事件驱动写入 DynamoDB。

## 总览

流程：

1. 数据抓取（per-asset-type 采集器）
2. 规范化（统一 `symbol`/`name`/`exchange`/`market`/`asset_type`/`status`）
3. 校验与去重（过滤未知/非法交易所、重复 `symbol`）
4. 写入主表（DynamoDB 批量写入）
5. 生命周期对账（退市/下架 -> `status = deactive`）

## 采集器约定

每类资产提供一个“目录采集器”，输出 DataFrame（或可迭代记录）且符合主表 Schema：

- A 股：`core.data_collector.stock.spot_data_collector.get_a_share_spot_data`
- 基金/加密/商品/外汇：对应模块分别输出相同 Schema

要求：

- 输出固定列：`symbol`、`name`、`exchange`、`market`、`asset_type`、`status`
- `symbol` 唯一；`status` 默认 `active`

## 写入 DynamoDB

建议在 `functions/` 中实现 `catalog_sync.py`：

- 组合多个采集器输出
- 统一去重（按 `symbol`）与校验
- 调用 AWS SDK 批量 `PutItem`（upsert）
  - 若存在则更新非键字段
  - 可选：对不在本次抓取清单内且历史存在的记录进行“软失活”（`status=deactive`）

批量写入注意：

- 控制单批 25 条（DynamoDB BatchWrite 限制）
- 失败重试与指数退避
- 记录失败项日志（CloudWatch）

## 任务调度（SST / Serverless）

- 定时任务：
  - A 股目录：每日开盘前、收盘后对账
  - 加密目录：每日或每数小时对账
- 事件驱动：
  - 新数据源上线触发一次全量构建

在 `deploy/cron/tasks.ts` 中新增 cron 任务，调用对应的 Lambda（Python/Node/Golang 均可）。

## 生命周期对账

- 数据源：
  - A 股退市/暂停列表（akshare 可获取，后续按需接入）
  - 交易所产品清单（加密/期货）
- 策略：
  - 清单内 -> `active`
  - 清单外且历史存在 -> `deactive`
  - 更名/合并 -> 新增新 `symbol`，旧 `symbol` 置 `deactive`

## 监控与可观测性

- 统计写入成功/失败数量
- 输出本次新增/更新/失活的数目
- 记录异常与重试详情

## 测试策略

- 采集器：
  - 使用 monkeypatch/fake data 验证规范化逻辑
  - 覆盖交易所推断、过滤与列一致性
- 写入层：
  - 使用 LocalStack 或 moto（若用 boto3）进行集成测试

## 后续计划

- 在 `core` 下沉 `AssetType`/`Market`/`Exchange`/`Status` 常量
- 新资产采集器（基金/加密/商品）逐步落地并纳入统一同步
