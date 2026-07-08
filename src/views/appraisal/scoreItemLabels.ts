/**
 * scoreItemLabels — ScoreItemCode 的中文標籤與顯示順序（共用）。
 *
 * 對應後端 models/appraisal.py 的 ScoreItemCode enum。任何前端視圖
 * 要顯示這些 code 的人話名稱都應從此載入，避免同 code 多版本標籤。
 *
 * （例外：useManualEventEntry.ts 的精簡版標籤，因卡片區塊 UI 需求保留。）
 */

export const ITEM_CODE_LABELS = {
  LATE_EARLY: '遲到 / 早退',
  MISSING_PUNCH: '未打卡',
  LEAVE: '請假',
  ABSENTEEISM: '曠職',
  RETURNING_RATE_0915: '9/15 留校率（學期初）',
  RETURNING_RATE_0315: '3/15 留校率（學期末）',
  AFTER_CLASS_RATE: '才藝報名率',
  REWARD_PUNISH: '獎懲（功過相抵）',
  SCHOOL_MEETING_ABSENCE: '園務會議缺席（填時數，每次最多計 4 小時）',
  INSTITUTION_MEETING_0913: '9/13 機構會議研習（填時數，每次最多計 4 小時）',
  INSTITUTION_MEETING_1115: '11/15 機構會議研習（填時數，每次最多計 4 小時）',
  SELF_IMPROVEMENT_ACTIVITY: '自強活動（填時數，每次最多計 4 小時）',
  CHILD_ACCIDENT: '幼兒意外（事件紀錄自動彙總，主管評議）',
  CLASS_HEADCOUNT_BONUS: '帶班人數加分',
  SPED: '特教加分（特教標記）',
  STUDENT_WITHDRAWAL: '休學人數（當月月費未繳者）',
  STUDENT_REINSTATE: '復學人數',
  TRIAL_LEAVE: '試讀離園',
  CLASS_TRANSFER: '轉班',
  EXAM_RESULT: '檢測成績（填分值 ±10，依當學期公告）',
  RECRUIT_SCORE: '招生加分（填分值 0~20，依當學期公告）',
  SUPERVISOR_SCORE: '主管加分（填分值 0~10）',
  EXCELLENCE_NOMINATION: '呈報優異（每學期全園 1 位）',
  OTHER: '其他',
}

export const ITEM_CODES_ORDER = Object.keys(ITEM_CODE_LABELS)

export const AUTO_ITEM_CODES = new Set([
  'LATE_EARLY',
  'MISSING_PUNCH',
  'LEAVE',
  'ABSENTEEISM',
  'RETURNING_RATE_0915',
  'RETURNING_RATE_0315',
  'AFTER_CLASS_RATE',
  'REWARD_PUNISH',
  'CHILD_ACCIDENT',
  'CLASS_HEADCOUNT_BONUS',
  'SPED',
  'STUDENT_REINSTATE',
  'TRIAL_LEAVE',
])

/** MANUAL_DELTA 類分值項的輸入範圍（與後端 aprreg01 規則 config 一致） */
export const MANUAL_DELTA_RANGES: Record<string, { min: number; max: number }> = {
  CHILD_ACCIDENT: { min: -10, max: 0 },
  EXAM_RESULT: { min: -10, max: 10 },
  RECRUIT_SCORE: { min: 0, max: 20 },
  SUPERVISOR_SCORE: { min: 0, max: 10 },
}
