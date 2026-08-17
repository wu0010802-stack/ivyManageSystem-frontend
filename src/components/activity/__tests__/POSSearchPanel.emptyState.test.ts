import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSSearchPanel from '../POSSearchPanel.vue'

/**
 * 稽核 P3-06（2026-08-14）：空狀態只在「有關鍵字」時出現。
 *
 * 但本頁的搜尋框自改版後是**過濾器**而非啟動條件（父層一進頁就預載全部未結清／
 * 可退費報名），預設關鍵字為空字串；而 runSearch 失敗時父層 fail-closed 會把清單
 * 清空。兩種情況下 `searchQuery` 都是空的 → 條件不成立 → 整片空白沒有任何文字，
 * 櫃台會把「載入失敗」或「查無資料」看成「全部繳清」而漏收款。
 *
 * 這組測試把「沒有資料時一定要說話」釘住。
 */

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(POSSearchPanel, {
    props: {
      mode: 'by-student',
      searchQuery: '',
      groups: [],
      ...props,
    },
    global: {
      directives: { loading: {} },
      stubs: {
        'el-card': slotStub(),
        'el-scrollbar': slotStub(),
        'el-radio-group': slotStub(),
        'el-radio-button': slotStub('span'),
        'el-select': slotStub(),
        'el-input': true,
        'el-option': true,
        'el-switch': true,
        'el-alert': true,
        'el-checkbox': true,
        'el-button': true,
      },
    },
  })
}

describe('POSSearchPanel 依日期（月曆）模式空狀態', () => {
  // 月曆模式走的是另一條 template 分支，不吃 emptyStateText。載入失敗時整份月曆
  // 都是空的，若照原樣提示「點日期查看當日報名」，櫃台會點遍每一天、每天都看到
  // 「當日無未結清報名」，與依學生模式同款誤導。
  it('載入失敗時要講讀取失敗，不能還在叫使用者點日期', () => {
    const wrapper = mountPanel({ mode: 'by-registration', loadError: true, registrations: [] })

    const empty = wrapper.find('.pos-panel__empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('讀取清單失敗')
    expect(wrapper.text()).not.toContain('點日期查看當日報名')
  })

  it('未載入失敗時維持原本的點日期引導', () => {
    const wrapper = mountPanel({ mode: 'by-registration', registrations: [] })

    expect(wrapper.get('.pos-panel__empty').text()).toContain('點日期查看當日報名')
  })
})

describe('POSSearchPanel 依學生清單空狀態', () => {
  it('關鍵字為空且清單為空時仍要顯示空狀態，不能整片空白', () => {
    const wrapper = mountPanel()

    const empty = wrapper.find('.pos-panel__empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('未結清')
  })

  it('退費模式空清單的文案要講「可退費」，不能沿用未結清語意', () => {
    const wrapper = mountPanel({ isRefundMode: true })

    expect(wrapper.get('.pos-panel__empty').text()).toContain('可退費')
  })

  it('有關鍵字卻查無結果時，文案要點出是哪個關鍵字沒中', () => {
    const wrapper = mountPanel({ searchQuery: '王小明' })

    const text = wrapper.get('.pos-panel__empty').text()
    expect(text).toContain('王小明')
    expect(text).toContain('找不到')
  })

  it('搜尋中不顯示空狀態（避免載入過程閃現「查無資料」）', () => {
    const wrapper = mountPanel({ searching: true })

    expect(wrapper.find('.pos-panel__empty').exists()).toBe(false)
  })

  it('載入失敗時空狀態要講「讀取失敗」而非「目前沒有未結清」（P3-06 未竟部分）', () => {
    const wrapper = mountPanel({ loadError: true })

    const text = wrapper.get('.pos-panel__empty').text()
    expect(text).toContain('讀取清單失敗')
    expect(text).not.toContain('目前沒有')
  })

  it('載入失敗優先於關鍵字文案（有關鍵字時也不能說成「找不到」）', () => {
    const wrapper = mountPanel({ loadError: true, searchQuery: '王小明' })

    const text = wrapper.get('.pos-panel__empty').text()
    expect(text).toContain('讀取清單失敗')
    expect(text).not.toContain('找不到')
  })

  it('有資料時不顯示空狀態', () => {
    const wrapper = mountPanel({
      groups: [
        {
          student_key: '王小明|2020-03-05',
          student_name: '王小明',
          class_name: '大班',
          group_owed_total: 4500,
          registrations: [
            {
              id: 101,
              courses: [{ name: '兒童美術' }],
              supplies: [],
              total_amount: 4500,
              paid_amount: 0,
              owed: 4500,
            },
          ],
        },
      ],
    })

    expect(wrapper.find('.pos-panel__empty').exists()).toBe(false)
  })
})
