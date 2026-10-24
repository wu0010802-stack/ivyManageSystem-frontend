// src/components/attendance/__tests__/ResolveCard.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ResolveCard from '../ResolveCard.vue'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'

// ── mock ElMessageBox（設定問題提醒的二次確認）─────────────────────────────────
const box = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('element-plus')>()),
  ElMessageBox: { confirm: box.confirm },
}))

// ── mock hasPermission ─────────────────────────────────────────────────────────
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

// Import after mock so we get the mocked version
import { hasPermission } from '@/utils/auth'
const mockHasPermission = hasPermission as ReturnType<typeof vi.fn>

// ── fixture data（detail 用後端實際的寫法）─────────────────────────────────────
const itemLate: AnomalyDayCard = {
  id: 10,
  employee_name: '王遲到',
  employee_number: 'E002',
  date: '2026-06-01',
  weekday: '一',
  confirmed_action: null,
  items: [
    { type: 'late', type_label: '遲到', detail: '遲到 15 分鐘', estimated_deduction: 300 },
  ],
}

const itemMissingPunch: AnomalyDayCard = {
  id: 20,
  employee_name: '李缺卡',
  employee_number: 'E003',
  date: '2026-06-02',
  weekday: '二',
  confirmed_action: null,
  items: [
    { type: 'missing_punch', type_label: '未打卡(下班)', detail: '下班未打卡（不扣款，僅記錄）', estimated_deduction: 0 },
  ],
}

type CardContext = {
  punch_in: string | null
  punch_out: string | null
  has_leave: boolean
  estimated_deduction: number
  plan?: string | null
  records?: 'loading' | 'loaded' | 'failed'
}

const defaultContext: CardContext = {
  punch_in: '08:15',
  punch_out: '17:00',
  has_leave: false,
  estimated_deduction: 300,
}

const missingOutContext: CardContext = {
  punch_in: '08:00',
  punch_out: null,
  has_leave: false,
  estimated_deduction: 0,
}

// ── stubs ──────────────────────────────────────────────────────────────────────
// Button stub that forwards click and supports disabled
const ElButton = {
  props: ['type', 'disabled', 'plain'],
  emits: ['click'],
  template: `<button
    class="el-button"
    :data-type="type"
    :disabled="disabled"
    @click="!disabled && $emit('click')"
  ><slot /></button>`,
}

// TimePicker stub: simple input that accepts v-model (modelValue)
const ElTimePicker = {
  props: ['modelValue', 'format', 'valueFormat', 'placeholder', 'disabled'],
  emits: ['update:modelValue'],
  template: `<input
    class="el-time-picker"
    :value="modelValue ?? ''"
    @input="$emit('update:modelValue', $event.target.value)"
  />`,
}

// 豁免理由：textarea 版的 el-input
const ElInput = {
  props: ['modelValue', 'type', 'maxlength', 'placeholder', 'id', 'rows', 'showWordLimit'],
  emits: ['update:modelValue'],
  template: `<textarea
    class="el-input"
    :id="id"
    :maxlength="maxlength"
    :placeholder="placeholder"
    :value="modelValue ?? ''"
    @input="$emit('update:modelValue', $event.target.value)"
  />`,
}

const stubs = { ElButton, ElTimePicker, ElInput }

// ── mount helper ───────────────────────────────────────────────────────────────
function mountCard(overrides: {
  item?: AnomalyDayCard
  index?: number
  total?: number
  context?: CardContext
  busy?: boolean
  showNav?: boolean
  actions?: Array<'punch' | 'admin_accept' | 'admin_waive'>
  primaryAction?: boolean
  acceptWarning?: string | null
  sealed?: boolean
}) {
  return mount(ResolveCard, {
    props: {
      item: overrides.item ?? itemLate,
      index: overrides.index ?? 0,
      total: overrides.total ?? 3,
      context: overrides.context ?? defaultContext,
      busy: overrides.busy ?? false,
      ...(overrides.showNav !== undefined ? { showNav: overrides.showNav } : {}),
      ...(overrides.actions ? { actions: overrides.actions } : {}),
      ...(overrides.primaryAction !== undefined ? { primaryAction: overrides.primaryAction } : {}),
      ...(overrides.acceptWarning !== undefined ? { acceptWarning: overrides.acceptWarning } : {}),
      ...(overrides.sealed !== undefined ? { sealed: overrides.sealed } : {}),
    },
    global: { stubs },
  })
}

type Wrapper = ReturnType<typeof mountCard>
const button = (w: Wrapper, text: string) => w.findAll('button').find((b) => b.text() === text)
const labels = (w: Wrapper) => w.findAll('button').map((b) => b.text())
const openWaive = async (w: Wrapper) => {
  await w.get('[data-test="resolve-waive-start"]').trigger('click')
  await nextTick()
}

// ── tests ──────────────────────────────────────────────────────────────────────
describe('ResolveCard 決策卡', () => {
  beforeEach(() => {
    mockHasPermission.mockReturnValue(true)
    box.confirm.mockReset()
  })

  it('逐人檢視的標頭：姓名、日期、第 n / N 件', () => {
    const wrapper = mountCard({ index: 1, total: 5 })
    expect(wrapper.text()).toContain('王遲到')
    expect(wrapper.text()).toContain('2026-06-01（一）')
    expect(wrapper.get('[data-test="resolve-counter"]').text()).toBe('第 2 / 5 件')
  })

  it('判定放大寫在最上面（「分鐘」寫成「分」、拿掉括號說明），右側是預估扣款', () => {
    const wrapper = mountCard({})
    expect(wrapper.get('[data-test="resolve-verdict"]').text()).toBe('遲到 15 分')
    expect(wrapper.get('[data-test="resolve-amount"]').text()).toBe('−NT$300')
  })

  it('一天多個異常：判定一起列；有遲到早退＝扣款色，只有缺卡＝缺卡色', () => {
    const multi: AnomalyDayCard = {
      ...itemLate,
      items: [
        { type: 'late', type_label: '遲到', detail: '遲到 15 分鐘', estimated_deduction: 300 },
        { type: 'missing_punch', type_label: '未打卡(下班)', detail: '下班未打卡（不扣款，僅記錄）', estimated_deduction: 0 },
      ],
    }
    const both = mountCard({ item: multi })
    expect(both.get('[data-test="resolve-verdict"]').text()).toBe('遲到 15 分・下班未打卡')
    expect(both.get('[data-test="resolve-decision"]').classes()).toContain('resolve-card__decision--deduct')
    const missing = mountCard({ item: itemMissingPunch, context: missingOutContext })
    expect(missing.get('[data-test="resolve-verdict"]').text()).toBe('下班未打卡')
    expect(missing.get('[data-test="resolve-decision"]').classes()).toContain('resolve-card__decision--missing')
  })

  it('預估扣款為 0 或空（金額遮罩）時不顯示金額', () => {
    expect(mountCard({ context: { ...defaultContext, estimated_deduction: 0 } }).find('[data-test="resolve-amount"]').exists()).toBe(false)
    expect(mountCard({ item: itemMissingPunch, context: missingOutContext }).find('[data-test="resolve-amount"]').exists()).toBe(false)
  })

  it('事實兩欄：應上班、實際；不再有重複的上班時間／下班時間／預估扣款方塊', () => {
    const wrapper = mountCard({ context: { ...defaultContext, plan: '早車 07:00–16:30（週排班）' } })
    const facts = wrapper.get('[data-test="resolve-facts"]')
    expect(facts.text()).toContain('應上班')
    expect(facts.text()).toContain('早車 07:00–16:30（週排班）')
    expect(facts.text()).toContain('實際')
    expect(facts.text()).toContain('08:15 – 17:00')
    expect(wrapper.text()).not.toContain('上班時間')
    expect(wrapper.text()).not.toContain('預估扣款')
  })

  it('沒給應上班（例如判定資料還沒到）就只寫實際；缺的那側寫「無紀錄」', () => {
    const wrapper = mountCard({ item: itemMissingPunch, context: missingOutContext })
    const facts = wrapper.get('[data-test="resolve-facts"]')
    expect(facts.text()).not.toContain('應上班')
    expect(facts.text()).toContain('08:00 – 無紀錄')
  })

  it('後果：有金額寫照扣多少；只缺卡寫記一次缺卡；都接「接受或豁免會套用到這天所有異常。」', () => {
    expect(mountCard({}).get('[data-test="resolve-consequence"]').text()).toBe('不處理的話，算薪時照扣 NT$300。接受或豁免會套用到這天所有異常。')
    expect(mountCard({ item: itemMissingPunch, context: missingOutContext }).get('[data-test="resolve-consequence"]').text())
      .toBe('不處理的話，記一次缺卡（不扣款）。接受或豁免會套用到這天所有異常。')
  })

  it('接受鈕是主要按鈕、文字帶金額；按下 emit admin_accept', async () => {
    const wrapper = mountCard({})
    const accept = wrapper.get('[data-test="resolve-accept"]')
    expect(accept.text()).toBe('接受扣款 NT$300')
    expect(accept.attributes('data-type')).toBe('primary')
    await accept.trigger('click')
    await nextTick()
    expect(wrapper.emitted('resolve')![0][0]).toEqual({ action: 'admin_accept' })
  })

  it('沒有金額時接受鈕不帶金額', () => {
    expect(mountCard({ context: { ...defaultContext, estimated_deduction: 0 } }).get('[data-test="resolve-accept"]').text()).toBe('接受扣款')
  })

  it('豁免要填理由：理由空白時「確認豁免」停用，填了才送出（帶去掉前後空白的理由）', async () => {
    const wrapper = mountCard({})
    expect(button(wrapper, '豁免…')).toBeTruthy()
    expect(wrapper.find('[data-test="resolve-waive"]').exists()).toBe(false)
    await openWaive(wrapper)
    const confirm = () => wrapper.get('[data-test="resolve-waive-confirm"]')
    expect(confirm().attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="resolve-waive-reason"]').setValue('   ')
    expect(confirm().attributes('disabled')).toBeDefined()
    await confirm().trigger('click')
    expect(wrapper.emitted('resolve')).toBeFalsy()
    await wrapper.get('[data-test="resolve-waive-reason"]').setValue('  園長同意晚到 ')
    expect(confirm().attributes('disabled')).toBeUndefined()
    await confirm().trigger('click')
    expect(wrapper.emitted('resolve')![0][0]).toEqual({ action: 'admin_waive', remark: '園長同意晚到' })
  })

  it('常用理由點了是填入（取代原本內容），之後仍可再改', async () => {
    const wrapper = mountCard({})
    await openWaive(wrapper)
    const reason = () => wrapper.get('[data-test="resolve-waive-reason"]').element as HTMLTextAreaElement
    expect(labels(wrapper)).toEqual(expect.arrayContaining(['園方指派外出', '打卡機故障', '園長同意']))
    await wrapper.get('[data-test="resolve-waive-reason"]').setValue('自己寫的')
    await button(wrapper, '打卡機故障')!.trigger('click')
    expect(reason().value).toBe('打卡機故障')
    await wrapper.get('[data-test="resolve-waive-reason"]').setValue('打卡機故障，9/17 已報修')
    await wrapper.get('[data-test="resolve-waive-confirm"]').trigger('click')
    expect(wrapper.emitted('resolve')![0][0]).toEqual({ action: 'admin_waive', remark: '打卡機故障，9/17 已報修' })
  })

  it('理由欄：最多 200 字、有範例提示與標籤', async () => {
    const wrapper = mountCard({})
    await openWaive(wrapper)
    const reason = wrapper.get('[data-test="resolve-waive-reason"]')
    expect(reason.attributes('maxlength')).toBe('200')
    expect(reason.attributes('placeholder')).toBe('或自己寫，例如：園長同意晚到')
    const id = reason.attributes('id')
    expect(id).toBeTruthy()
    expect(wrapper.get(`label[for="${id}"]`).text()).toContain('豁免理由')
  })

  it('取消：收起理由並清空，回到兩顆按鈕', async () => {
    const wrapper = mountCard({})
    await openWaive(wrapper)
    await wrapper.get('[data-test="resolve-waive-reason"]').setValue('打錯了')
    await button(wrapper, '取消')!.trigger('click')
    expect(wrapper.find('[data-test="resolve-waive"]').exists()).toBe(false)
    expect(button(wrapper, '豁免…')).toBeTruthy()
    await openWaive(wrapper)
    expect((wrapper.get('[data-test="resolve-waive-reason"]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('isDirty：打了豁免理由還沒送出也算', async () => {
    const wrapper = mountCard({})
    const vm = wrapper.vm as unknown as { isDirty: () => boolean }
    expect(vm.isDirty()).toBe(false)
    await openWaive(wrapper)
    expect(vm.isDirty()).toBe(false)
    await wrapper.get('[data-test="resolve-waive-reason"]').setValue('園長同意')
    expect(vm.isDirty()).toBe(true)
  })

  it('換一件（item 變了）收起豁免理由', async () => {
    const wrapper = mountCard({})
    await openWaive(wrapper)
    await wrapper.get('[data-test="resolve-waive-reason"]').setValue('園長同意')
    await wrapper.setProps({ item: { ...itemLate, id: 11, date: '2026-06-03' } })
    expect(wrapper.find('[data-test="resolve-waive"]').exists()).toBe(false)
    expect((wrapper.vm as unknown as { isDirty: () => boolean }).isDirty()).toBe(false)
  })

  it('補打卡收在可展開區塊：不是只缺卡時預設收合；只缺卡、或只能補卡時預設展開', () => {
    const late = mountCard({ context: missingOutContext })
    expect(late.get('[data-test="resolve-punch"]').element.tagName).toBe('DETAILS')
    expect(late.get('[data-test="resolve-punch"]').attributes('open')).toBeUndefined()
    expect(late.get('[data-test="resolve-punch"] summary').text()).toBe('補打卡')
    expect(mountCard({ item: itemMissingPunch, context: missingOutContext }).get('[data-test="resolve-punch"]').attributes('open')).toBeDefined()
    const punchOnly = mountCard({ item: { ...itemLate, items: [] }, context: missingOutContext, actions: ['punch'] })
    expect(punchOnly.get('[data-test="resolve-punch"]').attributes('open')).toBeDefined()
  })

  it('缺下班卡填入時間後點「補打卡並重算」→ emit resolve punch payload（表單邏輯不變）', async () => {
    const wrapper = mountCard({ item: itemMissingPunch, context: missingOutContext })
    const timePickers = wrapper.findAll('.el-time-picker')
    expect(timePickers).toHaveLength(1)
    await timePickers[0].setValue('18:00')
    await nextTick()
    const punchBtn = button(wrapper, '補打卡並重算')!
    // 決策卡的主要按鈕是接受，補打卡不搶主色
    expect(punchBtn.attributes('data-type')).not.toBe('primary')
    await punchBtn.trigger('click')
    await nextTick()
    expect(wrapper.emitted('resolve')![0][0]).toEqual({ action: 'punch', punch_in: '08:00', punch_out: '18:00' })
  })

  it('點「下一件」→ emit navigate(1)；「上一件」→ navigate(-1)；到頭到尾停用', async () => {
    const wrapper = mountCard({ index: 1, total: 3 })
    await wrapper.get('[data-test="resolve-next"]').trigger('click')
    await wrapper.get('[data-test="resolve-prev"]').trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([[1], [-1]])
    expect(mountCard({ index: 0, total: 3 }).get('[data-test="resolve-prev"]').attributes('disabled')).toBeDefined()
    expect(mountCard({ index: 2, total: 3 }).get('[data-test="resolve-next"]').attributes('disabled')).toBeDefined()
  })

  it('hasPermission 回 false 時動作與後果都不顯示', () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = mountCard({})
    const text = wrapper.text()
    expect(text).not.toContain('補打卡')
    expect(text).not.toContain('接受扣款')
    expect(text).not.toContain('豁免')
  })

  it('context.has_leave=true 時顯示「當日有請假」', () => {
    const wrapper = mountCard({ context: { ...defaultContext, has_leave: true } })
    expect(wrapper.text()).toContain('當日有請假')
  })

  it('僅 context 變更（item 不變）→ 補卡時間 ref 亦被 reset', async () => {
    // characterization：context 是父層 computed，每次換筆都回新物件參考；
    // 保留的 watch(context) 已能承擔 reset，故單獨改 context 即應清空 local ref。
    const wrapper = mountCard({ item: itemMissingPunch, context: missingOutContext })
    const outPicker = wrapper.findAll('.el-time-picker')[0]
    await outPicker.setValue('21:00')
    await nextTick()
    expect((outPicker.element as HTMLInputElement).value).toBe('21:00')
    await wrapper.setProps({ context: { punch_in: '08:00', punch_out: null, has_leave: false, estimated_deduction: 0 } })
    await nextTick()
    expect((wrapper.findAll('.el-time-picker')[0].element as HTMLInputElement).value).toBe('')
  })

  it('busy=true 時接受、豁免鈕停用且點擊不 emit（P1-4 防重複送出）', async () => {
    const wrapper = mountCard({ busy: true })
    const accept = wrapper.get('[data-test="resolve-accept"]')
    expect(accept.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="resolve-waive-start"]').attributes('disabled')).toBeDefined()
    await accept.trigger('click')
    expect(wrapper.emitted('resolve')).toBeFalsy()
  })

  it('props.item 變更後補卡時間 ref 被 reset（換筆清空）', async () => {
    const wrapper = mountCard({ item: itemMissingPunch, context: missingOutContext })
    await wrapper.findAll('.el-time-picker')[0].setValue('19:00')
    await nextTick()
    await wrapper.setProps({ item: itemLate, context: defaultContext })
    await nextTick()
    await wrapper.setProps({ item: itemMissingPunch, context: missingOutContext })
    await nextTick()
    expect((wrapper.findAll('.el-time-picker')[0].element as HTMLInputElement).value).toBe('')
  })
})

describe('ResolveCard — 嵌在排班與出勤抽屜', () => {
  beforeEach(() => mockHasPermission.mockReturnValue(true))

  it('showNav=false 不畫姓名日期列與上下件（抽屜標題已有）', () => {
    const w = mountCard({ showNav: false, total: 1 })
    expect(w.find('[data-test="resolve-counter"]').exists()).toBe(false)
    expect(w.find('[data-test="resolve-next"]').exists()).toBe(false)
    expect(w.text()).not.toContain('王遲到')
  })

  it('actions 只列允許的動作；沒有接受扣款／豁免時也不寫後果', () => {
    const punchOnly = mountCard({ item: { ...itemLate, items: [] }, context: missingOutContext, actions: ['punch'] })
    expect(labels(punchOnly)).toContain('補打卡並重算')
    expect(punchOnly.find('[data-test="resolve-accept"]').exists()).toBe(false)
    expect(labels(punchOnly)).not.toContain('豁免…')
    expect(punchOnly.find('[data-test="resolve-consequence"]').exists()).toBe(false)
    const confirmOnly = mountCard({ actions: ['admin_accept', 'admin_waive'] })
    expect(labels(confirmOnly)).not.toContain('補打卡並重算')
    expect(confirmOnly.find('[data-test="resolve-punch"]').exists()).toBe(false)
  })

  it('primaryAction=false：接受不是主要按鈕（同一抽屜另有主要動作時不得兩顆主色鈕）', () => {
    expect(mountCard({ primaryAction: false }).get('[data-test="resolve-accept"]').attributes('data-type')).not.toBe('primary')
    expect(mountCard({}).get('[data-test="resolve-accept"]').attributes('data-type')).toBe('primary')
  })
})

describe('ResolveCard — 打卡紀錄未載入／載入失敗（QA #22）', () => {
  beforeEach(() => mockHasPermission.mockReturnValue(true))
  const unknownContext = (records: 'loading' | 'failed'): CardContext => ({ punch_in: null, punch_out: null, has_leave: false, estimated_deduction: 0, records })

  it('載入中：不把「不知道」顯示成缺卡，不出補卡時間欄，補打卡停用；確認缺卡／豁免仍可用', () => {
    const w = mountCard({ item: itemMissingPunch, context: unknownContext('loading') })
    expect(w.findAll('.el-time-picker')).toHaveLength(0)
    expect(w.text()).toContain('打卡紀錄載入中')
    expect(w.text()).not.toContain('無紀錄')
    expect(button(w, '補打卡並重算')!.attributes('disabled')).toBeDefined()
    expect(w.get('[data-test="resolve-accept"]').attributes('disabled')).toBeUndefined()
    expect(button(w, '豁免…')!.attributes('disabled')).toBeUndefined()
  })

  it('載入失敗：寫出失敗並可重試，補打卡停用', async () => {
    const w = mountCard({ item: itemMissingPunch, context: unknownContext('failed') })
    expect(w.findAll('.el-time-picker')).toHaveLength(0)
    expect(w.text()).toContain('打卡紀錄載入失敗')
    expect(button(w, '補打卡並重算')!.attributes('disabled')).toBeDefined()
    await button(w, '重試')!.trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('載入中仍算豁免理由是否未送出', async () => {
    const w = mountCard({ item: itemMissingPunch, context: unknownContext('loading') })
    await openWaive(w)
    await w.get('[data-test="resolve-waive-reason"]').setValue('打卡機故障')
    expect((w.vm as unknown as { isDirty: () => boolean }).isDirty()).toBe(true)
  })
})

describe('ResolveCard — 只有缺卡的日子與設定問題提醒（第五輪審查）', () => {
  beforeEach(() => {
    mockHasPermission.mockReturnValue(true)
    box.confirm.mockReset()
  })

  it('整天只有缺卡（不扣薪）：按鈕寫「確認缺卡」不寫「接受扣款」；送出帶「已確認缺卡」提示', async () => {
    const w = mountCard({ item: itemMissingPunch, context: missingOutContext })
    const accept = w.get('[data-test="resolve-accept"]')
    expect(accept.text()).toBe('確認缺卡')
    expect(w.text()).not.toContain('接受扣款')
    await accept.trigger('click')
    await nextTick()
    expect(w.emitted('resolve')![0][0]).toEqual({ action: 'admin_accept', doneText: '已確認缺卡' })
  })

  it('只有缺卡時豁免要說清楚範圍：只讓本月薪資不記入，年終與考核仍照次計（業主 2026-07-02 裁示）', async () => {
    const w = mountCard({ item: itemMissingPunch, context: missingOutContext })
    await openWaive(w)
    expect(w.get('[data-test="resolve-waive"]').text()).toContain('豁免只讓本月薪資不記入，年終與考核仍照次計')
    const late = mountCard({})
    await openWaive(late)
    expect(late.get('[data-test="resolve-waive"]').text()).not.toContain('年終')
  })

  it('有遲到的日子仍是「接受扣款」', () => {
    expect(mountCard({ item: itemLate }).get('[data-test="resolve-accept"]').text()).toContain('接受扣款')
  })

  it('有設定問題提醒時，接受扣款先問一次；取消就不送出，確認才送', async () => {
    box.confirm.mockRejectedValueOnce('cancel')
    const w = mountCard({ item: itemLate, acceptWarning: '黃老師本月每天遲到約 57 分，多半是時段設錯' })
    await w.get('[data-test="resolve-accept"]').trigger('click')
    await nextTick()
    await nextTick()
    expect(box.confirm).toHaveBeenCalledWith('黃老師本月每天遲到約 57 分，多半是時段設錯', '可能是設定問題', expect.objectContaining({ confirmButtonText: '仍要接受扣款', cancelButtonText: '先不要' }))
    expect(w.emitted('resolve')).toBeFalsy()

    box.confirm.mockResolvedValueOnce('confirm')
    await w.get('[data-test="resolve-accept"]').trigger('click')
    await nextTick()
    await nextTick()
    expect(w.emitted('resolve')![0][0]).toEqual({ action: 'admin_accept' })
  })

  it('沒有提醒時直接送出、不問；豁免永遠不問', async () => {
    const w = mountCard({ item: itemLate })
    await w.get('[data-test="resolve-accept"]').trigger('click')
    await nextTick()
    expect(box.confirm).not.toHaveBeenCalled()
    expect(w.emitted('resolve')![0][0]).toEqual({ action: 'admin_accept' })
    const warned = mountCard({ item: itemLate, acceptWarning: '設定問題' })
    await openWaive(warned)
    await button(warned, '園長同意')!.trigger('click')
    await warned.get('[data-test="resolve-waive-confirm"]').trigger('click')
    expect(box.confirm).not.toHaveBeenCalled()
    expect(warned.emitted('resolve')![0][0]).toEqual({ action: 'admin_waive', remark: '園長同意' })
  })
})

describe('ResolveCard — 薪資已封存只能看（R26）', () => {
  beforeEach(() => {
    mockHasPermission.mockReturnValue(true)
  })

  it('封存：不顯示補打卡、接受扣款、豁免與後果，改寫「這個月薪資已封存，只能看。」', () => {
    const wrapper = mountCard({ sealed: true })
    expect(wrapper.get('[data-test="resolve-sealed-note"]').text()).toBe('這個月薪資已封存，只能看。')
    const texts = labels(wrapper)
    expect(texts).not.toContain('補打卡並重算')
    expect(wrapper.find('[data-test="resolve-accept"]').exists()).toBe(false)
    expect(texts).not.toContain('豁免…')
    expect(wrapper.find('[data-test="resolve-consequence"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('您無權限執行操作')
  })

  it('封存：缺的那側打卡不給時間欄，寫「無紀錄」（不用破折號）；判定與上下件照常看得到', () => {
    const wrapper = mountCard({ sealed: true, context: missingOutContext })
    expect(wrapper.find('.el-time-picker').exists()).toBe(false)
    expect(wrapper.text()).toContain('無紀錄')
    expect(wrapper.text()).not.toContain('—')
    expect(wrapper.text()).toContain('遲到 15 分')
    expect(wrapper.find('[data-test="resolve-next"]').exists()).toBe(true)
  })

  it('沒封存：動作鈕與時間欄照舊，沒有封存提示', () => {
    const wrapper = mountCard({ sealed: false, context: missingOutContext })
    expect(wrapper.find('[data-test="resolve-sealed-note"]').exists()).toBe(false)
    expect(wrapper.find('.el-time-picker').exists()).toBe(true)
    expect(wrapper.get('[data-test="resolve-accept"]').text()).toBe('接受扣款')
  })

  it('封存：沒有可以送出的補卡，isDirty 恆為 false', async () => {
    const wrapper = mountCard({ sealed: true, context: missingOutContext })
    expect((wrapper.vm as unknown as { isDirty: () => boolean }).isDirty()).toBe(false)
  })

  it('沒有寫入權限仍寫無權限（不是封存）', () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = mountCard({})
    expect(wrapper.text()).toContain('您無權限執行操作')
    expect(wrapper.find('[data-test="resolve-sealed-note"]').exists()).toBe(false)
  })
})
