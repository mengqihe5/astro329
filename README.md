# Micah Blog (Astro)

这个仓库是纯 **Astro** 版本（已移除 Django 代码与模板目录）。

## 1. 安装与运行

```bash
npm install
npm run dev
```

默认地址：`http://localhost:4321`

建议在提交或部署前先运行：

```bash
npm run check
```

## 2. 内容目录

- 文章：`content/articles/*.md`
- 读后感：`content/reviews/*.md`
- Steam 月度补充数据：`content/steam/monthly_hours.json`
- Steam 每日总时长快照：`content/steam/daily_totals.json`
- 静态资源：`public/app01/*`

## 3. 新建文章（带模板）

```bash
npm run new:article -- my-new-post --title "我的新文章" --tags "日记,读书"
```

会生成：`content/articles/my-new-post.md`

模板内容：

```txt
title: 
date: YYYY-MM-DD
tags: 
cover: 
draft: false
summary: 

```

文章前置字段检查：

```bash
npm run content:check
```

自动修复缺失字段：

```bash
npm run content:fix
```

## 4. Steam API 环境变量

本项目支持从环境变量读取 Steam 配置：

- `STEAM_API_KEY`
- `STEAM_ID`

本地可在 `.env` 中写入：

```bash
STEAM_API_KEY=你的key
STEAM_ID=你的steamid
```

推荐先把 `.env.example` 复制为 `.env`，再填写你的值。

安全建议：
- 不要把 `STEAM_API_KEY` 提交到仓库。
- 如果 key 曾经泄露，先去 Steam Web API 页面轮换新 key，再更新本地和 Netlify/GitHub Secrets。

## 5. Steam 每日快照（真实月统计）

手动同步一次快照：

```bash
npm run steam:snapshot
```

可指定快照日期（补历史日）：

```bash
npm run steam:snapshot -- --date 2026-04-04
```

说明：
- `content/steam/daily_totals.json` 保存分钟级快照（`capturedAt + totalsMin`，按 `Asia/Hong_Kong` 日界计算）。
- `content/steam/monthly_hours.json` 保存已归档月份（过去月份冻结）。
- 页面“本月时长/排序/首页条形图”按快照区间差值分配：`<=6h` 高可信、`6h~48h` 估算、`>48h` 不分配到日柱而计入月总未知桶。

## 6. 部署到 Netlify（同步 GitHub）

1. 把仓库推到 GitHub。
2. Netlify -> Add new project -> Import from Git。
3. Build command：`npm run build`
4. Publish directory：保持默认（Astro Netlify adapter 会自动处理 SSR）。
5. 在 Netlify 项目设置里添加环境变量：`STEAM_API_KEY`、`STEAM_ID`。

之后每次 push 到 GitHub，Netlify 会自动拉取并重新部署。

自动快照（推荐）：
- 仓库已提供 GitHub Actions：`.github/workflows/steam-snapshot.yml`
- 在 GitHub 仓库 Secrets 添加：`STEAM_API_KEY`、`STEAM_ID`
- 工作流会每 30 分钟更新快照并自动提交 `content/steam/*.json`

## 7. 图片优化

```bash
npm run images:optimize
```

会压缩这些目录内的 `jpg/png/webp`：
- `public/app01/backgrounds`
- `public/app01/article-covers`
- `public/app01/book-covers`

## 8. 路由

- `/` 首页记录台
- `/articles/` 文章
- `/articles/[slug]/` 文章详情
- `/steam/` Steam 游戏记录
- `/books/` 书架
- `/books/[slug]/` 读后感详情
- `/api/day-articles` 日历右侧局部刷新接口
