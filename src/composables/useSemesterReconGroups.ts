// 學期對帳班級分組（③學期對帳改造，2026-08-16）：純函式，不依賴 Vue 響應式，
// 供 POSSemesterReconciliation.vue 依班級分組渲染逐學生清單。

export interface ReconItem {
  id: number | string
  student_name: string
  class_name: string
  total_amount: number
  paid_amount: number
  owed: number
  pending_review: boolean
  pending_amount: number
  match_status: string
  [key: string]: unknown
}

export interface ReconGroupSubtotal {
  total: number
  paid: number
  owed: number
  pending: number
}

export interface ReconGroup {
  key: string
  label: string
  pending: boolean
  items: ReconItem[]
  subtotal: ReconGroupSubtotal
}

const PENDING_KEY = '__pending__'
const PENDING_LABEL = '待審核／未分班'

/**
 * 依班級分組；「待審核/未分班」（pending_review 為真，或無 class_name）獨立
 * 成一組並排在最前面，避免待審核新生沉在清單底部被忽略。其餘班級依名稱排序。
 */
export function groupReconciliationItems(items: ReconItem[]): ReconGroup[] {
  const map = new Map<string, ReconGroup>()
  for (const item of items) {
    const isPending = item.pending_review || !item.class_name
    const key = isPending ? PENDING_KEY : item.class_name
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        label: isPending ? PENDING_LABEL : item.class_name,
        pending: isPending,
        items: [],
        subtotal: { total: 0, paid: 0, owed: 0, pending: 0 },
      }
      map.set(key, group)
    }
    group.items.push(item)
    group.subtotal.total += item.total_amount || 0
    group.subtotal.paid += item.paid_amount || 0
    group.subtotal.owed += item.owed || 0
    group.subtotal.pending += item.pending_amount || 0
  }
  const groups = [...map.values()]
  groups.sort((a, b) => {
    if (a.pending !== b.pending) return a.pending ? -1 : 1
    return a.label.localeCompare(b.label, 'zh-Hant')
  })
  return groups
}
