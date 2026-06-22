import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// ② 家長端報名前讀報名時段、關閉即 disable「開始報名」按鈕並顯示提示。
const getRegistrationTimeMock = vi.fn()
vi.mock('@/parent/api/activity', () => ({
  listCourses: vi.fn().mockResolvedValue({ data: { items: [] } }),
  myRegistrations: vi.fn().mockResolvedValue({ data: { items: [] } }),
  registerCourses: vi.fn().mockResolvedValue({ data: {} }),
  confirmPromotion: vi.fn().mockResolvedValue({ data: {} }),
  getRegistrationTime: (...a: unknown[]) => getRegistrationTimeMock(...a),
}))

vi.mock('@/parent/api/profile', () => ({
  getMyChildren: vi
    .fn()
    .mockResolvedValue({ data: { items: [{ student_id: 1, name: '小明' }] } }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const STUBS = {
  ActivityHero: true,
  ActivityCardList: true,
  ActivityRegisterSheet: true,
  RegistrationStatusList: true,
  ChildContextHeader: true,
  ParentIcon: true,
  // PullToRefresh 必須渲染預設 slot，否則 tab 內容（含按鈕）不會出現
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
}

async function buildView() {
  setActivePinia(createPinia())
  const ActivityView = (await import('@/parent/views/ActivityView.vue')).default
  const w = mount(ActivityView, { global: { stubs: STUBS } })
  await flushPromises()
  // 切到「可報名課程」tab（第二顆 tab 按鈕）
  const tabs = w.findAll('.tab-btn')
  await tabs[1].trigger('click')
  await flushPromises()
  return w
}

function regButton(w: ReturnType<typeof mount>) {
  return w.findAll('button').find((b) => b.text().includes('開始報名'))
}

describe('ActivityView 報名時段守衛（②）', () => {
  beforeEach(() => {
    getRegistrationTimeMock.mockReset()
  })

  it('報名已關閉（is_open=false）時 disable「開始報名」並顯示提示', async () => {
    getRegistrationTimeMock.mockResolvedValue({
      data: { is_open: false, open_at: null, close_at: null },
    })
    const w = await buildView()
    const btn = regButton(w)
    expect(btn).toBeTruthy()
    expect(btn!.attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('報名尚未開放')
  })

  it('報名截止（close_at 已過）時 disable 並顯示「報名已截止」', async () => {
    getRegistrationTimeMock.mockResolvedValue({
      data: { is_open: true, open_at: '2020-01-01T00:00', close_at: '2020-01-02T00:00' },
    })
    const w = await buildView()
    expect(regButton(w)!.attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('報名已截止')
  })

  it('報名開放中（is_open=true 無時間限制）時按鈕可用、無關閉提示', async () => {
    getRegistrationTimeMock.mockResolvedValue({
      data: { is_open: true, open_at: null, close_at: null },
    })
    const w = await buildView()
    expect(regButton(w)!.attributes('disabled')).toBeUndefined()
    expect(w.text()).not.toContain('報名尚未開放')
    expect(w.text()).not.toContain('報名已截止')
  })

  it('讀取報名時段失敗時 fail-open（按鈕可用，後端仍為硬閘）', async () => {
    getRegistrationTimeMock.mockRejectedValue(new Error('network'))
    const w = await buildView()
    expect(regButton(w)!.attributes('disabled')).toBeUndefined()
  })
})
