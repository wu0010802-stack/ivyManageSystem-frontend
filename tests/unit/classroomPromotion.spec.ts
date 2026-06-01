import { describe, it, expect } from 'vitest'
import {
    buildPromotionPayload,
    isGraduationRow,
    type PromotionRowDraft,
    type PromotionTermDraft,
} from '@/utils/classroomPromotion'

const term: PromotionTermDraft = {
    source_school_year: 114,
    source_semester: 2,
    target_school_year: 115,
    target_semester: 1,
}

const makeRow = (overrides: Partial<PromotionRowDraft> = {}): PromotionRowDraft => ({
    source_classroom_id: 1,
    target_name: '大班A',
    target_grade_id: 10,
    copy_teachers: true,
    move_students: true,
    excluded: false,
    ...overrides,
})

describe('isGraduationRow', () => {
    it('無目標年級視為畢業', () => {
        expect(isGraduationRow({ target_grade_id: null })).toBe(true)
    })
    it('有目標年級非畢業', () => {
        expect(isGraduationRow({ target_grade_id: 5 })).toBe(false)
    })
})

describe('buildPromotionPayload', () => {
    it('帶入學期（normalizeSchoolYear 對民國年 passthrough）', () => {
        const payload = buildPromotionPayload(term, [])
        expect(payload).toMatchObject({
            source_school_year: 114,
            source_semester: 2,
            target_school_year: 115,
            target_semester: 1,
        })
        expect(payload.classrooms).toEqual([])
    })

    it('排除列不送出', () => {
        const rows = [
            makeRow({ source_classroom_id: 1, excluded: false }),
            makeRow({ source_classroom_id: 2, excluded: true }),
        ]
        const payload = buildPromotionPayload(term, rows)
        expect(payload.classrooms).toHaveLength(1)
        expect(payload.classrooms[0].source_classroom_id).toBe(1)
    })

    it('畢業列（清空目標年級）target_name 與 target_grade_id 皆為 null', () => {
        const rows = [makeRow({ target_grade_id: null, target_name: '舊大班' })]
        const payload = buildPromotionPayload(term, rows)
        expect(payload.classrooms[0].target_grade_id).toBeNull()
        expect(payload.classrooms[0].target_name).toBeNull()
    })

    it('非畢業列保留新班名與目標年級', () => {
        const rows = [makeRow({ target_grade_id: 10, target_name: '大班B' })]
        const payload = buildPromotionPayload(term, rows)
        expect(payload.classrooms[0].target_name).toBe('大班B')
        expect(payload.classrooms[0].target_grade_id).toBe(10)
    })

    it('非畢業列空字串新班名轉為 null', () => {
        const rows = [makeRow({ target_grade_id: 10, target_name: '' })]
        const payload = buildPromotionPayload(term, rows)
        expect(payload.classrooms[0].target_name).toBeNull()
    })

    it('copy_teachers / move_students 反映逐班開關（非寫死 true）', () => {
        const rows = [makeRow({ copy_teachers: false, move_students: false })]
        const payload = buildPromotionPayload(term, rows)
        expect(payload.classrooms[0].copy_teachers).toBe(false)
        expect(payload.classrooms[0].move_students).toBe(false)
    })
})
