import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus, { ElMessageBox } from "element-plus";

vi.spyOn(ElMessageBox, "confirm").mockResolvedValue("confirm" as any);

vi.mock("@/api/audit", () => ({
  getHighRiskAudits: vi.fn(),
  ackAudit: vi.fn().mockResolvedValue({ data: { ok: true } }),
  ackAllAudits: vi.fn().mockResolvedValue({ data: { acknowledged_count: 3 } }),
}));

import { getHighRiskAudits, ackAudit, ackAllAudits } from "@/api/audit";
import WorkbenchHighRiskView from "@/views/workbench/WorkbenchHighRiskView.vue";

describe("WorkbenchHighRiskView", () => {
  beforeEach(() => {
    vi.mocked(getHighRiskAudits).mockResolvedValue({
      data: {
        items: [
          { id: 1, action: "DELETE", entity_type: "employee", entity_id: "10", summary: "刪除 員工 王小明 (不可復原)", username: "admin", created_at: "2026-05-25T10:00:00Z", acknowledged_at: null, acknowledged_by: null, risk_kind: "hard_delete" },
          { id: 2, action: "BLOCKED_DELETE", entity_type: "user", entity_id: "5", summary: "拒絕刪除使用者", username: "jdoe", created_at: "2026-05-25T11:00:00Z", acknowledged_at: null, acknowledged_by: null, risk_kind: "blocked" },
          { id: 3, action: "UPDATE", entity_type: "user", entity_id: "7", summary: "修改使用者 (role: hr → admin)", username: "admin", created_at: "2026-05-25T12:00:00Z", acknowledged_at: null, acknowledged_by: null, risk_kind: "permission_change" },
        ],
        unack_count: 3,
        total: 3,
      },
    } as any);
  });

  it("渲染 3 種 risk_kind 各一筆", async () => {
    const wrapper = mount(WorkbenchHighRiskView, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    expect(wrapper.text()).toContain("王小明");
    expect(wrapper.text()).toContain("拒絕刪除");
    expect(wrapper.text()).toContain("role");
    // 3 個 risk tag
    expect(wrapper.findAll(".risk-tag").length).toBe(3);
  });

  it("單筆 ack 按鈕呼叫 ackAudit", async () => {
    const wrapper = mount(WorkbenchHighRiskView, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    const ackButtons = wrapper.findAll("[data-test='ack-btn']");
    expect(ackButtons.length).toBeGreaterThan(0);
    await ackButtons[0].trigger("click");
    await flushPromises();
    expect(ackAudit).toHaveBeenCalledWith(1);
  });

  it("「全部標已讀」按鈕呼叫 ackAllAudits", async () => {
    const wrapper = mount(WorkbenchHighRiskView, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    const ackAllBtn = wrapper.find("[data-test='ack-all-btn']");
    await ackAllBtn.trigger("click");
    // ElMessageBox.confirm is mocked or auto-confirmed
    await flushPromises();
    expect(ackAllAudits).toHaveBeenCalled();
  });

  it("empty state 顯示", async () => {
    vi.mocked(getHighRiskAudits).mockResolvedValueOnce({
      data: { items: [], unack_count: 0, total: 0 },
    } as any);
    const wrapper = mount(WorkbenchHighRiskView, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    expect(wrapper.text()).toMatch(/沒有|無高風險|空/);
  });
});
