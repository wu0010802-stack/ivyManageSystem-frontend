/**
 * 接送管理 POS 平板佈局共用型別（T-001）。
 *
 * 右側佇列（DismissalPosQueuePanel/Card）需要同時渲染兩種來源的項目：
 * 1. 前端 5 秒倒數中、尚未送出後端的「staging」項目（純本地狀態）
 * 2. 後端已存在的 active call（沿用 useDismissalUrgency.ts 的 DismissalCallView）
 * PosQueueItem 是兩者合併後的單一形狀（見 useDismissalPosQueue.ts），
 * 使用端只需依 phase 分支，不需要在型別層另外 union 兩種介面。
 */

import type { DismissalCallView } from '@/composables/useDismissalUrgency'

/** 學生接送狀態（供卡片徽章與排序）。on_leave / bus_picked 本輪無資料來源（D3/D4），永遠回傳固定值。 */
export type PosStudentStatus = 'unpicked' | 'on_leave' | 'bus_picked' | 'guardian_picked'

/**
 * 佇列項目來源標籤。
 * - onsite：現場（request_source=staff）
 * - reservation：家長預約（request_source=parent）
 * - proxy：代理接送，本輪只保留型別值（BD-004 尚待產品定義），沒有任何資料來源會產生它
 */
export type PosQueueSource = 'onsite' | 'reservation' | 'proxy'

/** 倒數中尚未送出後端的本地 staging 資訊（見 useDismissalPosQueue.ts 的 staging Map）。 */
export interface PosQueueCountdown {
  /** 倒數起始時間（Date.now() 毫秒），供 DismissalPosCountdownBar 計算進度。 */
  startedAt: number
  /** 倒數總長度（毫秒），預設 5000。 */
  durationMs: number
}

/**
 * 右側佇列的單一項目——staging（倒數中尚未送出）／active（後端進行中的
 * dismissal call）／done（今日已放學完成，保留在佇列尾端供回顧）三種狀態的
 * 統一形狀，由 phase 判別：
 * - phase='staging'：countdown 必有值、call 為 null；id 是本地暫用識別碼
 *   （非後端 call id，格式見 useDismissalPosQueue.ts，例如 `staging:<studentId>`）
 * - phase='active'：call 必有值（既有 DismissalCallView，含 status/expected_arrival_at
 *   /arrived_at 等，供 T-009 重用 useDismissalUrgency 的 ETA/等候時間邏輯）、countdown 為 null；
 *   id 是後端 dismissal call 的數字 id
 * - phase='done'：status=completed 的 call，欄位形狀同 active；不可滑動取消
 *   （後端已完成的通知沒有取消語意），排在所有 staging/active 之後
 */
export interface PosQueueItem {
  id: string | number
  phase: 'staging' | 'active' | 'done'
  studentId: number
  studentName: string
  classroomName: string
  source: PosQueueSource
  countdown: PosQueueCountdown | null
  call: DismissalCallView | null
}
