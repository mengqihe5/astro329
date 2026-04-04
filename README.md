# Micah Blog (Astro)

这个仓库是纯 **Astro** 版本（已移除 Django 代码与模板目录）。

## 1. 安装与运行

```bash
npm install
npm run dev
```

默认地址：`http://localhost:4321`

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

## 5. 部署到 Netlify（同步 GitHub）

1. 把仓库推到 GitHub。
2. Netlify -> Add new project -> Import from Git。
3. Build command：`npm run build`
4. Publish directory：保持默认（Astro Netlify adapter 会自动处理 SSR）。
5. 在 Netlify 项目设置里添加环境变量：`STEAM_API_KEY`、`STEAM_ID`。

之后每次 push 到 GitHub，Netlify 会自动拉取并重新部署。

## 6. 路由

- `/` 首页记录台
- `/articles/` 文章
- `/articles/[slug]/` 文章详情
- `/steam/` Steam 游戏记录
- `/books/` 书架
- `/books/[slug]/` 读后感详情
- `/api/day-articles` 日历右侧局部刷新接口
