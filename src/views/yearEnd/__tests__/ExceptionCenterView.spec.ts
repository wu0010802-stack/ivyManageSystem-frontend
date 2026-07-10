import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { formatTimeTW } from '@/utils/format'

// ── Mock APIs ──────────────────────────────────────────────────────
vi.mock('@/api/appraisal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/appraisal')>()
  return {
    ...actual,
    listAppraisalCycles: vi.fn(),
    getAppraisalCycleExceptions: vi.fn(),
  }
})

vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    listYearEndCycles: vi.fn(),
    getYearEndCycleExceptions: vi.fn(),
  }
})

const mockHasPermission = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}))

// Task 14②③：週期選擇同步 URL query（acycle/ycycle），需要可觀察的 route.query / router.replace
// （比照 AppraisalPayoutView.spec.ts 慣例：routeQuery 為可變殼、replaceMock 供斷言）。
const routeQuery: { value: Record<string, unknown> } = { value: {} }
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
}))

import * as appraisalApi from '@/api/appraisal'
import * as yearEndApi from '@/api/yearEnd'
import ExceptionCenterView from '../ExceptionCenterView.vue'

// ── Fixtures ──────────────────────────────────────────────────────
interface CycleFixture { id: number; academic_year: number; status: string; semester?: number }
function makeCycle(overrides: Partial<CycleFixture> = {}): CycleFixture {
  return { id: 1, academic_year: 114, status: 'OPEN', semester: 1, ...overrides }
}
interface ExceptionItemFixture {
  type: string
  severity: 'blocking' | 'warning' | 'info'
  entity_type: string
  entity_id: string
  target_name: string
  reason: string
  impact: string
  suggested_action: string
  deep_link: string
}
function makeItem(overrides: Partial<ExceptionItemFixture> = {}): ExceptionItemFixture {
  return {
    type: 'missing_score_item',
    severity: 'blocking',
    entity_type: 'employee',
    entity_id: '42',
    target_name: '王小明',
    reason: '缺少考核加減分項目',
    impact: '無法產生考核總表',
    suggested_action: '請至考核明細補登記錄',
    deep_link: '/appraisal/participants/42',
    ...overrides,
  }
}
function makeExceptionsOut(overrides: Record<string, unknown> = {}) {
  return {
    cycle_id: 1,
    generated_at: '2026-07-06T03:15:00+00:00',
    counts_by_type: { missing_score_item: 1 },
    items: [makeItem()],
    ...overrides,
  }
}

// ── Stubs ────────────────────────────────────────────────────────
const ElSelectStub = defineComponent({
  name: 'ElSelectStub',
  props: { modelValue: { type: [Number, String], default: null } },
  emits: ['update:modelValue', 'change'],
  setup(props, { slots, emit, attrs }) {
    return () => h(
      'select',
      {
        class: 'el-select-stub',
        'data-test': attrs['data-test'],
        value: props.modelValue,
        onChange: (e: Event) => {
          const val = Number((e.target as HTMLSelectElement).value)
          emit('update:modelValue', val)
          emit('change', val)
        },
      },
      slots.default?.(),
    )
  },
})
const ElOptionStub = defineComponent({
  name: 'ElOptionStub',
  props: { label: String, value: [Number, String] },
  setup(props) {
    return () => h('option', { value: props.value }, props.label)
  },
})
const ElTagStub = defineComponent({
  name: 'ElTagStub',
  props: { type: { type: String, default: undefined } },
  setup(props, { slots }) {
    return () => h('span', { class: 'el-tag-stub', 'data-type': props.type }, slots.default?.())
  },
})
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  props: { loading: { type: Boolean, default: false } },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')))
    return () => h(
      'button',
      { ...dataAttrs, 'data-loading': props.loading ? 'true' : 'false', onClick: () => emit('click') },
      slots.default?.(),
    )
  },
})
const ElEmptyStub = defineComponent({
  name: 'ElEmptyStub',
  props: { description: { type: String, default: '' } },
  setup(props) {
    return () => h('div', { class: 'el-empty-stub' }, props.description)
  },
})
const ElAlertStub = defineComponent({
  name: 'ElAlertStub',
  props: { title: { type: String, default: '' } },
  setup(props) {
    return () => h('div', { class: 'el-alert-stub' }, props.title)
  },
})
const RouterLinkStub = defineComponent({
  name: 'RouterLinkStub',
  props: { to: { type: [String, Object], default: '' } },
  setup(props, { slots }) {
    return () => h('a', { class: 'router-link-stub', href: String(props.to) }, slots.default?.())
  },
})

const stubs = {
  'el-select': ElSelectStub,
  'el-option': ElOptionStub,
  'el-tag': ElTagStub,
  'el-button': ElButtonStub,
  'el-empty': ElEmptyStub,
  'el-alert': ElAlertStub,
  'el-skeleton': true,
  'router-link': RouterLinkStub,
}

async function mountView() {
  const wrapper = mount(ExceptionCenterView, { global: { stubs } })
  // 排乾掛載時的整條 async 鏈（loadCycles → loadExceptions → Promise.all 合併修正 → 單次 replace）：
  // macrotask 會等所有 pending microtask 跑完才執行，比固定次數 nextTick 更穩。
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
  return wrapper
}

describe('ExceptionCenterView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
    routeQuery.value = {}
  })

  it('掛載後對兩批次分別載入週期清單並取最新一筆（id 最大）例外', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({
      data: [makeCycle({ id: 3 }), makeCycle({ id: 5 }), makeCycle({ id: 4 })],
    } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
      data: [makeCycle({ id: 10 }), makeCycle({ id: 12 })],
    } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)
    vi.mocked(yearEndApi.getYearEndCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)

    await mountView()

    expect(appraisalApi.getAppraisalCycleExceptions).toHaveBeenCalledWith(5)
    expect(yearEndApi.getYearEndCycleExceptions).toHaveBeenCalledWith(12)
  })

  it('渲染 counts_by_type 磚（全部 + 各 type）', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({
      data: makeExceptionsOut({
        counts_by_type: { missing_score_item: 2, unsigned_summary: 1 },
        items: [
          makeItem({ type: 'missing_score_item' }),
          makeItem({ type: 'missing_score_item', entity_id: '43' }),
          makeItem({ type: 'unsigned_summary', entity_id: '44' }),
        ],
      }),
    } as never)
    vi.mocked(yearEndApi.getYearEndCycleExceptions).mockResolvedValue({ data: makeExceptionsOut({ items: [], counts_by_type: {} }) } as never)

    const wrapper = await mountView()
    const appraisalGroup = wrapper.get('[data-test="group-appraisal"]')
    expect(appraisalGroup.text()).toContain('全部')
    expect(appraisalGroup.text()).toContain('missing_score_item')
    expect(appraisalGroup.text()).toContain('unsigned_summary')
    // 全部 tile 顯示 3（items.length），各 type tile 顯示各自 count
    const chipsText = appraisalGroup.get('[data-test="appraisal-type-chip-all"]').text()
    expect(chipsText).toContain('3')
  })

  it('點擊 type chip 篩選清單', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({
      data: makeExceptionsOut({
        counts_by_type: { missing_score_item: 1, unsigned_summary: 1 },
        items: [
          makeItem({ type: 'missing_score_item', target_name: '王小明' }),
          makeItem({ type: 'unsigned_summary', target_name: '李小華', entity_id: '99' }),
        ],
      }),
    } as never)

    const wrapper = await mountView()
    const group = wrapper.get('[data-test="group-appraisal"]')
    expect(group.text()).toContain('王小明')
    expect(group.text()).toContain('李小華')

    await group.get('[data-test="appraisal-type-chip-unsigned_summary"]').trigger('click')
    await nextTick()

    expect(group.text()).not.toContain('王小明')
    expect(group.text()).toContain('李小華')
  })

  it('severity 對照：blocking=danger、warning=warning、info=info', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({
      data: makeExceptionsOut({
        counts_by_type: { a: 1, b: 1, c: 1 },
        items: [
          makeItem({ type: 'a', severity: 'blocking', entity_id: '1' }),
          makeItem({ type: 'b', severity: 'warning', entity_id: '2' }),
          makeItem({ type: 'c', severity: 'info', entity_id: '3' }),
        ],
      }),
    } as never)

    const wrapper = await mountView()
    const tags = wrapper.findAll('.el-tag-stub')
    expect(tags.map((t) => t.attributes('data-type'))).toEqual(['danger', 'warning', 'info'])
  })

  it('空狀態：本批次沒有待處理事項', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({
      data: makeExceptionsOut({ items: [], counts_by_type: {} }),
    } as never)

    const wrapper = await mountView()
    const group = wrapper.get('[data-test="group-appraisal"]')
    expect(group.find('.el-empty-stub').text()).toContain('本批次沒有待處理事項')
  })

  it('載入失敗顯示 apiError 訊息', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockRejectedValue({
      response: { data: { detail: '例外彙整暫時失敗' } },
    })

    const wrapper = await mountView()
    const group = wrapper.get('[data-test="group-appraisal"]')
    expect(group.find('.el-alert-stub').text()).toContain('例外彙整暫時失敗')
  })

  it('每筆項目渲染 target_name/reason/impact/suggested_action，且深連結 :to 對齊 deep_link', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({
      data: makeExceptionsOut({
        items: [makeItem({ deep_link: '/activity/registrations?match_status=pending' })],
      }),
    } as never)

    const wrapper = await mountView()
    const group = wrapper.get('[data-test="group-appraisal"]')
    expect(group.text()).toContain('王小明')
    expect(group.text()).toContain('缺少考核加減分項目')
    expect(group.text()).toContain('無法產生考核總表')
    expect(group.text()).toContain('請至考核明細補登記錄')
    const link = group.get('.router-link-stub')
    expect(link.attributes('href')).toBe('/activity/registrations?match_status=pending')
  })

  it('顯示 generated_at 彙整時間（formatTimeTW）', async () => {
    const generatedAt = '2026-07-06T03:15:00+00:00'
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({
      data: makeExceptionsOut({ generated_at: generatedAt }),
    } as never)

    const wrapper = await mountView()
    const group = wrapper.get('[data-test="group-appraisal"]')
    expect(group.text()).toContain(`彙整於 ${formatTimeTW(generatedAt)}`)
  })

  it('點擊重新整理按鈕重打目前選定週期的例外', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)

    const wrapper = await mountView()
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockClear()
    const group = wrapper.get('[data-test="group-appraisal"]')
    await group.get('[data-test="appraisal-refresh-button"]').trigger('click')
    await nextTick()

    expect(appraisalApi.getAppraisalCycleExceptions).toHaveBeenCalledWith(1)
  })

  it('切換週期下拉會重新載入該週期例外並重設 type 篩選', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({
      data: [makeCycle({ id: 1 }), makeCycle({ id: 2 })],
    } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)

    const wrapper = await mountView()
    expect(appraisalApi.getAppraisalCycleExceptions).toHaveBeenCalledWith(2)

    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockClear()
    const group = wrapper.get('[data-test="group-appraisal"]')
    const select = group.get('[data-test="appraisal-cycle-select"]')
    await select.setValue('1')
    await nextTick()

    expect(appraisalApi.getAppraisalCycleExceptions).toHaveBeenCalledWith(1)
  })

  it('只有 YEAR_END_READ 權限 → 只渲染年終批次群組', async () => {
    mockHasPermission.mockImplementation((p: unknown) => p === 'YEAR_END_READ')
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.getYearEndCycleExceptions).mockResolvedValue({ data: makeExceptionsOut({ items: [], counts_by_type: {} }) } as never)

    const wrapper = await mountView()
    expect(wrapper.find('[data-test="group-appraisal"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="group-year-end"]').exists()).toBe(true)
    expect(appraisalApi.listAppraisalCycles).not.toHaveBeenCalled()
  })

  // Task 14①：type chips 與 row 標題以 exceptionTypeLabel 顯示中文，非 raw code。
  it('type chips 與 row 標題顯示中文標籤而非 raw code', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({
      data: makeExceptionsOut({
        counts_by_type: { qualification: 1 },
        items: [makeItem({ type: 'qualification' })],
      }),
    } as never)

    const wrapper = await mountView()
    const group = wrapper.get('[data-test="group-appraisal"]')
    // chip 顯示中文標籤，且 data-test 選擇器仍用 raw code（不影響既有測試穩定性）
    const chip = group.get('[data-test="appraisal-type-chip-qualification"]')
    expect(chip.text()).toContain('年資資格疑義')
    expect(chip.text()).not.toContain('qualification')
    // row 標題同樣顯示中文標籤
    expect(group.get('.exception-row__type').text()).toBe('年資資格疑義')
  })

  // Task 14②：週期選擇同步 URL query（acycle/ycycle）——重載時以 URL 優先，變更時寫回、互不干擾。
  it('週期選擇同步 URL query（acycle/ycycle），重載後保留', async () => {
    routeQuery.value = { acycle: '3', ycycle: '10' }
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({
      data: [makeCycle({ id: 1 }), makeCycle({ id: 3 }), makeCycle({ id: 5 })],
    } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
      data: [makeCycle({ id: 10 }), makeCycle({ id: 12 })],
    } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)
    vi.mocked(yearEndApi.getYearEndCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)

    const wrapper = await mountView()

    // 重載後保留：URL 值（3 / 10）優先於「選最新」預設值（5 / 12）
    expect(appraisalApi.getAppraisalCycleExceptions).toHaveBeenCalledWith(3)
    expect(yearEndApi.getYearEndCycleExceptions).toHaveBeenCalledWith(10)
    expect(replaceMock).not.toHaveBeenCalled()

    // 變更考核側週期 → 寫回 acycle，且不動 ycycle（兩參數互不干擾）
    const group = wrapper.get('[data-test="group-appraisal"]')
    const select = group.get('[data-test="appraisal-cycle-select"]')
    await select.setValue('5')
    await nextTick()

    expect(replaceMock).toHaveBeenCalledWith({ query: expect.objectContaining({ acycle: '5', ycycle: '10' }) })
  })

  // Task 14③：URL 帶的週期值不在列表中（例如已刪除的週期）→ fallback 回預設「選最新」並用 replace 修正 URL。
  it('URL 週期值不在列表中時 fallback 回預設並修正 URL', async () => {
    routeQuery.value = { acycle: '999' }
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({
      data: [makeCycle({ id: 1 }), makeCycle({ id: 3 }), makeCycle({ id: 5 })],
    } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)

    await mountView()

    // fallback 回「選最新」（id 最大 = 5），而非停在無效的 999
    expect(appraisalApi.getAppraisalCycleExceptions).toHaveBeenCalledWith(5)
    // 並用 replace 修正 URL，避免地址列停留在已失效的週期值
    expect(replaceMock).toHaveBeenCalledWith({ query: expect.objectContaining({ acycle: '5' }) })
  })

  // Review fix：兩組 URL 值皆失效時，修正必須收斂為單次 replace——
  // 兩個 fire-and-forget 的併發 replace 會被 vue-router pendingLocation 機制互相取消，
  // 且後發起者的 query spread 是「修正前」快照，其中一組修正會被靜默還原成失效值。
  it('兩組 URL 週期值皆失效時只做一次 replace 且合併兩個修正', async () => {
    routeQuery.value = { acycle: '999', ycycle: '888' }
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({
      data: [makeCycle({ id: 1 }), makeCycle({ id: 3 }), makeCycle({ id: 5 })],
    } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
      data: [makeCycle({ id: 10 }), makeCycle({ id: 12 })],
    } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)
    vi.mocked(yearEndApi.getYearEndCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)

    await mountView()

    // 兩組各自 fallback 回「選最新」（5 / 12）
    expect(appraisalApi.getAppraisalCycleExceptions).toHaveBeenCalledWith(5)
    expect(yearEndApi.getYearEndCycleExceptions).toHaveBeenCalledWith(12)
    // 單次 replace、payload 同時含兩個修正後的 key（不可分兩次互相取消）
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith({
      query: expect.objectContaining({ acycle: '5', ycycle: '12' }),
    })
  })
})
