/**
 * 才藝儀表板「人次比率」欄位（2026-08-04 業主需求）。
 *
 * 原表格只有一個「比率」欄，語意是**參與率**（不重複參與學生 ÷ 在籍數），值域
 * 封頂 100%，看不出「每人平均報幾門」。且原「班級人數」欄名不實——其值是
 * total_enrollments（同一學生報兩門算 2），實為**人次**，後端 Excel 匯出一直
 * 都叫「報名人次」，只有這張表的 label 講錯。
 *
 * 本測試釘住三件事：
 * 1. 欄名正名為「班級人次」，不得回退成「班級人數」。
 * 2. 新增「人次比率」欄並綁定後端 enrollment_ratio。
 * 3. （2026-10-19 業主裁定改向）達標改以人次比率判定，紅綠著色移到人次比率欄，
 *    參與率降為參考欄、不著色。
 *
 * ⚠ 測試策略：本 view 無法在 happy-dom 下掛載（含 shallowMount）——動態課程欄位
 * 的 `<template #default="scope">{{ getCourseCount(scope.row, …) }}</template>`
 * 在 vnode 正規化階段會以 undefined scope 被呼叫而拋錯。這是既有寫法的限制，非
 * 本次改動所致（既有的 ActivityDashboardView.bonusLabel.test.ts 同樣只測純函式）。
 * 故欄位定義改以 SFC 原始碼斷言；「後端值原樣流入表格列」則由 flatten 用的 spread
 * 保證，其數值正確性由後端
 * tests/test_activity_dashboard_enrollment_ratio_2026_08_04.py 覆蓋。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SFC_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/views/activity/ActivityDashboardView.vue'),
  'utf-8',
)

describe('才藝儀表板欄位定義', () => {
  it('欄名正名為「班級人次」，不得回退成「班級人數」', () => {
    expect(SFC_SOURCE).toContain('班級人次')
    expect(SFC_SOURCE).not.toContain('班級人數')
  })

  it('存在綁定 enrollment_ratio 的「人次比率」欄', () => {
    expect(SFC_SOURCE).toContain('prop="enrollment_ratio"')
    expect(SFC_SOURCE).toContain('label="人次比率"')
  })

  it('達標著色改套在人次比率欄、讀後端 meets_target（2026-10-19 業主裁定）', () => {
    const start = SFC_SOURCE.indexOf('prop="enrollment_ratio"')
    const end = SFC_SOURCE.indexOf('</el-table-column>', start)
    expect(SFC_SOURCE.slice(start, end)).toContain('ratioClass(scope.row)')
    expect(SFC_SOURCE).toMatch(/row\.meets_target \? 'text-success' : 'text-danger'/)
  })

  it('同比／環比只在年級小計與全園顯示，班級列不顯示（2026-10-19 使用者裁定）', () => {
    expect(SFC_SOURCE).toContain(`<div v-if="scope.row.rowType !== 'class'" class="trend-cell">`)
  })

  it('參與率欄降為參考、不著色', () => {
    const start = SFC_SOURCE.indexOf('prop="ratio"')
    const end = SFC_SOURCE.indexOf('</el-table-column>', start)
    const columnBlock = SFC_SOURCE.slice(start, end)

    expect(columnBlock).toContain('參與率（參考）')
    expect(columnBlock).not.toContain('text-danger')
    expect(columnBlock).not.toContain('text-success')
  })
})

describe('分母口徑（spec C10，2026-10-19）', () => {
  it('分母欄（student_count）欄名跟後端口徑走，不再寫死「在籍人數」', () => {
    const start = SFC_SOURCE.indexOf('prop="student_count"')
    const end = SFC_SOURCE.indexOf('/>', start)
    expect(SFC_SOURCE.slice(start, end)).toContain(':label="denominatorLabels.header"')
    expect(SFC_SOURCE).toContain('buildDenominatorLabels(')
  })

  it('比率說明的分母名詞與前期口徑附註來自 denominatorLabels', () => {
    expect(SFC_SOURCE).toContain('denominatorLabels.noun')
    expect(SFC_SOURCE).toContain('denominatorLabels.priorBasisNote')
    expect(SFC_SOURCE).not.toContain('÷ 在籍人數')
  })
})

describe('表格列組裝不做欄位白名單', () => {
  it('班級／小計／總計三種列皆以 spread 帶入後端欄位', () => {
    // 若日後改成逐欄挑選，新增的後端欄位會靜默消失在畫面上——釘住 spread 寫法。
    // 列組裝 2026-10-19 自 SFC 抽到 activityDashboardRows.ts。
    const rowsSource = readFileSync(
      resolve(process.cwd(), 'src/views/activity/activityDashboardRows.ts'),
      'utf-8',
    )
    expect(rowsSource).toContain('...cls,')
    expect(rowsSource).toContain('...grade.subtotal,')
    expect(rowsSource).toContain('...table.grand_total,')
  })
})
