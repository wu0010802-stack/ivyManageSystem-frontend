import { describe, expect, it } from 'vitest'
import { groupReconciliationItems } from '@/composables/useSemesterReconGroups'
import type { ReconItem } from '@/composables/useSemesterReconGroups'

const mk = (over: Partial<ReconItem> = {}): ReconItem => ({
  id: 1,
  student_name: '生',
  class_name: '玫瑰',
  total_amount: 1000,
  paid_amount: 0,
  owed: 1000,
  pending_review: false,
  pending_amount: 0,
  match_status: 'matched',
  ...over,
})

describe('groupReconciliationItems', () => {
  it('依班級分組並依 zh-Hant locale 排序，計算小計', () => {
    const groups = groupReconciliationItems([
      mk({ id: 1, class_name: '百合', paid_amount: 400, owed: 600 }),
      mk({ id: 2, class_name: '玫瑰' }),
      mk({ id: 3, class_name: '百合' }),
    ])
    // 排序依 localeCompare('zh-Hant') 實際定序結果（非直覺筆畫/拼音序，僅要求穩定）
    const expectedOrder = ['百合', '玫瑰'].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    expect(groups.map((g) => g.label)).toEqual(expectedOrder)
    const lily = groups.find((g) => g.label === '百合')!
    expect(lily.items.length).toBe(2)
    expect(lily.subtotal).toEqual({ total: 2000, paid: 400, owed: 1600, pending: 0 })
  })

  it('待審核/未分班群組置頂', () => {
    const groups = groupReconciliationItems([
      mk({ id: 1, class_name: '玫瑰' }),
      mk({ id: 2, class_name: '', pending_review: true, pending_amount: 1500 }),
    ])
    expect(groups[0].pending).toBe(true)
    expect(groups[0].label).toBe('待審核／未分班')
    expect(groups[0].subtotal.pending).toBe(1500)
  })

  it('有班級但待審核者同樣進置頂群組', () => {
    const groups = groupReconciliationItems([
      mk({ id: 1, class_name: '玫瑰', pending_review: true, pending_amount: 800 }),
    ])
    expect(groups[0].pending).toBe(true)
    expect(groups[0].items[0].class_name).toBe('玫瑰') // 原始 class_name 保留供列上顯示
  })

  it('空陣列回傳空清單', () => {
    expect(groupReconciliationItems([])).toEqual([])
  })

  it('同名班級的多筆報名累加進同一組', () => {
    const groups = groupReconciliationItems([
      mk({ id: 1, class_name: '玫瑰', total_amount: 1000, paid_amount: 1000, owed: 0 }),
      mk({ id: 2, class_name: '玫瑰', total_amount: 2000, paid_amount: 500, owed: 1500 }),
    ])
    expect(groups.length).toBe(1)
    expect(groups[0].subtotal).toEqual({ total: 3000, paid: 1500, owed: 1500, pending: 0 })
  })
})
