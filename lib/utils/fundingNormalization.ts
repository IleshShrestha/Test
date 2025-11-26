export function normalizeFundingAmount(value: string): string {
  if (!value) return "";

  // Remove all characters except digits and decimal points
  let cleaned = value.replace(/[^\d.]/g, "");

  // Handle multiple decimal points - keep only the first one
  const firstDecimalIndex = cleaned.indexOf(".");
  if (firstDecimalIndex !== -1) {
    const beforeDecimal = cleaned.substring(0, firstDecimalIndex);
    const afterDecimal = cleaned
      .substring(firstDecimalIndex + 1)
      .replace(/\./g, "");
    cleaned = beforeDecimal + "." + afterDecimal;
  }

  // Limit to 2 decimal places
  if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    if (parts[1] && parts[1].length > 2) {
      cleaned = parts[0] + "." + parts[1].substring(0, 2);
    }
  }

  // Remove leading zeros (but keep at least one digit before decimal)
  if (cleaned.match(/^0+[1-9]/)) {
    cleaned = cleaned.replace(/^0+/, "");
  }

  return cleaned;
}

export function formatAmountForDisplay(value: string): string {
  const normalized = normalizeFundingAmount(value);
  if (!normalized) return "";

  const num = parseFloat(normalized);
  if (isNaN(num)) return normalized;

  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
