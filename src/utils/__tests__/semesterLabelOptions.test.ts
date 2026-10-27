import { describe, it, expect } from 'vitest'
import { buildSemesterLabelOptions } from '../academic'

// 學生評量的 semester 欄是自由字串，既有資料一律是「民國學年＋上/下」（例：114上）。
describe('buildSemesterLabelOptions', () => {
  it('由目前學期往回排，格式與既有資料一致', () => {
    expect(buildSemesterLabelOptions({ school_year: 114, semester: 1 }, 4)).toEqual([
      '114上', '113下', '113上', '112下',
    ])
    expect(buildSemesterLabelOptions({ school_year: 114, semester: 2 }, 3)).toEqual([
      '114下', '114上', '113下',
    ])
  })

  it('既有紀錄的學期不在清單內時補在最後，避免編輯時欄位空白', () => {
    expect(buildSemesterLabelOptions({ school_year: 114, semester: 1 }, 2, ['2025上', '114上']))
      .toEqual(['114上', '113下', '2025上'])
  })
})
