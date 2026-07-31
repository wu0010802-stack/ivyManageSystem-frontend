/**
 * useTodayTimeline × 家長端 router 路徑 parity。
 *
 * 背景：`useTodayTimeline.ts` 曾把用藥卡片的 path 打成 `/medication`（單數），
 * 但路由是 `/medications`（複數）。既有的 `useTodayTimeline.test.js` 只斷言
 * primary/secondary/tone 等文案與分桶邏輯，從未檢查過 path 字串本身；
 * `TodayTimeline.test.js` 則是用手造 fixture 測「path 有沒有被正確 emit」，
 * 跟 composable 實際算出的資料完全脫鉤。兩者中間留了一個縫，讓這個打字錯誤
 * 一路存活到現在都沒被抓到。
 *
 * 這支測試補的不是「path === '/medications'」這一條斷言（那只擋得住這一個
 * 字），而是把 composable 在各種 fixture 下產生的**每一個** path，都拿去問
 * 家長端 router「這條路真的能走到哪裡」：用 `router.resolve()` 解析後，
 * 若落進 catch-all（`/:pathMatch(.*)*` → redirect '/home'，沒有 name），
 * `resolved.name` 會是 undefined —— 藉此抓住「以後任何人在 timeline 加新卡片
 * 手滑打錯 path」這一整類錯誤，不只是這一次的錯字。
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useTodayTimeline } from '@/parent/composables/useTodayTimeline'
import router from '@/parent/router'

/** 觸發 useTodayTimeline 內每一條會產生 event 的分支，讓每一種 path 都被涵蓋到。 */
function buildAllBranchesFixture() {
  const summary = ref({
    fees: { outstanding: 5200, overdue: 3000, outstanding_count: 1 },
    pending_event_acks: 1,
    unread_messages: 1,
    pending_activity_promotions: 1,
    unread_announcements: 1,
    recent_leave_reviews: 1,
  })
  const todayChildren = ref([
    { student_id: 1, name: '小明', attendance: { status: '出席' } },
    { student_id: 2, name: '小華', leave: { type: '病假' } },
    { student_id: 3, name: '小芬' }, // 無 attendance/leave → 尚未到校（pending）
    { student_id: 4, name: '小美', medication: { has_order: true, order_count: 1 } },
    {
      student_id: 5,
      name: '小強',
      dismissal: {
        status: 'completed',
        requested_at: '2026-05-13T06:00:00Z',
        completed_at: '2026-05-13T08:00:00Z',
      },
    },
  ])
  return { summary, todayChildren }
}

describe('useTodayTimeline — path × router parity', () => {
  it('每一個 event.path 都能被家長端 router 解析到真實具名路由（不落進 catch-all）', () => {
    const { summary, todayChildren } = buildAllBranchesFixture()
    const { events } = useTodayTimeline({ summary, todayChildren })

    // 防 fixture 本身失效（例如改壞了 buildAllBranchesFixture）造成假綠：
    // 目前分支數應至少涵蓋 attendance/leave/pending/medication/dismissal 5 種
    // 子女事件，加上 6 種 summary 待辦，共 11 個以上。
    expect(events.value.length).toBeGreaterThanOrEqual(11)

    const offenders = events.value
      .map((event) => ({ id: event.id, path: event.path, resolved: router.resolve(event.path) }))
      .filter((r) => !r.resolved.name)

    expect(
      offenders.map((o) => `${o.id} → ${o.path}`),
      'useTodayTimeline 產生了無法被 router 解析成具名路由的 path' +
        '（會落進 catch-all 被靜默導回 /home，使用者點不進目標頁）。',
    ).toEqual([])
  })
})
