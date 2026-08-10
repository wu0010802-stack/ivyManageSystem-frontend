import { describe, it, expect } from 'vitest'
import { addQuestion, emptyDraft, moveQuestion, removeQuestion, validateDraft, type SurveyDraft } from '../surveyFormModel'

/** 產生一份除待測欄位外皆合法的草稿，用來隔離單一規則。 */
function validBaseDraft(): SurveyDraft {
  const d = emptyDraft()
  d.title = '秋季戶外教學'
  d.reply_deadline = '2030-10-01'
  return d
}

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

  describe('validateDraft 補充規則', () => {
    it('title 超過 100 字時擋下', () => {
      const d = validBaseDraft()
      d.title = 'a'.repeat(101)
      expect(validateDraft(d).some(m => m.includes('標題'))).toBe(true)
    })

    it('題目文字空值時擋下', () => {
      const d = validBaseDraft()
      addQuestion(d, 'text')
      expect(validateDraft(d).some(m => m.includes('題目文字'))).toBe(true)
    })

    it('題目文字超過 200 字時擋下', () => {
      const d = validBaseDraft()
      addQuestion(d, 'text')
      d.questions[0].question_text = 'a'.repeat(201)
      expect(validateDraft(d).some(m => m.includes('題目文字') && m.includes('200'))).toBe(true)
    })

    it('choice 題選項重複時擋下', () => {
      const d = validBaseDraft()
      addQuestion(d, 'single_choice')
      d.questions[0].question_text = '飲食'
      d.questions[0].options = ['葷', '葷']
      expect(validateDraft(d).some(m => m.includes('重複'))).toBe(true)
    })

    it('choice 題選項少於 2 個時擋下', () => {
      const d = validBaseDraft()
      addQuestion(d, 'single_choice')
      d.questions[0].question_text = '飲食'
      d.questions[0].options = ['葷']
      expect(validateDraft(d).some(m => m.includes('選項') && m.includes('2'))).toBe(true)
    })

    it('choice 題選項超過 50 字時擋下', () => {
      const d = validBaseDraft()
      addQuestion(d, 'single_choice')
      d.questions[0].question_text = '飲食'
      d.questions[0].options = ['a'.repeat(51), '素']
      expect(validateDraft(d).some(m => m.includes('選項') && m.includes('50'))).toBe(true)
    })

    it('非 choice 題帶 options 時擋下', () => {
      const d = validBaseDraft()
      addQuestion(d, 'text')
      d.questions[0].question_text = '備註'
      d.questions[0].options = ['不該有這個']
      expect(validateDraft(d).some(m => m.includes('非選擇題'))).toBe(true)
    })
  })
})
