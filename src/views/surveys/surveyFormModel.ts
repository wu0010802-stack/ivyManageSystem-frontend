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

/** 後端 `GET /surveys/{id}` 中表單用得到的欄位（題目另帶原題 id，表單不需要）。 */
export interface SurveySource {
  title: string
  description: string | null
  event_date: string | null
  location: string | null
  fee_note: string | null
  audience_type: 'all' | 'classrooms'
  classroom_ids: number[] | null
  reply_deadline: string
  questions: (QuestionDraft & { id?: number })[] | null
}

/** 後端調查詳情 → 表單草稿（題目只取表單欄位，不帶原題 id）。 */
export function draftFromSurvey(src: SurveySource): SurveyDraft {
  return {
    title: src.title,
    description: src.description ?? '',
    event_date: src.event_date ?? null,
    location: src.location ?? '',
    fee_note: src.fee_note ?? '',
    audience_type: src.audience_type,
    classroom_ids: src.classroom_ids ?? [],
    reply_deadline: src.reply_deadline,
    questions: (src.questions ?? []).map(q => ({
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options ?? null,
      is_required: q.is_required,
      sort_order: q.sort_order,
    })),
  }
}

const SURVEY_TITLE_MAX = 100
const COPY_TITLE_SUFFIX = '（複本）'

/**
 * 複製調查：沿用說明、地點、對象與題目，標題加「（複本）」，活動日期與回覆截止日
 * 清空要重填（複製的多半是明年同一場活動，沿用舊日期只會存出已過期的截止日）。
 * 原班級已不在目前班級清單（如去年的班）就不帶入，否則畫面勾不到卻仍算「已選」；
 * 清單載入失敗（null）時無從比對，照原樣保留交給後端驗證。
 */
export function copyDraftFrom(src: SurveySource, availableClassroomIds: number[] | null): SurveyDraft {
  const base = draftFromSurvey(src)
  return {
    ...base,
    title: base.title.slice(0, SURVEY_TITLE_MAX - COPY_TITLE_SUFFIX.length) + COPY_TITLE_SUFFIX,
    event_date: null,
    reply_deadline: '',
    classroom_ids: availableClassroomIds === null
      ? base.classroom_ids
      : base.classroom_ids.filter(id => availableClassroomIds.includes(id)),
  }
}

/**
 * 草稿是否有未儲存變更。題目為巢狀結構，用序列化整體比對而非淺比較——
 * 淺比較會漏掉「只改了某題標題」這種最常見的編輯。
 */
export function isDraftDirty(baseline: SurveyDraft, current: SurveyDraft): boolean {
  return JSON.stringify(baseline) !== JSON.stringify(current)
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
    // 主題目「是否參加」固定不編號，附加題從 1 起算，與表單／詳情頁的編號一致。
    const label = `附加題 ${i + 1}`
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

/**
 * 回覆截止日的非阻擋提示（畫面上顯示在欄位下方，不擋儲存）：
 * - 截止日已過：草稿發布時後端會拒絕（reply_deadline 須 ≥ 今天），家長也無法填寫。
 * - 截止日晚於活動日：多半是填反了，提醒一下但不硬擋（活動後仍可能收回條）。
 */
export function deadlineHints(d: Pick<SurveyDraft, 'reply_deadline' | 'event_date'>, today: string): string[] {
  const hints: string[] = []
  if (!d.reply_deadline) return hints
  if (d.reply_deadline < today) hints.push('截止日已過：家長無法填寫，發布時也會被拒絕')
  if (d.event_date && d.reply_deadline > d.event_date) hints.push('截止日晚於活動日期，家長可能在活動結束後才回覆')
  return hints
}
