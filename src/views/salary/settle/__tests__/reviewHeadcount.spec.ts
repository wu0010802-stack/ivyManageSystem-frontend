import { describe, it, expect } from 'vitest'
import {
    headcountsOf,
    primaryHeadcount,
    headcountGap,
    gapText,
    ratioText,
    overtimeText,
} from '../reviewHeadcount'

const head = {
    snapshot_date: '2026-10-31',
    total: 28,
    classroom_id: 1,
    classroom_name: '蒲公英',
    grade_name: '大班',
    multi_head: false,
    target: 30,
    overtime_target: 33,
}

describe('headcountsOf', () => {
    it('班導班在前，副班導／美師班在後', () => {
        const row = {
            breakdown: {
                enrollment: head,
                assistant: {
                    by_classroom: ['海豚'],
                    classes: [
                        {
                            classroom_id: 2,
                            classroom_name: '海豚',
                            grade_name: '大班',
                            role: 'art_teacher',
                            total: 31,
                            target: 30,
                            overtime_target: 33,
                            is_shared_assistant: false,
                        },
                    ],
                },
            },
        }
        const list = headcountsOf(row)
        expect(list.map((h) => [h.classroomName, h.role])).toEqual([
            ['蒲公英', 'head_teacher'],
            ['海豚', 'art_teacher'],
        ])
        expect(primaryHeadcount(row)?.classroomName).toBe('蒲公英')
    })

    it('無 breakdown／舊後端沒有 classes → 空陣列，不炸', () => {
        expect(headcountsOf({})).toEqual([])
        expect(headcountsOf({ breakdown: null })).toEqual([])
        expect(headcountsOf({ breakdown: { enrollment: null, assistant: { by_classroom: ['A'] } } })).toEqual([])
        expect(primaryHeadcount({})).toBeNull()
    })

    it('target 缺（舊後端）→ null', () => {
        const { target: _t, overtime_target: _o, ...legacy } = head
        const [h] = headcountsOf({ breakdown: { enrollment: legacy } })
        expect(h.target).toBeNull()
        expect(h.overtimeTarget).toBeNull()
    })
})

describe('差距與文字', () => {
    const base = headcountsOf({ breakdown: { enrollment: head } })[0]

    it('在籍 − 目標', () => {
        expect(headcountGap(base)).toBe(-2)
        expect(gapText(-2)).toBe('−2')
        expect(gapText(1)).toBe('+1')
        expect(gapText(0)).toBe('達標')
        expect(gapText(null)).toBe('—')
    })

    it('目標未設定（0 或 null）→ 差距 null', () => {
        expect(headcountGap({ ...base, target: 0 })).toBeNull()
        expect(headcountGap({ ...base, target: null })).toBeNull()
    })

    it('達成率取一位小數', () => {
        expect(ratioText(base)).toBe('93.3%')
        expect(ratioText({ ...base, target: null })).toBe('—')
    })

    it('超額門檻文字', () => {
        expect(overtimeText(base)).toBe('未超額，還差 5 人')
        expect(overtimeText({ ...base, enrollment: 35 })).toBe('超額 2 人')
        expect(overtimeText({ ...base, enrollment: 33 })).toBe('剛好到門檻，未超額')
        expect(overtimeText({ ...base, overtimeTarget: null })).toBe('—')
    })
})
