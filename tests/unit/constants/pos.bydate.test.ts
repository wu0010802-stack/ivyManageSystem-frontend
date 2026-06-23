/**
 * TDD：POSPaymentPanel by-date 模式課程品名顯示（修正 a19e4747 假綠）
 *
 * 問題根因（a19e4747 修前提錯誤）：
 * - normalizeByDateRow 「優先使用 row.courses 陣列」的假設在 by-date 模式永不成立——
 *   GET /activity/registrations 只回傳 course_names（頓號分隔字串）、
 *   course_count、supply_count，無結構化 courses/supplies 陣列（那只存在 detail 端點）。
 * - 舊測試 makeRow() 餵入假的 courses 陣列 → Array.isArray 恆 true → 永走「優先路徑」，
 *   從未驗證真實 by-date 資料流（假綠）。
 *
 * 正確資料流（by-date）：
 *   row = { course_names: "美術、鋼琴", ...其他後端欄位，無 courses/supplies }
 *   normalizeByDateRow → courses: [{name:"美術",price:0},{name:"鋼琴",price:0}], supplies:[]
 *   POSPaymentPanel → 明細區塊顯示（courses.length > 0），「美術」「鋼琴」品名渲染
 *
 * 修正點：
 * 1. makeRow 改為真實 by-date 形狀（無 courses/supplies 陣列）
 * 2. 驗證 normalizeByDateRow fallback 行為（品名有、price=0）
 * 3. 掛載 POSPaymentPanel 驗證品名出現在 DOM（面板課程列 name span 無 v-if，應綠）
 * 4. 保留 by-student 真實 price 反向案例防迴歸
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

import { normalizeByDateRow } from '@/constants/pos'
import POSPaymentPanel from '@/components/activity/POSPaymentPanel.vue'

// ── 真實 by-date 列形狀 ──
// 後端 GET /activity/registrations 回傳欄位，無結構化 courses/supplies
function makeByDateRow(over: Record<string, unknown> = {}) {
  return {
    id: 42,
    student_name: '林小美',
    class_name: '中班',
    total_amount: 2300,
    paid_amount: 0,
    course_names: '美術、鋼琴',
    course_count: 2,
    supply_count: 0,
    // 注意：無 courses 陣列、無 supplies 陣列（這才是真實 API 回傳）
    ...over,
  }
}

// ── 反向案例：by-student 模式有真實結構化 courses（detail 端點回傳） ──
function makeByStudentRow(over: Record<string, unknown> = {}) {
  return {
    id: 99,
    student_name: '陳大雄',
    class_name: '大班',
    total_amount: 2300,
    paid_amount: 0,
    course_names: '美術、鋼琴',
    courses: [
      { name: '美術', price: 1500, status: 'enrolled' },
      { name: '鋼琴', price: 800, status: 'enrolled' },
    ],
    supplies: [{ name: '手工材料包', price: 0, status: 'active' }],
    ...over,
  }
}

// ── 掛載 POSPaymentPanel 並傳入 selectedItem ──
function mountPanel(selectedItem: Record<string, unknown>) {
  return mount(POSPaymentPanel, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        'el-input-number': true, // 避免 EP 數字輸入元件在 happy-dom 慢
      },
    },
    props: {
      itemTotal: (selectedItem.owed as number) ?? 2300,
      selectedItem,
      canSubmit: false,
      submitting: false,
    },
  })
}

describe('normalizeByDateRow — 真實 by-date 資料流（無結構化 courses/supplies 陣列）', () => {
  it('（核心）course_names 拆解後產生含品名的 courses，price 為 0', () => {
    // 真實 by-date 列形狀：無 courses 陣列
    const result = normalizeByDateRow(makeByDateRow())
    expect(result.courses).toHaveLength(2)
    expect(result.courses[0]).toMatchObject({ name: '美術', price: 0 })
    expect(result.courses[1]).toMatchObject({ name: '鋼琴', price: 0 })
  })

  it('（核心）無 supplies 陣列時回傳空陣列（不崩潰）', () => {
    const result = normalizeByDateRow(makeByDateRow())
    expect(result.supplies).toEqual([])
  })

  it('欠費計算（owed）正確：total - paid', () => {
    const result = normalizeByDateRow(makeByDateRow({ total_amount: 2300, paid_amount: 800 }))
    expect(result.owed).toBe(1500)
  })

  it('course_names 為空字串時 courses 回傳空陣列', () => {
    const result = normalizeByDateRow(makeByDateRow({ course_names: '' }))
    expect(result.courses).toEqual([])
  })
})

describe('POSPaymentPanel — by-date 模式課程品名渲染（真實資料流）', () => {
  it('（防迴歸核心）by-date normalized 資料在面板中顯示課程品名，price:0 不致整列被吞', () => {
    // 真實 by-date 列：無 courses 陣列，只有 course_names
    const normalized = normalizeByDateRow(makeByDateRow())
    // normalized.courses = [{name:"美術",price:0},{name:"鋼琴",price:0}]
    // normalized.supplies = []
    const wrapper = mountPanel(normalized as Record<string, unknown>)
    const text = wrapper.text()
    // 面板明細區的 name span 無 v-if，品名應無條件渲染
    expect(text).toContain('美術')
    expect(text).toContain('鋼琴')
  })

  it('by-date normalized：courses.length > 0 → 明細容器出現', () => {
    const normalized = normalizeByDateRow(makeByDateRow())
    const wrapper = mountPanel(normalized as Record<string, unknown>)
    // pos-payment__selected-lines 的 v-if 依 courses.length || supplies.length
    const lines = wrapper.find('.pos-payment__selected-lines')
    expect(lines.exists()).toBe(true)
  })

  it('（反向）by-student 真實 price 在面板中亦顯示品名與金額', () => {
    const normalized = normalizeByDateRow(makeByStudentRow())
    const wrapper = mountPanel(normalized as Record<string, unknown>)
    const text = wrapper.text()
    expect(text).toContain('美術')
    expect(text).toContain('鋼琴')
    // by-student 有真實 price，金額 span（v-if="c.price"）會渲染
    expect(text).toContain('NT$1,500')
    expect(text).toContain('NT$800')
  })

  it('by-date price:0 的課程不顯示金額（v-if="c.price" 藏 price span，但品名存在）', () => {
    const normalized = normalizeByDateRow(makeByDateRow())
    const wrapper = mountPanel(normalized as Record<string, unknown>)
    // 品名存在
    const nameSpans = wrapper.findAll('.pos-payment__selected-line-name')
    const names = nameSpans.map(s => s.text())
    expect(names).toContain('美術')
    expect(names).toContain('鋼琴')
    // 價格 span 不出現（price:0 → v-if 為 false）
    const priceSpans = wrapper.findAll('.pos-payment__selected-line-price')
    expect(priceSpans).toHaveLength(0)
  })
})
