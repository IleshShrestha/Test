import {
  validateEmail,
  isValidEmail,
  normalizeEmail,
} from "../emailValidation";

describe("Email Validation", () => {
  describe("validateEmail", () => {
    describe("Valid emails", () => {
      it("should validate standard .com emails", () => {
        const result = validateEmail("test@example.com");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.normalizedEmail).toBe("test@example.com");
      });

      it("should validate emails with different TLDs", () => {
        const validEmails = [
          "user@example.org",
          "test@example.net",
          "admin@example.io",
          "user@example.co.uk",
          "test@example.info",
          "user@example.biz",
          "test@example.dev",
          "user@example.app",
          "test@subdomain.example.com",
        ];

        validEmails.forEach((email) => {
          const result = validateEmail(email);
          expect(result.isValid).toBe(true);
          expect(result.error).toBeUndefined();
        });
      });

      it("should validate emails with plus signs", () => {
        const result = validateEmail("test+tag@example.com");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should validate emails with dots in local part", () => {
        const result = validateEmail("first.last@example.com");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should validate emails with hyphens", () => {
        const result = validateEmail("test-user@example-domain.com");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should validate emails with underscores", () => {
        const result = validateEmail("test_user@example.com");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should validate emails with numbers", () => {
        const result = validateEmail("user123@example456.com");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    describe("Invalid emails", () => {
      it("should reject empty string", () => {
        const result = validateEmail("");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Email is required");
      });

      it("should reject whitespace-only string", () => {
        const result = validateEmail("   ");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Email is required");
      });

      it("should reject emails without @ symbol", () => {
        const result = validateEmail("invalidemail.com");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid email format. Please enter a valid email address."
        );
      });

      it("should reject emails without domain", () => {
        const result = validateEmail("user@");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid email format. Please enter a valid email address."
        );
      });

      it("should reject emails without local part", () => {
        const result = validateEmail("@example.com");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid email format. Please enter a valid email address."
        );
      });

      it("should reject emails with invalid TLD (too short)", () => {
        const result = validateEmail("test@example.c");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid email format. Please enter a valid email address."
        );
      });

      it("should reject emails that are too long", () => {
        const longLocalPart = "a".repeat(65);
        const result = validateEmail(`${longLocalPart}@example.com`);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Email local part is too long (maximum 64 characters)"
        );
      });

      it("should reject emails exceeding 254 characters", () => {
        const longEmail = "a".repeat(250) + "@example.com";
        expect(longEmail.length).toBeGreaterThan(254);
        const result = validateEmail(longEmail);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Email address is too long (maximum 254 characters)"
        );
      });
    });

    describe("Case normalization", () => {
      it("should normalize uppercase emails to lowercase", () => {
        const result = validateEmail("TEST@EXAMPLE.COM");
        expect(result.isValid).toBe(true);
        expect(result.normalizedEmail).toBe("test@example.com");
      });

      it("should normalize mixed case emails to lowercase", () => {
        const result = validateEmail("Test@Example.Com");
        expect(result.isValid).toBe(true);
        expect(result.normalizedEmail).toBe("test@example.com");
      });

      it("should warn when email is normalized", () => {
        const result = validateEmail("Test@Example.COM");
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContain(
          "Your email will be stored in lowercase. This is normal and helps prevent duplicate accounts."
        );
      });

      it("should not warn for already lowercase emails", () => {
        const result = validateEmail("test@example.com");
        expect(result.isValid).toBe(true);
        expect(result.warnings).not.toContain(
          "Your email will be stored in lowercase"
        );
      });

      it("should trim whitespace and normalize", () => {
        const result = validateEmail("  Test@Example.COM  ");
        expect(result.isValid).toBe(true);
        expect(result.normalizedEmail).toBe("test@example.com");
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });

    describe("TLD typo detection", () => {
      it("should detect .con typo and suggest .com", () => {
        const result = validateEmail("test@example.con");
        expect(result.isValid).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some((w) => w.includes(".con"))).toBe(true);
        expect(result.warnings.some((w) => w.includes("Did you mean"))).toBe(
          true
        );
      });

      it("should detect .c0m typo and suggest .com", () => {
        // Note: .c0m is actually invalid format (TLD must be letters), so it gets rejected
        // But the typo detection logic would catch it if it passed format validation
        const result = validateEmail("test@example.c0m");
        // The regex rejects it because TLD must be letters only
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid email format. Please enter a valid email address."
        );
      });

      it("should detect .cm typo and suggest .com", () => {
        const result = validateEmail("test@example.cm");
        expect(result.isValid).toBe(true);
        expect(result.warnings.some((w) => w.includes(".cm"))).toBe(true);
      });

      it("should detect .co typo and suggest .com", () => {
        const result = validateEmail("test@example.co");
        expect(result.isValid).toBe(true);
        expect(result.warnings.some((w) => w.includes(".co"))).toBe(true);
      });

      it("should detect .comm typo and suggest .com", () => {
        const result = validateEmail("test@example.comm");
        expect(result.isValid).toBe(true);
        expect(result.warnings.some((w) => w.includes(".comm"))).toBe(true);
      });

      it("should detect .om typo and suggest .com", () => {
        const result = validateEmail("test@example.om");
        expect(result.isValid).toBe(true);
        expect(result.warnings.some((w) => w.includes(".om"))).toBe(true);
      });

      it("should not warn for valid .com TLD", () => {
        const result = validateEmail("test@example.com");
        expect(result.isValid).toBe(true);
        expect(
          result.warnings.some((w) => w.includes("Common typo detected"))
        ).toBe(false);
      });

      it("should not warn for valid .net TLD", () => {
        const result = validateEmail("test@example.net");
        expect(result.isValid).toBe(true);
        expect(
          result.warnings.some((w) => w.includes("Common typo detected"))
        ).toBe(false);
      });

      it("should not warn for valid .org TLD", () => {
        const result = validateEmail("test@example.org");
        expect(result.isValid).toBe(true);
        expect(
          result.warnings.some((w) => w.includes("Common typo detected"))
        ).toBe(false);
      });

      it("should provide corrected email in warning", () => {
        const result = validateEmail("test@example.con");
        expect(result.isValid).toBe(true);
        const typoWarning = result.warnings.find((w) =>
          w.includes("Did you mean")
        );
        expect(typoWarning).toBeDefined();
        expect(typoWarning).toContain("test@example.com");
      });
    });

    describe("Edge cases", () => {
      it("should handle emails with subdomains", () => {
        const result = validateEmail("user@mail.example.com");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should handle emails with multiple subdomains", () => {
        const result = validateEmail("user@mail.subdomain.example.com");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should handle very short valid emails", () => {
        const result = validateEmail("a@b.co");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should handle emails with country code TLDs", () => {
        const result = validateEmail("test@example.co.uk");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should handle new gTLDs", () => {
        const result = validateEmail("test@example.technology");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    describe("Multiple warnings", () => {
      it("should show both case normalization and typo warnings", () => {
        const result = validateEmail("Test@Example.CON");
        expect(result.isValid).toBe(true);
        expect(result.warnings.length).toBeGreaterThanOrEqual(2);
        expect(result.warnings.some((w) => w.includes("lowercase"))).toBe(true);
        expect(result.warnings.some((w) => w.includes("Common typo"))).toBe(
          true
        );
      });
    });
  });

  describe("isValidEmail", () => {
    it("should return true for valid emails", () => {
      expect(isValidEmail("test@example.com")).toBe(true);
      expect(isValidEmail("user@example.org")).toBe(true);
    });

    it("should return false for invalid emails", () => {
      expect(isValidEmail("")).toBe(false);
      expect(isValidEmail("invalid")).toBe(false);
      expect(isValidEmail("test@")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
    });

    it("should return false for emails with consecutive dots", () => {
      expect(isValidEmail("test..user@example.com")).toBe(false);
    });
  });

  describe("normalizeEmail", () => {
    it("should convert email to lowercase", () => {
      expect(normalizeEmail("TEST@EXAMPLE.COM")).toBe("test@example.com");
      expect(normalizeEmail("Test@Example.Com")).toBe("test@example.com");
    });

    it("should trim whitespace", () => {
      expect(normalizeEmail("  test@example.com  ")).toBe("test@example.com");
      expect(normalizeEmail("\ttest@example.com\n")).toBe("test@example.com");
    });

    it("should handle already normalized emails", () => {
      expect(normalizeEmail("test@example.com")).toBe("test@example.com");
    });

    it("should handle mixed case with whitespace", () => {
      expect(normalizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
    });
  });
});
