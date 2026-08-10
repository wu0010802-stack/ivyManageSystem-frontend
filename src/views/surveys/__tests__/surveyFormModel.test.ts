import { describe, it, expect } from 'vitest'
import { addQuestion, emptyDraft, moveQuestion, removeQuestion, validateDraft } from '../surveyFormModel'

describe('surveyFormModel', () => {
  it('addQuestion 給 choice 型預設兩個空選項、number/text 為 null', () => {
    const d = emptyDraft()
    addQuestion(d, 'single_choice')
    addQuestion(d, 'number')
    expect(d.questions[0].options).toEqual(['', ''])
    expect(d.questions[1].options).toBeNull()
    expect(d.questions.map(q => q.sort_order)).toEqual([0, 1])
  })
  it('remove/move 維持 sort_order 連續', () => {
    const d = emptyDraft()
    addQuestion(d, 'text'); addQuestion(d, 'number'); addQuestion(d, 'text')
    removeQuestion(d, 1)
    expect(d.questions.map(q => q.sort_order)).toEqual([0, 1])
    moveQuestion(d, 1, -1)
    expect(d.questions[0].question_type).toBe('text')
    expect(d.questions.map(q => q.sort_order)).toEqual([0, 1])
  })
  it('validateDraft 抓齊規則', () => {
    const d = emptyDraft()
    expect(validateDraft(d)).toContain('請填寫調查標題')
    d.title = '秋季戶外教學'; d.reply_deadline = '2030-10-01'
    d.audience_type = 'classrooms'
    expect(validateDraft(d)).toContain('指定班級型調查至少需選一個班級')
    d.classroom_ids = [1]
    addQuestion(d, 'single_choice')
    d.questions[0].question_text = '飲食'
    expect(validateDraft(d).some(m => m.includes('選項'))).toBe(true)
    d.questions[0].options = ['葷', '素']
    expect(validateDraft(d)).toEqual([])
  })
})
