import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { screen, waitFor } from "@testing-library/dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import ChannelMessagesView from "./ChannelMessagesView";

// Mock the Supabase client used by the component
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

const mockRemoveChannel = vi.fn();

const mockQuery = {
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
  then: vi.fn().mockReturnThis(),
};

const mockSupabase = {
  from: vi.fn(() => mockQuery),
  channel: vi.fn(() => mockChannel),
  removeChannel: mockRemoveChannel,
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn().mockReturnValue({ subscription: { unsubscribe: vi.fn() } }),
  },
  rpc: vi.fn().mockResolvedValue({}),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

function renderWithLang(lang: "ar" | "en", channels = []) {
  localStorage.setItem("app_lang", lang);
  return render(
    <LanguageProvider>
      <ChannelMessagesView channels={channels} />
    </LanguageProvider>
  );
}

describe("ChannelMessagesView header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default select returns empty messages with count 0
    mockQuery.select.mockImplementation((_columns: unknown, opts?: { count?: string }) => {
      // Simulate the final promise resolution when the chain is awaited
      mockQuery.then.mockImplementation((cb: (value: { data: null; count: number }) => unknown) => {
        return Promise.resolve(cb({ data: null, count: 0 }));
      });
      return mockQuery;
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders the Arabic header title and live badge", async () => {
    renderWithLang("ar");

    const title = await screen.findByTestId("messages-header-title");
    expect(title).toHaveTextContent(
      "قناة مربوطة بالبوت و يتم وصول رسالة فيها يتم تنزيلها باسم قناة و تكون مثل قنوات تلغرام"
    );

    const badge = screen.getByTestId("messages-live-badge");
    expect(badge).toHaveTextContent("مباشر");
  });

  it("renders the English header title and live badge", async () => {
    renderWithLang("en");

    const title = await screen.findByTestId("messages-header-title");
    expect(title).toHaveTextContent("Channel messages");

    const badge = screen.getByTestId("messages-live-badge");
    expect(badge).toHaveTextContent("LIVE");
  });

  it("switches header text when language changes", async () => {
    const { rerender } = renderWithLang("ar");

    await screen.findByText(
      "قناة مربوطة بالبوت و يتم وصول رسالة فيها يتم تنزيلها باسم قناة و تكون مثل قنوات تلغرام"
    );

    localStorage.setItem("app_lang", "en");
    rerender(
      <LanguageProvider>
        <ChannelMessagesView channels={[]} />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("messages-header-title")).toHaveTextContent("Channel messages");
    });

    expect(screen.getByTestId("messages-live-badge")).toHaveTextContent("LIVE");
  });
});
