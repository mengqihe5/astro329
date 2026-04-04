import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_KEYS = ["title", "date", "tags", "cover", "draft", "summary"];
const args = new Set(process.argv.slice(2));
const shouldFix = args.has("--fix");

const articlesDir = resolve(process.cwd(), "content", "articles");
const files = readdirSync(articlesDir).filter((name) => name.toLowerCase().endsWith(".md"));
const today = new Date().toISOString().slice(0, 10);

function slugToTitle(slug) {
  return slug.replace(/[-_]+/g, " ").trim();
}

function normalizeSummary(rawSummary, body) {
  const summary = String(rawSummary || "").trim();
  if (summary) return summary;
  const compact = String(body || "").replace(/\s+/g, " ").trim();
  return compact.length > 90 ? `${compact.slice(0, 90)}...` : compact;
}

function parseFrontMatter(rawText) {
  const lines = String(rawText || "").split(/\r?\n/);
  const metadata = {};
  let bodyStartIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      bodyStartIndex = index + 1;
      break;
    }
    if (!line.includes(":")) {
      bodyStartIndex = index;
      break;
    }
    const [key, ...rest] = line.split(":");
    metadata[key.trim().toLowerCase()] = rest.join(":").trim();
    bodyStartIndex = index + 1;
  }

  return {
    metadata,
    body: lines.slice(bodyStartIndex).join("\n").trim(),
  };
}

function buildFileText(metadata, body) {
  const lines = REQUIRED_KEYS.map((key) => `${key}: ${metadata[key] ?? ""}`);
  return `${lines.join("\n")}\n\n${String(body || "").trim()}\n`;
}

let totalIssues = 0;
let fixedFiles = 0;

for (const fileName of files) {
  const fullPath = resolve(articlesDir, fileName);
  const raw = readFileSync(fullPath, "utf8");
  const { metadata, body } = parseFrontMatter(raw);
  const slug = fileName.replace(/\.md$/i, "");

  const normalized = {
    title: String(metadata.title || "").trim() || slugToTitle(slug),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(metadata.date || "").trim()) ? String(metadata.date).trim() : today,
    tags: String(metadata.tags || "").trim(),
    cover: String(metadata.cover || "").trim(),
    draft: /^(1|true|yes|on)$/i.test(String(metadata.draft || "").trim()) ? "true" : "false",
    summary: normalizeSummary(metadata.summary, body),
  };

  const issues = [];
  for (const key of REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) {
      issues.push(`missing ${key}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(metadata.date || "").trim())) {
    issues.push("invalid date format (expected YYYY-MM-DD)");
  }
  if (metadata.draft && !/^(0|1|true|false|yes|no|on|off)$/i.test(String(metadata.draft).trim())) {
    issues.push("invalid draft (expected true/false)");
  }

  if (issues.length > 0) {
    totalIssues += issues.length;
    console.log(`[articles] ${fileName}: ${issues.join("; ")}`);
  }

  if (shouldFix) {
    const nextText = buildFileText(normalized, body);
    if (nextText !== raw) {
      writeFileSync(fullPath, nextText, "utf8");
      fixedFiles += 1;
      console.log(`[articles] fixed ${fileName}`);
    }
  }
}

if (shouldFix) {
  console.log(`[articles] fixed files: ${fixedFiles}`);
}

if (totalIssues > 0 && !shouldFix) {
  console.error(`[articles] check failed: ${totalIssues} issue(s). Run: npm run content:fix`);
  process.exit(1);
}

console.log("[articles] check passed");
