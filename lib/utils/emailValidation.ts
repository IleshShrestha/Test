/**
 * Case Normalization:
 * - All emails are automatically converted to lowercase for storage and comparison
 * - Users are notified when their email is normalized (e.g., if they entered uppercase letters)
 */

// Common TLD typos that should trigger warnings
const COMMON_TLD_TYPOS: Record<string, string> = {
  ".con": ".com",
  ".c0m": ".com",
  ".cm": ".com",
  ".co": ".com",
  ".comm": ".com",
  ".om": ".com",
};

// Valid email regex that supports all TLDs (including new gTLDs)
const EMAIL_REGEX =
  /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export type EmailValidationResult = {
  isValid: boolean;
  normalizedEmail: string;
  warnings: string[];
  error?: string;
};

/**
 * Validates an email address and detects common typos
 * @param email - The email address to validate
 * @returns Validation result with normalized email, warnings, and error messages
 */
export function validateEmail(email: string): EmailValidationResult {
  const result: EmailValidationResult = {
    isValid: false,
    normalizedEmail: email.trim().toLowerCase(),
    warnings: [],
  };

  // Trim and check if empty
  const trimmed = email.trim();
  if (!trimmed) {
    result.error = "Email is required";
    return result;
  }

  // Check for case normalization
  const originalEmail = trimmed;
  const normalizedEmail = trimmed.toLowerCase();
  if (originalEmail !== normalizedEmail) {
    result.warnings.push(
      "Your email will be stored in lowercase. This is normal and helps prevent duplicate accounts."
    );
  }

  // Check for common TLD typos
  const domain = normalizedEmail.split("@")[1];
  if (domain) {
    const lastDotIndex = domain.lastIndexOf(".");
    if (lastDotIndex > 0) {
      const tld = domain.substring(lastDotIndex);
      const suggestedTld = COMMON_TLD_TYPOS[tld.toLowerCase()];
      if (suggestedTld && suggestedTld !== tld.toLowerCase()) {
        result.warnings.push(
          `Did you mean "${normalizedEmail.replace(
            tld,
            suggestedTld
          )}"? Common typo detected: "${tld}"`
        );
      }
    }
  }

  // Validate email format
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    result.error = "Invalid email format. Please enter a valid email address.";
    return result;
  }

  // Additional checks
  // Check for consecutive dots
  if (normalizedEmail.includes("..")) {
    result.error = "Email cannot contain consecutive dots";
    return result;
  }

  // Check for dot at start or end of local part
  const [localPart] = normalizedEmail.split("@");

  // Check length limits (RFC 5321)
  if (normalizedEmail.length > 254) {
    result.error = "Email address is too long (maximum 254 characters)";
    return result;
  }

  if (localPart && localPart.length > 64) {
    result.error = "Email local part is too long (maximum 64 characters)";
    return result;
  }

  result.isValid = true;
  return result;
}

/**
 * Simple boolean check for email validity
 */
export function isValidEmail(email: string): boolean {
  return validateEmail(email).isValid;
}

/**
 * Normalizes email to lowercase (for storage/comparison)
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
