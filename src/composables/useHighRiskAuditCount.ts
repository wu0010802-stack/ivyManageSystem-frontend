import { ref, onMounted, onUnmounted } from "vue";

import { getHighRiskAudits } from "@/api/audit";
import { hasPermission } from "@/utils/auth";

const POLL_INTERVAL_MS = 60_000;

export function useHighRiskAuditCount() {
  const unackCount = ref(0);
  const loading = ref(false);
  let timerId: ReturnType<typeof setInterval> | null = null;

  async function refresh(): Promise<void> {
    // 高風險事件已於 2026-08-03 自 AUDIT_LOGS 細分為 HIGH_RISK_READ；無此權限者
    // 打端點只會拿 403（badge 本來也不該顯示），直接不發請求。
    if (!hasPermission("HIGH_RISK_READ")) {
      unackCount.value = 0;
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      return; // hidden tab 跳過，省 quota
    }
    loading.value = true;
    try {
      const res = await getHighRiskAudits({ days: 7, limit: 1 });
      unackCount.value = res.data?.unack_count ?? 0;
    } catch (e) {
      // 靜默失敗：紅點消失優於假數字
      unackCount.value = 0;
    } finally {
      loading.value = false;
    }
  }

  function onVisibility(): void {
    if (!document.hidden) {
      void refresh();
    }
  }

  function stop(): void {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  }

  onMounted(() => {
    void refresh();
    timerId = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
  });

  onUnmounted(stop);

  return { unackCount, loading, refresh, stop };
}
