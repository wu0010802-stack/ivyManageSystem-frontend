import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@/api', () => ({
  default: { delete: vi.fn() },
}))

import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { useConfirmDelete } from '@/composables/useConfirmDelete'

describe('useConfirmDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('confirmDelete() — 使用者確認刪除', () => {
    it('呼叫 ElMessageBox.confirm 顯示確認框', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockResolvedValue({})

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn() })
      await confirmDelete({ id: 1, name: '王小明' })

      expect(ElMessageBox.confirm).toHaveBeenCalledOnce()
    })

    it('確認訊息含員工姓名', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockResolvedValue({})

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn() })
      await confirmDelete({ id: 1, name: '李大華' })

      const [msg] = ElMessageBox.confirm.mock.calls[0]
      expect(msg).toContain('李大華')
    })

    it('無姓名時仍能正常運作（顯示通用確認訊息）', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockResolvedValue({})

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn() })
      await confirmDelete({ id: 2 })

      const [msg] = ElMessageBox.confirm.mock.calls[0]
      expect(msg).toBe('確定要刪除嗎？')
    })

    it('使用自訂 label 覆蓋 row.name', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockResolvedValue({})

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn() })
      await confirmDelete({ id: 1, name: '王小明' }, { label: '自訂名稱' })

      const [msg] = ElMessageBox.confirm.mock.calls[0]
      expect(msg).toContain('自訂名稱')
    })

    it('確認後呼叫 api.delete，帶正確路徑', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockResolvedValue({})

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn() })
      await confirmDelete({ id: 42 })

      expect(api.delete).toHaveBeenCalledWith('/employees/42')
    })

    it('確認後呼叫自訂 idField', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockResolvedValue({})

      const { confirmDelete } = useConfirmDelete({ endpoint: '/students', onSuccess: vi.fn() })
      await confirmDelete({ student_id: 99 }, { idField: 'student_id' })

      expect(api.delete).toHaveBeenCalledWith('/students/99')
    })

    it('刪除成功後呼叫 onSuccess', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockResolvedValue({})
      const onSuccess = vi.fn()

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess })
      await confirmDelete({ id: 1 })

      expect(onSuccess).toHaveBeenCalledOnce()
    })

    it('刪除成功顯示成功訊息', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockResolvedValue({})

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn(), successMsg: '員工已刪除' })
      await confirmDelete({ id: 1 })

      expect(ElMessage.success).toHaveBeenCalledWith('員工已刪除')
    })

    it('successMsg 預設為 "已刪除"', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockResolvedValue({})

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn() })
      await confirmDelete({ id: 1 })

      expect(ElMessage.success).toHaveBeenCalledWith('已刪除')
    })
  })

  describe('confirmDelete() — 使用者取消', () => {
    it('取消時不呼叫 api.delete', async () => {
      ElMessageBox.confirm.mockRejectedValue('cancel')

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn() })
      await confirmDelete({ id: 1 })

      expect(api.delete).not.toHaveBeenCalled()
    })

    it('取消時不顯示錯誤訊息', async () => {
      ElMessageBox.confirm.mockRejectedValue('cancel')

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn() })
      await confirmDelete({ id: 1 })

      expect(ElMessage.error).not.toHaveBeenCalled()
    })

    it('取消時不呼叫 onSuccess', async () => {
      ElMessageBox.confirm.mockRejectedValue('cancel')
      const onSuccess = vi.fn()

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess })
      await confirmDelete({ id: 1 })

      expect(onSuccess).not.toHaveBeenCalled()
    })
  })

  describe('confirmDelete() — API 錯誤', () => {
    it('api.delete 失敗時顯示錯誤訊息', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockRejectedValue(new Error('Network Error'))

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn(), errorMsg: '刪除失敗，請重試' })
      await confirmDelete({ id: 1 })

      expect(ElMessage.error).toHaveBeenCalledWith('刪除失敗，請重試')
    })

    it('errorMsg 預設為 "刪除失敗"', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockRejectedValue(new Error('500'))

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess: vi.fn() })
      await confirmDelete({ id: 1 })

      expect(ElMessage.error).toHaveBeenCalledWith('刪除失敗')
    })

    it('api.delete 失敗時不呼叫 onSuccess', async () => {
      ElMessageBox.confirm.mockResolvedValue('confirm')
      api.delete.mockRejectedValue(new Error('500'))
      const onSuccess = vi.fn()

      const { confirmDelete } = useConfirmDelete({ endpoint: '/employees', onSuccess })
      await confirmDelete({ id: 1 })

      expect(onSuccess).not.toHaveBeenCalled()
    })
  })
})
