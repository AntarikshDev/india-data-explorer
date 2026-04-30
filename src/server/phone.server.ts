// Indian phone validation — accepts BOTH mobiles and landlines.
// Mobile: exactly 10 digits, starts with 6/7/8/9 (TRAI mobile series).
// Landline: STD code (2-4 digits) + subscriber number → 10-11 digits total,
//           first digit is 2-5 (Indian landline series).
//
// Junk filter: all-same digit, strict 0-9/9-0 sequence, <4 unique digits, or
// known LLM placeholders.

const SEQ_ASC = "0123456789";
const SEQ_DESC = "9876543210";

const KNOWN_BAD = new Set([
  "1234567890", "9876543210", "1234567891", "0123456789",
  "9999999999", "8888888888", "7777777777", "6666666666",
  "0000000000", "1111111111",
]);

function isJunk(d: string): boolean {
  if (/^(\d)\1+$/.test(d)) return true;
  if (SEQ_ASC.includes(d) || SEQ_DESC.includes(d)) return true;
  if (new Set(d).size < 4) return true;
  if (KNOWN_BAD.has(d)) return true;
  return false;
}

export function normalizeIndianMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  // Strip +91 country code
  if (digits.length >= 12 && digits.startsWith("91")) digits = digits.slice(2);
  // Strip leading 0 (STD/trunk prefix)
  if (digits.length >= 11 && digits.startsWith("0")) digits = digits.slice(1);

  // If a long blob (multiple numbers concatenated), take the last 10 digits —
  // JustDial pages sometimes return "Show Number 9876543210 reviews 45".
  if (digits.length > 11) digits = digits.slice(-10);

  if (digits.length < 10 || digits.length > 11) return null;
  if (isJunk(digits)) return null;

  // Mobile: 10 digits starting 6-9
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;

  // Landline: 10-11 digits, first digit 2-5 (after STD code prefix already stripped)
  if (/^[2-5]/.test(digits)) return digits;

  return null;
}

export function isValidIndianMobile(input: string | null | undefined): boolean {
  return normalizeIndianMobile(input) !== null;
}
