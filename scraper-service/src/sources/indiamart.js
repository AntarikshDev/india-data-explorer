// IndiaMART scraper. Search results page; phones often visible as "+91-XXXXX-XXXXX".
export async function scrapeIndiaMart(page, { query, city, limit }) {
  const ss = query.trim().replace(/\s+/g, "+");
  const cq = (city || "").trim().replace(/\s+/g, "+");
  const sourceUrl = `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(ss).replace(/%2B/g, "+")}${
    cq ? `&cq=${encodeURIComponent(cq).replace(/%2B/g, "+")}` : ""
  }`;

  await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // Lazy load
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(600);
  }

  const leads = await page.evaluate((max) => {
    const out = [];
    const cards = document.querySelectorAll(".cardlinks, .card, [class*='lst']");
    let n = 0;
    cards.forEach((card) => {
      if (n >= max) return;
      const name =
        card.querySelector(".companyname, .cardlinks h2, .lcname a, h2")?.textContent?.trim() || null;
      // Phone: spans with mobile / phone classes, or any +91 pattern in card text
      let phone =
        card.querySelector(".pns_h, .duet, [class*='mobileNo']")?.textContent?.trim() || null;
      if (!phone) {
        const txt = card.textContent || "";
        const m = txt.match(/(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/);
        if (m) phone = m[0];
      }
      const address =
        card.querySelector(".newad, .sl_addr, [class*='address']")?.textContent?.trim() || null;
      const ratingTxt =
        card.querySelector(".tcw_rate, [class*='rating']")?.textContent?.trim() || null;
      const rating = ratingTxt ? parseFloat(ratingTxt) : null;
      const a = card.querySelector("a.cardlinks, h2 a");
      const listing_url = a ? a.href : null;
      if (name) {
        out.push({ name, phone, address, rating, listing_url });
        n++;
      }
    });
    return out;
  }, limit);

  return {
    leads: leads.map((l) => ({ ...l, city: city || undefined })),
    sourceUrl,
  };
}
