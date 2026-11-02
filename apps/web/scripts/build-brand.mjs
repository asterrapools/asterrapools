// Builds optimized brand rasters from docs/brand/asterrapools-logo.png (2000px mark on a near-black field) with ImageMagick.
// # Jalankan di: ROOT/apps/web
//   pnpm brand
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "..");
const src = resolve(web, "../../docs/brand/asterrapools-logo.png");
const out = join(web, "public/brand");
const app = join(web, "src/app");
const sansBold = join(web, "node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf");
const monoRegular = join(web, "node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf");
const BG = "#06080C";

const tmp = mkdtempSync(join(tmpdir(), "asterra-brand-"));
const m = (...args) => execFileSync("magick", args, { stdio: "inherit" });

mkdirSync(out, { recursive: true });

// 1. Key the dark field out: alpha follows the brightest channel, so the anti-aliased edge stays smooth.
//    Then trim and pad to a centered square master.
const master = join(tmp, "master.png");
m(src, "-alpha", "off", "(", "+clone", "-separate", "-evaluate-sequence", "max", "-level", "6%,26%", ")", "-alpha", "off", "-compose", "CopyOpacity",
  "-composite", "-compose", "over", "-trim", "+repage", "-gravity", "center", "-background", "none",
  "-extent", "%[fx:max(w,h)*1.06]x%[fx:max(w,h)*1.06]", master);

// 2. Square marks.
for (const s of [32, 64, 128, 256, 512]) {
  m(master, "-filter", "Lanczos", "-resize", `${s}x${s}`, "-strip", "-depth", "8", "-define", "png:compression-level=9",
    join(out, `asterra-mark-${s}.png`));
}
m(master, "-resize", "512x512", "-strip", "-quality", "88", "-define", "webp:alpha-quality=90", join(out, "asterra-mark.webp"));

// 3. App icons (Next.js file conventions).
m(master, "-resize", "256x256", "-strip", "-depth", "8", join(app, "icon.png"));
m("-size", "180x180", `xc:${BG}`, "(", master, "-resize", "136x136", ")", "-gravity", "center", "-composite", "-strip", "-depth", "8",
  join(app, "apple-icon.png"));
m(master, "-define", "icon:auto-resize=48,32,16", join(app, "favicon.ico"));

// 4. OG image: dark field, prism glow behind the mark, ASTERRAPOOLS wordmark and the tagline.
const glow = join(tmp, "glow.png");
m("-size", "1100x1100", "radial-gradient:rgba(43,75,255,0.5)-rgba(6,8,12,0)", "-gravity", "center", "-crop", "1100x630+0+0", "+repage", glow);
const og = join(out, "og.png");
m(
  "-size", "1200x630", `xc:${BG}`,
  "(", glow, ")", "-gravity", "east", "-geometry", "-260+0", "-compose", "screen", "-composite", "-compose", "over",
  "(", master, "-resize", "400x400", ")", "-gravity", "east", "-geometry", "+90+0", "-composite",
  "-gravity", "northwest",
  "-font", monoRegular, "-pointsize", "18", "-fill", "#19E6FF", "-kerning", "3", "-annotate", "+80+86", "LIQUIDITY ON ROBINHOOD CHAIN",
  "-font", sansBold, "-pointsize", "70", "-fill", "#ECF1FA", "-kerning", "-1", "-annotate", "+76+200", "ASTERRAPOOLS",
  "-font", sansBold, "-pointsize", "40", "-fill", "#B0BAD0", "-kerning", "0", "-annotate", "+80+330", "Built for the flow\nof every market.",
  "-fill", "#202738", "-draw", "rectangle 0,548 1200,549",
  "-font", monoRegular, "-pointsize", "16", "-fill", "#808BA4", "-kerning", "3", "-annotate", "+80+572", "DLMM   DAMM   LP POSITIONS   SMART ROUTING",
  "-fill", "#DFFF1F", "-annotate", "+900+572", "ASTERRAPOOLS.TECH",
  "-strip", "-depth", "8", "-define", "png:compression-level=9", og,
);
m(og, "-strip", "-depth", "8", join(app, "opengraph-image.png"));

rmSync(tmp, { recursive: true, force: true });
console.log("brand assets written to public/brand and src/app");
