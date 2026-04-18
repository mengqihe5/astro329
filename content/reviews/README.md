# 书架最简新增流程

1. 在 `content/reviews/` 新建一个 `slug.md` 文件。
2. 在 md 顶部写两行元数据：

   title: 书名
   month: YYYY-MM

3. 二选一：

   - 手动放封面：把图片放到 `public/app01/book-covers/`，文件名用 `slug.jpg`（也支持 `jpeg/png/svg`）。
   - 自动抓封面：运行 `npm run books:covers`，脚本会按书名从网上匹配并下载封面到本地。

4. 刷新页面，书架和详情会自动出现，不需要改 Python 代码。
