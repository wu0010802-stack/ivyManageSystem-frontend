/**
 * scoreItemLabels — 14 個 ScoreItemCode 的中文標籤與顯示順序（共用）。
 *
 * 對應後端 models/appraisal.py 的 ScoreItemCode enum。任何前端視圖
 * 要顯示這些 code 的人話名稱都應從此載入，避免同 code 多版本標籤。
 *
 * （例外：useManualEventEntry.js 的精簡版標籤，因卡片區塊 UI 需求保留。）
 */

export const ITEM_CODE_LABELS = {
  LATE_EARLY: '遲到 / 早退',
  MISSING_PUNCH: '未打卡',
  LEAVE: '請假',
  RETURNING_RATE_0915: '9/15 留校率（學期初）',
  RETURNING_RATE_0315: '3/15 留校率（學期末）',
  AFTER_CLASS_RATE: '才藝報名率',
  REWARD_PUNISH: '獎懲（警告/小過/大過）',
  SCHOOL_MEETING_ABSENCE: '園務會議缺席',
  INSTITUTION_MEETING_0913: '9/13 機構會議研習',
  INSTITUTION_MEETING_1115: '11/15 機構會議研習',
  SELF_IMPROVEMENT_ACTIVITY: '自強活動',
  CHILD_ACCIDENT: '幼兒意外',
  CLASS_HEADCOUNT_BONUS: '帶班人數加分',
  OTHER: '其他',
}

export const ITEM_CODES_ORDER = Object.keys(ITEM_CODE_LABELS)

export const AUTO_ITEM_CODES = new Set([
  'LATE_EARLY',
  'MISSING_PUNCH',
  'LEAVE',
  'RETURNING_RATE_0915',
  'RETURNING_RATE_0315',
  'AFTER_CLASS_RATE',
  'REWARD_PUNISH',
])
