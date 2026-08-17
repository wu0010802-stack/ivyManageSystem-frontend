// 資安回歸（2026-08-17 資安稽核 SEC-20）：
// `calcTooltipHtml` 產出的字串被 LeaveView.vue / PortalLeaveForm.vue 以
// `<el-tooltip raw-content>` 渲染（等同 v-html）。其中 `holiday_name` 來自
// `holidays.name`，是任何持 CALENDAR 權限者可經「假日批次匯入」寫入的欄位
// → 未跳脫即為儲存型 HTML/XSS 注入。
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useLeaveHintFormatter } from '@/composables/useLeaveHintFormatter'

type BreakdownDay = {
  date: string
  type: string
  hours?: number
  work_start?: string
  work_end?: string
  holiday_name?: string
}

function build(breakdown: BreakdownDay[]) {
  const { calcTooltipHtml } = useLeaveHintFormatter({
    form: { start_date: null, end_date: null },
    calcBreakdown: ref(breakdown),
    leaveMode: ref('full'),
  })
  return calcTooltipHtml
}

describe('useLeaveHintFormatter：tooltip 內插值的 HTML 跳脫', () => {
  it('假日名稱含 HTML 標記時不得原樣進入 tooltip 字串', () => {
    const tip = build([
      {
        date: '2026-03-02',
        type: 'holiday',
        holiday_name: '<img src=x onerror=alert(1)>',
      },
    ])
    // 原樣的標記不可出現（否則 raw-content 會把它當 HTML 解析）
    expect(tip.value).not.toContain('<img')
    // 應以跳脫形式呈現，使用者仍看得到原文
    expect(tip.value).toContain('&lt;img src=x onerror=alert(1)&gt;')
    // 精確判準：拿掉刻意保留的 <br> 後，不該再有任何原始角括號。
    // （`onerror=` 這串純文字留著無害——`<`/`>` 已是實體，它無法成為屬性）
    expect(tip.value.replace(/<br>/g, '')).not.toMatch(/[<>]/)
  })

  it('假日名稱含引號與 & 時一併跳脫', () => {
    const tip = build([
      { date: '2026-04-04', type: 'holiday', holiday_name: `兒童節 & "春假"` },
    ])
    expect(tip.value).toContain('&amp;')
    expect(tip.value).toContain('&quot;')
  })

  it('正常假日名稱維持可讀（不過度跳脫）', () => {
    const tip = build([
      { date: '2026-01-01', type: 'holiday', holiday_name: '中華民國開國紀念日' },
    ])
    expect(tip.value).toContain('中華民國開國紀念日')
    expect(tip.value).toContain('0h')
  })

  it('分隔用的 <br> 仍是真正的換行標記（不可被跳脫掉）', () => {
    const tip = build([
      { date: '2026-01-01', type: 'holiday', holiday_name: '元旦' },
      { date: '2026-01-02', type: 'workday', hours: 8 },
    ])
    expect(tip.value).toContain('<br>')
    expect(tip.value).not.toContain('&lt;br&gt;')
  })
})
