// Strict Indian mobile phone validation.
// Rules:
// - Strip non-digits (also strip leading 91 / 0 country/STD prefix)
// - Must be exactly 10 digits and start with 6, 7, 8, or 9 (TRAI mobile series)
// - Reject obvious junk: all-same digit (9999999999), strictly sequential
//   ascending/descending (1234567890 / 9876543210), or fewer than 4 unique digits

const SEQ_ASC = "0123456789";
const SEQ_DESC = "9876543210";

export function normalizeIndianMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  if (!/^[6-9]/.test(digits)) return null;

  // All-same digit
  if (/^(\d)\1{9}$/.test(digits)) return null;
  // Strictly sequential
  if (SEQ_ASC.includes(digits) || SEQ_DESC.includes(digits)) return null;
  // Too few unique digits (placeholder vibes like 9999988888)
  if (new Set(digits).size < 4) return null;
  // Common hallucinated placeholders the LLM produces from directory templates
  const known_bad = new Set([
    "1234567890", "9876543210", "1234567891", "0123456789",
    "9999999999", "8888888888", "7777777777", "6666666666",
  ]);
  if (known_bad.has(digits)) return null;

  return digits;
}

export function isValidIndianMobile(input: string | null | undefined): boolean {
  return normalizeIndianMobile(input) !== null;
}
