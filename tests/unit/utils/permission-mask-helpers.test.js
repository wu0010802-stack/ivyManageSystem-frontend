import { describe, it, expect } from 'vitest'
import {
  permissionMaskAdd,
  permissionMaskCombine,
  permissionMaskHas,
  permissionMaskRemove,
} from '@/utils/auth'

describe('permission mask helpers (INFO-1 BigInt 安全)', () => {
  describe('permissionMaskHas', () => {
    it('-1 一律 true', () => {
      expect(permissionMaskHas(-1, 1 << 5)).toBe(true)
      expect(permissionMaskHas(-1, 2 ** 40)).toBe(true)
    })

    it('低位元（< 32-bit）正確', () => {
      const mask = (1 << 0) | (1 << 5)
      expect(permissionMaskHas(mask, 1 << 0)).toBe(true)
      expect(permissionMaskHas(mask, 1 << 5)).toBe(true)
      expect(permissionMaskHas(mask, 1 << 6)).toBe(false)
    })

    it('高位元（≥ 1 << 32）正確', () => {
      // 故意挑會被 32-bit `&` 截斷的位元
      const high = 2 ** 40
      const mask = high
      expect(permissionMaskHas(mask, high)).toBe(true)
      expect(permissionMaskHas(mask, 2 ** 41)).toBe(false)
    })

    it('value=0 永遠 false（避免「空權限」誤判為命中）', () => {
      expect(permissionMaskHas(123, 0)).toBe(false)
    })

    it('null/undefined 視為 0n', () => {
      expect(permissionMaskHas(null, 1)).toBe(false)
      expect(permissionMaskHas(undefined, 1)).toBe(false)
    })
  })

  describe('permissionMaskAdd', () => {
    it('低位元 OR', () => {
      expect(permissionMaskAdd(0, 1 << 3)).toBe(8)
      expect(permissionMaskAdd(1, 1 << 1)).toBe(3)
    })

    it('高位元 OR 不溢位', () => {
      const r = permissionMaskAdd(0, 2 ** 40)
      expect(r).toBe(2 ** 40)
    })

    it('重複加同一位元為冪等', () => {
      const a = permissionMaskAdd(0, 1 << 5)
      const b = permissionMaskAdd(a, 1 << 5)
      expect(a).toBe(b)
    })
  })

  describe('permissionMaskRemove', () => {
    it('移除指定位元、保留其他', () => {
      const mask = (1 << 0) | (1 << 5) | (1 << 7)
      const r = permissionMaskRemove(mask, 1 << 5)
      expect(r).toBe((1 << 0) | (1 << 7))
    })

    it('高位元移除', () => {
      const mask = 2 ** 40 + 2 ** 35
      const r = permissionMaskRemove(mask, 2 ** 40)
      expect(r).toBe(2 ** 35)
    })
  })

  describe('permissionMaskCombine', () => {
    it('多個位元 OR', () => {
      const r = permissionMaskCombine([1, 4, 8])
      expect(r).toBe(13)
    })

    it('混合高低位元', () => {
      const r = permissionMaskCombine([1, 2 ** 40])
      expect(r).toBe(1 + 2 ** 40)
    })

    it('空陣列回 0', () => {
      expect(permissionMaskCombine([])).toBe(0)
    })
  })
})
