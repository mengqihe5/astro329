# Steam 月度时长数据格式

文件：
- `content/steam/monthly_hours.json`
- `content/steam/monthly_snapshots.json`

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
- 页面选择某年月后，优先读取 `monthly_hours.json` 的该月数据。
- 系统会在访问 Steam 数据时自动记录“月初总时长快照”到 `monthly_snapshots.json`。
- 当捕获到“下个月月初快照”后，会自动把上个月的月度时长写入 `monthly_hours.json`，用于后续快速查询。
- 当前月若还没有可用月度归档，则使用“当前总时长 - 月初快照”计算；首次初始化月初快照时，会用 `playtime_2weeks` 做一次平滑估算。
