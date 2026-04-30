// JustDial scraper.
//
// JustDial sits behind Akamai bot detection. Hitting the deep listing URL
// directly returns "Access Denied" / 403. To pass we have to look like a
// returning user:
//   1) load the homepage first (warm cookies + Akamai sensor data),
//   2) scroll/move the mouse a bit,
//   3) navigate to the city + category page,
//   4) wait for results, scroll, click "Show Number" buttons,
//   5) extract.
//
// If JustDial still serves the Akamai interstitial we bail out with a clear
// error so the app can fall back to the other sources cleanly.

import { humanDelay, humanScroll, humanMouseMove, rand } from "../browser.js";

function titleSlug(s) {
  return (s || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("-");
}

async function isBlocked(page) {
  const title = (await page.title().catch(() => "")) || "";
  if (/access denied/i.test(title)) return true;
  const bodyText = await page
    .evaluate(() => document.body && document.body.innerText.slice(0, 400))
    .catch(() => "");
  return /access denied|errors\.edgesuite|reference #\d/i.test(bodyText || "");
}

export async function scrapeJustDial(page, { query, city, limit }) {
  const citySlug = titleSlug(city || "");
  const querySlug = titleSlug(query);
  const listingUrl = citySlug
    ? `https://www.justdial.com/${citySlug}/${querySlug}`
    : `https://www.justdial.com/search?q=${encodeURIComponent(query)}`;

  // 1) Warm up — visit the homepage so Akamai issues us cookies + a sensor token.
  await page.goto("https://www.justdial.com/", {
    waitUntil: "domcontentloaded",
    referer: "https://www.google.com/",
  });
  await humanDelay(page, 1500, 2800);
  if (await isBlocked(page)) {
    return {
      leads: [],
      sourceUrl: listingUrl,
      error:
        "JustDial blocked the warm-up request (Akamai 403). Try again later or run from a residential IP.",
    };
  }
  await humanMouseMove(page);
  await humanScroll(page, 2);

  // Dismiss any modal that pops up (login, location).
  await page
    .locator('[aria-label="Close"], .jd-modal-close, .jd_close')
    .first()
    .click({ timeout: 1500 })
    .catch(() => {});

  // 2) Navigate to the listing page with the homepage as referer.
  await page.goto(listingUrl, {
    waitUntil: "domcontentloaded",
    referer: "https://www.justdial.com/",
  });
  await humanDelay(page, 1800, 3000);
  if (await isBlocked(page)) {
    return {
      leads: [],
      sourceUrl: listingUrl,
      error: "JustDial served Akamai 'Access Denied' on the listing page.",
    };
  }

  // 3) Human-like scroll to load lazy results.
  for (let i = 0; i < 8; i++) {
    await humanScroll(page, 1);
    await humanDelay(page, 500, 1100);
  }

  // 4) Reveal phone numbers — JustDial hides them behind "Show Number".
  const showButtons = await page
    .locator(
      'span.callNowAnchor, .callcontent, [data-track="Call"], button:has-text("Show Number")',
    )
    .all()
    .catch(() => []);
  for (const btn of showButtons.slice(0, limit)) {
    await btn.click({ timeout: 1500 }).catch(() => {});
    await humanDelay(page, 200, 500);
  }
  await humanDelay(page, 1000, 1800);

  // 5) Extract.
  const leads = await page.evaluate((max) => {
    const out = [];
    const cards = document.querySelectorAll(
      ".resultbox, [class*='resultbox'], .cntanr, [class*='cntanr']",
    );
    cards.forEach((card, i) => {
      if (i >= max) return;
      const name =
        card
          .querySelector(
            ".resultbox_title_anchor, h2 a, .lng_cont_name, .resultbox_title h2",
          )
          ?.textContent?.trim() || null;
      // Always grep the card text for phone — the dedicated selectors often
      // return "Show Number" button label or stale placeholder text.
      let phone = null;
      const cardTxt = card.textContent || "";
      // Prefer mobile (10 digits starting 6-9), then landline with STD code.
      const mobileMatch = cardTxt.match(/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/);
      const landlineMatch = cardTxt.match(/\b0?\d{2,4}[\s-]?\d{6,8}\b/);
      if (mobileMatch) phone = mobileMatch[0];
      else if (landlineMatch) phone = landlineMatch[0];
      // Fallback to selector-based extraction if regex found nothing.
      if (!phone) {
        const sel = card.querySelector(
          ".callcontent, .contact-info a, [class*='callNumber'], .green-box + span",
        )?.textContent?.trim();
        if (sel && !/show\s*number/i.test(sel)) phone = sel;
      }
      const ratingTxt = card
        .querySelector(".resultbox_totalrate, .green-box, [class*='rating']")
        ?.textContent?.trim();
      const rating = ratingTxt ? parseFloat(ratingTxt) : null;
      const reviewsTxt = card
        .querySelector(".resultbox_totalrate + span, .rt_count, [class*='votes']")
        ?.textContent?.trim();
      const reviewsMatch = reviewsTxt && reviewsTxt.match(/(\d[\d,]*)/);
      const reviews_count = reviewsMatch
        ? parseInt(reviewsMatch[1].replace(/,/g, ""), 10)
        : null;
      const address =
        card
          .querySelector(".resultbox_address, .cont_sw_addr, [class*='address']")
          ?.textContent?.trim() || null;
      const category =
        card
          .querySelector(".resultbox_cat, .cont_catg, [class*='category']")
          ?.textContent?.trim() || null;
      const a = card.querySelector("a.resultbox_title_anchor, h2 a");
      const listing_url = a ? a.href : null;
      if (name) {
        out.push({ name, phone, rating, reviews_count, address, category, listing_url });
      }
    });
    return out;
  }, limit);

  // small jitter so consecutive runs don't look identical
  await page.waitForTimeout(rand(300, 900));

  return {
    leads: leads.map((l) => ({ ...l, city: city || undefined })),
    sourceUrl: listingUrl,
  };
}
