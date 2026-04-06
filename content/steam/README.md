# Steam 月度时长数据格式

文件：
- `content/steam/monthly_hours.json`
- `content/steam/daily_totals.json`

用于给任意年月补充真实的“本月时长”，键可以用 `appid`（推荐）或游戏名。

示例：

```json
{
  "2026-03": {
    "367520": 18.0,
    "Hollow Knight": 2.5
  },
  "2026-02": {
    "367520": 10.0
  }
}
```

说明：
- 页面选择某年月后，优先读取 `monthly_hours.json` 的该月数据（已归档月份）。
- 快照由脚本 `npm run steam:snapshot` 写入 `daily_totals.json`，结构为 `snapshots[]`：每条含 `capturedAt(UTC)` 与 `totalsMin(分钟累计值)`。
- 统计按固定时区 `Asia/Hong_Kong` 划日界，分钟级计算，展示时再换算为小时。
- 日分配策略：
  - 间隔 `<=6h`：按区间重叠分配到当天/跨天（高可信）。
  - 间隔 `6h~48h`：同样分配，但标记为估算。
  - 间隔 `>48h`：不分配到日柱，计入当月总量的未知桶。
- 过去月份在满足归档条件后写入 `monthly_hours.json`，归档后不再修改。
- 如果你手工维护 `monthly_hours.json`，页面会优先使用你填的值。
