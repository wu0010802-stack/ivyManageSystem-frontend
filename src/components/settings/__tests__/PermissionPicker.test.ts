import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PermissionPicker from '../PermissionPicker.vue'

// fixture 對齊 production 契約（後端 get_permissions_definition）：
// SPLIT_MODULES 的碼（STUDENTS_READ/WRITE、ATTENDANCE_READ/WRITE…）只出現在
// split_permissions、不在 group.permissions；非 split 的 scope-aware 碼
// （PORTFOLIO_READ 等）才走 group.permissions 一般列。
const DEFINITION = {
  permissions: {
    STUDENTS_READ: { value: 'STUDENTS_READ', label: '學生 (檢視)', scope_options: ['own_class', 'all'] },
    STUDENTS_WRITE: { value: 'STUDENTS_WRITE', label: '學生 (編輯)', scope_options: ['own_class', 'all'] },
    PORTFOLIO_READ: { value: 'PORTFOLIO_READ', label: '學習檔案 (檢視)', scope_options: ['own_class', 'all'] },
    ATTENDANCE_READ: { value: 'ATTENDANCE_READ', label: '出勤 (檢視)', scope_options: null },
    ATTENDANCE_WRITE: { value: 'ATTENDANCE_WRITE', label: '出勤 (編輯)', scope_options: null },
    DASHBOARD: { value: 'DASHBOARD', label: '儀表板', scope_options: null },
  },
  groups: [
    {
      name: '學生',
      permissions: ['PORTFOLIO_READ'],
      split_permissions: [{ module: '學生', read: 'STUDENTS_READ', write: 'STUDENTS_WRITE' }],
    },
    {
      name: '出勤',
      permissions: [],
      split_permissions: [{ module: '出勤', read: 'ATTENDANCE_READ', write: 'ATTENDANCE_WRITE' }],
    },
    { name: '一般', permissions: ['DASHBOARD'], split_permissions: [] },
  ],
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
  toggleSplit: (perm: string, checked: boolean) => void
  isChecked: (code: string) => boolean
  isSplitChecked: (perm: string) => boolean
  currentScope: (code: string) => string | null
  selectAll: () => void
  clearAll: () => void
}
const lastEmit = (w: ReturnType<typeof mountPicker>): string[] => {
  const ev = w.emitted('update:modelValue')
  return (ev?.[ev.length - 1]?.[0] ?? []) as string[]
}

describe('PermissionPicker', () => {
  it('selectAll emits wildcard, clearAll emits empty', () => {
    const w = mountPicker([])
    ;(w.vm as unknown as Vm).selectAll()
    expect(lastEmit(w)).toEqual(['*'])
    ;(w.vm as unknown as Vm).clearAll()
    expect(lastEmit(w)).toEqual([])
  })

  it('toggle on scope-aware code defaults to own_class', () => {
    const w = mountPicker([])
    ;(w.vm as unknown as Vm).toggle('STUDENTS_READ', true)
    expect(lastEmit(w)).toContain('STUDENTS_READ:own_class')
  })

  it('toggle on non-scope code adds bare key', () => {
    const w = mountPicker([])
    ;(w.vm as unknown as Vm).toggle('DASHBOARD', true)
    expect(lastEmit(w)).toContain('DASHBOARD')
    expect(lastEmit(w).find((k) => k.startsWith('DASHBOARD:'))).toBeUndefined()
  })

  it('unchecking a code in wildcard state expands to all bare codes minus that one', () => {
    const w = mountPicker(['*'])
    ;(w.vm as unknown as Vm).toggle('DASHBOARD', false)
    const next = lastEmit(w)
    expect(next).not.toContain('*')
    expect(next).toContain('STUDENTS_READ')   // bare = 全園
    expect(next).toContain('ATTENDANCE_READ')
    expect(next).not.toContain('DASHBOARD')
  })

  it('setScope replaces an existing scoped entry', () => {
    const w = mountPicker(['STUDENTS_READ:own_class'])
    ;(w.vm as unknown as Vm).setScope('STUDENTS_READ', 'all')
    expect(lastEmit(w)).toContain('STUDENTS_READ:all')
    expect(lastEmit(w)).not.toContain('STUDENTS_READ:own_class')
  })

  // 回歸：wildcard 狀態下改某 scope-aware 權限的 scope，會把 '*' 展開成所有 bare code
  // （bare = 全園），並把目標 code 收斂為所選 scope。這是「去升權」（de-escalation）的
  // by-design 行為——釘成回歸測試，避免日後有人「修正」成保留 '*'（=維持全權）或往升權方向改。
  it('setScope in wildcard state de-escalates: leaves wildcard, target code → chosen scope, others → bare', () => {
    const w = mountPicker(['*'])
    ;(w.vm as unknown as Vm).setScope('STUDENTS_READ', 'own_class')
    const next = lastEmit(w)
    expect(next).not.toContain('*')                    // 離開 wildcard
    expect(next).toContain('STUDENTS_READ:own_class')  // 目標 code 收斂為 own_class
    expect(next).toContain('DASHBOARD')                // 其餘展開為 bare（= 全園）
    expect(next).toContain('ATTENDANCE_READ')
  })

  it('currentScope: bare scope-aware shows all, scoped shows its scope, wildcard shows all', () => {
    expect((mountPicker(['STUDENTS_READ']).vm as unknown as Vm).currentScope('STUDENTS_READ')).toBe('all')
    expect((mountPicker(['STUDENTS_READ:own_class']).vm as unknown as Vm).currentScope('STUDENTS_READ')).toBe('own_class')
    expect((mountPicker(['*']).vm as unknown as Vm).currentScope('STUDENTS_READ')).toBe('all')
  })

  it('isChecked true for wildcard and for any scoped form', () => {
    expect((mountPicker(['*']).vm as unknown as Vm).isChecked('DASHBOARD')).toBe(true)
    expect((mountPicker(['STUDENTS_READ:all']).vm as unknown as Vm).isChecked('STUDENTS_READ')).toBe(true)
    expect((mountPicker([]).vm as unknown as Vm).isChecked('DASHBOARD')).toBe(false)
  })

  it('scope radio row does not render for non-scope permission', () => {
    mountPicker(['DASHBOARD'])
    expect(document.querySelector('[data-perm-scope="DASHBOARD"]')).toBeNull()
  })
})

// P1 回歸（qa-loop 2026-07-21）：split-row 對 scope-aware 碼（STUDENTS_*/DISMISSAL_CALLS_*）
// 曾完全 scope-blind——scoped token 顯示未勾選、勾選 push bare（後端 _normalize_permissions
// 轉 :all → 自班靜默升全園）、撤權移不掉 scoped token。以下釘住 scope-aware 行為。
describe('PermissionPicker split-row scope-aware', () => {
  it('isSplitChecked recognizes scoped tokens (:own_class / :all) as checked', () => {
    expect((mountPicker(['STUDENTS_READ:own_class']).vm as unknown as Vm).isSplitChecked('STUDENTS_READ')).toBe(true)
    expect((mountPicker(['STUDENTS_READ:all']).vm as unknown as Vm).isSplitChecked('STUDENTS_READ')).toBe(true)
    expect((mountPicker([]).vm as unknown as Vm).isSplitChecked('STUDENTS_READ')).toBe(false)
  })

  it('toggleSplit checking a scope-aware perm adds default own_class, never bare', () => {
    const w = mountPicker([])
    ;(w.vm as unknown as Vm).toggleSplit('STUDENTS_READ', true)
    expect(lastEmit(w)).toContain('STUDENTS_READ:own_class')
    expect(lastEmit(w)).not.toContain('STUDENTS_READ')
  })

  it('toggleSplit checking a non-scope perm still adds bare key', () => {
    const w = mountPicker([])
    ;(w.vm as unknown as Vm).toggleSplit('ATTENDANCE_READ', true)
    expect(lastEmit(w)).toContain('ATTENDANCE_READ')
    expect(lastEmit(w).find((k) => k.startsWith('ATTENDANCE_READ:'))).toBeUndefined()
  })

  it('toggleSplit unchecking removes a scoped token (revocation works)', () => {
    const w = mountPicker(['STUDENTS_READ:own_class', 'DASHBOARD'])
    ;(w.vm as unknown as Vm).toggleSplit('STUDENTS_READ', false)
    expect(lastEmit(w)).toEqual(['DASHBOARD'])
  })

  it('toggleSplit unchecking removes bare and scoped duplicates together', () => {
    const w = mountPicker(['STUDENTS_READ', 'STUDENTS_READ:all'])
    ;(w.vm as unknown as Vm).toggleSplit('STUDENTS_READ', false)
    expect(lastEmit(w)).toEqual([])
  })

  it('toggleSplit unchecking in wildcard state de-escalates like toggle', () => {
    const w = mountPicker(['*'])
    ;(w.vm as unknown as Vm).toggleSplit('STUDENTS_READ', false)
    const next = lastEmit(w)
    expect(next).not.toContain('*')
    expect(next.some((k) => k === 'STUDENTS_READ' || k.startsWith('STUDENTS_READ:'))).toBe(false)
    expect(next).toContain('DASHBOARD')
  })

  it('split-row renders scope radio for a checked scope-aware perm', () => {
    mountPicker(['STUDENTS_READ:own_class'])
    expect(document.querySelector('[data-perm-scope="STUDENTS_READ"]')).not.toBeNull()
  })

  it('split-row does not render scope radio for unchecked or non-scope perms', () => {
    mountPicker(['ATTENDANCE_READ'])
    expect(document.querySelector('[data-perm-scope="ATTENDANCE_READ"]')).toBeNull()
    expect(document.querySelector('[data-perm-scope="STUDENTS_READ"]')).toBeNull()
  })

  it('split-row scope radio switches own_class → all via setScope', async () => {
    const w = mountPicker(['STUDENTS_READ:own_class'])
    const row = w.find('[data-perm-scope="STUDENTS_READ"]')
    expect(row.exists()).toBe(true)
    const radios = row.findAll('input[type="radio"]')
    expect(radios.length).toBe(2)
    await radios[1].setValue() // scope_options 順序 ['own_class', 'all'] → 第二顆 = 全園
    expect(lastEmit(w)).toContain('STUDENTS_READ:all')
    expect(lastEmit(w)).not.toContain('STUDENTS_READ:own_class')
  })
})
