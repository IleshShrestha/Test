"use strict";

import cardValidator from "card-validator";

const stripSeparators = (value: string): string => value.replace(/[\s-]/g, "");

export type CardType = "visa" | "mastercard" | "amex" | "discover";

// Map card-validator card types to our CardType
const mapCardType = (cardType: string | undefined): CardType | null => {
  if (!cardType) return null;

  const typeMap: Record<string, CardType> = {
    visa: "visa",
    mastercard: "mastercard",
    "american-express": "amex",
    discover: "discover",
  };

  return typeMap[cardType] ?? null;
};

export const normalizeCardNumber = (value: string): string =>
  stripSeparators(value);

export const detectCardType = (digits: string): CardType | null => {
  const validation = cardValidator.number(digits);
  if (!validation.isValid || !validation.card) {
    return null;
  }
  return mapCardType(validation.card.type);
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

  const validation = cardValidator.number(normalized);

  if (!validation.isValid) {
    return "Invalid card number";
  }

  if (!validation.card) {
    return "Card must be Visa, Mastercard, American Express, or Discover";
  }

  const cardType = mapCardType(validation.card.type);
  if (!cardType) {
    return "Card must be Visa, Mastercard, American Express, or Discover";
  }

  return true;
};

export const isValidCardNumber = (value: string): boolean =>
  validateCardNumber(value) === true;
