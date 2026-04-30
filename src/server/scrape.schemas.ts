import { z } from "zod";

export const SourceEnum = z.enum(["gmaps", "justdial", "indiamart"]);

export const StartSchema = z.object({
  query: z.string().min(2).max(200),
  city: z.string().max(100).optional().nullable(),
  sources: z.array(SourceEnum).min(1).max(3),
  resultsPerSource: z.number().int().min(5).max(50).default(25),
});
