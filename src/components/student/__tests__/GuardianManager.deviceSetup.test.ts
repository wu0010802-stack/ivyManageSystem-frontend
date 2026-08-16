/**
 * GuardianManager — 「產生裝置設定碼」「撤銷此監護人的所有裝置」兩個新動作。
 *
 * 背景：後端 device-setup 三支端點（含 IP 限流、失敗鎖定、稽核、30 天裝置
 * 記憶）已做完，前端行政端零串接——家長手機遺失時行政人員完全無法撤銷
 * 那個 30 天長效 session。這兩個動作放進既有的監護人管理表格，跟既有的
 * 「發碼」（LINE 綁定碼）並列。
 *
 * shallow mount + 直接呼叫 wrapper.vm 上的 handler：跟同目錄
 * StudentListPanel.race.test.ts 的既有慣例一致，避免真的渲染 el-table/
 * el-dialog 這些重元件（GuardianManager.vue 沒有 defineExpose 這兩支
 * handler，但 Vue Test Utils 的 wrapper.vm 在測試環境下本來就能碰到
 * setupState，不受 defineExpose 限制——本檔第三支既有測試沒有，直接
 * 沿用這個已驗證可行的手法）。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockListGuardians, mockCreateGuardianDeviceSetupCode, mockRevokeGuardianDevices, mockConfirm, mockMessageSuccess, mockMessageError } = vi.hoisted(() => ({
  mockListGuardians: vi.fn(),
  mockCreateGuardianDeviceSetupCode: vi.fn(),
  mockRevokeGuardianDevices: vi.fn(),
  mockConfirm: vi.fn(),
  mockMessageSuccess: vi.fn(),
  mockMessageError: vi.fn(),
}))

vi.mock('@/api/students', () => ({
  createGuardian: vi.fn(),
  createGuardianBindingCode: vi.fn(),
  createGuardianDeviceSetupCode: mockCreateGuardianDeviceSetupCode,
  revokeGuardianDevices: mockRevokeGuardianDevices,
  deleteGuardian: vi.fn(),
  listGuardians: mockListGuardians,
  updateGuardian: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: mockMessageSuccess, error: mockMessageError, warning: vi.fn() },
  ElMessageBox: { confirm: mockConfirm },
}))

import GuardianManager from '../GuardianManager.vue'

const GUARDIAN_ROW = { id: 7, name: '陳美玲', relation: '母親', is_primary: true }

beforeEach(() => {
  mockListGuardians.mockReset().mockResolvedValue({ data: { items: [GUARDIAN_ROW] } })
  mockCreateGuardianDeviceSetupCode.mockReset()
  mockRevokeGuardianDevices.mockReset()
  mockConfirm.mockReset()
  mockMessageSuccess.mockReset()
  mockMessageError.mockReset()
})

async function mountManager() {
  const wrapper = mount(GuardianManager, {
    props: { studentId: 42 },
    global: { stubs: { 'el-table': true, 'el-dialog': true } },
  })
  await flushPromises()
  return wrapper
}

describe('GuardianManager — 產生裝置設定碼', () => {
  it('確認後成功簽發：呼叫 createGuardianDeviceSetupCode 並存下明碼與過期時間', async () => {
    mockConfirm.mockResolvedValueOnce(undefined) // 使用者按下確定
    mockCreateGuardianDeviceSetupCode.mockResolvedValueOnce({
      data: { code: 'ABCD1234EFGH', expires_at: '2026-08-01T10:00:00' },
    })

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as {
      handleIssueDeviceSetupCode: (row: typeof GUARDIAN_ROW) => Promise<void>
      deviceSetupCode: string
      deviceSetupCodeVisible: boolean
    }
    await vm.handleIssueDeviceSetupCode(GUARDIAN_ROW)

    expect(mockCreateGuardianDeviceSetupCode).toHaveBeenCalledWith(7)
    expect(vm.deviceSetupCode).toBe('ABCD1234EFGH')
    expect(vm.deviceSetupCodeVisible).toBe(true)
  })

  it('使用者取消確認 → 不呼叫 API', async () => {
    mockConfirm.mockRejectedValueOnce('cancel') // ElMessageBox.confirm 取消時 reject

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as {
      handleIssueDeviceSetupCode: (row: typeof GUARDIAN_ROW) => Promise<void>
    }
    await vm.handleIssueDeviceSetupCode(GUARDIAN_ROW)

    expect(mockCreateGuardianDeviceSetupCode).not.toHaveBeenCalled()
  })

  it('簽發失敗 → ElMessage.error', async () => {
    mockConfirm.mockResolvedValueOnce(undefined)
    mockCreateGuardianDeviceSetupCode.mockRejectedValueOnce({ response: { data: { detail: '此監護人已有 3 個未使用的裝置登入碼' } } })

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as {
      handleIssueDeviceSetupCode: (row: typeof GUARDIAN_ROW) => Promise<void>
    }
    await vm.handleIssueDeviceSetupCode(GUARDIAN_ROW)

    expect(mockMessageError).toHaveBeenCalled()
  })
})

describe('GuardianManager — 設定碼彌窗附家長端網址', () => {
  it('網址以目前後台網域推導（多租戶下自動對應該分校）', async () => {
    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as { parentAppUrl: string }

    expect(vm.parentAppUrl).toBe(`${window.location.origin}/parent/`)
    // 不得寫死任何品牌網址，否則 B 校職員會把 A 校網址發給家長
    expect(vm.parentAppUrl).not.toContain('ivypreschool.tw')
    expect(vm.parentAppUrl).not.toContain('zeabur')
  })

  it('複製網址：寫進剪貼簿並提示成功', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as { copyParentAppUrl: () => Promise<void> }
    await vm.copyParentAppUrl()

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/parent/`)
    expect(mockMessageSuccess).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('複製網址與設定碼：一次備好可直接貼給家長的訊息（含網址、碼、期限）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    mockConfirm.mockResolvedValueOnce(undefined)
    mockCreateGuardianDeviceSetupCode.mockResolvedValueOnce({
      data: { code: 'ABCD1234EFGH', expires_at: '2026-08-11T10:00:00' },
    })

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as {
      handleIssueDeviceSetupCode: (row: typeof GUARDIAN_ROW) => Promise<void>
      copyDeviceSetupMessage: () => Promise<void>
    }
    await vm.handleIssueDeviceSetupCode(GUARDIAN_ROW)
    await vm.copyDeviceSetupMessage()

    const text = writeText.mock.calls.at(-1)?.[0] as string
    expect(text).toContain(`${window.location.origin}/parent/`)
    expect(text).toContain('ABCD1234EFGH')
    // 期限沿用彌窗既有的格式化結果，這裡只確認有帶到、不固化格式
    expect(text).toContain('有效期限')
    expect(text).toContain('2026-08-11')
    vi.unstubAllGlobals()
  })

  it('沒有設定碼時不複製訊息（避免貼出只有網址的半套內容）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as { copyDeviceSetupMessage: () => Promise<void> }
    await vm.copyDeviceSetupMessage()

    expect(writeText).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('GuardianManager — 撤銷此監護人的所有裝置', () => {
  it('確認後成功撤銷：呼叫 revokeGuardianDevices 並用回傳數量顯示成功訊息', async () => {
    mockConfirm.mockResolvedValueOnce(undefined)
    mockRevokeGuardianDevices.mockResolvedValueOnce({ data: { revoked: 2 } })

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as {
      handleRevokeDevices: (row: typeof GUARDIAN_ROW) => Promise<void>
    }
    await vm.handleRevokeDevices(GUARDIAN_ROW)

    expect(mockRevokeGuardianDevices).toHaveBeenCalledWith(7)
    expect(mockMessageSuccess).toHaveBeenCalledWith(expect.stringContaining('2'))
  })

  it('確認 dialog 文案要講清楚後果（立即登出、需重新登入）', async () => {
    mockConfirm.mockResolvedValueOnce(undefined)
    mockRevokeGuardianDevices.mockResolvedValueOnce({ data: { revoked: 0 } })

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as {
      handleRevokeDevices: (row: typeof GUARDIAN_ROW) => Promise<void>
    }
    await vm.handleRevokeDevices(GUARDIAN_ROW)

    const confirmMessage = mockConfirm.mock.calls[0][0] as string
    expect(confirmMessage).toContain('登出')
    expect(confirmMessage).toMatch(/重新綁定|設定碼/)
    // 後端「全撤」含 LINE 裝置一併撤銷；行政人員若誤以為只撤設定碼登入的
    // 裝置會誤判影響範圍，確認文案必須講清楚連 LINE 裝置也會被撤。
    expect(confirmMessage).toContain('LINE')
  })

  it('使用者取消確認 → 不呼叫 API', async () => {
    mockConfirm.mockRejectedValueOnce('cancel')

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as {
      handleRevokeDevices: (row: typeof GUARDIAN_ROW) => Promise<void>
    }
    await vm.handleRevokeDevices(GUARDIAN_ROW)

    expect(mockRevokeGuardianDevices).not.toHaveBeenCalled()
  })

  it('撤銷失敗 → ElMessage.error', async () => {
    mockConfirm.mockResolvedValueOnce(undefined)
    mockRevokeGuardianDevices.mockRejectedValueOnce({ response: { data: { detail: '權限不足' } } })

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as {
      handleRevokeDevices: (row: typeof GUARDIAN_ROW) => Promise<void>
    }
    await vm.handleRevokeDevices(GUARDIAN_ROW)

    expect(mockMessageError).toHaveBeenCalled()
  })
})
