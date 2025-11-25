/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SignupPage from "../page";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// Mock tRPC
jest.mock("@/lib/trpc/client", () => ({
  trpc: {
    auth: {
      signup: {
        useMutation: jest.fn(),
      },
    },
  },
}));

/**
 * Frontend Password Validation Tests
 *
 * These tests verify client-side password validation, UI behavior, and user interactions.
 * Tests cover:
 * - Password length requirements (minimum 12 characters)
 * - Password complexity requirements (uppercase, lowercase, numbers, special chars)
 * - Password confirmation matching
 * - Error message display
 * - Form submission behavior
 * - User interaction flows
 */
describe("Password Validation - Frontend", () => {
  const mockPush = jest.fn();
  const mockMutateAsync = jest.fn();
  const mockUseMutation = jest.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    (trpc.auth.signup.useMutation as jest.Mock).mockReturnValue(
      mockUseMutation()
    );
  });

  const fillStep1Fields = (
    container: HTMLElement,
    email: string,
    password: string,
    confirmPassword: string
  ) => {
    const emailInput = container.querySelector(
      'input[name="email"]'
    ) as HTMLInputElement;
    const passwordInput = container.querySelector(
      'input[name="password"]'
    ) as HTMLInputElement;
    const confirmPasswordInput = container.querySelector(
      'input[name="confirmPassword"]'
    ) as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: email } });
    fireEvent.change(passwordInput, { target: { value: password } });
    fireEvent.change(confirmPasswordInput, {
      target: { value: confirmPassword },
    });
  };

  const fillAllRequiredFields = (container: HTMLElement) => {
    // Step 1: Email and Password
    fillStep1Fields(
      container,
      "test@example.com",
      "ValidPassword123!",
      "ValidPassword123!"
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2: Personal Info
    fireEvent.change(
      container.querySelector('input[name="firstName"]') as HTMLInputElement,
      {
        target: { value: "Test" },
      }
    );
    fireEvent.change(
      container.querySelector('input[name="lastName"]') as HTMLInputElement,
      {
        target: { value: "User" },
      }
    );
    fireEvent.change(
      container.querySelector('input[name="phoneNumber"]') as HTMLInputElement,
      {
        target: { value: "1234567890" },
      }
    );
    fireEvent.change(
      container.querySelector('input[name="dateOfBirth"]') as HTMLInputElement,
      {
        target: { value: "1990-01-01" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 3: Address
    fireEvent.change(
      container.querySelector('input[name="ssn"]') as HTMLInputElement,
      {
        target: { value: "123456789" },
      }
    );
    fireEvent.change(
      container.querySelector('input[name="address"]') as HTMLInputElement,
      {
        target: { value: "123 Main St" },
      }
    );
    fireEvent.change(
      container.querySelector('input[name="city"]') as HTMLInputElement,
      {
        target: { value: "Test City" },
      }
    );
    fireEvent.change(
      container.querySelector('input[name="state"]') as HTMLInputElement,
      {
        target: { value: "CA" },
      }
    );
    fireEvent.change(
      container.querySelector('input[name="zipCode"]') as HTMLInputElement,
      {
        target: { value: "12345" },
      }
    );
  };

  describe("Password Length Requirements", () => {
    it("should display error for passwords shorter than 12 characters", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(container, "test@example.com", "Short1!", "Short1!");

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(/password must be at least 12 characters/i)
        ).toBeInTheDocument();
      });
    });

    it("should accept passwords with exactly 12 characters", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "ValidPass12!",
        "ValidPass12!"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.queryByText(/password must be at least 12 characters/i)
        ).not.toBeInTheDocument();
      });

      // Should proceed to step 2
      await waitFor(() => {
        expect(
          container.querySelector('input[name="firstName"]')
        ).toBeInTheDocument();
      });
    });

    it("should accept passwords longer than 12 characters", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "VeryLongPassword123!@#",
        "VeryLongPassword123!@#"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.queryByText(/password must be at least 12 characters/i)
        ).not.toBeInTheDocument();
      });

      // Should proceed to step 2
      await waitFor(() => {
        expect(
          container.querySelector('input[name="firstName"]')
        ).toBeInTheDocument();
      });
    });
  });

  describe("Password Complexity Requirements", () => {
    it("should display error for passwords without uppercase letters", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "lowercase123!@#",
        "lowercase123!@#"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(
            /password must contain at least one uppercase letter/i
          )
        ).toBeInTheDocument();
      });
    });

    it("should display error for passwords without lowercase letters", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "UPPERCASE123!@#",
        "UPPERCASE123!@#"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(
            /password must contain at least one lowercase letter/i
          )
        ).toBeInTheDocument();
      });
    });

    it("should display error for passwords without numbers", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "NoNumbers!@#",
        "NoNumbers!@#"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(/password must contain at least one number/i)
        ).toBeInTheDocument();
      });
    });

    it("should display error for passwords without special characters", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "NoSpecial123",
        "NoSpecial123"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(
            /password must contain at least one special character/i
          )
        ).toBeInTheDocument();
      });
    });

    it("should accept passwords with all required complexity elements", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "ComplexPass123!@#",
        "ComplexPass123!@#"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.queryByText(/password must contain/i)
        ).not.toBeInTheDocument();
      });

      // Should proceed to step 2
      await waitFor(() => {
        expect(
          container.querySelector('input[name="firstName"]')
        ).toBeInTheDocument();
      });
    });

    it("should display multiple error messages for multiple missing requirements", async () => {
      const { container } = render(<SignupPage />);

      // Password missing uppercase, number, and special char
      fillStep1Fields(
        container,
        "test@example.com",
        "lowercaseonly",
        "lowercaseonly"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(/password must be at least 12 characters/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Password Confirmation", () => {
    it("should display error when passwords do not match", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "ValidPassword123!",
        "DifferentPassword123!"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });

    it("should accept matching passwords", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "ValidPassword123!",
        "ValidPassword123!"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.queryByText(/passwords do not match/i)
        ).not.toBeInTheDocument();
      });

      // Should proceed to step 2
      await waitFor(() => {
        expect(
          container.querySelector('input[name="firstName"]')
        ).toBeInTheDocument();
      });
    });

    it("should update error when password is changed after mismatch", async () => {
      const { container } = render(<SignupPage />);

      const passwordInput = container.querySelector(
        'input[name="password"]'
      ) as HTMLInputElement;
      const confirmPasswordInput = container.querySelector(
        'input[name="confirmPassword"]'
      ) as HTMLInputElement;

      fireEvent.change(passwordInput, {
        target: { value: "ValidPassword123!" },
      });
      fireEvent.change(confirmPasswordInput, {
        target: { value: "DifferentPassword123!" },
      });

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });

      // Fix the mismatch
      fireEvent.change(confirmPasswordInput, {
        target: { value: "ValidPassword123!" },
      });

      await waitFor(() => {
        expect(
          screen.queryByText(/passwords do not match/i)
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Form Submission", () => {
    it("should prevent submission with invalid password", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(container, "test@example.com", "Short1!", "Short1!");

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(/password must be at least 12 characters/i)
        ).toBeInTheDocument();
      });

      // Should still be on step 1
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    });

    it("should allow progression through steps with valid password", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(
        container,
        "test@example.com",
        "ValidPassword123!",
        "ValidPassword123!"
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      });
    });

    it("should submit form with valid password", async () => {
      mockMutateAsync.mockResolvedValue({
        user: { id: 1, email: "test@example.com" },
        token: "mock-token",
      });

      const { container } = render(<SignupPage />);

      fillAllRequiredFields(container);

      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            password: "ValidPassword123!",
          })
        );
      });
    });

    it("should display error message on submission failure", async () => {
      const errorMessage = "Password validation failed";
      mockMutateAsync.mockRejectedValue(new Error(errorMessage));

      const { container } = render(<SignupPage />);

      fillAllRequiredFields(container);

      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });
  });

  describe("User Interaction and UX", () => {
    it("should show error messages immediately after validation fails", async () => {
      const { container } = render(<SignupPage />);

      const passwordInput = container.querySelector(
        'input[name="password"]'
      ) as HTMLInputElement;
      fireEvent.change(passwordInput, { target: { value: "Short1!" } });

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(/password must be at least 12 characters/i)
        ).toBeInTheDocument();
      });
    });

    it("should clear error messages when password becomes valid", async () => {
      const { container } = render(<SignupPage />);

      const passwordInput = container.querySelector(
        'input[name="password"]'
      ) as HTMLInputElement;
      fireEvent.change(passwordInput, { target: { value: "Short1!" } });

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(/password must be at least 12 characters/i)
        ).toBeInTheDocument();
      });

      // Fix the password
      fireEvent.change(passwordInput, {
        target: { value: "ValidPassword123!" },
      });

      await waitFor(() => {
        expect(
          screen.queryByText(/password must be at least 12 characters/i)
        ).not.toBeInTheDocument();
      });
    });

    it("should handle password field type correctly (password input)", () => {
      const { container } = render(<SignupPage />);

      const passwordInput = container.querySelector(
        'input[name="password"]'
      ) as HTMLInputElement;
      expect(passwordInput.type).toBe("password");

      fireEvent.change(passwordInput, {
        target: { value: "ValidPassword123!" },
      });
      expect(passwordInput.value).toBe("ValidPassword123!");
    });

    it("should handle confirm password field type correctly", () => {
      const { container } = render(<SignupPage />);

      const confirmPasswordInput = container.querySelector(
        'input[name="confirmPassword"]'
      ) as HTMLInputElement;
      expect(confirmPasswordInput.type).toBe("password");

      fireEvent.change(confirmPasswordInput, {
        target: { value: "ValidPassword123!" },
      });
      expect(confirmPasswordInput.value).toBe("ValidPassword123!");
    });
  });

  describe("Edge Cases", () => {
    it("should handle passwords with special characters", async () => {
      const { container } = render(<SignupPage />);

      const specialPassword = "Pass!@#$%^&*()_+-=[]{}|;:,.<>?123";
      fillStep1Fields(
        container,
        "test@example.com",
        specialPassword,
        specialPassword
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.queryByText(/password must contain/i)
        ).not.toBeInTheDocument();
      });

      // Should proceed to step 2
      await waitFor(() => {
        expect(
          container.querySelector('input[name="firstName"]')
        ).toBeInTheDocument();
      });
    });

    it("should handle very long passwords", async () => {
      const { container } = render(<SignupPage />);

      const longPassword = "VeryLongPassword123!@#" + "x".repeat(100);
      fillStep1Fields(
        container,
        "test@example.com",
        longPassword,
        longPassword
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.queryByText(/password must be at least 12 characters/i)
        ).not.toBeInTheDocument();
      });

      // Should proceed to step 2
      await waitFor(() => {
        expect(
          container.querySelector('input[name="firstName"]')
        ).toBeInTheDocument();
      });
    });

    it("should handle empty password field", async () => {
      const { container } = render(<SignupPage />);

      fillStep1Fields(container, "test@example.com", "", "");

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });
    });

    it("should handle empty confirm password field", async () => {
      const { container } = render(<SignupPage />);

      const passwordInput = container.querySelector(
        'input[name="password"]'
      ) as HTMLInputElement;
      fireEvent.change(passwordInput, {
        target: { value: "ValidPassword123!" },
      });

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(/please confirm your password/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Password Validation Integration", () => {
    it("should validate all password requirements together", async () => {
      const { container } = render(<SignupPage />);

      // Start with invalid password (too short, no uppercase, no number, no special)
      fillStep1Fields(container, "test@example.com", "lowercase", "lowercase");

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(/password must be at least 12 characters/i)
        ).toBeInTheDocument();
      });

      // Fix all issues step by step
      const passwordInput = container.querySelector(
        'input[name="password"]'
      ) as HTMLInputElement;
      const confirmPasswordInput = container.querySelector(
        'input[name="confirmPassword"]'
      ) as HTMLInputElement;

      // Add length and uppercase
      fireEvent.change(passwordInput, { target: { value: "ValidPassword!" } });
      fireEvent.change(confirmPasswordInput, {
        target: { value: "ValidPassword!" },
      });

      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText(/password must contain at least one number/i)
        ).toBeInTheDocument();
      });

      // Add number
      fireEvent.change(passwordInput, {
        target: { value: "ValidPassword123!" },
      });
      fireEvent.change(confirmPasswordInput, {
        target: { value: "ValidPassword123!" },
      });

      fireEvent.click(nextButton);

      // Should now pass validation
      await waitFor(() => {
        expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      });
    });
  });
});
