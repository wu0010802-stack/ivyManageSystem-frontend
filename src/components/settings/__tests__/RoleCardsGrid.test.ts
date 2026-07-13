import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockIsSuperAdmin = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isSuperAdmin: () => mockIsSuperAdmin() }
})

import RoleCardsGrid from '../RoleCardsGrid.vue'
import type { RolesDefinition } from '../roles/types'

const definition: RolesDefinition = {
  permissions: {},
  groups: [],
  roles: {
    parent: { label: '家長', description: '', permissions: [], is_core: true, flags: ['parent', 'portal_only'] },
    admin: { label: '管理員', description: '', permissions: ['*'], is_core: true, flags: ['super_admin'] },
    teacher: { label: '教師', description: '', permissions: [], is_core: true, flags: ['portal_only'] },
    hr: { label: '人資', description: '', permissions: ['DASHBOARD'], is_core: true, flags: [] },
    custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], is_core: false, flags: [] },
  },
}

const mountGrid = (modelValue = 'teacher') =>
  mount(RoleCardsGrid, { props: { modelValue, definition } })

describe('RoleCardsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSuperAdmin.mockReturnValue(true)
  })

  it('資料驅動：含自訂角色、排除 parent flag 角色；核心排前、自訂附後', () => {
    const w = mountGrid()
    const codes = w.findAll('[data-role]').map((n) => n.attributes('data-role'))
    expect(codes).toEqual(['admin', 'hr', 'teacher', 'custom_x'])
    expect(codes).not.toContain('parent')
  })

  it('點擊卡片 emit update:modelValue', async () => {
    const w = mountGrid()
    await w.find('[data-role="hr"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['hr'])
  })

  it('鍵盤可達性：role=button、tabindex、aria-pressed、Enter/Space 選取', async () => {
    const w = mountGrid('hr')
    const card = w.find('[data-role="custom_x"]')
    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('tabindex')).toBe('0')
    expect(card.attributes('aria-pressed')).toBe('false')
    expect(w.find('[data-role="hr"]').attributes('aria-pressed')).toBe('true')
    await card.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['custom_x'])
    await card.trigger('keydown', { key: ' ' })
    expect(w.emitted('update:modelValue')?.[1]).toEqual(['custom_x'])
  })

  it('角色卡不放 icon（業主 2026-07-13 裁定移除）', () => {
    const w = mountGrid()
    expect(w.find('[data-role="admin"] .role-card__icon').exists()).toBe(false)
    expect(w.find('[data-role="admin"] .role-card__label').text()).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('非 super_admin：super_admin flag 角色卡 disabled、點擊不 emit', async () => {
    mockIsSuperAdmin.mockReturnValue(false)
    const w = mountGrid()
    const adminCard = w.find('[data-role="admin"]')
    expect(adminCard.classes()).toContain('is-disabled')
    await adminCard.trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})
