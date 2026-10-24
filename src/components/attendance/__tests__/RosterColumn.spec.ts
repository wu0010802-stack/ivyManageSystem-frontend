// src/components/attendance/__tests__/RosterColumn.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RosterColumn from '../RosterColumn.vue'
import type { RosterRow } from '@/composables/useAttendanceWorkspace'

// ── fixture data ──────────────────────────────────────────────────────────────
const rowFull: RosterRow = {
  employee_id: 1,
  employee_name: '陳全勤',
  employee_number: 'E001',
  normal_days: 22,
  late_count: 0,
  early_leave_count: 0,
  missing_punch_in: 0,
  missing_punch_out: 0,
  total_late_minutes: 0,
}
const rowLate: RosterRow = {
  employee_id: 2,
  employee_name: '王遲到',
  employee_number: 'E002',
  normal_days: 20,
  late_count: 2,
  early_leave_count: 1,
  missing_punch_in: 0,
  missing_punch_out: 0,
  total_late_minutes: 45,
}
const rowMissing: RosterRow = {
  employee_id: 3,
  employee_name: '李缺卡',
  employee_number: 'E003',
  normal_days: 18,
  late_count: 0,
  early_leave_count: 0,
  missing_punch_in: 3,
  missing_punch_out: 2,
  total_late_minutes: 0,
}

// anomalyCount: rowFull=0, rowLate=3 (2+1+0+0), rowMissing=5 (0+0+3+2)
// expected sort order: rowMissing (5) > rowLate (3) > rowFull (0)

// ── stubs ─────────────────────────────────────────────────────────────────────
const ElInput = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: `<input
    :value="modelValue"
    :placeholder="placeholder"
    @input="$emit('update:modelValue', $event.target.value)"
  />`,
}

const ElTag = {
  props: ['type'],
  template: `<span :data-type="type"><slot /></span>`,
}

const ElEmpty = {
  props: ['description'],
  template: `<div class="el-empty">{{ description }}</div>`,
}

const EmptyStateStub = {
  props: ['variant', 'title', 'description'],
  template: `<div class="empty-state-stub">{{ title }}</div>`,
}

const stubs = {
  ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElInput,
  ElTag,
  ElEmpty,
  EmptyState: EmptyStateStub,
  // directive stub: v-loading just renders children
  vLoading: {}, // directives handled below
}

function mountRoster(props: {
  roster?: RosterRow[]
  selectedEmployeeId?: number | null
  loading?: boolean
  pendingCounts?: Record<string, number>
}) {
  return mount(RosterColumn, {
    props: {
      roster: props.roster ?? [rowFull, rowLate, rowMissing],
      selectedEmployeeId: props.selectedEmployeeId ?? null,
      loading: props.loading ?? false,
      ...(props.pendingCounts ? { pendingCounts: props.pendingCounts } : {}),
    },
    global: {
      stubs,
      directives: {
        loading: {
          // no-op directive stub
          mounted() {},
          updated() {},
        },
      },
    },
  })
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe('RosterColumn', () => {
  it('renders all roster names', () => {
    const wrapper = mountRoster({})
    expect(wrapper.text()).toContain('陳全勤')
    expect(wrapper.text()).toContain('王遲到')
    expect(wrapper.text()).toContain('李缺卡')
  })

  it('sorts by anomalyCount descending — most anomalies first', () => {
    const wrapper = mountRoster({})
    const items = wrapper.findAll('.roster-item')
    expect(items.length).toBe(3)
    // rowMissing has anomalyCount=5, should be first
    expect(items[0].text()).toContain('李缺卡')
    // rowLate has anomalyCount=3, should be second
    expect(items[1].text()).toContain('王遲到')
    // rowFull has anomalyCount=0, should be last
    expect(items[2].text()).toContain('陳全勤')
  })

  it('filters roster by name search input', async () => {
    const wrapper = mountRoster({})
    await wrapper.find('input').setValue('王')
    await nextTick()
    const items = wrapper.findAll('.roster-item')
    expect(items.length).toBe(1)
    expect(items[0].text()).toContain('王遲到')
  })

  it('filters by employee_number', async () => {
    const wrapper = mountRoster({})
    await wrapper.find('input').setValue('E001')
    await nextTick()
    const items = wrapper.findAll('.roster-item')
    expect(items.length).toBe(1)
    expect(items[0].text()).toContain('陳全勤')
  })

  it('emits select with correct employee_id on row click', async () => {
    const wrapper = mountRoster({})
    // sorted order: [李缺卡(3), 王遲到(2), 陳全勤(1)]
    const items = wrapper.findAll('.roster-item')
    // click second item (王遲到, id=2)
    await items[1].trigger('click')
    const emitted = wrapper.emitted('select')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([2])
  })

  it('emits select with employee_id of first item (李缺卡, id=3)', async () => {
    const wrapper = mountRoster({})
    const items = wrapper.findAll('.roster-item')
    await items[0].trigger('click')
    expect(wrapper.emitted('select')![0]).toEqual([3])
  })

  it('applies selected class to the row matching selectedEmployeeId', () => {
    const wrapper = mountRoster({ selectedEmployeeId: 1 })
    // rowFull (id=1) is last after sorting
    const items = wrapper.findAll('.roster-item')
    const selectedItem = items.find((i) => i.text().includes('陳全勤'))
    expect(selectedItem?.classes()).toContain('roster-item--selected')
    // others should not have selected class
    const unselected = items.find((i) => i.text().includes('李缺卡'))
    expect(unselected?.classes()).not.toContain('roster-item--selected')
  })

  it('shows full-attendance badge for rowFull (anomalyCount=0)', () => {
    const wrapper = mountRoster({})
    // rowFull is last item; find it
    const items = wrapper.findAll('.roster-item')
    const fullItem = items.find((i) => i.text().includes('陳全勤'))
    // should have a success tag
    const tag = fullItem?.find('[data-type="success"]')
    expect(tag).toBeTruthy()
  })

  it('缺卡 badge 是 warning（缺卡不扣款，只記次數）；遲／早 badge 是 danger（會扣款）', () => {
    const wrapper = mountRoster({})
    const items = wrapper.findAll('.roster-item')
    const missingItem = items.find((i) => i.text().includes('李缺卡'))!
    const missingTag = missingItem.find('[data-type="warning"]')
    expect(missingTag.exists()).toBe(true)
    expect(missingTag.text()).toBe('缺5')
    expect(missingItem.find('[data-type="danger"]').exists()).toBe(false)

    const lateItem = items.find((i) => i.text().includes('王遲到'))!
    const lateTags = lateItem.findAll('[data-type="danger"]').map((t) => t.text())
    expect(lateTags).toEqual(['遲2', '早1'])
    expect(lateItem.find('[data-type="warning"]').exists()).toBe(false)
  })

  it('shows empty state when roster is empty and not loading', async () => {
    const wrapper = mountRoster({ roster: [] })
    await nextTick()
    // EmptyState stub renders with class empty-state-stub
    const empty = wrapper.find('.empty-state-stub')
    expect(empty.exists()).toBe(true)
  })

  it('search is case-insensitive and also searches employee_number', async () => {
    const wrapper = mountRoster({})
    await wrapper.find('input').setValue('e002')
    await nextTick()
    const items = wrapper.findAll('.roster-item')
    expect(items.length).toBe(1)
    expect(items[0].text()).toContain('王遲到')
  })
})


it('搜尋無結果可清除並恢復名冊', async () => {
  const wrapper = mountRoster({})
  await wrapper.find('input').setValue('不存在的測試員工')
  expect(wrapper.text()).toContain('沒有符合搜尋的人員')
  await wrapper.find('button').trigger('click')
  expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
  wrapper.unmount()
})

describe('RosterColumn — 分組用真正的待處理數', () => {
  it('異常已全部處理完的人歸到「無待處理」，不再掛在有待處理', async () => {
    // rowLate 月統計有 3 次異常，但都已接受扣款／豁免 → pending 0
    const wrapper = mountRoster({ pendingCounts: { E002: 0, E003: 2 } })
    await nextTick()
    const text = wrapper.text()
    const pendingIdx = text.indexOf('有待處理')
    const cleanIdx = text.indexOf('無待處理')
    expect(pendingIdx).toBeGreaterThanOrEqual(0)
    expect(cleanIdx).toBeGreaterThan(pendingIdx)
    // 李缺卡仍有 2 筆待處理 → 落在「有待處理」段；王遲到已處理完 → 落在其後
    expect(text.indexOf('李缺卡')).toBeGreaterThan(pendingIdx)
    expect(text.indexOf('李缺卡')).toBeLessThan(cleanIdx)
    expect(text.indexOf('王遲到')).toBeGreaterThan(cleanIdx)
    wrapper.unmount()
  })

  it('未提供 pendingCounts 時退回月統計數，既有行為不變', async () => {
    const wrapper = mountRoster({})
    await nextTick()
    const text = wrapper.text()
    const cleanIdx = text.indexOf('無待處理')
    // 王遲到、李缺卡都有月統計異常 → 仍在「有待處理」段（早於「無待處理」標頭）
    expect(text.indexOf('王遲到')).toBeLessThan(cleanIdx)
    expect(text.indexOf('李缺卡')).toBeLessThan(cleanIdx)
    wrapper.unmount()
  })

  // 2026-10-16 staging 實測：徽章「遲N」原本是遲到＋早退的合計，只有早退的人也顯示「遲」
  it('shows late and early-leave counts as separate badges', () => {
    const earlyOnly: RosterRow = {
      ...rowFull,
      employee_id: 4,
      employee_name: '趙早退',
      employee_number: 'E004',
      early_leave_count: 3,
    }
    const wrapper = mountRoster({ roster: [rowLate, earlyOnly] })
    const badges = (name: string) =>
      wrapper
        .findAll('.roster-item')
        .find((i) => i.text().includes(name))!
        .findAll('.roster-item__badges span')
        .map((b) => b.text())
    expect(badges('王遲到')).toEqual(['遲2', '早1'])
    expect(badges('趙早退')).toEqual(['早3'])
    wrapper.unmount()
  })
})

// ── 鍵盤操作：WAI-ARIA listbox + roving tabindex ─────────────────────────────
describe('RosterColumn — 鍵盤操作（listbox / roving tabindex）', () => {
  // 排序後：李缺卡(3)、王遲到(2) 在「有待處理」，陳全勤(1) 在「無待處理」
  const mountAttached = (props: Parameters<typeof mountRoster>[0] = {}) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const wrapper = mountRoster(props)
    host.appendChild(wrapper.element)
    return { wrapper, host }
  }
  const options = (wrapper: ReturnType<typeof mountRoster>) => wrapper.findAll('[role="option"]')

  it('容器是 listbox 且有名稱；分組用 role=group 包住 option', () => {
    const wrapper = mountRoster({})
    const list = wrapper.find('[role="listbox"]')
    expect(list.attributes('aria-label')).toBe('人員名冊')
    const groups = wrapper.findAll('[role="group"]')
    expect(groups.map((g) => g.attributes('aria-label'))).toEqual(['有待處理，2 人', '無待處理，1 人'])
    // option 一律在 group 內，listbox 直屬子層沒有裸 option
    expect(wrapper.findAll('.roster-column__list > [role="option"]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('roving tabindex：沒有選取時只有第一列 tabindex=0，其餘 -1', () => {
    const wrapper = mountRoster({})
    expect(options(wrapper).map((o) => o.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
    wrapper.unmount()
  })

  it('roving tabindex：有選取列時 Tab 停點落在選取列，aria-selected 對應', () => {
    const wrapper = mountRoster({ selectedEmployeeId: 1 })
    const opts = options(wrapper)
    // 順序：李缺卡(3)、王遲到(2)、陳全勤(1)
    expect(opts.map((o) => o.attributes('tabindex'))).toEqual(['-1', '-1', '0'])
    expect(opts.map((o) => o.attributes('aria-selected'))).toEqual(['false', 'false', 'true'])
    wrapper.unmount()
  })

  it('Enter / Space 觸發與點擊相同的 select 事件', async () => {
    const wrapper = mountRoster({})
    const opts = options(wrapper)
    await opts[1].trigger('keydown', { key: 'Enter' })
    await opts[2].trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('select')).toEqual([[2], [1]])
    wrapper.unmount()
  })

  it('Space 的預設捲動行為被擋下', async () => {
    const wrapper = mountRoster({})
    const evt = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    options(wrapper)[0].element.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('↓／↑ 移動焦點（跨分組、到頭不循環），並更新 Tab 停點；不會誤觸 select', async () => {
    const { wrapper, host } = mountAttached()
    const opts = () => options(wrapper)
    ;(opts()[0].element as HTMLElement).focus()
    await opts()[0].trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts()[1].element)
    await opts()[1].trigger('keydown', { key: 'ArrowDown' })
    // 第三列在另一個分組（無待處理）
    expect(document.activeElement).toBe(opts()[2].element)
    expect(opts().map((o) => o.attributes('tabindex'))).toEqual(['-1', '-1', '0'])
    // 到底再按 ↓ 不循環
    await opts()[2].trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts()[2].element)
    await opts()[2].trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(opts()[1].element)
    expect(wrapper.emitted('select')).toBeFalsy()
    wrapper.unmount()
    host.remove()
  })

  it('Home／End 跳到第一列／最後一列', async () => {
    const { wrapper, host } = mountAttached()
    const opts = () => options(wrapper)
    ;(opts()[1].element as HTMLElement).focus()
    await opts()[1].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(opts()[2].element)
    await opts()[2].trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(opts()[0].element)
    wrapper.unmount()
    host.remove()
  })

  it('搜尋縮小清單後，Tab 停點落在仍可見的列（不會指向被濾掉的人）', async () => {
    const wrapper = mountRoster({ selectedEmployeeId: 3 })
    await wrapper.find('input').setValue('陳')
    const opts = options(wrapper)
    expect(opts).toHaveLength(1)
    expect(opts[0].attributes('tabindex')).toBe('0')
    wrapper.unmount()
  })

  it('帶修飾鍵的按鍵（Ctrl／Meta／Alt）不被攔截', async () => {
    const wrapper = mountRoster({})
    const evt = new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true, cancelable: true })
    options(wrapper)[1].element.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(false)
    wrapper.unmount()
  })
})
