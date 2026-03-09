import { describe, it, expect, vi } from 'vitest'
import { useCrudDialog } from '@/composables/useCrudDialog'

describe('useCrudDialog', () => {
  describe('初始狀態', () => {
    it('dialogVisible 預設 false', () => {
      const { dialogVisible } = useCrudDialog()
      expect(dialogVisible.value).toBe(false)
    })

    it('isEdit 預設 false', () => {
      const { isEdit } = useCrudDialog()
      expect(isEdit.value).toBe(false)
    })
  })

  describe('openCreate()', () => {
    it('開啟 dialog', () => {
      const { dialogVisible, openCreate } = useCrudDialog()
      openCreate()
      expect(dialogVisible.value).toBe(true)
    })

    it('isEdit 設為 false', () => {
      const { isEdit, openCreate } = useCrudDialog()
      openCreate()
      expect(isEdit.value).toBe(false)
    })

    it('呼叫 resetForm', () => {
      const resetForm = vi.fn()
      const { openCreate } = useCrudDialog({ resetForm })
      openCreate()
      expect(resetForm).toHaveBeenCalledOnce()
    })

    it('無 resetForm 不 crash', () => {
      const { openCreate } = useCrudDialog()
      expect(() => openCreate()).not.toThrow()
    })
  })

  describe('openEdit(row)', () => {
    it('開啟 dialog', () => {
      const { dialogVisible, openEdit } = useCrudDialog()
      openEdit({ id: 1 })
      expect(dialogVisible.value).toBe(true)
    })

    it('isEdit 設為 true', () => {
      const { isEdit, openEdit } = useCrudDialog()
      openEdit({ id: 1 })
      expect(isEdit.value).toBe(true)
    })

    it('呼叫 populateForm 並傳入 row', () => {
      const populateForm = vi.fn()
      const { openEdit } = useCrudDialog({ populateForm })
      const row = { id: 5, name: '王小明' }
      openEdit(row)
      expect(populateForm).toHaveBeenCalledWith(row)
    })

    it('無 populateForm 不 crash', () => {
      const { openEdit } = useCrudDialog()
      expect(() => openEdit({ id: 1 })).not.toThrow()
    })
  })

  describe('closeDialog()', () => {
    it('關閉已開啟的 dialog', () => {
      const { dialogVisible, openCreate, closeDialog } = useCrudDialog()
      openCreate()
      expect(dialogVisible.value).toBe(true)
      closeDialog()
      expect(dialogVisible.value).toBe(false)
    })

    it('對已關閉的 dialog 呼叫不 crash', () => {
      const { closeDialog } = useCrudDialog()
      expect(() => closeDialog()).not.toThrow()
    })
  })

  describe('完整流程', () => {
    it('新增 → 關閉 → 編輯：isEdit 正確切換', () => {
      const { dialogVisible, isEdit, openCreate, openEdit, closeDialog } = useCrudDialog()

      openCreate()
      expect(isEdit.value).toBe(false)
      expect(dialogVisible.value).toBe(true)

      closeDialog()
      expect(dialogVisible.value).toBe(false)

      openEdit({ id: 1 })
      expect(isEdit.value).toBe(true)
      expect(dialogVisible.value).toBe(true)
    })
  })
})
