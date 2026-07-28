/**
 * 工作台置頂「下一件：… 處理 →」點下去沒反應（bug-hunt 2026-07-27）。
 *
 * 後端 api/portal/class_hub.py 為 sticky_next 產出
 *   deep_link = /portal/class-hub?sheet=medication&id=<log_id>
 * 但 PortalClassHubView 的 jumpDeep 只 router.push，全檔沒有任何地方讀
 * route.query.sheet。使用者已經在 class-hub 上，網址多了 query 但用藥抽屜不會打開。
 * （時段卡那一列點得開，所以只有置頂橫幅壞掉，症狀更難察覺。）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'

const routeQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: routeQuery }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/composables/usePortalClassHub', () => ({
  usePortalClassHub: () => ({
    data: { value: null },
    loading: { value: false },
    error: { value: null },
    classrooms: { value: [] },
    classroomId: { value: 1 },
    refresh: vi.fn(),
    load: vi.fn(),
  }),
}))

vi.mock('@/api/portalMeasurements', () => ({
  getMeasurementsLatest: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

vi.mock('@/utils/auth', () => ({
  hasPortalPermission: () => true,
  hasPermission: () => true,
  getUserInfo: () => ({ role: 'teacher', permission_names: [] }),
}))

import PortalClassHubView from '@/views/portal/PortalClassHubView.vue'

async function mountHub() {
  setActivePinia(createPinia())
  const wrapper = mount(PortalClassHubView, {
    global: { plugins: [ElementPlus], stubs: { teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('工作台的 sheet deep link', () => {
  beforeEach(() => {
    for (const k of Object.keys(routeQuery)) delete routeQuery[k]
  })

  it('網址帶 ?sheet=medication 時要打開用藥抽屜', async () => {
    routeQuery.sheet = 'medication'
    const wrapper = await mountHub()

    expect(
      (wrapper.vm as unknown as { sheets: Record<string, boolean> }).sheets
        .medication,
    ).toBe(true)
  })

  it('網址帶 ?sheet=attendance 時要打開點名抽屜', async () => {
    routeQuery.sheet = 'attendance'
    const wrapper = await mountHub()

    expect(
      (wrapper.vm as unknown as { sheets: Record<string, boolean> }).sheets
        .attendance,
    ).toBe(true)
  })

  it('沒帶 sheet 時所有抽屜維持關閉', async () => {
    const wrapper = await mountHub()
    const sheets = (wrapper.vm as unknown as { sheets: Record<string, boolean> })
      .sheets

    expect(sheets.medication).toBe(false)
    expect(sheets.attendance).toBe(false)
    expect(sheets.incident).toBe(false)
  })

  it('未知的 sheet 值不得打開任何抽屜', async () => {
    routeQuery.sheet = 'nonsense'
    const wrapper = await mountHub()
    const sheets = (wrapper.vm as unknown as { sheets: Record<string, boolean> })
      .sheets

    expect(Object.values(sheets).some(Boolean)).toBe(false)
  })
})
