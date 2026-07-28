import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useClassroomProspects } from '@/composables/useClassroomProspects'

vi.mock('@/api/recruitmentIntake', () => ({
  getIntakePlan: vi.fn().mockResolvedValue({
    data: {
      rows: [
        { grade_id: 7, grade_name: '小班', target_seats: 10, reserved_count: 2, enrolled_count: 1, remaining: 7, over_capacity: false },
      ],
    },
  }),
}))
vi.mock('@/api/recruitment', () => ({
  getRecruitmentRecords: vi.fn().mockResolvedValue({
    data: {
      records: [
        { id: 1, child_name: '甲', provisional_grade_id: 7, target_school_year: 115, target_semester: 1, enrolled: false },
        { id: 2, child_name: '乙', provisional_grade_id: 7, target_school_year: 115, target_semester: 1, enrolled: true }, // 已註冊→排除
        { id: 3, child_name: '丙', provisional_grade_id: 9, target_school_year: 115, target_semester: 1, enrolled: false }, // 別年級→排除
        { id: 4, child_name: '丁', provisional_grade_id: 7, target_school_year: 114, target_semester: 1, enrolled: false }, // 別學年→排除
        { id: 5, child_name: '戊', provisional_grade_id: 7, target_school_year: 115, target_semester: 2, enrolled: false }, // 別學期→排除
      ],
    },
  }),
}))

describe('useClassroomProspects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters prospects by grade+year and excludes enrolled', async () => {
    const opts = ref({ grade_id: 7, school_year: 115, semester: 1 })
    const { reservedCount, prospects, reload } = useClassroomProspects(opts)
    await reload()
    expect(reservedCount.value).toBe(2)
    expect(prospects.value.map((p) => p.id)).toEqual([1])
  })

  it('no-op when grade_id missing', async () => {
    const opts = ref<{ grade_id?: number | null; school_year?: number | null; semester?: number | null }>({
      grade_id: undefined,
      school_year: 115,
      semester: 1,
    })
    const { prospects, reload } = useClassroomProspects(opts)
    await reload()
    expect(prospects.value).toEqual([])
  })
})
