import { describe, it, expect } from 'vitest'
import { groupUpcomingEvents } from '@/composables/useDashboardSections'

// groupUpcomingEvents 純函式：把 upcoming events 依 event_date 分組並產生
// 「今天 / 明天 / 後天 / M 月 D 日」label。F3 防禦：event_date 為空 / 壞值
// 時不應崩潰（原先 key.split('-') 對 undefined 會 throw）。
describe('groupUpcomingEvents 純邏輯防禦（F3）', () => {
  const today = new Date('2026-06-24T08:00:00')

  it('空陣列回空', () => {
    expect(groupUpcomingEvents([], today)).toEqual([])
  })

  it('正常 event_date 產生今天 / 明天 / 後天 label', () => {
    const groups = groupUpcomingEvents([
      { event_date: '2026-06-24' },
      { event_date: '2026-06-25' },
      { event_date: '2026-06-26' },
    ], today)
    const labels = groups.map(g => g.label)
    expect(labels).toContain('今天')
    expect(labels).toContain('明天')
    expect(labels).toContain('後天')
  })

  it('遠日 event_date 產生「M 月 D 日」label', () => {
    const groups = groupUpcomingEvents([{ event_date: '2026-07-03' }], today)
    expect(groups[0].label).toBe('7 月 3 日')
  })

  it('event_date 為空字串 / null / undefined 不崩潰（跳過該筆）', () => {
    expect(() => {
      groupUpcomingEvents(
        [
          { event_date: '' },
          { event_date: null as unknown as string },
          { event_date: undefined as unknown as string },
        ],
        today,
      )
    }).not.toThrow()
  })

  it('event_date 為壞格式（無 dash）不崩潰', () => {
    expect(() => {
      groupUpcomingEvents([{ event_date: 'not-a-date' }], today)
      groupUpcomingEvents([{ event_date: '20260703' }], today)
    }).not.toThrow()
  })

  it('混入壞值時仍正常分組合法筆數', () => {
    const groups = groupUpcomingEvents(
      [
        { event_date: '' },
        { event_date: '2026-06-24' },
        { event_date: null as unknown as string },
      ],
      today,
    )
    // 至少含合法的「今天」分組；壞值被跳過不影響
    const labels = groups.map(g => g.label)
    expect(labels).toContain('今天')
  })
})
