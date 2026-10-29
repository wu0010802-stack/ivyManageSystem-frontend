/**
 * 公告管理頁 UI/UX 整修（2026-10-29）鎖定項：
 * - 送出 payload 與整修前逐欄一致（新增／編輯／指定員工／家長端）
 * - 表單欄位寫作順序：標題 → 內容 → 分類與對象 → 發佈設定
 * - 列表載入失敗顯示錯誤態＋重試，不顯示成「尚無公告」；空狀態分「沒資料」與「篩不到」
 * - 寫入失敗可見：新增失敗、家長端對象設定失敗都不得關閉對話框或宣稱成功；送出中不可重複送出
 *
 * 注意：vitest 下 ElForm.validate() 恆回 true，所以必填一律斷言純邏輯守衛（fieldErrors／API 未被呼叫），
 * 不靠真 el-form 驗證失敗。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'

const {
  getAnnouncements, getReaders, createAnnouncement, updateAnnouncement, replaceParent, confirmMock, msg, hasPermissionMock,
} = vi.hoisted(() => ({
  getAnnouncements: vi.fn(),
  getReaders: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  replaceParent: vi.fn(),
  confirmMock: vi.fn(),
  msg: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  hasPermissionMock: vi.fn(() => true),
}))

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: (...a: unknown[]) => getAnnouncements(...a),
  createAnnouncement: (...a: unknown[]) => createAnnouncement(...a),
  updateAnnouncement: (...a: unknown[]) => updateAnnouncement(...a),
  deleteAnnouncement: vi.fn(),
  getAnnouncementReaders: (...a: unknown[]) => getReaders(...a),
  getAnnouncementParentRecipients: vi.fn().mockResolvedValue({ data: { items: [] } }),
  replaceAnnouncementParentRecipients: (...a: unknown[]) => replaceParent(...a),
  getAnnouncementRecipients: vi.fn().mockResolvedValue({ data: { employee_ids: [] } }),
  uploadAnnouncementAttachment: vi.fn(),
  deleteAnnouncementAttachment: vi.fn(),
}))
vi.mock('@/api/announcementCategories', () => ({
  getAnnouncementCategories: vi.fn().mockResolvedValue({ data: { items: [{ id: 7, name: '一般', is_default: true }], total: 1 } }),
}))
vi.mock('@/api/students', () => ({ getStudents: vi.fn().mockResolvedValue({ data: { items: [] } }) }))
vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, ElMessage: msg, ElMessageBox: { confirm: (...a: unknown[]) => confirmMock(...a) } }
})
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn() }),
}))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => hasPermissionMock(code) }))

import AnnouncementView from '@/views/AnnouncementView.vue'
import FormDialog from '@/components/common/FormDialog.vue'

type Vm = {
  openAdd: () => void
  handleSubmit: () => Promise<void>
  onAnnFilterChange: (v: Record<string, unknown>) => Promise<unknown>
  fetchAnnouncements: () => Promise<unknown>
  ensureReadersLoaded: (id: number, force?: boolean) => Promise<void>
  readersError: Record<number, boolean>
  readersCache: Record<number, { items: unknown[]; loaded: boolean }>
  handleAttachmentChange: (f: { uid: number; raw?: File }) => void
  fieldErrors: Record<string, string>
  submitText: string
  dialogVisible: boolean
  submitLoading: boolean
  isEdit: boolean
  isFormDirty: () => boolean
  loadError: boolean
  form: {
    id: number | null
    title: string
    content: string
    priority: string
    category_id: number | null
    is_pinned: boolean
    restrict_recipients: boolean
    target_employee_ids: number[]
    parent_visibility: string
    publish_at: string | null
    expires_at: string | null
  }
}

const passthrough = { template: '<div><slot /></div>' }
const globalConfig = {
  stubs: {
    teleport: true,
    EmptyState: false,
    FormDialog: passthrough,
    FormSection: passthrough,
    AdminListCards: { template: '<div class="cards"><slot name="empty" /></div>' },
    'el-table': { template: '<div class="el-table"><slot /><slot name="empty" /></div>' },
    'el-table-column': { template: '<span />' },
  },
}

const mountView = async (stubs: Record<string, unknown> = {}) => {
  const wrapper = shallowMount(AnnouncementView, {
    global: { stubs: { ...globalConfig.stubs, ...stubs } },
  })
  await flushPromises()
  return wrapper
}
const vmOf = (w: VueWrapper) => w.vm as unknown as Vm

const fillDraft = (vm: Vm) => {
  vm.openAdd()
  vm.form.title = '停課通知'
  vm.form.content = '明日颱風停課'
}

beforeEach(() => {
  mockIsMobile.value = false
  getAnnouncements.mockReset().mockResolvedValue({ data: { items: [], total: 0 } })
  getReaders.mockReset().mockResolvedValue({ data: { items: [], total: 0 } })
  createAnnouncement.mockReset().mockResolvedValue({ data: { id: 9 } })
  updateAnnouncement.mockReset().mockResolvedValue({ data: {} })
  replaceParent.mockReset().mockResolvedValue({ data: {} })
  confirmMock.mockReset().mockResolvedValue('confirm')
  msg.success.mockReset(); msg.error.mockReset(); msg.warning.mockReset()
  hasPermissionMock.mockReset().mockReturnValue(true)
})

describe('送出 payload 契約（與整修前一致）', () => {
  it('新增：欄位集合固定，未限制員工時 target_employee_ids 為 null', async () => {
    const vm = vmOf(await mountView())
    fillDraft(vm)
    vm.form.priority = 'urgent'
    vm.form.is_pinned = true
    vm.form.publish_at = '2099-01-01T08:00:00'
    vm.form.expires_at = '2099-01-02T08:00:00'
    await vm.handleSubmit()
    await flushPromises()
    expect(createAnnouncement).toHaveBeenCalledTimes(1)
    expect(createAnnouncement).toHaveBeenCalledWith({
      title: '停課通知',
      content: '明日颱風停課',
      priority: 'urgent',
      category_id: 7, // 新公告預設帶入 is_default 分類
      is_pinned: true,
      target_employee_ids: null,
      publish_at: '2099-01-01T08:00:00',
      expires_at: '2099-01-02T08:00:00',
    })
  })

  it('新增＋指定員工：target_employee_ids 為所選員工', async () => {
    const vm = vmOf(await mountView())
    fillDraft(vm)
    vm.form.restrict_recipients = true
    vm.form.target_employee_ids = [3, 5]
    await vm.handleSubmit()
    await flushPromises()
    expect(createAnnouncement.mock.calls[0][0].target_employee_ids).toEqual([3, 5])
  })

  it('編輯：走 update，未限制員工時 target_employee_ids 為空陣列（不是 null）', async () => {
    const vm = vmOf(await mountView())
    fillDraft(vm)
    await vm.handleSubmit() // 先建立 → 轉為編輯模式（id=9）
    await flushPromises()
    updateAnnouncement.mockClear()
    msg.success.mockClear()
    await vm.handleSubmit()
    await flushPromises()
    expect(updateAnnouncement).toHaveBeenCalledWith(9, {
      title: '停課通知',
      content: '明日颱風停課',
      priority: 'normal',
      category_id: 7,
      is_pinned: false,
      target_employee_ids: [],
      publish_at: null,
      expires_at: null,
    })
  })

  it('家長端對象 payload 不變：全部家長 → [{scope:"all"}]', async () => {
    const vm = vmOf(await mountView())
    fillDraft(vm)
    vm.form.parent_visibility = 'all'
    await vm.handleSubmit()
    await flushPromises()
    expect(replaceParent).toHaveBeenCalledWith(9, [{ scope: 'all' }])
  })
})

describe('表單欄位順序與必填守衛', () => {
  it('內容排在對象／分類之前，發佈設定最後', async () => {
    const wrapper = await mountView()
    vmOf(wrapper).openAdd()
    await flushPromises()
    const labels = wrapper.findAll('el-form-item').map((w) => w.attributes('label'))
    const idx = (l: string) => labels.indexOf(l)
    expect(idx('標題')).toBe(0)
    expect(idx('內容')).toBe(1)
    expect(idx('內容')).toBeLessThan(idx('分類'))
    expect(idx('內容')).toBeLessThan(idx('家長端'))
    expect(idx('分類')).toBeLessThan(idx('發佈時間'))
    expect(idx('家長端')).toBeLessThan(idx('發佈時間'))
    expect(idx('發佈時間')).toBeLessThan(idx('到期時間'))
  })

  it('分區標題依序為 公告內容 → 分類與對象 → 發佈設定', async () => {
    const wrapper = await mountView({ FormSection: { props: ['title'], template: '<section :data-title="title"><slot /></section>' } })
    vmOf(wrapper).openAdd()
    await flushPromises()
    expect(wrapper.findAll('section').map((s) => s.attributes('data-title'))).toEqual([
      '公告內容', '分類與對象', '發佈設定',
    ])
  })

  it('標題或內容空白（含純空白）時不送出，也不呼叫 API', async () => {
    const vm = vmOf(await mountView())
    vm.openAdd()
    vm.form.title = '   '
    vm.form.content = '內容'
    expect(vm.fieldErrors.title).toBe('請輸入標題')
    await vm.handleSubmit()
    expect(msg.warning).toHaveBeenCalledWith('請輸入標題')
    expect(createAnnouncement).not.toHaveBeenCalled()

    vm.form.title = '標題'
    vm.form.content = ''
    expect(vm.fieldErrors.content).toBe('請輸入內容')
    await vm.handleSubmit()
    expect(createAnnouncement).not.toHaveBeenCalled()
  })

  it('到期時間不晚於發佈時間 → 擋下（後端同樣會拒絕）', async () => {
    const vm = vmOf(await mountView())
    fillDraft(vm)
    vm.form.publish_at = '2099-01-02T08:00:00'
    vm.form.expires_at = '2099-01-01T08:00:00'
    expect(vm.fieldErrors.expires_at).toContain('晚於')
    await vm.handleSubmit()
    expect(createAnnouncement).not.toHaveBeenCalled()
  })

  it('送出鈕文字：新增＝發佈公告、排程＝排程發佈、編輯＝更新公告', async () => {
    const vm = vmOf(await mountView())
    vm.openAdd()
    expect(vm.submitText).toBe('發佈公告')
    vm.form.publish_at = '2099-01-01T08:00:00'
    expect(vm.submitText).toBe('排程發佈')
  })

  it('未儲存保護：剛開啟為乾淨，輸入後為 dirty', async () => {
    const vm = vmOf(await mountView())
    vm.openAdd()
    expect(vm.isFormDirty()).toBe(false)
    vm.form.title = '草稿'
    expect(vm.isFormDirty()).toBe(true)
  })

  it('只加了待上傳附件、表單欄位沒動，關閉時一樣算未儲存', async () => {
    const vm = vmOf(await mountView())
    vm.openAdd()
    expect(vm.isFormDirty()).toBe(false)
    vm.handleAttachmentChange({ uid: 1, raw: new File(['x'], 'a.pdf') })
    expect(vm.isFormDirty()).toBe(true)
  })

  it('對話框用 standardNarrow 尺寸，且關閉 Enter 送出（避免在標題欄 Enter 就發佈並通知家長）', async () => {
    const wrapper = shallowMount(AnnouncementView, { global: { stubs: { teleport: true, 'el-table-column': { template: '<span />' } } } })
    await flushPromises()
    const dialog = wrapper.findComponent(FormDialog)
    expect(dialog.props('enterSubmit')).toBe(false)
    expect(dialog.props('size')).toBe('standardNarrow')
  })
})

describe('列表載入失敗與空狀態', () => {
  it('載入失敗 → 錯誤態＋重試，不顯示「尚無公告」', async () => {
    getAnnouncements.mockRejectedValue(new Error('network'))
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="announcement-load-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('公告載入失敗')
    expect(wrapper.text()).not.toContain('尚無公告')
    expect(wrapper.find('.el-table').exists()).toBe(false)
    expect(msg.error).toHaveBeenCalled()
  })

  it('按「重新載入」重打 API，成功後錯誤態消失', async () => {
    getAnnouncements.mockRejectedValueOnce(new Error('network'))
    const wrapper = await mountView()
    expect(getAnnouncements).toHaveBeenCalledTimes(1)
    const retry = wrapper.find('[data-test="announcement-load-error"]').find('el-button')
    expect(retry.text()).toContain('重新載入')
    await retry.trigger('click')
    await flushPromises()
    expect(getAnnouncements).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="announcement-load-error"]').exists()).toBe(false)
    expect(wrapper.find('.el-table').exists()).toBe(true)
  })

  it('換篩選後失敗：不保留上一頁舊列、不顯示 0 筆空狀態', async () => {
    getAnnouncements.mockResolvedValueOnce({
      data: { items: [{ id: 1, title: '舊公告', content: '', priority: 'normal', is_pinned: false }], total: 1 },
    })
    const wrapper = await mountView()
    getAnnouncements.mockRejectedValueOnce(new Error('boom'))
    await vmOf(wrapper).onAnnFilterChange({ priority: 'urgent' })
    await flushPromises()
    expect(vmOf(wrapper).loadError).toBe(true)
    expect(wrapper.find('[data-test="announcement-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="announcement-load-error"]').exists()).toBe(true)
  })

  it('真的沒有公告 → 「尚無公告」空狀態（非錯誤）', async () => {
    const wrapper = await mountView()
    const empty = wrapper.find('[data-test="announcement-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('尚無公告')
    expect(wrapper.find('[data-test="announcement-load-error"]').exists()).toBe(false)
  })

  it('有篩選條件但查無結果 → 「找不到符合條件」並提供清除條件', async () => {
    const wrapper = await mountView()
    await vmOf(wrapper).onAnnFilterChange({ priority: 'urgent' })
    await flushPromises()
    const empty = wrapper.find('[data-test="announcement-empty"]')
    expect(empty.text()).toContain('找不到符合條件的公告')
    expect(empty.find('el-button').text()).toContain('清除條件')
    await empty.find('el-button').trigger('click')
    await flushPromises()
    expect(getAnnouncements).toHaveBeenLastCalledWith(expect.objectContaining({ priority: undefined }))
  })

  it('手機卡片版同樣有空狀態與錯誤態', async () => {
    mockIsMobile.value = true
    const empty = await mountView()
    expect(empty.find('.cards [data-test="announcement-empty"]').text()).toContain('尚無公告')

    getAnnouncements.mockRejectedValue(new Error('network'))
    const failed = await mountView()
    expect(failed.find('[data-test="announcement-load-error"]').exists()).toBe(true)
    expect(failed.find('.cards').exists()).toBe(false)
  })
})

describe('寫入失敗必須可見', () => {
  it('新增失敗：顯示後端訊息、對話框不關、可再次送出', async () => {
    createAnnouncement.mockRejectedValueOnce({ displayMessage: '標題重複' })
    const vm = vmOf(await mountView())
    fillDraft(vm)
    await vm.handleSubmit()
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith('標題重複')
    expect(msg.success).not.toHaveBeenCalled()
    expect(vm.dialogVisible).toBe(true)
    expect(vm.submitLoading).toBe(false)
    expect(vm.isEdit).toBe(false) // 沒建立成功就不能轉成編輯，重試仍走 create

    await vm.handleSubmit()
    await flushPromises()
    expect(createAnnouncement).toHaveBeenCalledTimes(2)
    expect(vm.dialogVisible).toBe(false)
  })

  it('家長端對象設定失敗：公告已存檔但不得宣稱成功或關閉對話框', async () => {
    replaceParent.mockRejectedValueOnce({ displayMessage: '家長對象寫入失敗' })
    const vm = vmOf(await mountView())
    fillDraft(vm)
    vm.form.parent_visibility = 'all'
    await vm.handleSubmit()
    await flushPromises()
    expect(createAnnouncement).toHaveBeenCalledTimes(1)
    expect(msg.success).not.toHaveBeenCalled()
    expect(String(msg.error.mock.calls[0][0])).toContain('家長對象寫入失敗')
    expect(vm.dialogVisible).toBe(true)
    // 已轉為編輯同一則，重試只會 update＋重設家長對象，不會再 create 出第二則
    expect(vm.isEdit).toBe(true)
    await vm.handleSubmit()
    await flushPromises()
    expect(createAnnouncement).toHaveBeenCalledTimes(1)
    expect(updateAnnouncement).toHaveBeenCalledTimes(1)
    expect(replaceParent).toHaveBeenCalledTimes(2)
    expect(vm.dialogVisible).toBe(false)
  })

  it('送出中不可重複送出：FormDialog 取得 loading，第二次呼叫被擋下', async () => {
    let release!: (v: unknown) => void
    createAnnouncement.mockReturnValueOnce(new Promise((r) => { release = r }))
    const wrapper = shallowMount(AnnouncementView, { global: { stubs: { teleport: true, 'el-table-column': { template: '<span />' } } } })
    await flushPromises()
    const vm = vmOf(wrapper)
    fillDraft(vm)

    const first = vm.handleSubmit()
    await nextTick()
    expect(wrapper.findComponent(FormDialog).props('loading')).toBe(true)
    await vm.handleSubmit() // 連點／Enter 的第二次
    expect(createAnnouncement).toHaveBeenCalledTimes(1)

    release({ data: { id: 9 } })
    await first
    await flushPromises()
    expect(wrapper.findComponent(FormDialog).props('loading')).toBe(false)
  })

  it('排程發佈成功訊息說明是排程，不說「已發佈」', async () => {
    const vm = vmOf(await mountView())
    fillDraft(vm)
    vm.form.publish_at = '2099-01-01T08:00:00'
    await vm.handleSubmit()
    await flushPromises()
    expect(msg.success).toHaveBeenCalledWith(expect.stringContaining('排程'))
  })
})

describe('已讀名單載入', () => {
  it('載入失敗標記 error（不當作空名單），重試成功後清除', async () => {
    getReaders.mockRejectedValueOnce(new Error('boom'))
    const vm = vmOf(await mountView())
    await vm.ensureReadersLoaded(1)
    expect(vm.readersError[1]).toBe(true)
    expect(vm.readersCache[1]).toBeUndefined()
    expect(msg.error).toHaveBeenCalled()

    getReaders.mockResolvedValueOnce({ data: { items: [{ employee_id: 2, name: '王老師', read_at: null }], total: 1 } })
    await vm.ensureReadersLoaded(1, true)
    expect(vm.readersError[1]).toBe(false)
    expect(vm.readersCache[1].items).toHaveLength(1)
  })
})
