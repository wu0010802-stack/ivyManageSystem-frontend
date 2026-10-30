/**
 * 考核（appraisal）共用常數——components 與 views 都會用到的放這裡，
 * 避免 components 反向 import views。
 */

/** MANUAL_DELTA 類分值項的輸入範圍（與後端 aprreg01 規則 config 一致） */
export const MANUAL_DELTA_RANGES: Record<string, { min: number; max: number }> = {
  CHILD_ACCIDENT: { min: -10, max: 0 },
  EXAM_RESULT: { min: -10, max: 10 },
  RECRUIT_SCORE: { min: 0, max: 20 },
  SUPERVISOR_SCORE: { min: 0, max: 10 },
}
