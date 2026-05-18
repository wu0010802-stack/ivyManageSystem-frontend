/**
 * tests/unit/api/classrooms.test.js
 *
 * 驗證 src/api/classrooms.ts wrapper：HTTP method / URL / payload。
 * 包含 PATCH 與 alias（getTeachers === getTeacherOptions）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut, mockDelete, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
  mockPatch: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
    patch: mockPatch,
  },
}))

import * as mod from '@/api/classrooms'

describe('classrooms api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockPatch.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
    mockPatch.mockResolvedValue({ data: {} })
  })

  it('getClassrooms GET /classrooms with default empty params', async () => {
    await mod.getClassrooms()
    expect(mockGet).toHaveBeenCalledWith('/classrooms', { params: {} })
  })

  it('getClassrooms GET /classrooms with params', async () => {
    await mod.getClassrooms({ academic_year: 114, semester: 1 })
    expect(mockGet).toHaveBeenCalledWith('/classrooms', {
      params: { academic_year: 114, semester: 1 },
    })
  })

  it('getClassroom GET /classrooms/:id', async () => {
    await mod.getClassroom(42)
    expect(mockGet).toHaveBeenCalledWith('/classrooms/42')
  })

  it('createClassroom POST /classrooms', async () => {
    const payload = { name: '大象班', grade_id: 1 }
    await mod.createClassroom(payload)
    expect(mockPost).toHaveBeenCalledWith('/classrooms', payload)
  })

  it('updateClassroom PUT /classrooms/:id', async () => {
    const payload = { name: '小熊班' }
    await mod.updateClassroom(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/classrooms/42', payload)
  })

  it('deleteClassroom DELETE /classrooms/:id', async () => {
    await mod.deleteClassroom(42)
    expect(mockDelete).toHaveBeenCalledWith('/classrooms/42')
  })

  it('cloneClassroomsToTerm POST /classrooms/clone-term', async () => {
    const payload = { from_term: '114-1', to_term: '114-2' }
    await mod.cloneClassroomsToTerm(payload)
    expect(mockPost).toHaveBeenCalledWith('/classrooms/clone-term', payload)
  })

  it('promoteAcademicYear POST /classrooms/promote-academic-year', async () => {
    const payload = { from_year: 114, to_year: 115 }
    await mod.promoteAcademicYear(payload)
    expect(mockPost).toHaveBeenCalledWith('/classrooms/promote-academic-year', payload)
  })

  it('getTeacherOptions GET /classrooms/teacher-options', async () => {
    await mod.getTeacherOptions()
    expect(mockGet).toHaveBeenCalledWith('/classrooms/teacher-options')
  })

  it('getTeachers is alias of getTeacherOptions', async () => {
    expect(mod.getTeachers).toBe(mod.getTeacherOptions)
    await mod.getTeachers()
    expect(mockGet).toHaveBeenCalledWith('/classrooms/teacher-options')
  })

  it('getGrades GET /grades', async () => {
    await mod.getGrades()
    expect(mockGet).toHaveBeenCalledWith('/grades')
  })

  it('updateGrade PATCH /grades/:id', async () => {
    const payload = { name: '中班' }
    await mod.updateGrade(3, payload)
    expect(mockPatch).toHaveBeenCalledWith('/grades/3', payload)
  })

  it('getClassroomEnrollmentComposition GET /classrooms/:id/enrollment-composition', async () => {
    await mod.getClassroomEnrollmentComposition(42)
    expect(mockGet).toHaveBeenCalledWith('/classrooms/42/enrollment-composition')
  })
})
