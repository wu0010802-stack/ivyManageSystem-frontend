import { describe, expect, it } from 'vitest'
import { applyTemplateToFields } from '@/composables/useContactBookTemplates'

describe('applyTemplateToFields', () => {
  it('only fills blank fields by default', () => {
    const tpl = { mood: 'tired', teacher_note: '今日表現好' }
    const cur = { mood: 'happy', teacher_note: null }
    const { result, changedFields } = applyTemplateToFields(tpl, cur)
    expect(result.mood).toBe('happy') // 已填，不蓋
    expect(result.teacher_note).toBe('今日表現好')
    expect(changedFields).toEqual(['teacher_note'])
  })

  it('forcing overwrites all fields', () => {
    const tpl = { mood: 'tired' }
    const cur = { mood: 'happy' }
    const { result, changedFields } = applyTemplateToFields(tpl, cur, {
      onlyFillBlank: false,
    })
    expect(result.mood).toBe('tired')
    expect(changedFields).toEqual(['mood'])
  })

  it('skips template values that are blank when only_fill_blank', () => {
    const tpl = { mood: null, teacher_note: 'x' }
    const cur = { mood: null, teacher_note: null }
    const { result, changedFields } = applyTemplateToFields(tpl, cur)
    expect(result.mood).toBeNull()
    expect(result.teacher_note).toBe('x')
    expect(changedFields).toEqual(['teacher_note'])
  })

  it('treats empty string as blank', () => {
    const tpl = { teacher_note: '備註' }
    const cur = { teacher_note: '' }
    const { result, changedFields } = applyTemplateToFields(tpl, cur)
    expect(result.teacher_note).toBe('備註')
    expect(changedFields).toEqual(['teacher_note'])
  })

  it('ignores fields not in fillable list', () => {
    const tpl = { random_unknown: 'x' }
    const cur = {}
    const { result, changedFields } = applyTemplateToFields(tpl, cur)
    expect(result).toEqual({})
    expect(changedFields).toEqual([])
  })

  it('returns unchanged when template is null', () => {
    const cur = { mood: 'happy' }
    const { result, changedFields } = applyTemplateToFields(null, cur)
    expect(result).toEqual({ mood: 'happy' })
    expect(changedFields).toEqual([])
  })
})
