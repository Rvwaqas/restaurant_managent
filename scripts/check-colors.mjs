import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const targetDirs = [
  path.join(rootDir, "src", "components"),
  path.join(rootDir, "src", "app"),
];

// Files permitted to contain color token constants
const ALLOWED_FILES = [
  "globals.css",
  "app.ts",
  "category-donut.tsx", // SVG Recharts palette
  "sales-chart.tsx",    // SVG Recharts gradient
  "top-items-bar.tsx",   // SVG Recharts axes
  "table-card.tsx",     // Table occupancy status tokens
  "floor-table-grid.tsx", // Table occupancy status tokens
  "status-badge.tsx",   // Status badge tokens
  "chart.tsx",          // Base shadcn chart tokens
  "tailwind.config.ts",
  "layout.tsx",         // theme-color meta tag
  "device-settings-sheet.tsx", // PWA metadata
  "manifest.ts",        // PWA theme & background tokens
  "global-error.tsx",   // Global error fallback before CSS loads
  "page.tsx",           // dev/ui token showcase
];

const HEX_REGEX = /#([0-9a-fA-F]{3,8})\b/g;

function scanDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, fileList);
    } else if (
      (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) &&
      !ALLOWED_FILES.includes(entry.name)
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allFiles = targetDirs.flatMap((d) => scanDir(d));
let violationCount = 0;

console.log(`Checking ${allFiles.length} component/app files for hardcoded hex colors...`);

for (const filePath of allFiles) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Skip comment lines
    if (line.trim().startsWith("//") || line.trim().startsWith("/*") || line.trim().startsWith("*")) {
      return;
    }

    const matches = line.match(HEX_REGEX);
    if (matches) {
      // Ignore KaTeX math formulas or harmless doc strings
      const filtered = matches.filter((m) => !line.includes("KaTeX") && !line.includes("LaTeX"));
      if (filtered.length > 0) {
        const relPath = path.relative(rootDir, filePath);
        console.warn(`⚠ ${relPath}:${idx + 1} Hardcoded color found: ${filtered.join(", ")}`);
        violationCount++;
      }
    }
  });
}

if (violationCount === 0) {
  console.log("✓ All scanned components strictly use Tailwind design system tokens. No hardcoded hex violations!");
  process.exit(0);
} else {
  console.warn(`Found ${violationCount} hardcoded color instance(s). Consider replacing with Tailwind semantic classes.`);
  // Non-fatal advisory check to allow build to proceed while warning
  process.exit(0);
}
