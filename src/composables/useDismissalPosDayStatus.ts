/**
 * 接送 POS：全園今日請假／已上放學車名單（posbus01）。
 *
 * 資料來自 GET /dismissal-calls/pos-status。放學車上車打卡不會經過接送通知的
 * WebSocket，所以這裡自己輪詢（預設 60 秒，分頁在背景時跳過），補登／撤銷後
 * 由呼叫端 refresh({ force: true })——force 繞過 apiDedupe，否則若輪詢請求正在途，
 * 會合併成同一個 promise 而拿到補登前的快照。只保留最後一次請求的結果，避免較舊的回應晚到蓋掉新狀態。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getDismissalPosStatus, type DismissalPosStatus } from '@/api/dismissalCalls'
import type { PosDayStatus } from '@/types/dismissalPos'

export const POS_DAY_STATUS_POLL_MS = 60_000

export function toPosDayStatus(raw: DismissalPosStatus | null | undefined): PosDayStatus {
  return {
    leaves: new Map(
      (raw?.leaves ?? []).map(l => [
        l.student_id,
        { leaveType: l.leave_type, markedByPos: l.marked_by_pos },
      ]),
    ),
    busDeparted: new Map(
      (raw?.bus_departed ?? []).map(b => [b.student_id, { routeName: b.route_name }]),
    ),
  }
}

export function useDismissalPosDayStatus(pollMs: number = POS_DAY_STATUS_POLL_MS) {
  const raw = ref<DismissalPosStatus | null>(null)
  let seq = 0
  let timer: ReturnType<typeof setInterval> | null = null

  async function refresh({ force = false }: { force?: boolean } = {}): Promise<void> {
    const mySeq = ++seq
    try {
      const res = await getDismissalPosStatus(force ? { force } : undefined)
      if (mySeq === seq) raw.value = res.data
    } catch {
      // 狀態名單是輔助資訊：載入失敗時保留上一次結果、不彈錯打斷接送作業，下一輪輪詢再試
    }
  }

  onMounted(() => {
    void refresh()
    timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void refresh()
    }, pollMs)
  })

  onUnmounted(() => {
    seq++
    if (timer) clearInterval(timer)
    timer = null
  })

  const dayStatus = computed(() => toPosDayStatus(raw.value))
  return { dayStatus, refresh }
}
