import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

/**
 * 通用表單 dirty 快照（spec 2026-09-06 §3.2）。
 *
 * - `snapshot()`：於 dialog 開啟／載入初值後呼叫，拍下目前值。
 * - `isDirty`：目前值與快照的 JSON 比對；透過 `toValue` 支援 reactive 物件、ref 或 getter，
 *   所以 `form.value = {...}` 整包重指派（openEdit 慣例）也能追蹤。
 * - 與 `useFormDraft` 不同：這裡只判斷，不持久化；與 `useEmployeeFormDirty` 不同：不分欄位群、不回傳 diff。
 *
 * 首次呼叫即拍一次快照，讓「開啟後沒動」為 clean。
 */
export function useFormDirty<T extends object>(
  state: MaybeRefOrGetter<T>,
  opts: { exclude?: string[] } = {},
): { isDirty: ComputedRef<boolean>; snapshot: () => void } {
  const exclude = new Set(opts.exclude ?? [])

  const serialize = (): string => {
    const src = toValue(state) as Record<string, unknown>
    const picked: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(src)) {
      if (!exclude.has(k)) picked[k] = v
    }
    return JSON.stringify(picked)
  }

  const baseline = ref(serialize())
  const snapshot = (): void => { baseline.value = serialize() }
  const isDirty = computed(() => serialize() !== baseline.value)

  return { isDirty, snapshot }
}
