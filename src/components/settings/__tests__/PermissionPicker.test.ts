import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PermissionPicker from '../PermissionPicker.vue'

const DEFINITION = {
  permissions: {
    STUDENTS_READ: { value: 'STUDENTS_READ', label: '學生 (檢視)', scope_options: ['own_class', 'all'] },
    DASHBOARD: { value: 'DASHBOARD', label: '儀表板', scope_options: null },
    EMPLOYEES_READ: { value: 'EMPLOYEES_READ', label: '員工 (檢視)', scope_options: null },
  },
  groups: [
    { name: '學生', permissions: ['STUDENTS_READ'], split_permissions: [] },
    { name: '一般', permissions: ['DASHBOARD', 'EMPLOYEES_READ'], split_permissions: [] },
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
    expect(next).toContain('EMPLOYEES_READ')
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
    expect(next).toContain('EMPLOYEES_READ')
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
