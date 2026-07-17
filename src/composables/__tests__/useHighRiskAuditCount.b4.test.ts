import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("@/api/audit", () => ({
  getHighRiskAudits: vi.fn(),
}));

import { getHighRiskAudits } from "@/api/audit";
import { useHighRiskAuditCount } from "@/composables/useHighRiskAuditCount";

// C4-useHighRiskAuditCount：移除多餘 `as any` 後，unack_count 讀取行為必須不變。
describe("useHighRiskAuditCount（去 as any 後行為保持）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function mountComposable() {
    const TestComp = {
      setup() {
        return useHighRiskAuditCount();
      },
      template: "<div>{{ unackCount }}</div>",
    };
    return mount(TestComp);
  }

  it("正確讀取後端回傳的 unack_count", async () => {
    vi.mocked(getHighRiskAudits).mockResolvedValue({
      data: { unack_count: 5, items: [], total: 5 },
    } as unknown as Awaited<ReturnType<typeof getHighRiskAudits>>);

    const wrapper = mountComposable();
    await flushPromises();
    expect(wrapper.text()).toBe("5");
    wrapper.unmount();
  });

  it("data 缺 unack_count（?.／?? 防禦）時回退為 0", async () => {
    vi.mocked(getHighRiskAudits).mockResolvedValue({
      data: undefined,
    } as unknown as Awaited<ReturnType<typeof getHighRiskAudits>>);

    const wrapper = mountComposable();
    await flushPromises();
    expect(wrapper.text()).toBe("0");
    wrapper.unmount();
  });

  it("API 失敗時靜默回退為 0", async () => {
    vi.mocked(getHighRiskAudits).mockRejectedValue(new Error("boom"));

    const wrapper = mountComposable();
    await flushPromises();
    expect(wrapper.text()).toBe("0");
    wrapper.unmount();
  });
});
