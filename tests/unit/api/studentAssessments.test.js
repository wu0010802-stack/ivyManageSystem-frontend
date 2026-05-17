import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  getAssessments,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  getMyClassAssessments,
  createPortalAssessment,
} from '@/api/studentAssessments'

vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('studentAssessments api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.put.mockReset()
    api.delete.mockReset()
  })

  it('getAssessments hits /student-assessments with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await getAssessments({ student_id: 42 })
    expect(api.get).toHaveBeenCalledWith('/student-assessments', {
      params: { student_id: 42 },
    })
  })

  it('getAssessments defaults to empty params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await getAssessments()
    expect(api.get).toHaveBeenCalledWith('/student-assessments', { params: {} })
  })

  it('createAssessment posts payload to /student-assessments', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } })
    const payload = { student_id: 42, score: 90 }
    await createAssessment(payload)
    expect(api.post).toHaveBeenCalledWith('/student-assessments', payload)
  })

  it('updateAssessment puts payload to /student-assessments/{id}', async () => {
    api.put.mockResolvedValue({ data: {} })
    const payload = { score: 95 }
    await updateAssessment(99, payload)
    expect(api.put).toHaveBeenCalledWith('/student-assessments/99', payload)
  })

  it('deleteAssessment deletes /student-assessments/{id}', async () => {
    api.delete.mockResolvedValue({ data: {} })
    await deleteAssessment(99)
    expect(api.delete).toHaveBeenCalledWith('/student-assessments/99')
  })

  it('getMyClassAssessments hits /portal/my-class-assessments with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await getMyClassAssessments({ semester: 'fall' })
    expect(api.get).toHaveBeenCalledWith('/portal/my-class-assessments', {
      params: { semester: 'fall' },
    })
  })

  it('getMyClassAssessments defaults to empty params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await getMyClassAssessments()
    expect(api.get).toHaveBeenCalledWith('/portal/my-class-assessments', { params: {} })
  })

  it('createPortalAssessment posts payload to /portal/assessments', async () => {
    api.post.mockResolvedValue({ data: {} })
    const payload = { student_id: 42, score: 88 }
    await createPortalAssessment(payload)
    expect(api.post).toHaveBeenCalledWith('/portal/assessments', payload)
  })
})
