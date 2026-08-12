import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

// Stub localStorage before any module imports it
const store: Record<string, string> = {};
const localStorageStub = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const key of Object.keys(store)) delete store[key]; },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).localStorage = localStorageStub;

const {
  mockSupabase,
  mockQuery,
  mockChannel,
  mockRemoveChannel,
} = vi.hoisted(() => {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  const removeChannel = vi.fn();
  const query = {
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
  const supabase = {
    from: vi.fn(() => query),
    channel: vi.fn(() => channel),
    removeChannel,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ subscription: { unsubscribe: vi.fn() } }),
    },
    rpc: vi.fn().mockResolvedValue({}),
  };
  return { mockSupabase: supabase, mockQuery: query, mockChannel: channel, mockRemoveChannel: removeChannel };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

import { LanguageProvider } from "@/contexts/LanguageContext";
import ChannelMessagesView from "./ChannelMessagesView";

function renderWithLang(lang: "ar" | "en", channels: { id: string; channel_name: string; channel_type: string }[] = []) {
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
    mockQuery.select.mockImplementation(() => {
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
    const { findByTestId, getByTestId } = renderWithLang("ar");

    const title = await findByTestId("messages-header-title");
    expect(title).toHaveTextContent(
      "قناة مربوطة بالبوت و يتم وصول رسالة فيها يتم تنزيلها باسم قناة و تكون مثل قنوات تلغرام"
    );

    expect(getByTestId("messages-live-badge")).toHaveTextContent("مباشر");
  });

  it("renders the English header title and live badge", async () => {
    const { findByTestId, getByTestId } = renderWithLang("en");

    const title = await findByTestId("messages-header-title");
    expect(title).toHaveTextContent("Channel messages");

    expect(getByTestId("messages-live-badge")).toHaveTextContent("LIVE");
  });

  it("switches header text when language changes", async () => {
    const { findByText, rerender, getByTestId, findByTestId } = renderWithLang("ar");

    await findByText(
      "قناة مربوطة بالبوت و يتم وصول رسالة فيها يتم تنزيلها باسم قناة و تكون مثل قنوات تلغرام"
    );

    localStorage.setItem("app_lang", "en");
    rerender(
      <LanguageProvider>
        <ChannelMessagesView channels={[]} />
      </LanguageProvider>
    );

    const title = await findByTestId("messages-header-title");
    expect(title).toHaveTextContent("Channel messages");
    expect(getByTestId("messages-live-badge")).toHaveTextContent("LIVE");
  });
});
