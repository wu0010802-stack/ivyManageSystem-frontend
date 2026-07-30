/**
 * 招生漏斗 stage／事件 — 前端單一來源。
 *
 * 對齊後端 services/recruitment_funnel.py Stage（4 值）。
 * 2026-07-30 起第四欄為真正的 withdrawn 退出狀態（退預繳／退註冊），
 * 舊 active（已開學）階段已自漏斗移除——開學屬學生 lifecycle 軸
 * （constants/lifecycle.ts），與本檔無關，勿混用。
 * 漂移由 __tests__/recruitmentFunnel.test.ts 鎖定。
 */

export const FUNNEL_STAGES = ['visited', 'deposited', 'enrolled', 'withdrawn'] as const

export type FunnelStage = (typeof FUNNEL_STAGES)[number]

export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  visited: '已訪視',
  deposited: '已預繳',
  enrolled: '已註冊',
  withdrawn: '退預繳／退註冊',
}

export const FUNNEL_STAGE_COLORS: Record<FunnelStage, string> = {
  visited: '#909399',
  deposited: '#e6a23c',
  enrolled: '#67c23a',
  withdrawn: '#409eff',
}

/** 卡片退出類型 tag：withdrawn_from → 顯示標籤 */
export const WITHDRAWN_FROM_LABELS: Record<string, string> = {
  deposited: '退預繳',
  enrolled: '退註冊',
}

/** 時間軸事件型別 → 標籤（TimelineDrawer / JourneyTimeline 共用） */
export const FUNNEL_EVENT_LABELS: Record<string, string> = {
  created: '建立訪視',
  deposit_added: '加上預繳',
  deposit_removed: '取消預繳',
  converted: '註冊（轉學生）',
  revert_converted: '取消註冊（刪學生）',
  withdrawn: '退預繳／退註冊',
  withdraw_cancelled: '取消退費',
  // 歷史事件：active 階段已於 2026-07-30 移除，僅存量 timeline 顯示
  activated: '退預繳／退註冊（舊紀錄）',
  revert_activated: '取消退費（舊紀錄）',
}
