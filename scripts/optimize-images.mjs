import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import sharp from "sharp";

const TARGET_DIRS = [
  resolve(process.cwd(), "public", "app01", "backgrounds"),
  resolve(process.cwd(), "public", "app01", "article-covers"),
  resolve(process.cwd(), "public", "app01", "book-covers"),
];

const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function listFilesRecursive(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function optimizeOne(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (!EXTENSIONS.has(ext)) return { skipped: true, reason: "extension" };

  const beforeSize = statSync(filePath).size;
  const input = readFileSync(filePath);
  let image = sharp(input, { failOn: "none" });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) return { skipped: true, reason: "metadata" };

  if (metadata.width > 1920) {
    image = image.resize({ width: 1920, withoutEnlargement: true });
  }

  let output;
  if (ext === ".jpg" || ext === ".jpeg") {
    output = await image.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } else if (ext === ".png") {
    output = await image.png({ compressionLevel: 9, palette: true, quality: 82 }).toBuffer();
  } else {
    output = await image.webp({ quality: 82, effort: 5 }).toBuffer();
  }

  if (output.length >= beforeSize - 512) {
    return { skipped: true, reason: "not-smaller" };
  }

  writeFileSync(filePath, output);
  return { skipped: false, beforeSize, afterSize: output.length };
}

let optimized = 0;
let savedBytes = 0;

for (const dir of TARGET_DIRS) {
  const files = listFilesRecursive(dir);
  for (const filePath of files) {
    try {
      const result = await optimizeOne(filePath);
      if (!result.skipped) {
        optimized += 1;
        savedBytes += Math.max(0, result.beforeSize - result.afterSize);
        console.log(`[img] optimized: ${filePath}`);
      }
    } catch (error) {
      console.warn(`[img] skip: ${filePath} (${error instanceof Error ? error.message : error})`);
    }
  }
}

console.log(`[img] optimized files: ${optimized}`);
console.log(`[img] saved: ${(savedBytes / 1024).toFixed(1)} KB`);
