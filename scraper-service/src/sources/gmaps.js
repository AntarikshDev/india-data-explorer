// Google Maps scraper. Loads the search results panel and extracts each card.
// Note: Google Maps DOM changes occasionally — selectors may need tweaks.
function titleCase(s) {
  return (s || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export async function scrapeGoogleMaps(page, { query, city, limit }) {
  const q = encodeURIComponent(city ? `${query} ${city}` : query);
  const sourceUrl = `https://www.google.com/maps/search/${q}/?hl=en`;
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });

  // Wait for the results feed
  await page.waitForSelector('div[role="feed"]', { timeout: 30000 }).catch(() => {});

  // Scroll the feed to load more results
  const feed = await page.$('div[role="feed"]');
  if (feed) {
    let lastCount = 0;
    for (let i = 0; i < 8; i++) {
      const count = await page.$$eval('div[role="feed"] > div > div[jsaction]', (els) => els.length).catch(() => 0);
      if (count >= limit) break;
      if (count === lastCount && i > 2) break;
      lastCount = count;
      await feed.evaluate((el) => el.scrollBy(0, 1200));
      await page.waitForTimeout(900);
    }
  }

  const cards = await page.$$('div[role="feed"] > div > div[jsaction]');
  const leads = [];
  for (const card of cards.slice(0, limit)) {
    try {
      const data = await card.evaluate((el) => {
        const text = (sel) => {
          const n = el.querySelector(sel);
          return n ? n.textContent.trim() : null;
        };
        const name = text(".qBF1Pd") || text("div.fontHeadlineSmall");
        // ratings: aria-label like "4.5 stars 120 Reviews"
        const ratingNode = el.querySelector('span[role="img"][aria-label*="star" i]');
        let rating = null;
        let reviews_count = null;
        if (ratingNode) {
          const label = ratingNode.getAttribute("aria-label") || "";
          const m = label.match(/([\d.]+)\s*star/i);
          if (m) rating = parseFloat(m[1]);
          const r = label.match(/([\d,]+)\s*review/i);
          if (r) reviews_count = parseInt(r[1].replace(/,/g, ""), 10);
        }
        // The category + address line is usually in .W4Efsd spans
        const subRows = Array.from(el.querySelectorAll(".W4Efsd")).map((n) => n.textContent.trim());
        const meta = subRows.join(" · ");
        // phone like "+91 98765 43210"
        const phoneMatch = meta.match(/(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/);
        const phone = phoneMatch ? phoneMatch[0] : null;
        // category often appears before the dot before address
        let category = null;
        let address = null;
        if (subRows.length > 0) {
          const parts = subRows[0].split("·").map((s) => s.trim()).filter(Boolean);
          if (parts.length >= 2) {
            category = parts[0];
            address = parts.slice(1).join(", ");
          } else {
            address = parts[0];
          }
        }
        // Listing url (Google Maps detail link)
        const a = el.querySelector("a.hfpxzc");
        const listing_url = a ? a.href : null;
        return { name, phone, rating, reviews_count, category, address, listing_url };
      });
      if (data.name) {
        leads.push({
          name: data.name,
          phone: data.phone || undefined,
          rating: data.rating ?? undefined,
          reviews_count: data.reviews_count ?? undefined,
          category: data.category || undefined,
          address: data.address || undefined,
          city: city || undefined,
          listing_url: data.listing_url || undefined,
        });
      }
    } catch {
      // skip card
    }
  }

  return { leads, sourceUrl };
}

// Reserved for callers that want title-case names elsewhere.
export { titleCase };
