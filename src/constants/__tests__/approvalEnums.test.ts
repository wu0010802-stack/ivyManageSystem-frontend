import { describe, it, expect } from 'vitest'
import { ROLE_TAG_MAP, OVERTIME_TYPES } from '../approvalEnums'

// 後端 utils/permissions.py ROLE_LABELS 的 7 角色 code；送單人 tag 須全涵蓋
// （園長/會計也會送假/加班，缺漏會導致 WorkbenchApprovalsView tag 空白）。
const BACKEND_ROLES = ['admin', 'principal', 'supervisor', 'hr', 'accountant', 'teacher', 'parent']

describe('ROLE_TAG_MAP — 涵蓋後端全部 7 角色', () => {
  it('每個後端角色都有 label + tag type', () => {
    for (const role of BACKEND_ROLES) {
      const entry = ROLE_TAG_MAP[role as keyof typeof ROLE_TAG_MAP]
      expect(entry, `缺少角色 ${role}`).toBeDefined()
      expect(entry.label).toBeTruthy()
      expect(entry.type).toBeTruthy()
    }
  })

  it('不含後端不存在的角色 key', () => {
    expect(Object.keys(ROLE_TAG_MAP).sort()).toEqual([...BACKEND_ROLES].sort())
  })
})

describe('OVERTIME_TYPES — 休息日前 2h 倍率文字對齊法定 1.34', () => {
  it('weekend desc 標示 ×1.34（非舊值 1.33）', () => {
    const weekend = OVERTIME_TYPES.find((t) => t.value === 'weekend')
    expect(weekend?.desc).toContain('1.34')
    expect(weekend?.desc).not.toContain('1.33')
  })
})
