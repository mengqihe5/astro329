import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseArgs(argv) {
  const args = { slug: "", title: "", tags: "", force: false };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--title") {
      args.title = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--tags") {
      args.tags = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--force") {
      args.force = true;
      continue;
    }
    if (!args.slug) {
      args.slug = token;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
let rawSlug = (args.slug || "").trim();
const title = (args.title || "").trim();
const tags = (args.tags || "").trim();

if (!rawSlug) {
  if (!title) {
    console.error("Usage: npm run new:article -- <slug> [--title 标题] [--tags 标签1,标签2] [--force]");
    process.exit(1);
  }
  rawSlug = title;
}

const slug = slugify(rawSlug);
if (!slug) {
  console.error("无法生成有效 slug。请提供可用的 slug 或标题。");
  process.exit(1);
}

const articlesDir = resolve(process.cwd(), "content", "articles");
mkdirSync(articlesDir, { recursive: true });

const filePath = resolve(articlesDir, `${slug}.md`);
if (existsSync(filePath) && !args.force) {
  console.error(`文件已存在: ${filePath} (可使用 --force 覆盖)`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const payload = `title: ${title}\ndate: ${today}\ntags: ${tags}\ncover: \ndraft: false\nsummary: \n\n`;
writeFileSync(filePath, payload, "utf8");

console.log(`Created: content/articles/${slug}.md`);
