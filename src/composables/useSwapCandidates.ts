/**
 * 換班對象候選：同時抓 /swap-candidates 與 /schedule/day-roster 並合併（SPEC-026 §4.4 T5）。
 *
 * - 候選先顯示：/swap-candidates 一回來就寫入名單並關閉 loading；day-roster 較慢時只是晚一點補上
 *   職務加註與重排，不會卡住選單（最壞情況＝axios timeout 前候選都看不到）。
 * - roster 失敗不影響換班：降級為原本的候選清單（只是少了職務加註），不提示。
 * - 候選請求失敗才算失敗：load() 回 false，由呼叫端決定要不要 toast。
 * - 競態：使用者快速換日期時，只採用最新一次請求的結果（含較慢的 roster）；clear() 也會作廢進行中的請求。
 */
import { ref } from 'vue'
import { getDayRoster, getSwapCandidates } from '@/api/portal'
import {
  mergeRosterIntoCandidates,
  type DayRosterEntry,
  type SwapCandidateBase,
  type SwapCandidateView,
} from '@/utils/swapRoster'

export function useSwapCandidates() {
  const candidates = ref<SwapCandidateView[]>([])
  const loading = ref(false)
  let seq = 0

  async function load(dateStr: string): Promise<boolean> {
    const mine = ++seq
    loading.value = true
    // roster 與候選同時發出；失敗以 null 表示（降級），不會變成 unhandled rejection
    const rosterRequest: Promise<readonly DayRosterEntry[] | null> = getDayRoster({ date: dateStr }).then(
      (res) => res.data,
      () => null,
    )
    try {
      let base: SwapCandidateBase[]
      try {
        base = (await getSwapCandidates({ date: dateStr })).data as unknown as SwapCandidateBase[]
      } catch {
        if (mine !== seq) return true // 已被取代的請求失敗，不算失敗
        candidates.value = []
        return false
      }
      if (mine !== seq) return true // 已被較新的請求（或 clear）取代，結果丟棄，不算失敗
      candidates.value = base // 候選先顯示
      loading.value = false
      const roster = await rosterRequest
      if (mine !== seq) return true
      if (roster) candidates.value = mergeRosterIntoCandidates(base, roster)
      return true
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  function clear() {
    seq++
    candidates.value = []
    loading.value = false
  }

  return { candidates, loading, load, clear }
}
