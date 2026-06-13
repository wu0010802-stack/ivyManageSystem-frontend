/**
 * 招生統計四 tab 元件渲染測試
 *
 * 注意：el-table 在 happy-dom 下不會渲染 row 資料（顯示 "No Data"），
 * 因此資料列/計算欄位（如 50.0%、路過、雅婷）無法靠 wrapper.text() 斷言。
 * 依 codebase 慣例改驗 ① 元件掛載不崩潰 ② 區塊標題/卡片標題正確渲染。
 * 實際 row 資料渲染已在 e2e 整合測試（start.sh）覆蓋。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RecruitmentClassTab from '../RecruitmentClassTab.vue'
import RecruitmentSourceTab from '../RecruitmentSourceTab.vue'
import RecruitmentStaffTab from '../RecruitmentStaffTab.vue'
import RecruitmentChuannianTab from '../RecruitmentChuannianTab.vue'

const fmtPct = (d: number, v: number) => (v ? ((d / v) * 100).toFixed(1) + '%' : '0%')

const global = { plugins: [ElementPlus] }

describe('招生統計四 tab 元件渲染', () => {
  it('RecruitmentClassTab 渲染表格區塊標題', () => {
    const wrapper = mount(RecruitmentClassTab, {
      global,
      props: {
        showCharts: false,
        classBarData: null, classRateData: null,
        classBarOptions: {}, percentHorizBarOptions: {},
        statsByGrade: [{ grade: '幼幼班', visit: 10, deposit: 5 }],
        monthGradeTableData: [], gradesOrder: ['幼幼班'], fmtPct,
      },
    })
    expect(wrapper.text()).toContain('班別統計')
    expect(wrapper.text()).toContain('月份 × 班別分布')
  })

  it('RecruitmentSourceTab 渲染來源區塊標題', () => {
    const wrapper = mount(RecruitmentSourceTab, {
      global,
      props: {
        showCharts: false,
        sourceBarData: null, sourceRateData: null,
        sourceClickBarOptions: {}, percentHorizBarOptions: {},
        statsBySource: [{ source: '路過', visit: 8, deposit: 2 }], fmtPct,
      },
    })
    expect(wrapper.text()).toContain('來源排名明細')
  })

  it('RecruitmentStaffTab 渲染接待人員區塊標題與交叉分析標題', () => {
    const wrapper = mount(RecruitmentStaffTab, {
      global,
      props: {
        showCharts: false,
        staffBarData: null, staffRateData: null,
        barOptions: {}, percentBarOptions: {},
        statsByReferrer: [{ referrer: '雅婷', visit: 6, deposit: 3 }],
        referrerSourceCross: { referrers: [{ referrer: '雅婷', sources: { 路過: 2 }, total: 2 }], sources: ['路過'] },
        gradesOrder: ['幼幼班'], fmtPct,
      },
    })
    expect(wrapper.text()).toContain('接待人員統計')
    expect(wrapper.text()).toContain('介紹者 × 來源 交叉分析')
  })

  it('RecruitmentChuannianTab 渲染 KPI 與空狀態', () => {
    const wrapper = mount(RecruitmentChuannianTab, {
      global,
      props: {
        showCharts: false,
        stats: { chuannian_visit: 4, chuannian_deposit: 1, total_visit: 20 },
        chuannianNoDeposit: 3,
        chuannianExpectedBarData: null, chuannianGradeBarData: null,
        barOptions: {}, horizBarOptions: {},
        chuannianByExpected: [], chuannianByGrade: [], fmtPct,
      },
    })
    expect(wrapper.text()).toContain('童年綠地參觀總數')
    expect(wrapper.text()).toContain('暫無童年綠地資料')
  })
})
