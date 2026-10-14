import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

/**
 * 教師端桌機版「待我代理的假單」表格要標示「接手職務」（SPEC-026 §4.4 T13）。
 *
 * D4 不推播，代理人只能靠這份清單得知「這張假單要我接手請假人的職務班別、核准後我的班會被改」；
 * 手機版卡片（PortalSubstituteCardList）早就有標示，桌機表格漏了。文案與手機卡片共用同一個
 * TakesDutyTag 元件，兩邊不會漂移。
 */

const { mockColleagues, mockStats, mockSubstitutes } = vi.hoisted(() => ({
  mockColleagues: vi.fn(),
  mockStats: vi.fn(),
  mockSubstitutes: vi.fn(),
}))

vi.mock('@/api/portal', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return {
    ...actual,
    getMyColleagues: mockColleagues,
    getMyLeaveStats: mockStats,
    getMySubstituteRequests: mockSubstitutes,
    respondToSubstitute: vi.fn(),
  }
})

// 桌機分支（el-table）；happy-dom 不量版面，el-table 不渲染資料列，所以表格用最小 stub：
// el-table 把 data 逐列丟給 el-table-column 的 default slot，足以驗證「欄位內容」。
// 注意要回真的 ref：模板的 v-if="isMobile" 對「{ value: false }」這種普通物件不解包，會恆為真而走手機分支
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(false), cleanup: () => {} }) }
})

import PortalLeaveView from '@/views/portal/PortalLeaveView.vue'

const STUBS = {
  PortalLeaveList: { props: ['refreshTrigger'], template: '<div class="leave-list-stub" />' },
  PortalLeaveForm: { props: ['allEmployees'], template: '<div class="leave-form-stub" />' },
  TeacherBottomSheet: { props: ['modelValue', 'title'], template: '<div><slot v-if="modelValue" /></div>' },
  ElTable: {
    props: ['data'],
    provide() {
      return { tableRows: () => (this as unknown as { data: unknown[] }).data }
    },
    template: '<div class="table-stub"><slot /></div>',
  },
  ElTableColumn: {
    inject: ['tableRows'],
    props: ['label', 'prop'],
    template: `<div class="col-stub" :data-col="label || prop">
      <div v-for="(row, i) in tableRows()" :key="i" class="cell-stub" :data-row="i">
        <slot :row="row">{{ prop ? row[prop] : '' }}</slot>
      </div>
    </div>`,
  },
}

const REQUEST = {
  requester_name: '王老師',
  leave_type_label: '事假',
  substitute_status: 'pending',
  start_date: '2026-09-15',
  end_date: '2026-09-15',
  leave_hours: 8,
  reason: '家中有事',
  created_at: '2026-09-14T09:00:00',
}

async function mountDesktop() {
  const wrapper = mount(PortalLeaveView, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('PortalLeaveView 桌機版：待我代理的假單標示接手職務', () => {
  beforeEach(() => {
    mockColleagues.mockReset().mockResolvedValue({ data: [] })
    mockStats.mockReset().mockResolvedValue({ data: {} })
    mockSubstitutes.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('要求接手職務的假單顯示「接手職務」標籤與說明，沒要求的不顯示', async () => {
    mockSubstitutes.mockResolvedValue({
      data: [
        { ...REQUEST, id: 11, substitute_takes_duty: true },
        { ...REQUEST, id: 12, requester_name: '李老師', substitute_takes_duty: false },
      ],
    })
    const wrapper = await mountDesktop()

    const cells = wrapper.findAll('.col-stub[data-col="接手職務"] .cell-stub')
    expect(cells).toHaveLength(2)
    const byRequester = (name: string) =>
      wrapper.findAll('.col-stub[data-col="請假人"] .cell-stub').findIndex((c) => c.text() === name)
    const first = byRequester('王老師')
    const second = byRequester('李老師')
    expect(cells[first].find('[data-test="takes-duty-tag"]').exists()).toBe(true)
    expect(cells[first].text()).toContain('接手職務')
    expect(cells[second].find('[data-test="takes-duty-tag"]').exists()).toBe(false)
  })

  it('舊後端回應沒有 substitute_takes_duty 欄位時不顯示標籤、不報錯', async () => {
    mockSubstitutes.mockResolvedValue({ data: [{ ...REQUEST, id: 13 }] })
    const wrapper = await mountDesktop()

    expect(wrapper.find('[data-test="takes-duty-tag"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('王老師')
  })
})
