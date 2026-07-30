import { describe, it, expect } from 'vitest'
import { labelClassroomsByTerm, type ClassroomLike } from '../classroomTerm'

describe('labelClassroomsByTerm — 跨學期班級清單的顯示標籤', () => {
  it('班名不重複時 label 就是班名', () => {
    const classrooms: ClassroomLike[] = [
      { id: 10, name: '小班' },
      { id: 20, name: '中班' },
    ]
    expect(labelClassroomsByTerm(classrooms).map(c => c.label)).toEqual(['小班', '中班'])
  })

  // 跨學年常見同班名（staging 實例：114-2 與 115-1 都有「向日葵」），
  // 不標學期的話下拉會出現兩個一模一樣的選項。
  it('同名班級補上 semester_label 以便分辨', () => {
    const classrooms: ClassroomLike[] = [
      { id: 24, name: '向日葵', semester_label: '114學年度下學期' },
      { id: 22, name: '向日葵', semester_label: '115學年度上學期' },
    ]
    expect(labelClassroomsByTerm(classrooms).map(c => c.label)).toEqual([
      '向日葵（114學年度下學期）',
      '向日葵（115學年度上學期）',
    ])
  })

  it('同名但缺 semester_label 時退回 school_year-semester 組字', () => {
    const classrooms: ClassroomLike[] = [
      { id: 24, name: '向日葵', school_year: 114, semester: 2 },
      { id: 22, name: '向日葵', school_year: 115, semester: 1 },
    ]
    expect(labelClassroomsByTerm(classrooms).map(c => c.label)).toEqual([
      '向日葵（114-2）',
      '向日葵（115-1）',
    ])
  })

  it('同名且完全沒有學期資訊時退回班名，不生出空括號', () => {
    const classrooms: ClassroomLike[] = [
      { id: 24, name: '向日葵' },
      { id: 22, name: '向日葵' },
    ]
    expect(labelClassroomsByTerm(classrooms).map(c => c.label)).toEqual(['向日葵', '向日葵'])
  })

  it('保留原順序與 id/name，空輸入回空陣列', () => {
    const classrooms: ClassroomLike[] = [
      { id: 30, name: '大班' },
      { id: 10, name: '小班' },
    ]
    expect(labelClassroomsByTerm(classrooms)).toEqual([
      { id: 30, name: '大班', label: '大班' },
      { id: 10, name: '小班', label: '小班' },
    ])
    expect(labelClassroomsByTerm([])).toEqual([])
  })
})
