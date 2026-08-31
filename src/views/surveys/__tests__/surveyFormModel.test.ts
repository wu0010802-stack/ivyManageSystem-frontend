import { describe, it, expect } from 'vitest'
import { addQuestion, emptyDraft, isDraftDirty, moveQuestion, removeQuestion, validateDraft, type SurveyDraft } from '../surveyFormModel'

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

  describe('isDraftDirty', () => {
    it('未改動時為 false', () => {
      const base = emptyDraft()
      expect(isDraftDirty(base, emptyDraft())).toBe(false)
    })

    it('改標題後為 true', () => {
      const base = emptyDraft()
      const draft = { ...emptyDraft(), title: '春季親子日' }
      expect(isDraftDirty(base, draft)).toBe(true)
    })

    it('陣列內容改動也偵測得到（非淺比較）', () => {
      const base = { ...emptyDraft(), classroom_ids: [1, 2] }
      const draft = { ...emptyDraft(), classroom_ids: [1, 3] }
      expect(isDraftDirty(base, draft)).toBe(true)
    })

    it('陣列長度改變偵測得到', () => {
      const base = { ...emptyDraft(), classroom_ids: [1] }
      const draft = { ...emptyDraft(), classroom_ids: [1, 2] }
      expect(isDraftDirty(base, draft)).toBe(true)
    })

    it('題目結構改動也偵測得到（使用者取消前多半是動了題目）', () => {
      const base = emptyDraft()
      const draft = emptyDraft()
      addQuestion(draft, 'single_choice')
      expect(isDraftDirty(base, draft)).toBe(true)
    })

    it('只改某題文字也偵測得到——isDraftDirty 註解宣稱的正是這個情境', () => {
      const draft = emptyDraft()
      addQuestion(draft, 'number')
      // 比照 SurveyFormView.loadSurvey() 的真實流程：baseline 是深拷貝快照，
      // 之後使用者只動巢狀欄位（題目文字），top-level 欄位數量與型別都沒變。
      const base = JSON.parse(JSON.stringify(draft)) as SurveyDraft
      draft.questions[0].question_text = '交通方式'
      expect(isDraftDirty(base, draft)).toBe(true)
    })
  })
})
