/**
 * 學生檔案頁籤 key 對照（S6）。這張表是舊書籤、站內連結、總覽卡片的共同契約：
 * 任何已出現過的 ?tab= 值都必須落到現行頁籤，不可變成空白內容區。
 */
import { describe, it, expect } from 'vitest'
import {
  STUDENT_TAB_KEYS,
  LEGACY_STUDENT_TAB_MAP,
  RECORDS_SECTIONS,
  GROWTH_SECTIONS,
  resolveStudentTab,
  sectionBelongsTo,
} from '../studentProfileTabs'

const first = (raw: string, q: { sub?: string; group?: string } = {}) => {
  const r = resolveStudentTab(raw, q)
  return { tab: r.candidates[0], sub: r.sub, legacy: r.legacy }
}

describe('resolveStudentTab — 現行 key 原樣通過', () => {
  it.each(STUDENT_TAB_KEYS)('%s → 自己、非舊 key、無區塊', (key) => {
    expect(first(key)).toEqual({ tab: key, sub: '', legacy: false })
  })

  it('records／growth 帶合法 ?sub= 保留；非本頁籤的 sub（殘留）忽略', () => {
    expect(first('records', { sub: 'leave' })).toEqual({ tab: 'records', sub: 'leave', legacy: false })
    expect(first('growth', { sub: 'timeline' })).toEqual({ tab: 'growth', sub: 'timeline', legacy: false })
    expect(first('records', { sub: 'timeline' }).sub).toBe('')
    expect(first('growth', { sub: 'attendance' }).sub).toBe('')
    expect(first('basic', { sub: 'attendance' }).sub).toBe('')
  })

  it('區塊 key 兩組互不重疊（共用同一個 ?sub= 才不會誤判）', () => {
    const overlap = RECORDS_SECTIONS.filter((s) => (GROWTH_SECTIONS as readonly string[]).includes(s))
    expect(overlap).toEqual([])
  })
})

describe('舊 key → 新 key 對照表（凍結）', () => {
  it.each([
    ['guardians', 'basic', ''],
    ['attendance', 'records', 'attendance'],
    ['health_growth', 'health', ''],
    ['growth_profile', 'growth', ''],
    ['milestones', 'growth', 'milestones'],
    ['timeline', 'growth', 'timeline'],
    ['photo_gallery', 'growth', 'photo_gallery'],
    ['growth_report', 'growth', 'growth_report'],
  ])('?tab=%s → %s（sub=%s）', (legacy, tab, sub) => {
    expect(first(legacy)).toEqual({ tab, sub, legacy: true })
  })

  it('health_growth_profile：預設與 ?group=health → health；?group=growth → growth（保留合法 sub）', () => {
    expect(first('health_growth_profile')).toEqual({ tab: 'health', sub: '', legacy: true })
    expect(first('health_growth_profile', { group: 'health' })).toEqual({ tab: 'health', sub: '', legacy: true })
    expect(first('health_growth_profile', { group: 'growth' })).toEqual({ tab: 'growth', sub: '', legacy: true })
    expect(first('health_growth_profile', { group: 'growth', sub: 'photo_gallery' })).toEqual({
      tab: 'growth', sub: 'photo_gallery', legacy: true,
    })
    // 舊網址 ?tab=health_growth_profile&group=health&sub=… 的 sub 不屬於健康頁籤
    expect(first('health_growth_profile', { group: 'health', sub: 'timeline' }).sub).toBe('')
  })

  it('growth_profile 帶舊 ?sub=：沿用該區塊；舊 key 自帶的區塊優先於 ?sub=', () => {
    expect(first('growth_profile', { sub: 'growth_report' })).toEqual({ tab: 'growth', sub: 'growth_report', legacy: true })
    expect(first('timeline', { sub: 'milestones' }).sub).toBe('timeline')
  })

  it('權限候補：健康看不到時退到成長（舊的合併頁籤兩邊都可能是使用者要的）', () => {
    expect(resolveStudentTab('health_growth_profile').candidates).toEqual(['health', 'growth'])
    expect(resolveStudentTab('health_growth_profile', { group: 'growth' }).candidates).toEqual(['growth', 'health'])
    expect(resolveStudentTab('health_growth').candidates).toEqual(['health', 'growth'])
  })

  it('對照表的目標都是現行 key，區塊都屬於目標頁籤（不會指到不存在的頁籤）', () => {
    for (const [legacy, rule] of Object.entries(LEGACY_STUDENT_TAB_MAP)) {
      expect(STUDENT_TAB_KEYS as readonly string[], legacy).toContain(rule.tab)
      for (const fb of rule.fallbacks ?? []) expect(STUDENT_TAB_KEYS as readonly string[], legacy).toContain(fb)
      if (rule.sub) expect(sectionBelongsTo(rule.tab, rule.sub), legacy).toBe(true)
    }
  })

  it('舊 key 不得與現行 key 同名（否則 legacy 旗標會誤判）', () => {
    for (const legacy of Object.keys(LEGACY_STUDENT_TAB_MAP)) {
      expect(STUDENT_TAB_KEYS as readonly string[]).not.toContain(legacy)
    }
  })
})
