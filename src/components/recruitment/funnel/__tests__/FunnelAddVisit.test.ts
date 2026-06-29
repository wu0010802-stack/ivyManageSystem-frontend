import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import FunnelAddVisit from '../FunnelAddVisit.vue'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'

const createRecruitmentRecordMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/recruitment', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createRecruitmentRecord: createRecruitmentRecordMock }
})

const successMock = vi.hoisted(() => vi.fn())
const errorMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    ElMessage: { success: successMock, error: errorMock, info: vi.fn(), warning: vi.fn() },
  }
})

const hasPermissionMock = vi.hoisted(() => vi.fn())
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, hasPermission: hasPermissionMock }
})

function makeDashboard() {
  return {
    stats: ref<Record<string, unknown>>({ by_district: [] }),
    options: ref<Record<string, unknown>>({ sources: [], referrers: [], no_deposit_reasons: [] }),
    fetchOptions: vi.fn().mockResolvedValue(true),
  }
}

function mountComp(dash = makeDashboard()) {
  return mount(FunnelAddVisit, {
    props: { dashboard: dash as unknown as ReturnType<typeof useRecruitmentDashboard> },
    global: { stubs: { teleport: true, RecruitmentRecordDialog: true } },
  })
}

type ExposedVm = {
  form: Record<string, unknown>
  dialogVisible: boolean
  saving: boolean
  openDialog: () => Promise<void>
  handleSave: () => Promise<void>
}

describe('FunnelAddVisit', () => {
  beforeEach(() => {
    createRecruitmentRecordMock.mockReset()
    createRecruitmentRecordMock.mockResolvedValue({ data: { id: 99, month: '115.03' } })
    successMock.mockReset()
    errorMock.mockReset()
    hasPermissionMock.mockReset()
    hasPermissionMock.mockReturnValue(true)
  })

  it('有 RECRUITMENT_WRITE 時渲染「新增訪視」按鈕', () => {
    const wrapper = mountComp()
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('新增訪視')
  })

  it('無權限時不渲染按鈕', () => {
    hasPermissionMock.mockReturnValue(false)
    const wrapper = mountComp()
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('openDialog 會 fetchOptions 並開啟 dialog', async () => {
    const dash = makeDashboard()
    const wrapper = mountComp(dash)
    const vm = wrapper.vm as unknown as ExposedVm
    await vm.openDialog()
    await flushPromises()
    expect(dash.fetchOptions).toHaveBeenCalled()
    expect(vm.dialogVisible).toBe(true)
  })

  it('儲存成功：payload 不含 month_raw、呼叫 create、emit created', async () => {
    const wrapper = mountComp()
    const vm = wrapper.vm as unknown as ExposedVm
    vm.form.child_name = '王小明'
    vm.form.month = '115.03'
    vm.form.month_raw = '2026-03-01'
    await vm.handleSave()
    await flushPromises()
    expect(createRecruitmentRecordMock).toHaveBeenCalledTimes(1)
    const payload = createRecruitmentRecordMock.mock.calls[0][0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('month_raw')
    expect(payload.child_name).toBe('王小明')
    expect(successMock).toHaveBeenCalled()
    expect(vm.dialogVisible).toBe(false)
    expect(wrapper.emitted('created')).toBeTruthy()
    expect(wrapper.emitted('created')![0][0]).toMatchObject({ id: 99 })
  })

  it('儲存失敗：顯示錯誤、不 emit created、saving 復位', async () => {
    createRecruitmentRecordMock.mockRejectedValue(new Error('boom'))
    const wrapper = mountComp()
    const vm = wrapper.vm as unknown as ExposedVm
    await vm.handleSave()
    await flushPromises()
    expect(errorMock).toHaveBeenCalled()
    expect(wrapper.emitted('created')).toBeFalsy()
    expect(vm.saving).toBe(false)
  })
})
