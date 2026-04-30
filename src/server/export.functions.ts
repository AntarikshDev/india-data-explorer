import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import ExcelJS from "exceljs";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOURCE_LABELS, type Source } from "@/lib/leadTypes";

export const exportRunToExcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: leads, error } = await supabase
      .from("leads")
      .select("*")
      .eq("run_id", data.runId)
      .order("scraped_at", { ascending: true });
    if (error) throw new Error(error.message);

    const wb = new ExcelJS.Workbook();
    wb.creator = "EdSetu Lead Scraper";
    const ws = wb.addWorksheet("Leads");
    ws.columns = [
      { header: "Name", key: "name", width: 32 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Address", key: "address", width: 40 },
      { header: "City", key: "city", width: 16 },
      { header: "Category", key: "category", width: 22 },
      { header: "Rating", key: "rating", width: 8 },
      { header: "Reviews", key: "reviews_count", width: 10 },
      { header: "Website", key: "website", width: 32 },
      { header: "Source", key: "source", width: 14 },
      { header: "Source URL", key: "source_url", width: 40 },
      { header: "Scraped At", key: "scraped_at", width: 22 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2937" },
    };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "L1" };

    // Force phone column to text
    ws.getColumn("phone").numFmt = "@";

    for (const l of leads ?? []) {
      ws.addRow({
        ...l,
        source: SOURCE_LABELS[l.source as Source] ?? l.source,
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { filename: `leads-${data.runId.slice(0, 8)}.xlsx`, base64 };
  });
