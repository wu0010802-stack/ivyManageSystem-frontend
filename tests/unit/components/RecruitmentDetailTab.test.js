import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import RecruitmentDetailTab from '@/components/recruitment/RecruitmentDetailTab.vue'

const sampleRow = {
  id: 1,
  visit_date: '115.04.18',
  month: '115.04',
  child_name: '小安',
  grade: '小班',
  address: '高雄市三民區民族一路100號',
  district: '三民區',
  source: '網路',
  referrer: '王主任',
  external_source: 'ivykids_yihua_backend',
  external_status: '預約正常',
  has_deposit: true,
  enrolled: false,
  transfer_term: false,
  no_deposit_reason: '',
  notes: '',
  parent_response: '',
}

const ElCard = defineComponent({
  name: 'ElCard',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-card' }, slots.default?.())
  },
})

const ElTable = defineComponent({
  name: 'ElTable',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-table' }, slots.default?.())
  },
})

const ElTableColumn = defineComponent({
  name: 'ElTableColumn',
  props: ['prop', 'label'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-table-column',
      'data-prop': props.prop ?? '',
      'data-label': props.label ?? '',
    }, [
      h('span', { class: 'column-label' }, props.label ?? ''),
      slots.default?.({ row: sampleRow }),
    ])
  },
})

const ElTag = defineComponent({
  name: 'ElTag',
  setup(_, { slots }) {
    return () => h('span', { class: 'el-tag' }, slots.default?.())
  },
})

const ElButton = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  setup(_, { emit, slots, attrs }) {
    return () => h('button', { ...attrs, onClick: () => emit('click') }, slots.default?.())
  },
})

const globalConfig = {
  directives: {
    loading: () => {},
  },
  components: {
    ElCard,
    ElTable,
    ElTableColumn,
    ElTag,
    ElButton,
  },
  stubs: {
    'el-select': true,
    'el-option': true,
    'el-input': true,
    'el-pagination': true,
  },
}

describe('RecruitmentDetailTab', () => {
  it('原始明細顯示詳細參觀日期與完整地址欄位', () => {
    const wrapper = mount(RecruitmentDetailTab, {
      props: {
        canWrite: false,
        options: {
          months: ['115.04'],
          grades: ['小班'],
          sources: ['網路'],
          referrers: ['王主任'],
          no_deposit_reasons: [],
        },
        filters: {
          month: null,
          grade: null,
          source: null,
          referrer: null,
          has_deposit: null,
          no_deposit_reason: null,
          keyword: '',
          page: 1,
          page_size: 50,
        },
        detailData: [sampleRow],
        detailTotal: 1,
        loadingDetail: false,
        rowClassName: () => '',
      },
      global: globalConfig,
    })

    const columns = wrapper.findAll('.el-table-column')
    expect(columns.some((column) =>
      column.attributes('data-label') === '參觀日期' &&
      column.attributes('data-prop') === 'visit_date',
    )).toBe(true)
    expect(columns.some((column) =>
      column.attributes('data-label') === '地址' &&
      column.attributes('data-prop') === 'address',
    )).toBe(true)
    expect(wrapper.text()).toContain('115.04.18')
    expect(wrapper.text()).toContain('高雄市三民區民族一路100號')
    expect(wrapper.text()).toContain('義華官網 / 預約正常')
  })
})
