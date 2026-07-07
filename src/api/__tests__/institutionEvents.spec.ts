import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/index', () => ({
  default: {
    defaults: { baseURL: '/api' },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from '@/api/index'
import {
  listInstitutionEvents,
  getInstitutionEvent,
  createInstitutionEvent,
  updateInstitutionEvent,
  deleteInstitutionEvent,
  replaceInstitutionEventAbsences,
  syncInstitutionEventsToAppraisal,
} from '../institutionEvents'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('institutionEvents api module', () => {
  it('listInstitutionEvents：GET /institution_events 帶學期 query', () => {
    listInstitutionEvents({ school_year: 114, semester: 1 })
    expect(api.get).toHaveBeenCalledWith('/institution_events', {
      params: { school_year: 114, semester: 1 },
    })
  })

  it('listInstitutionEvents：不帶參數時 query 為空物件（後端不過濾）', () => {
    listInstitutionEvents()
    expect(api.get).toHaveBeenCalledWith('/institution_events', { params: {} })
  })

  it('getInstitutionEvent：GET /institution_events/{event_id}', () => {
    getInstitutionEvent(5)
    expect(api.get).toHaveBeenCalledWith('/institution_events/5')
  })

  it('createInstitutionEvent：POST /institution_events 帶完整 payload', () => {
    const payload = {
      title: '園務會議',
      event_type: 'org_meeting',
      event_date: '2026-09-13',
      hours: 2.0,
      score_item_code: 'INSTITUTION_MEETING_0913',
      note: null,
    }
    createInstitutionEvent(payload)
    expect(api.post).toHaveBeenCalledWith('/institution_events', payload)
  })

  it('updateInstitutionEvent：PATCH /institution_events/{event_id}', () => {
    updateInstitutionEvent(7, { title: '改名', score_item_code: null })
    expect(api.patch).toHaveBeenCalledWith('/institution_events/7', {
      title: '改名',
      score_item_code: null,
    })
  })

  it('deleteInstitutionEvent：DELETE /institution_events/{event_id}', () => {
    deleteInstitutionEvent(9)
    expect(api.delete).toHaveBeenCalledWith('/institution_events/9')
  })

  it('replaceInstitutionEventAbsences：PUT replace-set 整包 entries', () => {
    const payload = {
      entries: [
        { employee_id: 1, is_exempt: null, exempt_reason: null },
        { employee_id: 2, is_exempt: true, exempt_reason: '當日有核准婚假' },
      ],
    }
    replaceInstitutionEventAbsences(5, payload)
    expect(api.put).toHaveBeenCalledWith('/institution_events/5/absences', payload)
  })

  it('syncInstitutionEventsToAppraisal：預設 dry_run=true', () => {
    syncInstitutionEventsToAppraisal(12)
    expect(api.post).toHaveBeenCalledWith(
      '/institution_events/sync/appraisal/12',
      { dry_run: true },
    )
  })

  it('syncInstitutionEventsToAppraisal：dryRun=false 實際套用', () => {
    syncInstitutionEventsToAppraisal(12, { dryRun: false })
    expect(api.post).toHaveBeenCalledWith(
      '/institution_events/sync/appraisal/12',
      { dry_run: false },
    )
  })
})
