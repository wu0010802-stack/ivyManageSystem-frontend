import { describe, it, expect } from 'vitest'
import {
    headcountsOf,
    primaryHeadcount,
    headcountGap,
    headcountDelta,
    deltaText,
    deltaTitle,
    prevMonthOf,
    prevHeaderTip,
    ratioText,
    overtimeText,
    isSchoolReference,
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

describe('全園人數（主管／辦公室）', () => {
    it('breakdown.school 排在最前，作為本人的人數依據', () => {
        const row = {
            breakdown: {
                enrollment: head,
                assistant: null,
                school: { basis: 'supervisor', total: 152, target: 160, snapshot_date: '2026-10-31' },
                festival_basis: 'supervisor',
            },
        }
        const list = headcountsOf(row)
        expect(list.map((h) => [h.scope, h.classroomName])).toEqual([
            ['school', '全園'],
            ['class', '蒲公英'],
        ])
        const p = primaryHeadcount(row)!
        expect(p.schoolBasis).toBe('supervisor')
        expect(headcountGap(p)).toBe(-8)
        expect(p.overtimeTarget).toBeNull()
    })
})

describe('全園人數（不帶班參考）', () => {
    it('basis=null：不帶班的人也帶全園在籍／目標，標為參考', () => {
        const row = {
            breakdown: {
                enrollment: null,
                assistant: null,
                school: { basis: null, total: 152, target: 160, snapshot_date: '2026-10-31' },
                festival_basis: null,
            },
        }
        const p = primaryHeadcount(row)!
        expect(p.scope).toBe('school')
        expect(p.classroomName).toBe('全園')
        expect(p.schoolBasis).toBeNull()
        expect(isSchoolReference(p)).toBe(true)
        expect(p.enrollment).toBe(152)
        expect(headcountGap(p)).toBe(-8)
    })

    it('節慶看全園的人（主管等）不是參考；班級列也不是', () => {
        const sup = primaryHeadcount({
            breakdown: { school: { basis: 'supervisor', total: 152, target: 160, snapshot_date: '2026-10-31' } },
        })
        expect(isSchoolReference(sup)).toBe(false)
        expect(isSchoolReference(primaryHeadcount({ breakdown: { enrollment: head } }))).toBe(false)
        expect(isSchoolReference(null)).toBe(false)
    })

    it('不認得的 basis 字串不採用（防舊／壞資料）', () => {
        expect(headcountsOf({ breakdown: { school: { basis: 'weird', total: 1, target: 2 } } })).toEqual([])
    })
})

describe('差距與文字', () => {
    const base = headcountsOf({ breakdown: { enrollment: head } })[0]

    it('在籍 − 目標（展開列與「人數未達目標」用）', () => {
        expect(headcountGap(base)).toBe(-2)
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

describe('較上月（2026-11-04：人數差距改與上月比較，不跨學年）', () => {
    const prevOk = { year: 2026, month: 9, comparable: true, reason: null }

    it('班導班、副班導班、全園都帶上月人數（prev_total）', () => {
        const row = {
            breakdown: {
                enrollment: { ...head, prev_total: 27 },
                assistant: {
                    by_classroom: ['海豚'],
                    classes: [
                        { classroom_id: 2, classroom_name: '海豚', grade_name: '大班', role: 'assistant_teacher',
                          total: 31, target: 30, overtime_target: 33, is_shared_assistant: false, prev_total: 33 },
                    ],
                },
                school: { basis: 'supervisor', total: 205, target: 160, snapshot_date: '2026-10-31', prev_total: 198 },
                prev_month: prevOk,
            },
        }
        expect(headcountsOf(row).map((h) => [h.classroomName, h.prevEnrollment])).toEqual([
            ['全園', 198],
            ['蒲公英', 27],
            ['海豚', 33],
        ])
    })

    it('舊後端沒有 prev_total／上月沒有這班（null）→ prevEnrollment null、較上月 null', () => {
        const [legacy] = headcountsOf({ breakdown: { enrollment: head } })
        expect(legacy.prevEnrollment).toBeNull()
        expect(headcountDelta(legacy)).toBeNull()
        const [fresh] = headcountsOf({ breakdown: { enrollment: { ...head, prev_total: null } } })
        expect(fresh.prevEnrollment).toBeNull()
        expect(headcountDelta(null)).toBeNull()
    })

    it('較上月＝本月在籍 − 上月在籍；上月 0 人照算', () => {
        const [h] = headcountsOf({ breakdown: { enrollment: { ...head, prev_total: 27 } } })
        expect(headcountDelta(h)).toBe(1)
        expect(headcountDelta({ ...h, prevEnrollment: 30 })).toBe(-2)
        expect(headcountDelta({ ...h, prevEnrollment: 28 })).toBe(0)
        expect(headcountDelta({ ...h, prevEnrollment: 0 })).toBe(28)
    })

    it('較上月文字', () => {
        expect(deltaText(1)).toBe('+1')
        expect(deltaText(-2)).toBe('−2')
        expect(deltaText(0)).toBe('持平')
        expect(deltaText(null)).toBe('—')
    })

    it('prevMonthOf 解析 breakdown.prev_month；缺或壞資料 → null', () => {
        expect(prevMonthOf({ breakdown: { prev_month: prevOk } })).toEqual(prevOk)
        expect(prevMonthOf({ breakdown: { prev_month: { year: 2026, month: 7, comparable: false, reason: 'cross_school_year' } } }))
            .toEqual({ year: 2026, month: 7, comparable: false, reason: 'cross_school_year' })
        expect(prevMonthOf({ breakdown: { enrollment: head } })).toBeNull()
        expect(prevMonthOf({})).toBeNull()
        expect(prevMonthOf({ breakdown: { prev_month: { year: 'x', month: 9 } } })).toBeNull()
    })

    it('儲存格說明：上月→本月人數；新班；跨學年；取不到', () => {
        const [h] = headcountsOf({ breakdown: { enrollment: { ...head, prev_total: 27 } } })
        expect(deltaTitle(h, prevOk)).toBe('9 月 27 人 → 本月 28 人')
        expect(deltaTitle({ ...h, prevEnrollment: null }, prevOk)).toBe('上月（9 月）還沒有這個班')
        expect(deltaTitle({ ...h, prevEnrollment: null }, { year: 2026, month: 7, comparable: false, reason: 'cross_school_year' }))
            .toBe('本月是新學年第一個月，不與上一學年（7 月）比較')
        expect(deltaTitle({ ...h, prevEnrollment: null }, { year: 2026, month: 9, comparable: false, reason: 'unavailable' }))
            .toBe('上月人數取不到，暫時無法比較')
        expect(deltaTitle(h, null)).toBe('')
        expect(deltaTitle(null, prevOk)).toBe('')
    })

    it('表頭說明依上月狀態', () => {
        expect(prevHeaderTip(prevOk)).toBe('本月在籍 − 上月（9 月）同一班在籍；不帶班者比全園人數。不跨學年比較。')
        expect(prevHeaderTip({ year: 2026, month: 7, comparable: false, reason: 'cross_school_year' }))
            .toBe('本月是新學年第一個月，不與上一學年（7 月）比較。')
        expect(prevHeaderTip({ year: 2026, month: 9, comparable: false, reason: 'unavailable' }))
            .toBe('上月人數取不到，暫時無法比較。')
        expect(prevHeaderTip(null)).toBe('本月在籍 − 上月同一班在籍；不跨學年比較。')
    })
})
