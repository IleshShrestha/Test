"use strict";

const stripSeparators = (value: string): string => value.replace(/[\s-]/g, "");

export type CardType = "visa" | "mastercard" | "amex" | "discover";

type CardRule = {
  type: CardType;
  lengths: number[];
  match: (digits: string) => boolean;
};

const cardRules: CardRule[] = [
  {
    type: "visa",
    lengths: [13, 16, 19],
    match: (digits) => digits.startsWith("4"),
  },
  {
    type: "mastercard",
    lengths: [16],
    match: (digits) => {
      const prefix2 = Number(digits.slice(0, 2));
      const prefix4 = Number(digits.slice(0, 4));
      return (
        (prefix2 >= 51 && prefix2 <= 55) || (prefix4 >= 2221 && prefix4 <= 2720)
      );
    },
  },
  {
    type: "amex",
    lengths: [15],
    match: (digits) => digits.startsWith("34") || digits.startsWith("37"),
  },
  {
    type: "discover",
    lengths: [16, 19],
    match: (digits) => {
      const prefix2 = Number(digits.slice(0, 2));
      const prefix3 = Number(digits.slice(0, 3));
      const prefix6 = Number(digits.slice(0, 6));
      return (
        digits.startsWith("6011") ||
        (prefix6 >= 622126 && prefix6 <= 622925) ||
        (prefix3 >= 644 && prefix3 <= 649) ||
        prefix2 === 65
      );
    },
  },
];

const luhnCheck = (digits: string): boolean => {
  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (Number.isNaN(digit)) return false;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
};

export const normalizeCardNumber = (value: string): string =>
  stripSeparators(value);

export const detectCardType = (digits: string): CardType | null => {
  const match = cardRules.find(
    (rule) => rule.lengths.includes(digits.length) && rule.match(digits)
  );
  return match?.type ?? null;
};

export const validateCardNumber = (value: string): true | string => {
  if (!value || !value.trim()) {
    return "Card number is required";
  }

  if (/[^\d\s-]/.test(value)) {
    return "Card number must contain only digits";
  }

  const normalized = normalizeCardNumber(value);

  if (normalized.length < 13 || normalized.length > 19) {
    return "Card number must be between 13 and 19 digits";
  }

  const cardType = detectCardType(normalized);
  if (!cardType) {
    return "Card must be Visa, Mastercard, American Express, or Discover";
  }

  if (!luhnCheck(normalized)) {
    return "Invalid card number";
  }

  return true;
};

export const isValidCardNumber = (value: string): boolean =>
  validateCardNumber(value) === true;
