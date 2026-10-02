// Regenerate the PNG app icons in public/icons from scripts/icons/icon.mjs.
// Usage: node scripts/icons/render.mjs   (uses Playwright's Chromium; no extra dependencies)
// Set PLAYWRIGHT_CHROMIUM_PATH to use a system Chromium, as the e2e config does.
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

import { iconSvg } from "./icon.mjs";

const OUT = new URL("../../public/icons/", import.meta.url);
const ICONS = [
  { file: "icon-192.png", size: 192, rounded: true },
  { file: "icon-512.png", size: 512, rounded: true },
  { file: "maskable-512.png", size: 512, inset: 0.72 },
  { file: "apple-touch-icon.png", size: 180, inset: 0.9 },
];

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${iconSvg(icon)}</body></html>`,
    );
    const png = await page.locator("svg").screenshot({ omitBackground: true });
    await writeFile(new URL(icon.file, OUT), png);
    await page.close();
    console.log(`wrote public/icons/${icon.file}`);
  }
  await writeFile(new URL("icon.svg", OUT), iconSvg({ size: 512, rounded: true }));
  console.log("wrote public/icons/icon.svg");
} finally {
  await browser.close();
}
