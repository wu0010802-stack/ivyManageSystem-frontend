/**
 * 首頁「常用功能」三格：家長各自在自己手機上編輯，存 DB
 * （GET/PUT /parent/quick-actions，見 api/quickActions.ts）。
 *
 * 2026-08-16 首頁改版（quickact01）。設計走了一圈：一開始是家長端本機
 * localStorage → 業主一度改裁定「園所後台統一配置」→ 業主同一次對話後段
 * 明確 reset 回最初方向，改成本檔這版：家長各自編輯、存 DB，不是租戶層級
 * 統一設定。swap()/resetToDefault() 都是「先本地樂觀更新 → PUT 失敗就回滾」，
 * 呼叫端（QuickActionsBar）負責失敗時的 toast 提示。
 */
import { ref, type Ref } from 'vue'
import { getQuickActions, updateQuickActions } from '../api/quickActions'
import {
  DEFAULT_SLOTS,
  QUICK_ACTION_CATALOG,
  resolveQuickActionSlots,
  type QuickActionModule,
} from '../utils/quickActionModules'

export { QUICK_ACTION_CATALOG }

export interface UseQuickActionSlots {
  slots: Ref<string[]>
  loading: Ref<boolean>
  isDefault: Ref<boolean>
  load: () => Promise<void>
  availableModules: () => QuickActionModule[]
  swap: (slotIndex: number, moduleKey: string) => Promise<void>
  resetToDefault: () => Promise<void>
}

export function useQuickActionSlots(): UseQuickActionSlots {
  const slots = ref<string[]>(DEFAULT_SLOTS.slice())
  const loading = ref(false)
  const isDefault = ref(true)

  async function load(): Promise<void> {
    loading.value = true
    try {
      const res = await getQuickActions()
      const data = res.data as { slots?: unknown; is_default?: boolean }
      slots.value = resolveQuickActionSlots(data.slots)
      isDefault.value = data.is_default !== false
    } catch {
      // 讀取失敗降級成預設三格，不擋首頁其他區塊
      slots.value = DEFAULT_SLOTS.slice()
      isDefault.value = true
    } finally {
      loading.value = false
    }
  }

  function availableModules() {
    return Object.values(QUICK_ACTION_CATALOG).filter((m) => !slots.value.includes(m.key))
  }

  async function persist(next: string[]): Promise<void> {
    const prev = slots.value
    slots.value = next // 樂觀更新：先讓 UI 立刻反映
    try {
      await updateQuickActions({ slots: next })
      isDefault.value = false
    } catch (err) {
      slots.value = prev // PUT 失敗回滾
      throw err
    }
  }

  async function swap(slotIndex: number, moduleKey: string): Promise<void> {
    if (slotIndex < 0 || slotIndex > 2) return
    if (!(moduleKey in QUICK_ACTION_CATALOG)) return
    if (slots.value.includes(moduleKey)) return // 已在其他格，不允許重複
    const next = slots.value.slice()
    next[slotIndex] = moduleKey
    await persist(next)
  }

  async function resetToDefault(): Promise<void> {
    await persist(DEFAULT_SLOTS.slice())
  }

  return { slots, loading, isDefault, load, availableModules, swap, resetToDefault }
}
