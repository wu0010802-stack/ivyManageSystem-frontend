/**
 * 教務紀錄 › 出席區塊（後台 IA 重整 S6）：原獨立「出席紀錄」一級頁籤併入教務紀錄的分類表格。
 * 守：三條進入路徑（父層 sectionRequest 深連結／出席率摘要卡片／請假列「看當時出席」）都落到出席區塊，
 * 請假列帶的日期區間會傳給出席區塊；預設進來仍是時間軸，不多打出席 API。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const getStudentRecordsTimeline = vi.hoisted(() => vi.fn())
vi.mock('@/api/studentRecords', () => ({ getStudentRecordsTimeline, getAcademicSummary: vi.fn() }))
vi.mock('@/stores/studentRecords', () => ({ useStudentRecordsStore: () => ({}) }))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/utils/domainBus', () => ({
  domainBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  RECORD_EVENTS: {},
  STUDENT_EVENTS: {},
}))

import RecordsTab from '../RecordsTab.vue'

const SummaryCardsStub = {
  name: 'SummaryCards',
  emits: ['jump-tab', 'jump-section'],
  template: '<div class="summary-stub" />',
}
const LeaveSectionStub = {
  name: 'LeaveSection',
  emits: ['jump-attendance'],
  template: '<div class="leave-stub" />',
}
const AttendanceTabStub = {
  name: 'AttendanceTab',
  props: ['studentId', 'active', 'externalDateRange'],
  template: '<div class="attendance-stub" />',
}

function mountTab(props: Record<string, unknown> = {}) {
  return mount(RecordsTab, {
    props: { studentId: 1, active: true, ...props },
    global: {
      plugins: [ElementPlus],
      directives: { loading: {} },
      stubs: {
        SummaryCards: SummaryCardsStub,
        LeaveSection: LeaveSectionStub,
        AttendanceTab: AttendanceTabStub,
        IncidentEditorDialog: true,
        AssessmentEditorDialog: true,
        ChangeLogEditorDialog: true,
      },
    },
  })
}
const attendance = (w: ReturnType<typeof mountTab>) => w.findComponent({ name: 'AttendanceTab' })
const activePaneLabel = (w: ReturnType<typeof mountTab>) => w.find('.el-tabs__item.is-active').text()

describe('RecordsTab › 出席區塊', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStudentRecordsTimeline.mockResolvedValue({ data: { items: [] } })
  })

  it('預設仍是時間軸：不掛出席區塊', async () => {
    const w = mountTab()
    await flushPromises()
    expect(attendance(w).exists()).toBe(false)
    expect(w.find('.el-timeline, .timeline-wrap').exists()).toBe(true)
  })

  it('分類表格的頁籤含「出席」（與事件、評量、請假、異動並列）', async () => {
    const w = mountTab({ sectionRequest: { section: 'incident', nonce: 1 } })
    await flushPromises()
    const labels = w.findAll('.el-tabs__item').map((n) => n.text())
    expect(labels).toContain('出席')
    expect(labels).toContain('請假')
    expect(labels.some((l) => l.startsWith('事件'))).toBe(true)
  })

  it('父層 sectionRequest=attendance（?tab=attendance 舊書籤、總覽卡片）→ 切到分類表格的出席，出席區塊為 active', async () => {
    const w = mountTab({ sectionRequest: { section: 'attendance', nonce: 1 } })
    await flushPromises()
    expect(activePaneLabel(w)).toBe('出席')
    expect(attendance(w).props('active')).toBe(true)
    expect(attendance(w).props('studentId')).toBe(1)
  })

  it('出席率摘要卡片（SummaryCards 仍以 jump-tab 表達）→ 出席區塊', async () => {
    const w = mountTab()
    await flushPromises()
    w.getComponent({ name: 'SummaryCards' }).vm.$emit('jump-tab', 'attendance')
    await flushPromises()
    expect(activePaneLabel(w)).toBe('出席')
    expect(attendance(w).props('active')).toBe(true)
  })

  it('其他摘要卡片（請假／評量／事件）仍各自切到自己的區塊，不受影響', async () => {
    const w = mountTab()
    await flushPromises()
    w.getComponent({ name: 'SummaryCards' }).vm.$emit('jump-section', 'leave')
    await flushPromises()
    expect(activePaneLabel(w)).toBe('請假')
  })

  it('請假列「看當時出席」→ 出席區塊並把請假起訖日當作預填區間', async () => {
    const w = mountTab({ sectionRequest: { section: 'leave', nonce: 1 } })
    await flushPromises()
    w.getComponent({ name: 'LeaveSection' }).vm.$emit('jump-attendance', { from: '2026-09-01', to: '2026-09-03' })
    await flushPromises()
    expect(activePaneLabel(w)).toBe('出席')
    expect(attendance(w).props('externalDateRange')).toEqual(['2026-09-01', '2026-09-03'])
  })

  it('不認得的區塊（如屬於成長頁籤的 timeline）忽略：維持時間軸', async () => {
    const w = mountTab({ sectionRequest: { section: 'timeline', nonce: 1 } })
    await flushPromises()
    expect(attendance(w).exists()).toBe(false)
  })

  it('出席區塊只在被看到時才 active（避免提早打出席 API）', async () => {
    const w = mountTab({ sectionRequest: { section: 'incident', nonce: 1 } })
    await flushPromises()
    // 表格模式但停在事件：出席 pane 在 DOM 裡但 active=false
    expect(attendance(w).exists()).toBe(true)
    expect(attendance(w).props('active')).toBe(false)
  })

  it('RecordsTab 不再對外 emit jump-tab（出席已在本元件內）', async () => {
    const w = mountTab({ sectionRequest: { section: 'attendance', nonce: 1 } })
    await flushPromises()
    w.getComponent({ name: 'SummaryCards' }).vm.$emit('jump-tab', 'attendance')
    w.getComponent({ name: 'LeaveSection' }).vm.$emit('jump-attendance', { from: 'a', to: 'b' })
    await flushPromises()
    expect(w.emitted('jump-tab')).toBeUndefined()
  })
})
