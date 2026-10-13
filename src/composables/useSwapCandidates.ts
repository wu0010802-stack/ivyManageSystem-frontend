/**
 * 換班對象候選：同時抓 /swap-candidates 與 /schedule/day-roster 並合併（SPEC-026 §4.4 T5）。
 *
 * - roster 失敗不影響換班：降級為原本的候選清單（只是少了職務加註），不提示。
 * - 候選請求失敗才算失敗：load() 回 false，由呼叫端決定要不要 toast。
 * - 競態：使用者快速換日期時，只採用最新一次請求的結果；clear() 也會作廢進行中的請求。
 */
import { ref } from 'vue'
import { getDayRoster, getSwapCandidates } from '@/api/portal'
import {
  mergeRosterIntoCandidates,
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
    try {
      const [candidateResult, rosterResult] = await Promise.allSettled([
        getSwapCandidates({ date: dateStr }),
        getDayRoster({ date: dateStr }),
      ])
      if (mine !== seq) return true // 已被較新的請求（或 clear）取代，結果丟棄，不算失敗
      if (candidateResult.status === 'rejected') {
        candidates.value = []
        return false
      }
      const base = candidateResult.value.data as unknown as SwapCandidateBase[]
      candidates.value =
        rosterResult.status === 'fulfilled'
          ? mergeRosterIntoCandidates(base, rosterResult.value.data)
          : base
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
