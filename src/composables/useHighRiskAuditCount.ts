import { ref, onMounted, onUnmounted } from "vue";

import { getHighRiskAudits } from "@/api/audit";

const POLL_INTERVAL_MS = 60_000;

export function useHighRiskAuditCount() {
  const unackCount = ref(0);
  const loading = ref(false);
  let timerId: ReturnType<typeof setInterval> | null = null;

  async function refresh(): Promise<void> {
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
