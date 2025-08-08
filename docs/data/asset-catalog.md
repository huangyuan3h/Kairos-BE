# 资产目录（Asset Catalog）主表设计

## 目标

主表用于“标注系统当前支持的资产”，提供统一、极简的资产元数据，便于前端展示与后续明细表/行情表关联。该表不承载实时行情数值，仅用于资产的标识与分类。

## Schema（建议 DynamoDB）

- `symbol` (PK): 资产的规范化代码，作为主键。
- `name`: 资产名称（中文/常用名）。
- `exchange`: 交易所/撮合平台/来源平台（如 `SH`/`SZ`/`BJ`/`BINANCE`）。
- `market`: 市场域（如 `CN_A`/`CRYPTO`/`COMMODITY`/`FX`/`CASH`/`FUND_CN`）。
- `asset_type`: 资产类型（如 `stock`/`fund`/`crypto`/`commodity`/`fx`/`cash`/`index`）。
- `status`: 生命周期状态，`active` 或 `deactive`（退市/下架）。

> 说明：SK（Sort Key）暂不使用；如未来需要细分视图（如多市场多平台聚合）可引入二级键或 GSI。

## 命名规范（跨资产）

为保证全局唯一性与可读性，`symbol` 与 `exchange` 遵循以下规则：

### 股票/基金（场内，示例：A 股）

- `symbol`: `<EX><CODE>`，如 `SH600519`、`SZ159915`
- `exchange`: `SH` | `SZ` | `BJ`
- `market`: `CN_A` 或 `CN_FUND`

交易所推断（A 股常见号段）：

- `SH`: `600/601/603/605/688/689`
- `SZ`: `000/001/002/003/300/301`
- `BJ`: `430/830-839/870-879`

### 加密资产（中心化交易所）

- `symbol`: `<EX>:<PAIR>`，如 `BINANCE:BTCUSDT`
- `exchange`: `BINANCE` | `OKX` | `COINBASE` ...
- `market`: `CRYPTO`

### 大宗商品（期货/现货）

- 期货：`symbol = <EX>:<CONTRACT>`，如 `NYMEX:CL`、`ICE:BRN`
- 现货：`symbol = GLOBAL:<CODE>`，如 `GLOBAL:WTI`
- `exchange`: 对应交易所或 `GLOBAL`
- `market`: `COMMODITY`

### 外汇（FX）

- `symbol`: `FX:<BASE><QUOTE>`，如 `FX:USDCNY`
- `exchange`: 为空或 `INTERBANK`
- `market`: `FX`

### 现金/货币（Cash）

- `symbol`: 货币代码，如 `CNY`
- `exchange`: 空
- `market`: `CASH`

### 指数（Index）

- `symbol`: `<NAMESPACE>:<CODE>`，如 `CN:CSI300`
- `exchange`: 可为空或 `GLOBAL`
- `market`: `INDEX`

## 字段说明

- `symbol`: 全局唯一标识，作为 DynamoDB PK；跨资产遵循上述命名规范。
- `name`: 友好名称；前端可自由组合展示格式（不再在主表维护 `display_name`）。
- `exchange`: 便于按交易所/平台过滤、授权与风控。
- `market`: 便于做跨资产域聚合（如 `CN_A`, `CRYPTO` 等）。
- `asset_type`: 对应资产大类，便于路由到不同明细表与采集器。
- `status`: 生命周期状态；`deactive` 常见于退市、下架、不再支持。

## 生命周期与退市

- 初始入库：新抓取的有效资产默认 `status = active`。
- 周期对账：定时任务（见开发文档 `development/catalog-sync.md`）基于官方或权威数据源对账；下列情况置为 `deactive`：
  - 退市/下架/合约终止
  - 长期无效代码或被平台移除
  - 兼并/更名：可保留旧 `symbol` 为 `deactive`，并新增新 `symbol`

## 与明细表/行情表的关系

- 主表只承载“资产有哪些”；数值类、时间序列类数据写入独立表（如 K 线/最新价/指标表），通过 `symbol` 关联。
- 前端展示通过主表列表 + 明细表联动，不在主表冗余数值字段。

## 数据质量与校验

- 采集阶段去重：`symbol` 唯一。
- 交易所推断：对 A 股提供号段推断；跨资产由具体采集器明确 `exchange`。
- 非法或未知 `exchange` 的记录不入库或进入隔离区（可选）。

## 示例记录

```json
{
  "symbol": "SH600519",
  "name": "贵州茅台",
  "exchange": "SH",
  "market": "CN_A",
  "asset_type": "stock",
  "status": "active"
}
```

```json
{
  "symbol": "BINANCE:BTCUSDT",
  "name": "Bitcoin",
  "exchange": "BINANCE",
  "market": "CRYPTO",
  "asset_type": "crypto",
  "status": "active"
}
```

## 后续扩展

- 枚举常量下沉到 `core`（如 `AssetType`/`Market`/`Exchange`/`Status`）。
- 新资产类（基金、期货、指数）采集器统一输出该 Schema。
- 引入只读 GSI（如按 `market`/`asset_type` 查询）视业务需要设计。
