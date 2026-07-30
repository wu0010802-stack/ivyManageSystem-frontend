import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import FunnelBoard from '../FunnelBoard.vue'
import FunnelAddVisit from '../FunnelAddVisit.vue'
import FunnelColumn from '../FunnelColumn.vue'
import { useRecruitmentFunnelStore } from '@/stores/recruitmentFunnel'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'

const infoMock = vi.hoisted(() => vi.fn())
const warningMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), info: infoMock, warning: warningMock },
  }
})

function emptyBoard() {
  return {
    stages: { visited: [], deposited: [], enrolled: [], withdrawn: [] },
    summary: { visited_count: 0, deposited_count: 0, enrolled_count: 0, withdrawn_count: 0 },
  }
}

function makeDashboard() {
  return {
    stats: ref<Record<string, unknown>>({ by_district: [] }),
    options: ref<Record<string, unknown>>({ sources: [], referrers: [], no_deposit_reasons: [] }),
    fetchOptions: vi.fn().mockResolvedValue(true),
  }
}

function mountBoard() {
  return mount(FunnelBoard, {
    props: { dashboard: makeDashboard() as unknown as ReturnType<typeof useRecruitmentDashboard> },
    global: {
      stubs: {
        FunnelAddVisit: true, FunnelColumn: true, FunnelSummaryBar: true,
        TransitionConfirmDialog: true, TimelineDrawer: true,
      },
    },
  })
}

describe('FunnelBoard 新增訪視串接', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    infoMock.mockReset()
    warningMock.mockReset()
  })

  it('子元件 created → 重載看板並 emit created', async () => {
    const store = useRecruitmentFunnelStore()
    store.board = { stages: { visited: [{ visit_id: 99 } as never], deposited: [], enrolled: [], withdrawn: [] },
      summary: emptyBoard().summary }
    const loadSpy = vi.spyOn(store, 'loadBoard').mockResolvedValue()
    const wrapper = mountBoard()
    await flushPromises()
    loadSpy.mockClear()

    await wrapper.findComponent(FunnelAddVisit).vm.$emit('created', { id: 99, month: '115.03' })
    await flushPromises()

    expect(loadSpy).toHaveBeenCalledWith({ force: true })
    expect(infoMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('created')).toBeTruthy()
  })

  it('看板重載失敗 → warning 提示且仍 emit created、不顯示 info', async () => {
    const store = useRecruitmentFunnelStore()
    store.board = emptyBoard()
    vi.spyOn(store, 'loadBoard').mockRejectedValue(new Error('network'))
    const wrapper = mountBoard()
    await flushPromises()
    await wrapper.findComponent(FunnelAddVisit).vm.$emit('created', { id: 99, month: '115.03' })
    await flushPromises()
    expect(warningMock).toHaveBeenCalled()
    expect(infoMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('created')).toBeTruthy()
  })

  it('新卡片不在目前篩選範圍 → 顯示提示', async () => {
    const store = useRecruitmentFunnelStore()
    store.board = emptyBoard() // 重載後仍無 visit_id=99
    const loadSpy = vi.spyOn(store, 'loadBoard').mockResolvedValue()
    const wrapper = mountBoard()
    await flushPromises()

    await wrapper.findComponent(FunnelAddVisit).vm.$emit('created', { id: 99, month: '110.03' })
    await flushPromises()

    expect(loadSpy).toHaveBeenCalledWith({ force: true })
    expect(infoMock).toHaveBeenCalledTimes(1)
    expect(infoMock.mock.calls[0][0]).toContain('不在目前篩選')
    expect(wrapper.emitted('created')).toBeTruthy()
  })

  it('四欄 stage 為 visited/deposited/enrolled/withdrawn（不再有 active）', async () => {
    const store = useRecruitmentFunnelStore()
    store.board = emptyBoard()
    vi.spyOn(store, 'loadBoard').mockResolvedValue()
    const wrapper = mountBoard()
    await flushPromises()
    const columns = wrapper.findAllComponents(FunnelColumn)
    expect(columns.map((c) => c.props('stage'))).toEqual([
      'visited', 'deposited', 'enrolled', 'withdrawn',
    ])
    expect(columns[3].props('title')).toBe('退預繳／退註冊')
  })
})
