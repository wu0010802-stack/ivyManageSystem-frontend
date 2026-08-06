/**
 * `OCCUPYING_STATUSES`（家長端佔位狀態集合）的跨 repo 契約測試。
 *
 * 這個常數是後端 `ivy-backend/utils/activity_constants.py` 的 `OCCUPYING_STATUSES`
 * 在前端的複本（無 codegen 管道可自動同步），漂移過一次：前端停在兩態
 * `['enrolled', 'promoted_pending']`，後端自 2026-07-19 業主決策起已是三態
 * （加入 pending_review「待審核報名視同占用容量」），而前端註解卻宣稱「已與後端對齊」。
 *
 * 家長端有兩處吃這個集合：
 *   ① hero「進行中」報名數（ActivityView.vue）
 *   ② 衝堂偵測的 busy 時段（collectBusySlots）
 * 後端 `GET /parent-portal/activity/upcoming-sessions`（hero「即將開課」的資料源）
 * 則是用後端那份三態集合過濾場次——兩邊口徑不同，同一張卡就可能出現互相矛盾的數字。
 *
 * 下方期望值刻意寫死，後端再調整佔位口徑時本測試會紅，逼下一位維護者一起改前端。
 */
import { describe, it, expect } from 'vitest'
import { OCCUPYING_STATUSES, collectBusySlots } from '../activitySchedule'

/**
 * 後端 `ivy-backend/utils/activity_constants.py::OCCUPYING_STATUSES` 的逐字複本。
 * 改這裡之前先確認後端真的改了（該常數是後端容量判定的單一來源）。
 */
const BACKEND_OCCUPYING_STATUSES = ['enrolled', 'promoted_pending', 'pending_review']

/** 後端 `QUEUE_STATUSES`：候補/排隊，不占容量、不占時段。 */
const BACKEND_QUEUE_STATUSES = ['waitlist', 'pending_review_waitlist']

describe('OCCUPYING_STATUSES 與後端 activity_constants.py 的契約', () => {
  it('內容與後端逐字一致（含 pending_review）', () => {
    expect([...OCCUPYING_STATUSES].sort()).toEqual([...BACKEND_OCCUPYING_STATUSES].sort())
  })

  it('不含任何候補狀態（候補未取得名額，不占時段也不算進行中）', () => {
    for (const queued of BACKEND_QUEUE_STATUSES) {
      expect(OCCUPYING_STATUSES).not.toContain(queued)
    }
  })
})

describe('collectBusySlots 對各報名狀態的取捨', () => {
  const slotOf = (status: string) => ({
    status,
    meeting_weekdays: [2],
    meeting_start_time: '15:00',
    meeting_end_time: '16:00',
  })

  it.each(BACKEND_OCCUPYING_STATUSES)('佔位狀態 %s 的課程要納入 busy 時段', (status) => {
    // 註：pending_review 的報名目前 student_id 為 NULL（比對失敗才會是待審核），
    // 家長端 my-registrations 依 student_id 過濾故實務上尚不會拿到這種列；
    // 這條釘的是「口徑」——與後端 upcoming-sessions 用同一集合，不讓兩邊再度分岔。
    expect(collectBusySlots([{ courses: [slotOf(status)] }])).toHaveLength(1)
  })

  it.each(BACKEND_QUEUE_STATUSES)('候補狀態 %s 的課程不納入 busy 時段', (status) => {
    expect(collectBusySlots([{ courses: [slotOf(status)] }])).toHaveLength(0)
  })
})
