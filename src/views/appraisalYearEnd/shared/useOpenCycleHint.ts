// src/views/appraisal/composables/useOpenCycleHint.ts
//
// Task B5：規則變更影響提示（OPEN 週期 → 前往重算）。
// 規則設定頁（RulesSettingsLayout 5 個分頁）儲存規則成功後，若目前存在 OPEN
// 考核週期，需提示「此變更於下次試算/重算生效」；規則設定頁頂部亦需常駐顯示
// 目前 OPEN 週期連結。抽出本 composable 供 layout 與各規則面板復用。
//
// ⚠ 範圍界定（比照 brief Interfaces）：僅消費既有 `listAppraisalCycles()`
// （考核週期 `/appraisal/cycles`），取第一筆 `status==='OPEN'` 者。年終
// （YearEndCycle，`/year_end/...`）為獨立週期概念，本 task 不引入第二套抓取，
// 避免超出 brief 範圍與 Step 1 測試契約（僅 mock listAppraisalCycles）。
//
// ⚠ 共用實例設計（provide/inject）：RulesSettingsLayout 為子路由面板的共同
//祖先（vue-router 的 <router-view> 渲染出的子路由元件仍在 layout 的元件樹
// 之下），layout 呼叫 `provideOpenCycleHint()` 建立唯一實例並 provide；各面板
// 呼叫 `injectOpenCycleHint()` 復用同一份 openCycle 狀態，避免每個面板各自
// 重複打 `/appraisal/cycles`。inject 帶 factory 預設值：面板在單元測試中常被
// 獨立掛載（無 layout 祖先 provide），此時 fallback 建立獨立實例——因為
// panel 本身不主動呼叫 refresh()（只有 layout onMounted 會呼叫），這個獨立
// 實例的 openCycle 永遠是初始值 null，不會意外觸發真實 API 呼叫，也不會讓
// 既有大量面板測試（多半整個 mock 掉 '@/api/appraisal' 且未列出
// listAppraisalCycles）因缺函式而炸掉。
import { ref, provide, inject, type Ref, type InjectionKey } from 'vue'
import { ElMessage } from 'element-plus'
import { listAppraisalCycles } from '@/api/appraisal'

/** 寬鬆型別：只斷言本 composable 實際用到的欄位，其餘欄位（academic_year 等）不強型別化。 */
export interface CycleLike {
  id: number
  status?: string | null
  [key: string]: unknown
}

export interface OpenCycleHint {
  openCycle: Ref<CycleLike | null>
  refresh: () => Promise<void>
  /**
   * 規則儲存成功後呼叫。若目前存在 OPEN 週期，顯示「此變更於下次試算/重算
   * 生效」提示（實際「前往重算」連結由 layout 頂部常駐 banner 提供，訊息
   * 本身為純文字）；否則顯示一般成功訊息（可由呼叫方帶入既有面板既定文案，
   * 未帶入時退回通用「已更新」）。
   */
  notifyRuleChanged: (fallbackMessage?: string) => void
}

export const OPEN_CYCLE_HINT_KEY: InjectionKey<OpenCycleHint> = Symbol('open-cycle-hint')

export function useOpenCycleHint(): OpenCycleHint {
  const openCycle = ref<CycleLike | null>(null)

  async function refresh(): Promise<void> {
    try {
      const res = await listAppraisalCycles()
      const list = ((res?.data ?? []) as CycleLike[])
      openCycle.value = list.find((c) => c.status === 'OPEN') ?? null
    } catch {
      // 常駐 banner 屬 nice-to-have 提示，抓取失敗不應干擾規則設定頁主流程；
      // 靜默回退 null（視同無 OPEN 週期，不誤導使用者去按不存在的重算連結）。
      openCycle.value = null
    }
  }

  function notifyRuleChanged(fallbackMessage = '已更新'): void {
    if (openCycle.value) {
      ElMessage.success('規則已更新。此變更於下次試算/重算生效。')
    } else {
      ElMessage.success(fallbackMessage)
    }
  }

  return { openCycle, refresh, notifyRuleChanged }
}

/** RulesSettingsLayout 呼叫：建立唯一實例並 provide 給子路由面板復用。 */
export function provideOpenCycleHint(): OpenCycleHint {
  const hint = useOpenCycleHint()
  provide(OPEN_CYCLE_HINT_KEY, hint)
  return hint
}

/** 各規則面板呼叫：優先復用 layout provide 的共用實例；無祖先 provide（如面板單獨掛載測試）時 fallback 建立獨立實例。 */
export function injectOpenCycleHint(): OpenCycleHint {
  return inject(OPEN_CYCLE_HINT_KEY, () => useOpenCycleHint(), true)
}
