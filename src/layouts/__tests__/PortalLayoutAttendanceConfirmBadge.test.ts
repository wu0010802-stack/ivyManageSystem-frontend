import { describe, it, expect } from 'vitest'
import PortalLayoutSource from '@/layouts/PortalLayout.vue?raw'

/**
 * 月底出勤確認側欄徽章即時重抓的文字契約（最終審查 M-13）。
 *
 * 確認頁回覆／簽認成功後發 `portal-attendance-confirm-count-changed`，殼層須監聽並
 * 重抓徽章，否則老師要等 30 秒 TTL 才看得到數字變化。掛 PortalLayout 需要 WS、router
 * 與多個 store，沿用 PortalLayoutClassNav.test.ts 的 ?raw 路數；斷言鎖在呼叫形狀，
 * 不用寬鬆的事件名 toContain（?raw 連註解一起讀進來）。
 */
describe('PortalLayout 月底出勤確認徽章', () => {
  it('掛載時監聽事件、卸載時移除（同一個具名 handler）', () => {
    expect(PortalLayoutSource).toContain(
      "window.addEventListener('portal-attendance-confirm-count-changed', onAttendanceConfirmChanged)",
    )
    expect(PortalLayoutSource).toContain(
      "window.removeEventListener('portal-attendance-confirm-count-changed', onAttendanceConfirmChanged)",
    )
  })

  it('handler 重抓月底出勤確認待辦數', () => {
    expect(PortalLayoutSource).toMatch(
      /const onAttendanceConfirmChanged = \(\) => \{\s*fetchAttendanceConfirmPendingCount\(\)\s*\}/,
    )
  })
})

/**
 * 入口依適用與否顯示（SPEC-026 第二期待辦 #6、Task 9、Q6）：側欄「月底出勤確認」
 * 只對「近 120 天內是適用者」的老師顯示，依後端 pending-count 回傳的 eligible 判定。
 * 搜尋指令面板刻意維持原樣，不受此限制。
 */
describe('PortalLayout 月底出勤確認入口依適用與否顯示', () => {
  it('宣告 attendanceConfirmEligible ref，預設 false（未取得資料前不誤顯示）', () => {
    expect(PortalLayoutSource).toContain('const attendanceConfirmEligible = ref(false)')
  })

  it('fetchAttendanceConfirmPendingCount 一併讀取 eligible 並寫入 attendanceConfirmEligible', () => {
    expect(PortalLayoutSource).toMatch(
      /attendanceConfirmEligible\.value = \(res\.data as Record<string, unknown>\)\?\.eligible === true/,
    )
  })

  it('側欄項目以 v-if="attendanceConfirmEligible" 把關', () => {
    expect(PortalLayoutSource).toMatch(
      /<el-menu-item v-if="attendanceConfirmEligible" index="\/portal\/attendance-confirm">/,
    )
  })
})
