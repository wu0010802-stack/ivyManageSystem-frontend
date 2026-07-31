import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PermissionPicker from '../PermissionPicker.vue'
import type { PermissionPickerDefinition } from '../PermissionPicker.vue'
import { NAVIGATION_MANIFEST, derivePickerTree } from '@/constants/navigation'
import type { PickerGroup, PickerPage } from '@/constants/navigation'

// manifest 化改造（2026-07-31）後 picker 渲染 derivePickerTree(NAVIGATION_MANIFEST,
// definition) 的三層樹；definition.groups / split_permissions 不再被使用（dead payload）。
// fixture 對齊後端 get_permissions_definition 的 permissions map 形態；LEGACY_ORPHAN_CODE
// 為 manifest 未收錄的假碼，驗證孤兒碼兜底（不得靜默消失）。
const DEFINITION: PermissionPickerDefinition = {
  permissions: {
    STUDENTS_READ: { value: 'STUDENTS_READ', label: '學生 (檢視)', scope_options: ['own_class', 'all'] },
    STUDENTS_WRITE: { value: 'STUDENTS_WRITE', label: '學生 (編輯)', scope_options: ['own_class', 'all'] },
    PORTFOLIO_READ: { value: 'PORTFOLIO_READ', label: '學習檔案 (檢視)', scope_options: ['own_class', 'all'] },
    ATTENDANCE_READ: { value: 'ATTENDANCE_READ', label: '出勤 (檢視)', scope_options: null },
    ATTENDANCE_WRITE: { value: 'ATTENDANCE_WRITE', label: '出勤 (編輯)', scope_options: null },
    EMPLOYEES_WRITE: { value: 'EMPLOYEES_WRITE', label: '員工 (編輯)', scope_options: null },
    VENDOR_PAYMENT_READ: { value: 'VENDOR_PAYMENT_READ', label: '廠商付款 (檢視)', scope_options: null },
    VENDOR_PAYMENT_WRITE: { value: 'VENDOR_PAYMENT_WRITE', label: '廠商付款 (編輯)', scope_options: null },
    MISC_RECEIPT_READ: { value: 'MISC_RECEIPT_READ', label: '雜項收款 (檢視)', scope_options: null },
    MISC_RECEIPT_WRITE: { value: 'MISC_RECEIPT_WRITE', label: '雜項收款 (編輯)', scope_options: null },
    DASHBOARD: { value: 'DASHBOARD', label: '儀表板', scope_options: null },
    LEGACY_ORPHAN_CODE: { value: 'LEGACY_ORPHAN_CODE', label: '孤兒碼', scope_options: null },
  },
  groups: [],
}

const TREE = derivePickerTree(NAVIGATION_MANIFEST, DEFINITION)
const groupOf = (key: string): PickerGroup => {
  const g = TREE.find((x) => x.key === key)
  if (!g) throw new Error(`missing group ${key}`)
  return g
}
const pageOf = (groupKey: string, pageKey: string): PickerPage => {
  const p = groupOf(groupKey).pages.find((x) => x.key === pageKey)
  if (!p) throw new Error(`missing page ${pageKey}`)
  return p
}

function mountPicker(modelValue: string[]) {
  return mount(PermissionPicker, {
    attachTo: document.body,
    props: { modelValue, definition: DEFINITION },
    global: { plugins: [ElementPlus] },
  })
}

type Vm = {
  toggle: (code: string, checked: boolean) => void
  setScope: (code: string, scope: string) => void
  isChecked: (code: string) => boolean
  currentScope: (code: string) => string | null
  selectAll: () => void
  clearAll: () => void
  groupState: (g: PickerGroup) => { checked: boolean; indeterminate: boolean }
  toggleGroup: (g: PickerGroup, checked: boolean) => void
  togglePageView: (page: PickerPage, code: string, checked: boolean) => void
}
const vmOf = (w: ReturnType<typeof mountPicker>): Vm => w.vm as unknown as Vm
const lastEmit = (w: ReturnType<typeof mountPicker>): string[] => {
  const ev = w.emitted('update:modelValue')
  return (ev?.[ev.length - 1]?.[0] ?? []) as string[]
}

// attachTo: document.body 的 mount 會殘留 DOM；document.querySelector 斷言需以乾淨 body 起手。
beforeEach(() => {
  document.body.innerHTML = ''
})

describe('PermissionPicker（manifest 樹）', () => {
  it('selectAll emits wildcard, clearAll emits empty', () => {
    const w = mountPicker([])
    vmOf(w).selectAll()
    expect(lastEmit(w)).toEqual(['*'])
    vmOf(w).clearAll()
    expect(lastEmit(w)).toEqual([])
  })

  it('toggle on scope-aware code defaults to own_class, never bare', () => {
    const w = mountPicker([])
    vmOf(w).toggle('STUDENTS_READ', true)
    expect(lastEmit(w)).toContain('STUDENTS_READ:own_class')
    expect(lastEmit(w)).not.toContain('STUDENTS_READ')
  })

  it('toggle on non-scope code adds bare key', () => {
    const w = mountPicker([])
    vmOf(w).toggle('DASHBOARD', true)
    expect(lastEmit(w)).toContain('DASHBOARD')
    expect(lastEmit(w).find((k) => k.startsWith('DASHBOARD:'))).toBeUndefined()
  })

  it('toggle unchecking removes bare and scoped forms together (revocation works)', () => {
    const w = mountPicker(['STUDENTS_READ:own_class', 'DASHBOARD'])
    vmOf(w).toggle('STUDENTS_READ', false)
    expect(lastEmit(w)).toEqual(['DASHBOARD'])

    const w2 = mountPicker(['STUDENTS_READ', 'STUDENTS_READ:all'])
    vmOf(w2).toggle('STUDENTS_READ', false)
    expect(lastEmit(w2)).toEqual([])
  })

  it('unchecking a code in wildcard state expands to all bare codes minus that one', () => {
    const w = mountPicker(['*'])
    vmOf(w).toggle('DASHBOARD', false)
    const next = lastEmit(w)
    expect(next).not.toContain('*')
    expect(next).toContain('STUDENTS_READ') // bare = 全園
    expect(next).toContain('ATTENDANCE_READ')
    expect(next).toContain('LEGACY_ORPHAN_CODE')
    expect(next).not.toContain('DASHBOARD')
  })

  it('setScope replaces an existing scoped entry', () => {
    const w = mountPicker(['STUDENTS_READ:own_class'])
    vmOf(w).setScope('STUDENTS_READ', 'all')
    expect(lastEmit(w)).toContain('STUDENTS_READ:all')
    expect(lastEmit(w)).not.toContain('STUDENTS_READ:own_class')
  })

  // 回歸：wildcard 狀態下改 scope 會把 '*' 展開成所有 bare code（bare = 全園），並把目標
  // code 收斂為所選 scope。「去升權」（de-escalation）是 by-design——釘住避免日後被「修正」
  // 成保留 '*'（=維持全權）或往升權方向改。
  it('setScope in wildcard state de-escalates: leaves wildcard, target code → chosen scope, others → bare', () => {
    const w = mountPicker(['*'])
    vmOf(w).setScope('STUDENTS_READ', 'own_class')
    const next = lastEmit(w)
    expect(next).not.toContain('*')
    expect(next).toContain('STUDENTS_READ:own_class')
    expect(next).toContain('DASHBOARD')
    expect(next).toContain('ATTENDANCE_READ')
  })

  it('currentScope: bare scope-aware shows all, scoped shows its scope, wildcard shows all', () => {
    expect(vmOf(mountPicker(['STUDENTS_READ'])).currentScope('STUDENTS_READ')).toBe('all')
    expect(vmOf(mountPicker(['STUDENTS_READ:own_class'])).currentScope('STUDENTS_READ')).toBe('own_class')
    expect(vmOf(mountPicker(['*'])).currentScope('STUDENTS_READ')).toBe('all')
  })

  it('isChecked true for wildcard and for any scoped form', () => {
    expect(vmOf(mountPicker(['*'])).isChecked('DASHBOARD')).toBe(true)
    expect(vmOf(mountPicker(['STUDENTS_READ:all'])).isChecked('STUDENTS_READ')).toBe(true)
    expect(vmOf(mountPicker([])).isChecked('DASHBOARD')).toBe(false)
  })
})

describe('PermissionPicker 群組級聯', () => {
  const students = groupOf('students')

  it('勾群組 → 全部 view 碼落地、scope-aware 碼帶 :own_class、actions 不連動', () => {
    const w = mountPicker([])
    vmOf(w).toggleGroup(students, true)
    const next = lastEmit(w)
    // definition 有 scope_options 的碼
    expect(next).toContain('STUDENTS_READ:own_class')
    expect(next).toContain('PORTFOLIO_READ:own_class')
    // definition 落後（scope_options 缺）但在 SCOPE_AWARE_CODES → fallback 仍落 own_class
    expect(next).toContain('DISMISSAL_CALLS_READ:own_class')
    // 非 scope-aware view → bare
    expect(next).toContain('FEES_READ')
    expect(next).toContain('RECRUITMENT_READ')
    // 高風險 actions 不得一鍵給
    expect(next.some((k) => k.startsWith('STUDENTS_WRITE'))).toBe(false)
    expect(next.some((k) => k.startsWith('PORTFOLIO_PUBLISH'))).toBe(false)
  })

  it('取消群組 → owned 碼（含 scoped 形態與 actions）清空，群組外碼保留', () => {
    const w = mountPicker(['STUDENTS_READ:all', 'STUDENTS_WRITE:own_class', 'FEES_READ', 'DASHBOARD'])
    vmOf(w).toggleGroup(students, false)
    expect(lastEmit(w)).toEqual(['DASHBOARD'])
  })

  it('groupState：部分 view → indeterminate；只勾 action → indeterminate；全 view → checked', () => {
    expect(vmOf(mountPicker(['STUDENTS_READ:own_class'])).groupState(students)).toEqual({
      checked: false,
      indeterminate: true,
    })
    expect(vmOf(mountPicker(['STUDENTS_WRITE:own_class'])).groupState(students)).toEqual({
      checked: false,
      indeterminate: true,
    })
    const allViews = students.viewCodes.map((c) => c)
    expect(vmOf(mountPicker(allViews)).groupState(students).checked).toBe(true)
    expect(vmOf(mountPicker([])).groupState(students)).toEqual({ checked: false, indeterminate: false })
  })

  it('wildcard 狀態群組顯示 checked', () => {
    expect(vmOf(mountPicker(['*'])).groupState(students)).toEqual({ checked: true, indeterminate: false })
  })
})

describe('PermissionPicker 頁面檢視連動 actions', () => {
  const financeSignoffs = pageOf('admin', 'financeSignoffs')

  it('取消 view → 依附（requiresView）該 view 的 action 連動移除，他 view 的 action 保留', () => {
    const w = mountPicker(['VENDOR_PAYMENT_READ', 'VENDOR_PAYMENT_WRITE', 'MISC_RECEIPT_READ', 'MISC_RECEIPT_WRITE'])
    vmOf(w).togglePageView(financeSignoffs, 'VENDOR_PAYMENT_READ', false)
    expect(lastEmit(w)).toEqual(['MISC_RECEIPT_READ', 'MISC_RECEIPT_WRITE'])
  })

  it('取消單檢視頁的 view → 未帶 requiresView 的 actions 全部連動移除', () => {
    const studentsMain = pageOf('students', 'studentsMain')
    const w = mountPicker(['STUDENTS_READ:own_class', 'STUDENTS_WRITE:own_class', 'GUARDIANS_READ', 'DASHBOARD'])
    vmOf(w).togglePageView(studentsMain, 'STUDENTS_READ', false)
    expect(lastEmit(w)).toEqual(['DASHBOARD'])
  })

  it('操作區 disable：view 未勾 → is-disabled + checkbox disabled；勾了解除', () => {
    mountPicker([])
    const disabledZone = document.querySelector('[data-perm-page="studentsMain"] .perm-actions.is-disabled')
    expect(disabledZone).not.toBeNull()
    const input = document.querySelector<HTMLInputElement>('[data-perm-action="STUDENTS_WRITE"] input')
    expect(input?.disabled).toBe(true)
    document.body.innerHTML = ''

    mountPicker(['STUDENTS_READ:own_class'])
    expect(document.querySelector('[data-perm-page="studentsMain"] .perm-actions.is-disabled')).toBeNull()
    const input2 = document.querySelector<HTMLInputElement>('[data-perm-action="STUDENTS_WRITE"] input')
    expect(input2?.disabled).toBe(false)
  })

  it('requiresView action 的 disable 跟隨指定 view（不看同頁他 view）', () => {
    mountPicker(['VENDOR_PAYMENT_READ'])
    const vendorWrite = document.querySelector<HTMLInputElement>('[data-perm-action="VENDOR_PAYMENT_WRITE"] input')
    const miscWrite = document.querySelector<HTMLInputElement>('[data-perm-action="MISC_RECEIPT_WRITE"] input')
    expect(vendorWrite?.disabled).toBe(false)
    expect(miscWrite?.disabled).toBe(true)
  })

  it('views 為空的 actions-only 節點（教師端預覽）永不 disable', () => {
    mountPicker([])
    const input = document.querySelector<HTMLInputElement>('[data-perm-action="PORTAL_PREVIEW"] input')
    expect(input?.disabled).toBe(false)
  })
})

describe('PermissionPicker 渲染', () => {
  it('孤兒碼與 standalone 碼出現在「其他權限（未分類）」尾端群組', () => {
    const w = mountPicker([])
    const tail = w.find('[data-perm-group="uncategorized"]')
    expect(tail.exists()).toBe(true)
    expect(tail.text()).toContain('孤兒碼') // 後端有、manifest 沒有 → 不得靜默消失
    expect(tail.text()).toContain('經營分析（已停用）') // standalonePermissions（BUSINESS_ANALYTICS）
    // 未分類群組顯示各碼 label 而非「檢視」
    expect(w.find('[data-perm-view="LEGACY_ORPHAN_CODE"]').text()).toContain('孤兒碼')
  })

  it('sharedViews 借道頁以灰字「同時開通」呈現在主屬頁', () => {
    const w = mountPicker([])
    const hint = w.find('[data-perm-page="studentsMain"] .perm-shared-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('統計圖表')
  })

  it('多檢視頁顯示各 view label；單檢視頁顯示「檢視」', () => {
    const w = mountPicker([])
    expect(w.find('[data-perm-view="VENDOR_PAYMENT_READ"]').text()).toContain('廠商付款 (檢視)')
    expect(w.find('[data-perm-view="FEES_READ"]').text()).toContain('檢視')
  })

  it('scope radio row renders for checked scope-aware code, not for non-scope code', () => {
    mountPicker(['STUDENTS_READ:own_class', 'DASHBOARD'])
    expect(document.querySelector('[data-perm-scope="STUDENTS_READ"]')).not.toBeNull()
    expect(document.querySelector('[data-perm-scope="DASHBOARD"]')).toBeNull()
    document.body.innerHTML = ''
    mountPicker(['ATTENDANCE_READ'])
    expect(document.querySelector('[data-perm-scope="ATTENDANCE_READ"]')).toBeNull()
    expect(document.querySelector('[data-perm-scope="STUDENTS_READ"]')).toBeNull()
  })

  it('scope radio switches own_class → all via DOM', async () => {
    const w = mountPicker(['STUDENTS_READ:own_class'])
    const row = w.find('[data-perm-scope="STUDENTS_READ"]')
    expect(row.exists()).toBe(true)
    const radios = row.findAll('input[type="radio"]')
    expect(radios.length).toBe(2)
    await radios[1].setValue() // scope_options 順序 ['own_class', 'all'] → 第二顆 = 全園
    expect(lastEmit(w)).toContain('STUDENTS_READ:all')
    expect(lastEmit(w)).not.toContain('STUDENTS_READ:own_class')
  })

  it('modelValue round-trip：餵扁平陣列渲染正確、操作後輸出仍是合法扁平陣列', () => {
    const w = mountPicker(['STUDENTS_READ:own_class', 'EMPLOYEES_WRITE'])
    const vm = vmOf(w)
    expect(vm.isChecked('STUDENTS_READ')).toBe(true)
    expect(vm.currentScope('STUDENTS_READ')).toBe('own_class')
    expect(vm.isChecked('EMPLOYEES_WRITE')).toBe(true)
    vm.toggle('DASHBOARD', true)
    const next = lastEmit(w)
    expect(next).toEqual(expect.arrayContaining(['STUDENTS_READ:own_class', 'EMPLOYEES_WRITE', 'DASHBOARD']))
    expect(next).toHaveLength(3)
    for (const key of next) {
      expect(key).toMatch(/^[A-Z][A-Z0-9_]*(:(own_class|all))?$/)
    }
  })
})

// 折疊 / 搜尋為顯示層狀態：只影響「渲染哪些節點」，勾選運算一律吃完整樹
//（groupState 拿原始 group、togglePageView 拿原始 page），故本區同時釘住
// 「折疊/過濾中半選與連動語意不變」。
// el-input 為 inheritAttrs:false，fallthrough 的 data-* 直接落在內層 <input> 上。
const typeSearch = async (w: ReturnType<typeof mountPicker>, text: string) => {
  await w.find('input[data-perm-search]').setValue(text)
}

describe('PermissionPicker 折疊', () => {
  it('預設全展開：群組與頁面 chevron 皆 aria-expanded=true，子項可見', () => {
    const w = mountPicker([])
    expect(w.find('[data-perm-toggle="students"]').attributes('aria-expanded')).toBe('true')
    expect(w.find('[data-perm-toggle="studentsMain"]').attributes('aria-expanded')).toBe('true')
    expect(w.find('[data-perm-page="studentsMain"]').exists()).toBe(true)
    expect(w.find('[data-perm-action="STUDENTS_WRITE"]').exists()).toBe(true)
  })

  it('折疊群組隱藏底下頁面，再點回復', async () => {
    const w = mountPicker([])
    await w.find('[data-perm-toggle="students"]').trigger('click')
    expect(w.find('[data-perm-toggle="students"]').attributes('aria-expanded')).toBe('false')
    expect(w.find('[data-perm-page="studentsMain"]').exists()).toBe(false)
    // 其他群組不受影響
    expect(w.find('[data-perm-page="employees"]').exists()).toBe(true)

    await w.find('[data-perm-toggle="students"]').trigger('click')
    expect(w.find('[data-perm-page="studentsMain"]').exists()).toBe(true)
  })

  it('折疊頁面只隱藏操作，檢視 checkbox 仍在', async () => {
    const w = mountPicker([])
    await w.find('[data-perm-toggle="studentsMain"]').trigger('click')
    expect(w.find('[data-perm-action="STUDENTS_WRITE"]').exists()).toBe(false)
    expect(w.find('[data-perm-view="STUDENTS_READ"]').exists()).toBe(true)
    // 同群組其他頁的操作不受影響
    expect(w.find('[data-perm-action="CLASSROOMS_WRITE"]').exists()).toBe(true)
  })

  it('折疊時群組 checkbox 的半選（indeterminate）狀態照常顯示', async () => {
    const w = mountPicker(['STUDENTS_READ:own_class'])
    const group = () => w.find('[data-perm-group="students"]')
    expect(group().find('.el-checkbox__input.is-indeterminate').exists()).toBe(true)
    await w.find('[data-perm-toggle="students"]').trigger('click')
    expect(group().find('[data-perm-page="studentsMain"]').exists()).toBe(false)
    expect(group().find('.el-checkbox__input.is-indeterminate').exists()).toBe(true)
    expect(vmOf(w).groupState(groupOf('students'))).toEqual({ checked: false, indeterminate: true })
  })

  it('沒有 actions 的頁面不顯示 chevron（葉節點頁）', () => {
    const w = mountPicker([])
    expect(w.find('[data-perm-page="dashboard"]').exists()).toBe(true)
    expect(w.find('[data-perm-toggle="dashboard"]').exists()).toBe(false)
    expect(w.find('[data-perm-toggle="topLevel"]').exists()).toBe(true) // 群組本身仍可折疊
  })
})

describe('PermissionPicker 搜尋', () => {
  it('以標題搜尋：命中群組整棵子樹保留，其餘群組隱藏', async () => {
    const w = mountPicker([])
    await typeSearch(w, '學生')
    expect(w.find('[data-perm-group="students"]').exists()).toBe(true)
    expect(w.find('[data-perm-view="STUDENTS_READ"]').exists()).toBe(true)
    expect(w.find('[data-perm-group="leave"]').exists()).toBe(false)
    expect(w.find('[data-perm-group="settings"]').exists()).toBe(false)
  })

  it('以權限碼搜尋（大小寫不敏感）：只留命中節點與其祖先', async () => {
    const w = mountPicker([])
    await typeSearch(w, 'vendor_payment')
    expect(w.find('[data-perm-group="admin"]').exists()).toBe(true)
    expect(w.find('[data-perm-page="financeSignoffs"]').exists()).toBe(true)
    expect(w.find('[data-perm-view="VENDOR_PAYMENT_READ"]').exists()).toBe(true)
    expect(w.find('[data-perm-action="VENDOR_PAYMENT_WRITE"]').exists()).toBe(true)
    // 同頁未命中的碼、同群組未命中的頁一併隱藏
    expect(w.find('[data-perm-view="MISC_RECEIPT_READ"]').exists()).toBe(false)
    expect(w.find('[data-perm-page="announcements"]').exists()).toBe(false)
  })

  it('搜尋不改變勾選連動語意：過濾中取消 view 仍以完整頁面計算連動', async () => {
    const w = mountPicker([
      'VENDOR_PAYMENT_READ',
      'VENDOR_PAYMENT_WRITE',
      'MISC_RECEIPT_READ',
      'MISC_RECEIPT_WRITE',
    ])
    await typeSearch(w, 'vendor_payment')
    await w.find('[data-perm-view="VENDOR_PAYMENT_READ"] input').setValue(false)
    expect(lastEmit(w)).toEqual(['MISC_RECEIPT_READ', 'MISC_RECEIPT_WRITE'])
  })

  it('搜尋強制展開已折疊分支，清空後恢復原本折疊狀態', async () => {
    const w = mountPicker([])
    await w.find('[data-perm-toggle="students"]').trigger('click')
    await w.find('[data-perm-toggle="employees"]').trigger('click')
    expect(w.find('[data-perm-page="studentsMain"]').exists()).toBe(false)

    await typeSearch(w, '學生')
    expect(w.find('[data-perm-page="studentsMain"]').exists()).toBe(true)
    expect(w.find('[data-perm-toggle="students"]').attributes('aria-expanded')).toBe('true')

    await typeSearch(w, '')
    expect(w.find('[data-perm-page="studentsMain"]').exists()).toBe(false)
    expect(w.find('[data-perm-toggle="students"]').attributes('aria-expanded')).toBe('false')
    // 頁面層的折疊狀態同樣保留
    expect(w.find('[data-perm-action="EMPLOYEES_WRITE"]').exists()).toBe(false)
  })

  it('全部不符合時顯示空狀態，清空搜尋後回復整棵樹', async () => {
    const w = mountPicker([])
    await typeSearch(w, 'zzz-no-such-permission')
    expect(w.find('[data-perm-empty]').exists()).toBe(true)
    expect(w.find('[data-perm-group="students"]').exists()).toBe(false)

    await typeSearch(w, '')
    expect(w.find('[data-perm-empty]').exists()).toBe(false)
    expect(w.find('[data-perm-group="students"]').exists()).toBe(true)
  })
})
