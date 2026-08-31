// src/components/attendance/__tests__/ResolveCard.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ResolveCard from '../ResolveCard.vue'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'

// ── mock hasPermission ─────────────────────────────────────────────────────────
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

// Import after mock so we get the mocked version
import { hasPermission } from '@/utils/auth'
const mockHasPermission = hasPermission as ReturnType<typeof vi.fn>

// ── fixture data ───────────────────────────────────────────────────────────────
const itemLate: AnomalyDayCard = {
  id: 10,
  employee_name: '王遲到',
  employee_number: 'E002',
  date: '2026-06-01',
  weekday: '一',
  confirmed_action: null,
  items: [
    { type: 'late', type_label: '遲到', detail: '遲到 15 分', estimated_deduction: 300 },
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
    { type: 'missing_punch', type_label: '未打卡', detail: '缺下班卡', estimated_deduction: 0 },
  ],
}

const defaultContext = {
  punch_in: '08:00',
  punch_out: '17:00',
  has_leave: false,
  estimated_deduction: 300,
}

const missingOutContext = {
  punch_in: '08:00',
  punch_out: null,
  has_leave: false,
  estimated_deduction: 0,
}

// ── stubs ──────────────────────────────────────────────────────────────────────
const ElTag = {
  props: ['type'],
  template: `<span class="el-tag" :data-type="type"><slot /></span>`,
}

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

const stubs = {
  ElTag,
  ElButton,
  ElTimePicker,
}

// ── mount helper ───────────────────────────────────────────────────────────────
function mountCard(overrides: {
  item?: AnomalyDayCard
  index?: number
  total?: number
  context?: typeof defaultContext | typeof missingOutContext
  busy?: boolean
}) {
  return mount(ResolveCard, {
    props: {
      item: overrides.item ?? itemLate,
      index: overrides.index ?? 0,
      total: overrides.total ?? 3,
      context: overrides.context ?? defaultContext,
      busy: overrides.busy ?? false,
    },
    global: { stubs },
  })
}

// ── tests ──────────────────────────────────────────────────────────────────────
describe('ResolveCard', () => {
  beforeEach(() => {
    mockHasPermission.mockReturnValue(true)
  })

  it('標頭顯示姓名、日期、第 n/N 筆', () => {
    const wrapper = mountCard({ index: 1, total: 5 })
    expect(wrapper.text()).toContain('王遲到')
    expect(wrapper.text()).toContain('2026-06-01')
    expect(wrapper.text()).toContain('一')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('5')
  })

  it('type_label 顯示在 el-tag 內', () => {
    const wrapper = mountCard({})
    const tag = wrapper.find('.el-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toContain('遲到')
  })

  it('missing_punch 的 el-tag type 為 danger', () => {
    const wrapper = mountCard({ item: itemMissingPunch, context: missingOutContext })
    const tag = wrapper.find('.el-tag')
    expect(tag.attributes('data-type')).toBe('danger')
  })

  it('late/early_leave 的 el-tag type 為 warning', () => {
    const wrapper = mountCard({ item: itemLate })
    const tag = wrapper.find('.el-tag')
    expect(tag.attributes('data-type')).toBe('warning')
  })

  it('點「接受扣款」→ emit resolve payload { action: admin_accept }', async () => {
    const wrapper = mountCard({})
    const btns = wrapper.findAll('button')
    const acceptBtn = btns.find((b) => b.text().includes('接受扣款'))
    expect(acceptBtn).toBeTruthy()
    await acceptBtn!.trigger('click')
    const emitted = wrapper.emitted('resolve')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({ action: 'admin_accept' })
  })

  it('點「豁免」→ emit resolve payload { action: admin_waive }', async () => {
    const wrapper = mountCard({})
    const btns = wrapper.findAll('button')
    const waiveBtn = btns.find((b) => b.text().includes('豁免'))
    expect(waiveBtn).toBeTruthy()
    await waiveBtn!.trigger('click')
    const emitted = wrapper.emitted('resolve')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({ action: 'admin_waive' })
  })

  it('缺下班卡（punch_out=null）填入時間後點「補打卡並重算」→ emit resolve punch payload', async () => {
    const wrapper = mountCard({
      item: itemMissingPunch,
      context: missingOutContext,
    })
    // Find the time picker for punch_out (it should be an editable input)
    const timePickers = wrapper.findAll('.el-time-picker')
    // There should be at least one time picker (for null punch_out)
    expect(timePickers.length).toBeGreaterThan(0)
    // Fill in punch_out
    const outPicker = timePickers[timePickers.length - 1]
    await outPicker.setValue('18:00')
    await nextTick()

    const btns = wrapper.findAll('button')
    const punchBtn = btns.find((b) => b.text().includes('補打卡'))
    expect(punchBtn).toBeTruthy()
    await punchBtn!.trigger('click')
    await nextTick()

    const emitted = wrapper.emitted('resolve')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { action: string; punch_in?: string; punch_out?: string }
    expect(payload.action).toBe('punch')
    expect(payload.punch_in).toBe('08:00')
    expect(payload.punch_out).toBe('18:00')
  })

  it('點 ▶ → emit navigate(1)', async () => {
    const wrapper = mountCard({ index: 1, total: 3 })
    const btns = wrapper.findAll('button')
    const nextBtn = btns.find((b) => b.text().includes('▶'))
    expect(nextBtn).toBeTruthy()
    await nextBtn!.trigger('click')
    const emitted = wrapper.emitted('navigate')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBe(1)
  })

  it('點 ◀ → emit navigate(-1)', async () => {
    const wrapper = mountCard({ index: 1, total: 3 })
    const btns = wrapper.findAll('button')
    const prevBtn = btns.find((b) => b.text().includes('◀'))
    expect(prevBtn).toBeTruthy()
    await prevBtn!.trigger('click')
    const emitted = wrapper.emitted('navigate')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBe(-1)
  })

  it('index=0 時 ◀ 按鈕 disabled', () => {
    const wrapper = mountCard({ index: 0, total: 3 })
    const btns = wrapper.findAll('button')
    const prevBtn = btns.find((b) => b.text().includes('◀'))
    expect(prevBtn).toBeTruthy()
    expect(prevBtn!.attributes('disabled')).toBeDefined()
  })

  it('index=total-1 時 ▶ 按鈕 disabled', () => {
    const wrapper = mountCard({ index: 2, total: 3 })
    const btns = wrapper.findAll('button')
    const nextBtn = btns.find((b) => b.text().includes('▶'))
    expect(nextBtn).toBeTruthy()
    expect(nextBtn!.attributes('disabled')).toBeDefined()
  })

  it('hasPermission 回 false 時三動作鈕不顯示', () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = mountCard({})
    const text = wrapper.text()
    expect(text).not.toContain('補打卡')
    expect(text).not.toContain('接受扣款')
    expect(text).not.toContain('豁免')
  })

  it('context.has_leave=true 時顯示「當日有請假」', () => {
    const wrapper = mountCard({
      context: { ...defaultContext, has_leave: true },
    })
    expect(wrapper.text()).toContain('當日有請假')
  })

  it('estimated_deduction > 0 時以紅字顯示金額', () => {
    const wrapper = mountCard({
      context: { ...defaultContext, estimated_deduction: 500 },
    })
    expect(wrapper.text()).toContain('500')
    const redEl = wrapper.find('.resolve-card__deduction--negative')
    expect(redEl.exists()).toBe(true)
  })

  it('僅 context 變更（item 不變）→ 補卡時間 ref 亦被 reset', async () => {
    // characterization：context 是父層 computed，每次換筆都回新物件參考；
    // 保留的 watch(context) 已能承擔 reset，故單獨改 context 即應清空 local ref。
    const wrapper = mountCard({
      item: itemMissingPunch,
      context: missingOutContext,
    })
    const timePickers = wrapper.findAll('.el-time-picker')
    const outPicker = timePickers[timePickers.length - 1]
    await outPicker.setValue('21:00')
    await nextTick()
    expect(outPicker.element.value).toBe('21:00')

    // 僅換 context（item 不變，模擬 recordsCache 更新或換筆時 computed 產生新物件）
    await wrapper.setProps({
      context: { punch_in: '08:00', punch_out: null, has_leave: false, estimated_deduction: 0 },
    })
    await nextTick()

    const pickersAfter = wrapper.findAll('.el-time-picker')
    const outPickerAfter = pickersAfter[pickersAfter.length - 1]
    expect(outPickerAfter.element.value).toBe('')
  })

  it('busy=true 時三動作鈕 disabled 且點擊不 emit（P1-4 防重複送出）', async () => {
    const wrapper = mountCard({ busy: true })
    const btns = wrapper.findAll('button')
    const acceptBtn = btns.find((b) => b.text().includes('接受扣款'))
    expect(acceptBtn!.attributes('disabled')).toBeDefined()
    await acceptBtn!.trigger('click')
    expect(wrapper.emitted('resolve')).toBeFalsy()
  })

  it('日卡多異常 → 每個異常各一個 el-tag，且顯示整天套用提示', () => {
    const multi: AnomalyDayCard = {
      ...itemLate,
      items: [
        { type: 'late', type_label: '遲到', detail: '遲到 15 分', estimated_deduction: 300 },
        { type: 'missing_punch', type_label: '未打卡(下班)', detail: '缺下班卡', estimated_deduction: 0 },
      ],
    }
    const wrapper = mountCard({ item: multi })
    expect(wrapper.findAll('.el-tag').length).toBe(2)
    expect(wrapper.text()).toContain('整天')
  })

  it('props.item 變更後補卡時間 ref 被 reset（換筆清空）', async () => {
    const wrapper = mountCard({
      item: itemMissingPunch,
      context: missingOutContext,
    })
    // Fill in punch_out
    const timePickers = wrapper.findAll('.el-time-picker')
    const outPicker = timePickers[timePickers.length - 1]
    await outPicker.setValue('19:00')
    await nextTick()

    // Switch to a different item
    await wrapper.setProps({ item: itemLate, context: defaultContext })
    await nextTick()

    // Switch back to missingPunch item — ref should be reset to context.punch_out (null)
    await wrapper.setProps({ item: itemMissingPunch, context: missingOutContext })
    await nextTick()

    // The time picker should now show empty / null (reset)
    const pickersAfter = wrapper.findAll('.el-time-picker')
    const outPickerAfter = pickersAfter[pickersAfter.length - 1]
    expect(outPickerAfter.element.value).toBe('')
  })
})
