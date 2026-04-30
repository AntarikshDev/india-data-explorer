// JustDial scraper. JustDial hides phone numbers behind "Show Number" buttons —
// we click them before extracting. Selectors evolve; tweak as needed.
function titleSlug(s) {
  return (s || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("-");
}

export async function scrapeJustDial(page, { query, city, limit }) {
  const citySlug = titleSlug(city || "");
  const querySlug = titleSlug(query);
  const sourceUrl = citySlug
    ? `https://www.justdial.com/${citySlug}/${querySlug}`
    : `https://www.justdial.com/search?q=${encodeURIComponent(query)}`;

  await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // Dismiss login modal if present
  await page.locator('[aria-label="Close"], .jd-modal-close').first().click({ timeout: 1500 }).catch(() => {});

  // Scroll to load more listings
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(700);
  }

  // Click all "Show Number" buttons
  await page
    .locator('span.callNowAnchor, .callcontent, [data-track="Call"]')
    .all()
    .then(async (els) => {
      for (const el of els.slice(0, limit)) {
        await el.click({ timeout: 1500 }).catch(() => {});
      }
    })
    .catch(() => {});
  await page.waitForTimeout(1500);

  const leads = await page.evaluate((max) => {
    const out = [];
    const cards = document.querySelectorAll(".resultbox, [class*='resultbox']");
    cards.forEach((card, i) => {
      if (i >= max) return;
      const name =
        card.querySelector(".resultbox_title_anchor, h2 a, .lng_cont_name")?.textContent?.trim() || null;
      const phone =
        card.querySelector(".callcontent, .contact-info a, [class*='callNumber']")?.textContent?.trim() || null;
      const ratingTxt = card.querySelector(".resultbox_totalrate, .green-box")?.textContent?.trim();
      const rating = ratingTxt ? parseFloat(ratingTxt) : null;
      const reviewsTxt = card.querySelector(".resultbox_totalrate + span, .rt_count")?.textContent?.trim();
      const reviewsMatch = reviewsTxt && reviewsTxt.match(/(\d[\d,]*)/);
      const reviews_count = reviewsMatch ? parseInt(reviewsMatch[1].replace(/,/g, ""), 10) : null;
      const address = card.querySelector(".resultbox_address, .cont_sw_addr")?.textContent?.trim() || null;
      const category = card.querySelector(".resultbox_cat, .cont_catg")?.textContent?.trim() || null;
      const a = card.querySelector("a.resultbox_title_anchor, h2 a");
      const listing_url = a ? a.href : null;
      if (name) {
        out.push({ name, phone, rating, reviews_count, address, category, listing_url });
      }
    });
    return out;
  }, limit);

  return {
    leads: leads.map((l) => ({ ...l, city: city || undefined })),
    sourceUrl,
  };
}
