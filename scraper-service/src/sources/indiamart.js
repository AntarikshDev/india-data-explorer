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
      // Phone: prefer regex over the card text (selector classes drift often).
      let phone = null;
      const cardTxt = card.textContent || "";
      const mobileMatch = cardTxt.match(/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/);
      const landlineMatch = cardTxt.match(/\b0?\d{2,4}[\s-]?\d{6,8}\b/);
      if (mobileMatch) phone = mobileMatch[0];
      else if (landlineMatch) phone = landlineMatch[0];
      if (!phone) {
        const sel = card.querySelector(".pns_h, .duet, [class*='mobileNo']")?.textContent?.trim();
        if (sel && !/show|click/i.test(sel)) phone = sel;
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
