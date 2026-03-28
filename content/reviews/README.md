# 书架最简新增流程

1. 在 `content/reviews/` 新建一个 `slug.md` 文件。
2. 在 md 顶部写两行元数据：

   title: 书名
   month: YYYY-MM

3. 在 `app01/static/app01/book-covers/` 放一张同名封面图：`slug.webp` 或 `slug.png` 或 `slug.jpg` 或 `slug.svg`。
4. 刷新页面，书架和详情会自动出现，不需要改 Python 代码。
