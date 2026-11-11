import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const iconsDir = path.join(rootDir, "public", "icons");

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Master SVG design: indigo background (#4F46E5) with white cutlery / terminal icon
function getSvg(size, maskable = false) {
  const padding = maskable ? size * 0.18 : size * 0.12;
  const innerSize = size - padding * 2;

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.22}" fill="#4F46E5"/>
  <g transform="translate(${padding}, ${padding}) scale(${innerSize / 100})">
    <!-- Cutlery / Dining icon -->
    <path d="M30 15 C30 25 35 35 42 38 L42 85 C42 88 45 90 48 90 C51 90 54 88 54 85 L54 38 C61 35 66 25 66 15 L66 10 L60 10 L60 25 L56 25 L56 10 L50 10 L50 25 L46 25 L46 10 L40 10 L40 25 L36 25 L36 10 L30 10 Z" fill="#FFFFFF"/>
    <path d="M72 10 L72 45 C72 50 76 54 80 54 L80 85 C80 88 83 90 86 90 C89 90 92 88 92 85 L92 10 C85 10 75 10 72 10 Z" fill="#FFFFFF" opacity="0.9"/>
    <!-- POS Terminal base dot -->
    <circle cx="18" cy="80" r="6" fill="#A5B4FC"/>
  </g>
</svg>
`.trim();
}

async function generate() {
  console.log("Generating PWA icons...");
  let sharp;
  try {
    const mod = await import("sharp");
    sharp = mod.default;
  } catch (err) {
    console.warn("sharp not found or failed to load. Writing SVG placeholders directly.", err);
    // Write SVGs as fallback
    fs.writeFileSync(path.join(iconsDir, "icon-192x192.svg"), getSvg(192));
    fs.writeFileSync(path.join(iconsDir, "icon-512x512.svg"), getSvg(512));
    fs.writeFileSync(path.join(iconsDir, "icon-512x512-maskable.svg"), getSvg(512, true));
    return;
  }

  // 192x192 PNG
  await sharp(Buffer.from(getSvg(192)))
    .png()
    .toFile(path.join(iconsDir, "icon-192x192.png"));
  console.log("✓ Generated public/icons/icon-192x192.png");

  // 512x512 PNG
  await sharp(Buffer.from(getSvg(512)))
    .png()
    .toFile(path.join(iconsDir, "icon-512x512.png"));
  console.log("✓ Generated public/icons/icon-512x512.png");

  // 512x512 Maskable PNG
  await sharp(Buffer.from(getSvg(512, true)))
    .png()
    .toFile(path.join(iconsDir, "icon-512x512-maskable.png"));
  console.log("✓ Generated public/icons/icon-512x512-maskable.png");

  // Apple touch icon (180x180)
  await sharp(Buffer.from(getSvg(180)))
    .png()
    .toFile(path.join(iconsDir, "apple-touch-icon.png"));
  console.log("✓ Generated public/icons/apple-touch-icon.png");

  console.log("All PWA icons generated successfully.");
}

generate().catch(console.error);

