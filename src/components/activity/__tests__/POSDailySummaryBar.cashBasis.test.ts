/**
 * MONEY-03（2026-08-24）：彙總條主數字要對得上抽屜。
 *
 * payment_total / refund_total / net 是**所有付款方式**的總額，含
 * payment_method='系統補齊' 的帳務調整（退課 force_refund、離園沖帳等）——那些沒有
 * 任何現金經手，而且因為沒有收據編號，「今日交易」清單預設也查不到。櫃台照舊主數字
 * 點鈔會誤判短溢，還找不到那筆是誰。
 *
 * 後端已補 cash_* / noncash_* 四欄；新欄位缺席時（前後端部署有時間差）要退回舊行為，
 * 不能顯示 0 讓櫃台以為今天沒收到錢。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSDailySummaryBar from '../POSDailySummaryBar.vue'

/** 現金收 8000、另有一筆非現金系統沖帳 3000（抽屜實際就是 8000）。 */
const WITH_NONCASH = {
  payment_total: 8000,
  refund_total: 3000,
  net: 5000,
  payment_count: 1,
  refund_count: 1,
  is_approved: false,
  cash_warning: false,
  cash_in_drawer: 8000,
  cash_payment_total: 8000,
  cash_refund_total: 0,
  cash_net: 8000,
  noncash_payment_total: 0,
  noncash_refund_total: 3000,
}

const CASH_ONLY = {
  ...WITH_NONCASH,
  refund_total: 0,
  net: 8000,
  refund_count: 0,
  noncash_refund_total: 0,
}

/** 舊版後端（尚未部署新欄位）的回應形狀。 */
const LEGACY = {
  payment_total: 17003,
  refund_total: 0,
  net: 17003,
  payment_count: 1,
  refund_count: 0,
  is_approved: false,
  cash_warning: false,
}

function mountBar(data: Record<string, unknown> | null) {
  return mount(POSDailySummaryBar, {
    props: { data: data as never },
    global: { stubs: { 'el-alert': true } },
  })
}

describe('MONEY-03：主數字改用現金口徑', () => {
  it('有非現金沖帳時，主數字顯示的是抽屜金額而非含沖帳的總額', () => {
    const text = mountBar(WITH_NONCASH).text()

    expect(text).toContain('NT$8,000')
    // 淨額 5,000 是「含系統沖帳」的數字，不該當成櫃台要點的錢
    expect(text).not.toContain('NT$5,000')
  })

  it('標籤明講是現金，收銀員才知道這欄要跟抽屜對', () => {
    const text = mountBar(WITH_NONCASH).text()

    expect(text).toContain('現金')
  })

  it('有非現金金額時另行標示，資訊不丟失', () => {
    const wrapper = mountBar(WITH_NONCASH)

    expect(wrapper.html()).toContain('noncash')
  })

  it('沒有非現金金額時不顯示那條提示（不製造噪音）', () => {
    const wrapper = mountBar(CASH_ONLY)

    expect(wrapper.html()).not.toContain('noncash')
  })

  it('後端還沒回新欄位時退回舊行為，不得顯示 0', () => {
    const text = mountBar(LEGACY).text()

    expect(text).toContain('NT$17,003')
    // 舊資料沒有現金／非現金之分，標籤就不該宣稱是現金
    expect(text).not.toContain('現金收款')
  })

  it('無資料時仍顯示「—」，不受本次改動影響', () => {
    const text = mountBar(null).text()

    expect(text).toContain('—')
  })
})
