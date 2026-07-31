import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePermissionSelection } from '../usePermissionSelection'
import type { SelectionGroup, SelectionPage } from '../usePermissionSelection'

// 純狀態運算單元測試（前端架構詳設 §4.2 七條行為決策）。
// fixture 用抽象碼名，與 manifest 解耦；emitUpdate 寫回 model 模擬 v-model round-trip。
const SCOPE_OPTIONS: Record<string, string[]> = {
  S_READ: ['own_class', 'all'],
  S_WRITE: ['own_class', 'all'],
}
const ALL_CODES = ['S_READ', 'S_WRITE', 'P_READ', 'A_READ', 'A_WRITE', 'B_READ', 'B_WRITE', 'X_ACT']

const GROUP: SelectionGroup = {
  viewCodes: ['S_READ', 'P_READ'],
  ownedCodes: ['S_READ', 'P_READ', 'S_WRITE', 'X_ACT'],
}
// 多檢視頁：A_WRITE/B_WRITE 各自依附指定 view，X_ACT 未帶 requiresView（依附全部 views）。
const PAGE_MULTI: SelectionPage = {
  views: [{ code: 'A_READ' }, { code: 'B_READ' }],
  actions: [
    { code: 'A_WRITE', requiresView: 'A_READ' },
    { code: 'B_WRITE', requiresView: 'B_READ' },
    { code: 'X_ACT' },
  ],
}
const PAGE_SINGLE: SelectionPage = {
  views: [{ code: 'S_READ' }],
  actions: [{ code: 'S_WRITE' }],
}
const PAGE_ACTIONS_ONLY: SelectionPage = { views: [], actions: [{ code: 'X_ACT' }] }

function setup(initial: string[]) {
  const model = ref<string[]>(initial)
  const emitted: string[][] = []
  const api = usePermissionSelection(
    model,
    (next) => {
      emitted.push(next)
      model.value = next
    },
    (code) => SCOPE_OPTIONS[code] ?? [],
    () => ALL_CODES,
  )
  const last = () => emitted[emitted.length - 1]
  return { model, emitted, last, ...api }
}

describe('usePermissionSelection：toggle / setScope / wildcard（沿用既有語意）', () => {
  it('toggle 勾選 scope-aware 碼預設 own_class、非 scope 碼為 bare', () => {
    const s = setup([])
    s.toggle('S_READ', true)
    expect(s.last()).toEqual(['S_READ:own_class'])
    s.toggle('P_READ', true)
    expect(s.last()).toEqual(['S_READ:own_class', 'P_READ'])
  })

  it('toggle 取消清掉 bare 與 scoped 全部形態', () => {
    const s = setup(['S_READ', 'S_READ:all', 'P_READ'])
    s.toggle('S_READ', false)
    expect(s.last()).toEqual(['P_READ'])
  })

  it('wildcard：isChecked 全 true、currentScope 顯示 all', () => {
    const s = setup(['*'])
    expect(s.isWildcard.value).toBe(true)
    expect(s.isChecked('X_ACT')).toBe(true)
    expect(s.currentScope('S_READ')).toBe('all')
  })

  it('wildcard 下 toggle 取消 → 先展開為全 bare 碼（去升權）再移除目標', () => {
    const s = setup(['*'])
    s.toggle('S_READ', false)
    const next = s.last()
    expect(next).not.toContain('*')
    expect(next).not.toContain('S_READ')
    expect(next).toContain('P_READ')
    expect(next).toContain('X_ACT')
  })

  it('setScope 置換既有 scoped entry；wildcard 下 setScope 去升權展開', () => {
    const s = setup(['S_READ:own_class'])
    s.setScope('S_READ', 'all')
    expect(s.last()).toEqual(['S_READ:all'])

    const w = setup(['*'])
    w.setScope('S_READ', 'own_class')
    const next = w.last()
    expect(next).not.toContain('*')
    expect(next).toContain('S_READ:own_class')
    expect(next).toContain('P_READ')
  })

  it('currentScope：bare scope-aware → all、scoped → 該 scope、未勾 → null', () => {
    expect(setup(['S_READ']).currentScope('S_READ')).toBe('all')
    expect(setup(['S_READ:own_class']).currentScope('S_READ')).toBe('own_class')
    expect(setup([]).currentScope('S_READ')).toBeNull()
  })
})

describe('usePermissionSelection：groupState', () => {
  it('全部 view 碼已勾（不論 scope 形態）→ checked', () => {
    const s = setup(['S_READ:own_class', 'P_READ'])
    expect(s.groupState(GROUP)).toEqual({ checked: true, indeterminate: false })
  })

  it('只勾部分 view → indeterminate', () => {
    const s = setup(['S_READ:all'])
    expect(s.groupState(GROUP)).toEqual({ checked: false, indeterminate: true })
  })

  it('只勾 action（無任何 view）→ indeterminate', () => {
    const s = setup(['S_WRITE:own_class'])
    expect(s.groupState(GROUP)).toEqual({ checked: false, indeterminate: true })
  })

  it('全未勾 → unchecked 且非 indeterminate', () => {
    const s = setup([])
    expect(s.groupState(GROUP)).toEqual({ checked: false, indeterminate: false })
  })
})

describe('usePermissionSelection：toggleGroup', () => {
  it('勾群組只級聯 views（scope-aware 落 own_class），不連動 actions', () => {
    const s = setup([])
    s.toggleGroup(GROUP, true)
    expect(s.last()).toEqual(['S_READ:own_class', 'P_READ'])
    expect(s.last()).not.toContain('S_WRITE')
    expect(s.last()).not.toContain('X_ACT')
  })

  it('勾群組保持已勾碼原樣（已選 all 的 scope 不被降回 own_class）', () => {
    const s = setup(['S_READ:all'])
    s.toggleGroup(GROUP, true)
    expect(s.last()).toEqual(['S_READ:all', 'P_READ'])
  })

  it('取消群組清掉全部 owned 碼（含 scoped 形態），不動群組外碼', () => {
    const s = setup(['S_READ:all', 'S_WRITE:own_class', 'P_READ', 'X_ACT', 'A_READ'])
    s.toggleGroup(GROUP, false)
    expect(s.last()).toEqual(['A_READ'])
  })

  it('wildcard 下取消群組 → 展開為 bare 後清群組碼，其餘保留', () => {
    const s = setup(['*'])
    s.toggleGroup(GROUP, false)
    const next = s.last()
    expect(next).not.toContain('*')
    for (const code of GROUP.ownedCodes) expect(next).not.toContain(code)
    expect(next).toContain('A_READ')
    expect(next).toContain('B_WRITE')
  })
})

describe('usePermissionSelection：togglePageView（取消檢視連動 actions）', () => {
  it('勾選 view 委派 toggle（scope-aware 預設 own_class）', () => {
    const s = setup([])
    s.togglePageView(PAGE_SINGLE, 'S_READ', true)
    expect(s.last()).toEqual(['S_READ:own_class'])
  })

  it('取消單一 view：requiresView 依附的 action 跟隨移除；他 view 的 action 保留', () => {
    const s = setup(['A_READ', 'A_WRITE', 'B_READ', 'B_WRITE', 'X_ACT'])
    s.togglePageView(PAGE_MULTI, 'A_READ', false)
    // A_READ + 依附它的 A_WRITE 移除；B_READ 仍勾 → B_WRITE 與未帶 requiresView 的 X_ACT 保留
    expect(s.last()).toEqual(['B_READ', 'B_WRITE', 'X_ACT'])
  })

  it('取消最後一個 view：未帶 requiresView 的 action 一併移除', () => {
    const s = setup(['B_READ', 'B_WRITE', 'X_ACT'])
    s.togglePageView(PAGE_MULTI, 'B_READ', false)
    expect(s.last()).toEqual([])
  })

  it('取消單檢視頁的 view：全部 actions（含 scoped 形態）移除', () => {
    const s = setup(['S_READ:own_class', 'S_WRITE:all', 'P_READ'])
    s.togglePageView(PAGE_SINGLE, 'S_READ', false)
    expect(s.last()).toEqual(['P_READ'])
  })

  it('wildcard 下取消 view → 展開後連動移除依附 action', () => {
    const s = setup(['*'])
    s.togglePageView(PAGE_MULTI, 'A_READ', false)
    const next = s.last()
    expect(next).not.toContain('*')
    expect(next).not.toContain('A_READ')
    expect(next).not.toContain('A_WRITE')
    expect(next).toContain('B_READ')
    expect(next).toContain('X_ACT') // B_READ 仍在 → 未帶 requiresView 的 action 保留
  })
})

describe('usePermissionSelection：actionsDisabled', () => {
  it('頁面全部 views 未勾 → 整區 disable；任一 view 勾了解除', () => {
    expect(setup([]).actionsDisabled(PAGE_SINGLE)).toBe(true)
    expect(setup(['S_READ:own_class']).actionsDisabled(PAGE_SINGLE)).toBe(false)
  })

  it('帶 requiresView 的 action 跟隨指定 view，不看其他 view', () => {
    const s = setup(['A_READ'])
    expect(s.actionsDisabled(PAGE_MULTI, { code: 'A_WRITE', requiresView: 'A_READ' })).toBe(false)
    expect(s.actionsDisabled(PAGE_MULTI, { code: 'B_WRITE', requiresView: 'B_READ' })).toBe(true)
    // 未帶 requiresView：任一 view 已勾即可
    expect(s.actionsDisabled(PAGE_MULTI, { code: 'X_ACT' })).toBe(false)
  })

  it('views 為空的 actions-only 節點永不 disable', () => {
    expect(setup([]).actionsDisabled(PAGE_ACTIONS_ONLY)).toBe(false)
    expect(setup([]).actionsDisabled(PAGE_ACTIONS_ONLY, { code: 'X_ACT' })).toBe(false)
  })
})

describe('usePermissionSelection：selectAll / clearAll', () => {
  it('selectAll emit wildcard、clearAll emit 空陣列', () => {
    const s = setup(['S_READ'])
    s.selectAll()
    expect(s.last()).toEqual(['*'])
    s.clearAll()
    expect(s.last()).toEqual([])
  })
})
