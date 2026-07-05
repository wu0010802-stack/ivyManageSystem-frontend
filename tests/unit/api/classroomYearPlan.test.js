/**
 * tests/unit/api/classroomYearPlan.test.js
 *
 * 驗證 src/api/classroomYearPlan.ts wrapper：HTTP method / URL / payload 轉發。
 * 比照 tests/unit/api/classrooms.test.js 薄殼風格。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mockDelete,
  },
}))

import * as mod from '@/api/classroomYearPlan'

describe('classroomYearPlan api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPatch.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPatch.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('getClassroomYearPlanStatus GET /classroom-year-plans/status', async () => {
    await mod.getClassroomYearPlanStatus()
    expect(mockGet).toHaveBeenCalledWith('/classroom-year-plans/status')
  })

  it('generateClassroomYearPlan POST /classroom-year-plans/generate', async () => {
    const payload = { target_school_year: 115 }
    await mod.generateClassroomYearPlan(payload)
    expect(mockPost).toHaveBeenCalledWith('/classroom-year-plans/generate', payload)
  })

  it('getClassroomYearPlanDetail GET /classroom-year-plans/:id', async () => {
    await mod.getClassroomYearPlanDetail(42)
    expect(mockGet).toHaveBeenCalledWith('/classroom-year-plans/42')
  })

  it('regenerateClassroomYearPlan POST /classroom-year-plans/:id/regenerate', async () => {
    const payload = { base_version: 3, overwrite_manual: false }
    await mod.regenerateClassroomYearPlan(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/classroom-year-plans/42/regenerate', payload)
  })

  it('createClassroomYearPlanClass POST /classroom-year-plans/:id/classes', async () => {
    const payload = { base_version: 3, target_grade_id: 1, target_name: '向日葵班' }
    await mod.createClassroomYearPlanClass(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/classroom-year-plans/42/classes', payload)
  })

  it('updateClassroomYearPlanClass PATCH /classroom-year-plans/:id/classes/:classId', async () => {
    const payload = { base_version: 3, target_name: '小熊班' }
    await mod.updateClassroomYearPlanClass(42, 7, payload)
    expect(mockPatch).toHaveBeenCalledWith('/classroom-year-plans/42/classes/7', payload)
  })

  it('deleteClassroomYearPlanClass DELETE /classroom-year-plans/:id/classes/:classId with base_version query', async () => {
    await mod.deleteClassroomYearPlanClass(42, 7, { base_version: 3 })
    expect(mockDelete).toHaveBeenCalledWith('/classroom-year-plans/42/classes/7', {
      params: { base_version: 3 },
    })
  })

  it('bulkUpdateClassroomYearPlanStudents POST /classroom-year-plans/:id/students/bulk（student_ids 為 Student.id）', async () => {
    const payload = { base_version: 3, op: 'assign', plan_class_id: 7, student_ids: [101, 102] }
    await mod.bulkUpdateClassroomYearPlanStudents(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/classroom-year-plans/42/students/bulk', payload)
  })

  it('getClassroomYearPlanPreview GET /classroom-year-plans/:id/preview', async () => {
    await mod.getClassroomYearPlanPreview(42)
    expect(mockGet).toHaveBeenCalledWith('/classroom-year-plans/42/preview')
  })

  it('publishClassroomYearPlan POST /classroom-year-plans/:id/publish', async () => {
    const payload = { base_version: 3 }
    await mod.publishClassroomYearPlan(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/classroom-year-plans/42/publish', payload)
  })

  it('unpublishClassroomYearPlan POST /classroom-year-plans/:id/unpublish', async () => {
    const payload = { base_version: 4 }
    await mod.unpublishClassroomYearPlan(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/classroom-year-plans/42/unpublish', payload)
  })

  it('cancelClassroomYearPlan POST /classroom-year-plans/:id/cancel', async () => {
    const payload = { base_version: 1 }
    await mod.cancelClassroomYearPlan(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/classroom-year-plans/42/cancel', payload)
  })
})
