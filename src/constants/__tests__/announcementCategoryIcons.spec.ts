import { describe, it, expect } from 'vitest'
import {
  ANNOUNCEMENT_CATEGORY_ICON_OPTIONS,
  DEFAULT_ANNOUNCEMENT_CATEGORY_ICON,
  previewIconFor,
} from '@/constants/announcementCategoryIcons'

describe('announcementCategoryIcons', () => {
  it('預設圖示落在策展清單內（與後端 migration 預設值 campaign 對齊）', () => {
    expect(DEFAULT_ANNOUNCEMENT_CATEGORY_ICON).toBe('campaign')
    expect(ANNOUNCEMENT_CATEGORY_ICON_OPTIONS.map((o) => o.value)).toContain(
      DEFAULT_ANNOUNCEMENT_CATEGORY_ICON,
    )
  })

  it('策展清單 value 不重複', () => {
    const values = ANNOUNCEMENT_CATEGORY_ICON_OPTIONS.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('previewIconFor 對已知 icon 回傳對應元件，未知/空值 fallback InfoFilled', () => {
    const known = previewIconFor('warning')
    const fallbackForUnknown = previewIconFor('some_unknown_icon_name')
    const fallbackForNull = previewIconFor(null)
    expect(known).not.toBe(fallbackForUnknown)
    expect(fallbackForUnknown).toBe(fallbackForNull)
  })
})
