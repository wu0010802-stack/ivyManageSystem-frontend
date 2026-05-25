/**
 * tests/unit/views/workbench/WorkbenchLayout.test.ts
 *
 * 驗證 WorkbenchLayout 的 sub-tab 顯示邏輯：
 *   - 有 AUDIT_LOGS 權限 → 顯示「高風險事件」tab + badge（unackCount > 0 時）
 *   - 無 AUDIT_LOGS 權限 → 隱藏「高風險事件」tab
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import ElementPlus from "element-plus";

// ---- vue-router mock ----
const route = reactive({ path: "/workbench/approvals" });
const routerPush = vi.fn();

vi.mock("vue-router", () => ({
  RouterView: { template: "<div />" },
  useRoute: () => route,
  useRouter: () => ({ push: routerPush }),
}));

// ---- auth mock ----
const hasPermissionMock = vi.fn(() => true);

vi.mock("@/utils/auth", () => ({
  hasPermission: (perm: string) => hasPermissionMock(perm),
}));

// ---- useHighRiskAuditCount mock ----
// 使用真實 Vue ref，讓模板的 v-if="unackCount > 0" 能正確 auto-unwrap
const unackCountRef = ref(5);

vi.mock("@/composables/useHighRiskAuditCount", () => ({
  useHighRiskAuditCount: () => ({
    unackCount: unackCountRef,
    loading: ref(false),
    refresh: vi.fn(),
    stop: vi.fn(),
  }),
}));

import WorkbenchLayout from "@/views/workbench/WorkbenchLayout.vue";

describe("WorkbenchLayout", () => {
  beforeEach(() => {
    unackCountRef.value = 5;
    route.path = "/workbench/approvals";
    routerPush.mockClear();
    hasPermissionMock.mockReturnValue(true);
  });

  it("有 AUDIT_LOGS 權限時顯示「高風險事件」tab", async () => {
    hasPermissionMock.mockReturnValue(true);
    const wrapper = mount(WorkbenchLayout, {
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("高風險事件");
    wrapper.unmount();
  });

  it("有 AUDIT_LOGS 權限且 unackCount > 0 時顯示 badge", async () => {
    hasPermissionMock.mockReturnValue(true);
    unackCountRef.value = 5;
    const wrapper = mount(WorkbenchLayout, {
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();
    expect(wrapper.find(".el-badge").exists()).toBe(true);
    wrapper.unmount();
  });

  it("無 AUDIT_LOGS 權限時隱藏「高風險事件」tab", async () => {
    hasPermissionMock.mockReturnValue(false);
    const wrapper = mount(WorkbenchLayout, {
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("高風險事件");
    wrapper.unmount();
  });

  it("路徑在 /workbench/high-risk 時 activeTab 為 high-risk", async () => {
    route.path = "/workbench/high-risk";
    hasPermissionMock.mockReturnValue(true);
    const wrapper = mount(WorkbenchLayout, {
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();
    // el-tabs 的 modelValue 對應到 activeTab
    expect(wrapper.findComponent({ name: "ElTabs" }).props("modelValue")).toBe("high-risk");
    wrapper.unmount();
  });
});
