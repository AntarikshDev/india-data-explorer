// Shared browser + human-like context factory.
// Goal: pass JustDial's Akamai bot wall by looking like a real returning user
// instead of a vanilla headless Chromium.

import { chromium } from "playwright";

let browserPromise = null;

const REAL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--lang=en-IN",
        ],
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

// Build a context that hides the most obvious headless tells and looks like
// a real Indian Chrome user. Akamai checks navigator.webdriver, plugins,
// languages, WebGL vendor, screen size, Accept-Language, sec-ch-ua, etc.
export async function newHumanContext() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: REAL_UA,
    viewport: { width: 1366, height: 850 },
    deviceScaleFactor: 1,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    geolocation: { latitude: 26.8467, longitude: 80.9462 }, // Lucknow
    permissions: ["geolocation"],
    extraHTTPHeaders: {
      "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8,hi;q=0.7",
      "Upgrade-Insecure-Requests": "1",
      "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    },
  });

  // Stealth init script — patch the most-checked properties before any page JS runs.
  await context.addInitScript(() => {
    // navigator.webdriver
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });

    // languages
    Object.defineProperty(Navigator.prototype, "languages", {
      get: () => ["en-IN", "en-GB", "en"],
    });

    // plugins (non-empty)
    Object.defineProperty(Navigator.prototype, "plugins", {
      get: () => [1, 2, 3, 4, 5].map((i) => ({ name: `Plugin ${i}` })),
    });

    // chrome runtime (Akamai checks `window.chrome`)
    // @ts-ignore
    window.chrome = window.chrome || { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };

    // permissions.query notifications quirk
    const origQuery = (window.navigator.permissions && window.navigator.permissions.query) || null;
    if (origQuery) {
      window.navigator.permissions.query = (params) =>
        params && params.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(params);
    }

    // WebGL vendor/renderer spoof
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (p) {
      if (p === 37445) return "Intel Inc.";
      if (p === 37446) return "Intel Iris OpenGL Engine";
      return getParam.call(this, p);
    };

    // hardwareConcurrency / deviceMemory
    Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => 8 });
  });

  return context;
}

// Small helpers to make navigation pacing look human.
export function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

export async function humanDelay(page, min = 600, max = 1600) {
  await page.waitForTimeout(rand(min, max));
}

export async function humanScroll(page, steps = 6) {
  for (let i = 0; i < steps; i++) {
    const dy = rand(400, 900);
    await page.mouse.wheel(0, dy);
    await humanDelay(page, 350, 900);
  }
}

export async function humanMouseMove(page) {
  const x = rand(100, 1200);
  const y = rand(100, 700);
  await page.mouse.move(x, y, { steps: rand(8, 20) });
}
