/**
 * 總覽工作台「下一步」推導（純函式，供 WorkbenchNextStepCard 與測試共用）。
 * 優先序（spec §3.3）：阻斷例外 > 年終待簽（OPEN）> 考核待簽 > 可發放 > 建立缺失週期 > 全部完成。
 * 任一統計 undefined = 尚在載入 → 回 null，呼叫端顯示 skeleton。
 */
import { PAGE_TERMS } from '@/constants/moduleTerms'

export interface CycleHandle {
  id: number
  label: string
  status: string
}

export interface WorkbenchStats {
  appraisalCycle: CycleHandle | null
  yearEndCycle: CycleHandle | null
  blockingExceptions: number | undefined
  yearEndPendingSign: number | undefined
  appraisalPendingSign: number | undefined
  payoutReadyCount: number | undefined
  // 權限旗標：無權限時對應卡片不 render，appraisalCycle/yearEndCycle 可能為 null
  // 只是「這個使用者看不到」而非「真的沒有週期」，建立引導分支須吃這兩旗標才不會
  // 對缺權限使用者給出誤導性的「去建立」CTA（見 task-11 review Important finding）
  canAppraisal: boolean
  canYearEnd: boolean
  payoutYear: number
}

export interface NextStep {
  key:
    | 'exceptions'
    | 'year-end-sign'
    | 'appraisal-sign'
    | 'payout'
    | 'create-appraisal'
    | 'create-year-end'
    | 'done'
  title: string
  reason: string
  ctaLabel: string
  to: string
}

export function deriveNextStep(stats: WorkbenchStats): NextStep | null {
  const {
    appraisalCycle,
    yearEndCycle,
    blockingExceptions,
    yearEndPendingSign,
    appraisalPendingSign,
    payoutReadyCount,
    canAppraisal,
    canYearEnd,
    payoutYear,
  } = stats
  if (
    blockingExceptions === undefined ||
    yearEndPendingSign === undefined ||
    appraisalPendingSign === undefined ||
    payoutReadyCount === undefined
  ) {
    return null
  }
  if (blockingExceptions > 0) {
    return {
      key: 'exceptions',
      title: `處理 ${blockingExceptions} 筆阻斷級例外`,
      reason: '阻斷級例外會讓試算與簽核出錯，建議最先處理。',
      ctaLabel: `前往${PAGE_TERMS.yearEndExceptions}`,
      to: '/appraisal-year-end/exceptions',
    }
  }
  if (yearEndCycle?.status === 'OPEN' && yearEndPendingSign > 0) {
    return {
      key: 'year-end-sign',
      title: `年終結算還有 ${yearEndPendingSign} 筆未核定`,
      reason: `${yearEndCycle.label}結算進行中，完成兩關簽核後才能鎖定發放。`,
      ctaLabel: '前往結算明細',
      to: `/appraisal-year-end/year-end/cycles/${yearEndCycle.id}`,
    }
  }
  if (appraisalCycle && appraisalPendingSign > 0) {
    return {
      key: 'appraisal-sign',
      title: `考核還有 ${appraisalPendingSign} 筆未核定`,
      reason: `${appraisalCycle.label}簽核進行中。`,
      ctaLabel: '前往簽核',
      to: `/appraisal-year-end/appraisal/history?cycle=${appraisalCycle.id}&view=kanban`,
    }
  }
  if (payoutReadyCount > 0) {
    return {
      key: 'payout',
      title: `${payoutReadyCount} 筆考核年終可發放`,
      reason: '簽核已完成，可產生轉帳資料。',
      ctaLabel: '前往發放',
      to: `/appraisal-year-end/year-end/payout?year=${payoutYear}`,
    }
  }
  if (!appraisalCycle && canAppraisal) {
    return {
      key: 'create-appraisal',
      title: '建立本學期考核週期',
      reason: '本學期尚未建立考核週期，建立後才能開始評分與簽核。',
      ctaLabel: '前往建立',
      to: '/appraisal-year-end/appraisal',
    }
  }
  if (!yearEndCycle && canYearEnd) {
    return {
      key: 'create-year-end',
      title: '建立年終結算週期',
      reason: '尚未建立年終週期；年底結算前建立即可。',
      ctaLabel: '前往建立',
      to: '/appraisal-year-end/year-end',
    }
  }
  return {
    key: 'done',
    title: '目前沒有待辦',
    reason: '簽核、例外與發放皆已處理完畢。',
    ctaLabel: '',
    to: '',
  }
}
