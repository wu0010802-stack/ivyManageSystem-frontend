/**
 * 娃娃車權限名稱 helper 的守衛。
 *
 * 這兩個 helper 存在的唯一理由，是讓權限鎖的提示叫得出**權限編輯器上逐字相同**
 * 的名字（見 `src/constants/bus.ts` 的註解）。它們的失敗模式很陰險：查不到就退回
 * 權限碼字面，畫面照樣渲染、不會拋錯，只是把一串英文丟給行政看。
 *
 * 2026-08-26 真的踩過一次：`BUS_WRITE` 在 manifest 裡屬於 `views`，而 helper 當時
 * 只掃 `actions` → `busWriteLabel()` 回傳 `'BUS_WRITE'`。當時頁面端的測試斷言寫成
 * 「畫面文字包含 `busWriteLabel()`」，**兩邊同時退化就恆等成立**，紅不起來。
 *
 * 所以這裡刻意不呼叫同一支 helper 來產生期望值，而是在測試內獨立走一次 manifest。
 */
import { describe, it, expect } from 'vitest'
import { busWriteLabel, busInProgressWriteLabel } from '@/constants/bus'
import { NAVIGATION_MANIFEST } from '@/constants/navigation/manifest'
import { PERMISSION_NAMES } from '@/constants/permissions'

/** 獨立於 helper 的 manifest 查找：helper 找錯地方時，這一份仍會找到正確答案。 */
function labelFromManifest(code: string): string | undefined {
  const pages = [
    ...NAVIGATION_MANIFEST.topLevel,
    ...NAVIGATION_MANIFEST.groups.flatMap((g) => [...g.pages]),
  ]
  for (const page of pages) {
    for (const entry of [...page.views, ...(page.actions ?? [])]) {
      if (entry.code === code && entry.label) return entry.label
    }
  }
  return undefined
}

describe('娃娃車權限名稱 helper', () => {
  it.each([
    ['busWriteLabel', PERMISSION_NAMES.BUS_WRITE, busWriteLabel],
    ['busInProgressWriteLabel', PERMISSION_NAMES.BUS_IN_PROGRESS_WRITE, busInProgressWriteLabel],
  ])('%s 取得 manifest 上的中文名，不退回權限碼字面', (_name, code, helper) => {
    const expected = labelFromManifest(code)

    // 前提檢查：這個碼本來就該在 manifest 上（不在的話該修 manifest，不是改測試）
    expect(expected).toBeTruthy()
    expect(helper()).toBe(expected)
    // 退回字面就是「畫面上出現一串英文」的那個 bug，單獨咬一次
    expect(helper()).not.toBe(code)
  })

  it('BUS_WRITE 掛在 views 而非 actions —— helper 不可只掃 actions', () => {
    const pages = [
      ...NAVIGATION_MANIFEST.topLevel,
      ...NAVIGATION_MANIFEST.groups.flatMap((g) => [...g.pages]),
    ]
    const inViews = pages.some(
      (p) => p.views.some((v) => v.code === PERMISSION_NAMES.BUS_WRITE),
    )
    const inActions = pages.some(
      (p) => (p.actions ?? []).some((a) => a.code === PERMISSION_NAMES.BUS_WRITE),
    )

    expect(inViews).toBe(true)
    expect(inActions).toBe(false)
  })
})
