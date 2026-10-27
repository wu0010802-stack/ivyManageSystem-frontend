// 薪資設定的「未儲存變更」登記表。
// 殼層 SalarySettingsView 的外層頁籤以 v-if 掛載面板，切走就卸載、改到一半的值直接消失；
// 各面板（含 BonusConfigPanel 內層頁籤的子元件）把自己的 dirty getter 登記上來，
// 殼層在切換頁籤與離開路由前一次問完，提示裡列出是哪幾塊沒存。
import { inject, onScopeDispose, provide, type InjectionKey } from 'vue'

interface Entry {
  label: string
  isDirty: () => boolean
}

interface Registry {
  register: (entry: Entry) => () => void
}

const KEY: InjectionKey<Registry> = Symbol('salarySettingsDirty')

export function provideSettingsDirty(): { dirtyLabels: () => string[] } {
  const entries = new Set<Entry>()
  provide(KEY, {
    register(entry) {
      entries.add(entry)
      return () => entries.delete(entry)
    },
  })
  return {
    dirtyLabels: () => [...entries].filter((e) => e.isDirty()).map((e) => e.label),
  }
}

/** 面板在 setup 內呼叫；卸載時自動解除登記。沒有殼層（單獨掛載、測試）時什麼都不做。 */
export function useSettingsDirty(label: string, isDirty: () => boolean): void {
  const registry = inject(KEY, null)
  if (!registry) return
  const unregister = registry.register({ label, isDirty })
  onScopeDispose(unregister)
}
