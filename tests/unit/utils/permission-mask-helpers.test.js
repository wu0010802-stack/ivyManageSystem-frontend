import { describe, it, expect } from 'vitest'
import {
  permissionsAdd,
  permissionsCombine,
  permissionsHave,
  permissionsRemove,
} from '@/utils/auth'

// 取代舊版 permissionMaskHas/Add/Remove/Combine（BigInt 安全）：
// 後端從 bigint mask 改為 text[]，前端的權限運算 helper 改為 string[] 上的 set 操作。

describe('permissions helpers (text[] 版本)', () => {
  describe('permissionsHave', () => {
    it("wildcard '*' 一律 true", () => {
      expect(permissionsHave(['*'], 'EMPLOYEES_READ')).toBe(true)
      expect(permissionsHave(['*'], 'ANY_NEWLY_ADDED_PERM')).toBe(true)
    })

    it('命中即 true', () => {
      const perms = ['EMPLOYEES_READ', 'SALARY_WRITE']
      expect(permissionsHave(perms, 'EMPLOYEES_READ')).toBe(true)
      expect(permissionsHave(perms, 'SALARY_WRITE')).toBe(true)
    })

    it('未命中為 false', () => {
      expect(permissionsHave(['EMPLOYEES_READ'], 'SALARY_WRITE')).toBe(false)
    })

    it('空 array 一律 false', () => {
      expect(permissionsHave([], 'X')).toBe(false)
    })

    it('null / undefined → false', () => {
      expect(permissionsHave(null, 'X')).toBe(false)
      expect(permissionsHave(undefined, 'X')).toBe(false)
    })
  })

  describe('permissionsAdd', () => {
    it('加入新項', () => {
      expect(permissionsAdd(['A'], 'B')).toEqual(['A', 'B'])
    })

    it('已存在不重複（idempotent）', () => {
      expect(permissionsAdd(['A', 'B'], 'A')).toEqual(['A', 'B'])
    })

    it('不修改 input', () => {
      const input = ['A']
      permissionsAdd(input, 'B')
      expect(input).toEqual(['A'])
    })
  })

  describe('permissionsRemove', () => {
    it('移除存在項', () => {
      const r = permissionsRemove(['A', 'B'], 'A')
      expect(r).toEqual(['B'])
    })

    it('移除不存在項不報錯', () => {
      expect(permissionsRemove(['A'], 'B')).toEqual(['A'])
    })

    it('不修改 input', () => {
      const input = ['A', 'B']
      permissionsRemove(input, 'A')
      expect(input).toEqual(['A', 'B'])
    })
  })

  describe('permissionsCombine', () => {
    it('多 array 合併去重', () => {
      expect(permissionsCombine([['A', 'B'], ['B', 'C']]).sort()).toEqual([
        'A',
        'B',
        'C',
      ])
    })

    it('空輸入回空 array', () => {
      expect(permissionsCombine([])).toEqual([])
      expect(permissionsCombine([[], []])).toEqual([])
    })
  })
})
