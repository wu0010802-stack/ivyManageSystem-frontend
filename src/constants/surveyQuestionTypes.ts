/**
 * 活動參加調查題型列舉 — 前端唯一真值來源，對齊後端 Pydantic Literal
 * （見 `src/api/_generated/schema.d.ts` 的 `question_type: "single_choice" | "multi_choice" | "number" | "text"`）。
 *
 * 根因（2026-08-10 whole-branch review Critical finding）：管理端／教師端／家長端
 * 三處原本各自手抄這四個字面值，家長端 `SurveyFillSheet.vue` 誤植成不存在的
 * `'single'` / `'multi'`，導致所有選擇題落入 textarea 分支、送出後後端
 * `validate_answers` 對 single_choice/multi_choice 一律回 422，家長送不出調查回覆。
 * 三端一律 import 這份常數／型別／共用驗證函式，禁止再各自手抄字面值。
 *
 * ⚠ 家長端 chunk 鐵律：本檔僅能是純 TS 常數／型別／純函式，不得 import 任何
 * 元件或會拉進 Element Plus 的東西。
 */

export const SURVEY_QUESTION_TYPES = {
  SINGLE_CHOICE: 'single_choice',
  MULTI_CHOICE: 'multi_choice',
  NUMBER: 'number',
  TEXT: 'text',
} as const

export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[keyof typeof SURVEY_QUESTION_TYPES]

/** single_choice / multi_choice 是否需要 options 陣列（其餘題型不可帶 options）。 */
export function isSurveyChoiceType(type: string): boolean {
  return type === SURVEY_QUESTION_TYPES.SINGLE_CHOICE || type === SURVEY_QUESTION_TYPES.MULTI_CHOICE
}

/**
 * 必填題檢查 — 家長端填寫 sheet／管理端代填 dialog／教師端代填 dialog 三處共用，
 * 避免各自手抄第三份判斷邏輯（第 1 項根因的同型問題）。
 * 回傳第一個「必填但未作答」題目的文字；全部通過回 null。
 */
export interface SurveyRequiredCheckQuestion {
  id: number
  question_text: string
  is_required: boolean
}

export function firstUnansweredRequiredQuestion(
  questions: SurveyRequiredCheckQuestion[],
  answers: Record<string, unknown>,
): string | null {
  for (const q of questions) {
    const v = answers[String(q.id)]
    if (q.is_required && (v === undefined || v === '' || (Array.isArray(v) && !v.length))) {
      return q.question_text
    }
  }
  return null
}
