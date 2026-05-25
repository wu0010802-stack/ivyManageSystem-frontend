import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("@/api/audit", () => ({
  getHighRiskAudits: vi.fn(),
}));

import { getHighRiskAudits } from "@/api/audit";
import { useHighRiskAuditCount } from "@/composables/useHighRiskAuditCount";

describe("useHighRiskAuditCount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getHighRiskAudits).mockResolvedValue({
      data: { unack_count: 3, items: [], total: 3 },
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("初次 mount 拉一次資料", async () => {
    const TestComp = {
      setup() {
        return useHighRiskAuditCount();
      },
      template: "<div>{{ unackCount }}</div>",
    };
    const wrapper = mount(TestComp);
    await flushPromises(); // drain the initial refresh() microtask without firing interval
    expect(getHighRiskAudits).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toBe("3");
    wrapper.unmount();
  });

  it("每 60 秒輪詢一次", async () => {
    const TestComp = {
      setup() {
        return useHighRiskAuditCount();
      },
      template: "<div></div>",
    };
    const wrapper = mount(TestComp);
    await flushPromises(); // drain initial refresh()
    expect(getHighRiskAudits).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    await flushPromises(); // drain the interval callback that was just triggered
    expect(getHighRiskAudits).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("unmount 後停止輪詢", async () => {
    const TestComp = {
      setup() {
        return useHighRiskAuditCount();
      },
      template: "<div></div>",
    };
    const wrapper = mount(TestComp);
    await flushPromises(); // drain initial refresh()
    wrapper.unmount();
    const callsBefore = vi.mocked(getHighRiskAudits).mock.calls.length;
    vi.advanceTimersByTime(120_000);
    await flushPromises();
    expect(vi.mocked(getHighRiskAudits).mock.calls.length).toBe(callsBefore);
  });

  it("refresh() 立即拉一次", async () => {
    const TestComp = {
      setup() {
        return useHighRiskAuditCount();
      },
      template: "<div></div>",
    };
    const wrapper = mount(TestComp);
    await flushPromises(); // drain initial refresh()
    const { refresh } = (wrapper.vm as any).$.setupState;
    await refresh();
    expect(getHighRiskAudits).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
