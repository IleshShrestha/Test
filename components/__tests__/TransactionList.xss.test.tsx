/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TransactionList } from "@/components/TransactionList";
import { trpc } from "@/lib/trpc/client";

// Mock tRPC
jest.mock("@/lib/trpc/client", () => ({
  trpc: {
    account: {
      getTransactions: {
        useQuery: jest.fn(),
      },
    },
  },
}));

describe("TransactionList XSS Prevention", () => {
  const mockUseQuery = trpc.account.getTransactions.useQuery as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to get the description cell (3rd column)
  const getDescriptionCell = (container: HTMLElement): HTMLElement | null => {
    const row = container.querySelector("tbody tr");
    if (!row) return null;
    const cells = row.querySelectorAll("td");
    return cells[2] as HTMLElement; // Description is the 3rd column (index 2)
  };

  // Helper function to create mock data with correct structure
  interface MockTransaction {
    id: number;
    type: string;
    amount: number;
    description: string | null;
    status: string;
    createdAt: string;
  }
  const createMockData = (transactions: MockTransaction[]) => ({
    data: {
      transactions,
      pagination: {
        page: 1,
        limit: 10,
        totalCount: transactions.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    isLoading: false,
  });

  describe("XSS Attack Vectors", () => {
    it("should escape script tags in transaction descriptions", () => {
      const maliciousDescription = '<script>alert("XSS")</script>';

      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: maliciousDescription,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const { container } = render(<TransactionList accountId={1} />);

      // Get the description cell (3rd column)
      const descriptionCell = getDescriptionCell(container);
      expect(descriptionCell).toBeInTheDocument();

      // Verify the escaped content is present (React converts < to &lt;)
      expect(descriptionCell!.innerHTML).toContain("&lt;script&gt;");
      expect(descriptionCell!.innerHTML).toContain("&lt;/script&gt;");

      // Most importantly: Verify no script tags exist in the DOM
      const scriptTags = container.querySelectorAll("script");
      expect(scriptTags.length).toBe(0);
    });

    it("should escape event handler attributes", () => {
      const maliciousDescription = '<img src="x" onerror="alert(\'XSS\')" />';

      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: maliciousDescription,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const { container } = render(<TransactionList accountId={1} />);

      const descriptionCell = getDescriptionCell(container);
      expect(descriptionCell).toBeInTheDocument();
      expect(descriptionCell!.innerHTML).toContain("&lt;img");

      // Verify no img tags with onerror exist
      const imgTags = container.querySelectorAll("img[onerror]");
      expect(imgTags.length).toBe(0);
    });

    it("should escape JavaScript URLs", () => {
      const maliciousDescription =
        "<a href=\"javascript:alert('XSS')\">Click me</a>";

      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: maliciousDescription,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const { container } = render(<TransactionList accountId={1} />);

      const descriptionCell = getDescriptionCell(container);
      expect(descriptionCell).toBeInTheDocument();

      // Verify no anchor tags with javascript: URLs exist
      const anchorTags = container.querySelectorAll('a[href^="javascript:"]');
      expect(anchorTags.length).toBe(0);
    });

    it("should escape iframe tags", () => {
      const maliciousDescription =
        "<iframe src=\"javascript:alert('XSS')\"></iframe>";

      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: maliciousDescription,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const { container } = render(<TransactionList accountId={1} />);

      const descriptionCell = getDescriptionCell(container);
      expect(descriptionCell).toBeInTheDocument();

      // Verify no iframe tags exist
      const iframeTags = container.querySelectorAll("iframe");
      expect(iframeTags.length).toBe(0);
    });

    it("should escape SVG with script content", () => {
      const maliciousDescription = '<svg><script>alert("XSS")</script></svg>';

      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: maliciousDescription,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const { container } = render(<TransactionList accountId={1} />);

      const descriptionCell = getDescriptionCell(container);
      expect(descriptionCell).toBeInTheDocument();

      // Verify no SVG or script tags exist
      const svgTags = container.querySelectorAll("svg");
      const scriptTags = container.querySelectorAll("script");
      expect(svgTags.length).toBe(0);
      expect(scriptTags.length).toBe(0);
    });

    it("should escape HTML entities properly", () => {
      const maliciousDescription = '&lt;script&gt;alert("XSS")&lt;/script&gt;';

      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: maliciousDescription,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const { container } = render(<TransactionList accountId={1} />);

      const descriptionCell = getDescriptionCell(container);
      expect(descriptionCell).toBeInTheDocument();
      // The & will be escaped to &amp; by React, so we check for the escaped version
      expect(descriptionCell!.textContent).toContain("&lt;script&gt;");
    });

    it("should escape multiple nested XSS attempts", () => {
      const maliciousDescription =
        '<div><script>alert("XSS")</script><img src="x" onerror="alert(\'XSS\')" /></div>';

      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: maliciousDescription,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const { container } = render(<TransactionList accountId={1} />);

      const descriptionCell = getDescriptionCell(container);
      expect(descriptionCell).toBeInTheDocument();

      // Verify no dangerous elements exist
      expect(container.querySelectorAll("script").length).toBe(0);
      expect(container.querySelectorAll("img[onerror]").length).toBe(0);
      // Note: There might be divs from the table structure, so we check that description doesn't create divs
      // The description cell itself should not contain div elements from the description
      const descriptionDivs = descriptionCell!.querySelectorAll("div");
      expect(descriptionDivs.length).toBe(0);
    });

    it("should handle safe text descriptions normally", () => {
      const safeDescription = "Funding from card";

      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: safeDescription,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      render(<TransactionList accountId={1} />);

      // Safe text should be displayed normally
      const descriptionElement = screen.getByText(safeDescription);
      expect(descriptionElement).toBeInTheDocument();
    });

    it("should handle null/undefined descriptions safely", () => {
      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: null,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      render(<TransactionList accountId={1} />);

      // Should display "-" for null descriptions
      const dashElements = screen.getAllByText("-");
      // There might be multiple "-" in the table, so check if at least one exists
      expect(dashElements.length).toBeGreaterThan(0);
    });
  });

  describe("React Escaping Behavior", () => {
    it("should verify React automatically escapes content", () => {
      const maliciousDescription = '<script>document.cookie="stolen"</script>';

      mockUseQuery.mockReturnValue(
        createMockData([
          {
            id: 1,
            type: "deposit",
            amount: 100,
            description: maliciousDescription,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const { container } = render(<TransactionList accountId={1} />);

      // Get description cell (3rd column)
      const descriptionCell = getDescriptionCell(container);
      expect(descriptionCell).toBeInTheDocument();

      // The innerHTML should contain escaped characters
      // React converts < to &lt; and > to &gt;
      expect(descriptionCell!.innerHTML).toContain("&lt;script&gt;");
      expect(descriptionCell!.innerHTML).toContain("&lt;/script&gt;");

      // No actual script tags should exist
      expect(container.querySelectorAll("script").length).toBe(0);
    });
  });
});
