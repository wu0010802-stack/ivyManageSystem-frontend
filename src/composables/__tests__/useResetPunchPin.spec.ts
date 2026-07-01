/**
 * TDD：useResetPunchPin composable
 * 驗證：確認後呼叫 resetPunchPin；使用者取消則不呼叫。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElMessageBox, ElMessage } from 'element-plus'
import { resetPunchPin } from '@/api/employees'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/api/employees', () => ({
  resetPunchPin: vi.fn(() => Promise.resolve({ data: { message: '打卡 PIN 已重置' } })),
}))

vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: vi.fn(() => Promise.resolve()),
  },
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useResetPunchPin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('確認後呼叫 resetPunchPin 並顯示成功訊息', async () => {
    const { useResetPunchPin } = await import('../useResetPunchPin')
    const { resetEmployeePin } = useResetPunchPin()

    await resetEmployeePin({ id: 42, name: '王小明' })

    expect(ElMessageBox.confirm).toHaveBeenCalledOnce()
    expect(resetPunchPin).toHaveBeenCalledWith(42)
    expect(ElMessage.success).toHaveBeenCalledWith('打卡 PIN 已重置')
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('使用者取消確認則不呼叫 resetPunchPin', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))

    const { useResetPunchPin } = await import('../useResetPunchPin')
    const { resetEmployeePin } = useResetPunchPin()

    await resetEmployeePin({ id: 42, name: '王小明' })

    expect(ElMessageBox.confirm).toHaveBeenCalledOnce()
    expect(resetPunchPin).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('API 失敗時顯示錯誤訊息', async () => {
    vi.mocked(resetPunchPin).mockRejectedValueOnce(new Error('network error'))

    const { useResetPunchPin } = await import('../useResetPunchPin')
    const { resetEmployeePin } = useResetPunchPin()

    await resetEmployeePin({ id: 42, name: '王小明' })

    expect(resetPunchPin).toHaveBeenCalledWith(42)
    expect(ElMessage.error).toHaveBeenCalledWith('重置失敗，請重試')
    expect(ElMessage.success).not.toHaveBeenCalled()
  })
})
