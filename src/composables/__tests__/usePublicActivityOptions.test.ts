import { describe, it, expect } from 'vitest'
import { usePublicActivityOptions } from '../usePublicActivityOptions'

// applyOptions 為個別端點與 /public/bootstrap 合併端點共用的填值邏輯
// （穩定度稽核 2026-06-23：6 支 GET 合併為 bootstrap）。
describe('usePublicActivityOptions.applyOptions', () => {
  it('映射 bootstrap 欄位（course_videos→videos）並去重班級、保留順序', () => {
    const { courses, supplies, classes, videos, applyOptions } = usePublicActivityOptions()
    applyOptions({
      courses: [{ name: '圍棋' }],
      supplies: [{ name: '圍棋墊' }],
      classes: ['大象班', '大象班', '兔子班'],
      videos: { 圍棋: 'https://v' },
    })
    expect(courses.value).toEqual([{ name: '圍棋' }])
    expect(supplies.value).toEqual([{ name: '圍棋墊' }])
    expect(classes.value).toEqual(['大象班', '兔子班'])
    expect(videos.value).toEqual({ 圍棋: 'https://v' })
  })

  it('缺漏 / 非陣列 payload 安全退為空（不丟例外，不污染 refs）', () => {
    const { courses, supplies, classes, videos, applyOptions } = usePublicActivityOptions()
    applyOptions({})
    expect(courses.value).toEqual([])
    expect(supplies.value).toEqual([])
    expect(classes.value).toEqual([])
    expect(videos.value).toEqual({})
  })
})
