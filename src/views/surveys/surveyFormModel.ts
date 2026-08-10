// 活動調查表單純函式模型（可測，不依賴 Vue）
import { isSurveyChoiceType, type SurveyQuestionType } from '@/constants/surveyQuestionTypes'

export interface QuestionDraft {
  question_text: string
  question_type: SurveyQuestionType
  options: string[] | null
  is_required: boolean
  sort_order: number
}

export interface SurveyDraft {
  title: string
  description: string
  event_date: string | null
  location: string
  fee_note: string
  audience_type: 'all' | 'classrooms'
  classroom_ids: number[]
  reply_deadline: string
  questions: QuestionDraft[]
}

export function emptyDraft(): SurveyDraft {
  return {
    title: '',
    description: '',
    event_date: null,
    location: '',
    fee_note: '',
    audience_type: 'all',
    classroom_ids: [],
    reply_deadline: '',
    questions: [],
  }
}

function isChoiceType(type: QuestionDraft['question_type']): boolean {
  return isSurveyChoiceType(type)
}

export function addQuestion(d: SurveyDraft, type: QuestionDraft['question_type']): void {
  d.questions.push({
    question_text: '',
    question_type: type,
    options: isChoiceType(type) ? ['', ''] : null,
    is_required: true,
    sort_order: d.questions.length,
  })
}

export function removeQuestion(d: SurveyDraft, index: number): void {
  d.questions.splice(index, 1)
  d.questions.forEach((q, i) => { q.sort_order = i })
}

export function moveQuestion(d: SurveyDraft, index: number, dir: -1 | 1): void {
  const target = index + dir
  if (target < 0 || target >= d.questions.length) return
  const tmp = d.questions[index]
  d.questions[index] = d.questions[target]
  d.questions[target] = tmp
  d.questions.forEach((q, i) => { q.sort_order = i })
}

export function validateDraft(d: SurveyDraft, forPublish = true): string[] {
  const errors: string[] = []

  if (!d.title.trim()) errors.push('請填寫調查標題')
  else if (d.title.length > 100) errors.push('調查標題請勿超過 100 字')

  if (!d.reply_deadline) errors.push('請填寫回覆截止日')

  if (forPublish && d.audience_type === 'classrooms' && d.classroom_ids.length === 0) {
    errors.push('指定班級型調查至少需選一個班級')
  }

  d.questions.forEach((q, i) => {
    const label = `第 ${i + 1} 題`
    const text = q.question_text.trim()
    if (!text) errors.push(`${label}請填寫題目文字`)
    else if (text.length > 200) errors.push(`${label}題目文字請勿超過 200 字`)

    if (isChoiceType(q.question_type)) {
      const opts = (q.options ?? []).map(o => o.trim())
      if (opts.some(o => !o)) errors.push(`${label}選項不可為空`)
      if (opts.length < 2) errors.push(`${label}選項至少需 2 個`)
      const nonEmpty = opts.filter(o => o)
      if (new Set(nonEmpty).size !== nonEmpty.length) errors.push(`${label}選項不可重複`)
      if (opts.some(o => o.length > 50)) errors.push(`${label}選項請勿超過 50 字`)
    } else if (q.options !== null) {
      errors.push(`${label}非選擇題不可帶選項`)
    }
  })

  return errors
}
