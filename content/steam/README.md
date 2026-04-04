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
- 快照由脚本 `npm run steam:snapshot` 写入 `daily_totals.json`（建议每天执行一次，或用 GitHub Actions 定时）。
- 本月统计基于 `daily_totals.json` 的“日差值”计算；当天会按最新 API 总时长补齐到今日。
- 过去月份在满足归档条件后写入 `monthly_hours.json`，归档后不再修改。
- 如果你手工维护 `monthly_hours.json`，页面会优先使用你填的值。
