/**
 * tests/api/offboarding.test.ts
 *
 * 驗證 offboarding.ts 7 個 wrapper 各自呼叫正確的 HTTP 方法與路徑：
 *   previewOffboarding / processOffboarding / getOffboardingDetail
 *   getOffboardingCertificate / patchNhiUnenroll / postMagicLink / deleteMagicLink
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

import {
    previewOffboarding,
    processOffboarding,
    getOffboardingDetail,
    getOffboardingCertificate,
    patchNhiUnenroll,
    postMagicLink,
    deleteMagicLink,
} from '@/api/offboarding'

describe('offboarding.ts — 7 個 wrapper', () => {
    beforeEach(() => {
        mockGet.mockReset()
        mockPost.mockReset()
        mockPatch.mockReset()
        mockDelete.mockReset()
    })

    it('previewOffboarding POST /offboarding/{id}/preview with payload', async () => {
        mockPost.mockResolvedValueOnce({ data: {} })
        const payload = { last_working_date: '2026-06-30', reason: '個人因素' }
        await previewOffboarding(1, payload)
        expect(mockPost).toHaveBeenCalledWith('/offboarding/1/preview', payload)
    })

    it('processOffboarding POST /offboarding/{id}/process with payload', async () => {
        mockPost.mockResolvedValueOnce({ data: {} })
        const payload = { last_working_date: '2026-06-30', reason: '個人因素' }
        await processOffboarding(1, payload)
        expect(mockPost).toHaveBeenCalledWith('/offboarding/1/process', payload)
    })

    it('getOffboardingDetail GET /offboarding/{id}', async () => {
        mockGet.mockResolvedValueOnce({ data: {} })
        await getOffboardingDetail(2)
        expect(mockGet).toHaveBeenCalledWith('/offboarding/2')
    })

    it('getOffboardingCertificate GET /offboarding/{id}/certificate.pdf with responseType blob', async () => {
        mockGet.mockResolvedValueOnce({ data: new Blob() })
        await getOffboardingCertificate(3)
        expect(mockGet).toHaveBeenCalledWith('/offboarding/3/certificate.pdf', { responseType: 'blob' })
    })

    it('patchNhiUnenroll PATCH /offboarding/{id}/nhi-unenroll with payload', async () => {
        mockPatch.mockResolvedValueOnce({ data: {} })
        const payload = { submitted: true }
        await patchNhiUnenroll(4, payload)
        expect(mockPatch).toHaveBeenCalledWith('/offboarding/4/nhi-unenroll', payload)
    })

    it('postMagicLink POST /offboarding/{id}/magic-link', async () => {
        mockPost.mockResolvedValueOnce({ data: { token: 'abc' } })
        await postMagicLink(5)
        expect(mockPost).toHaveBeenCalledWith('/offboarding/5/magic-link')
    })

    it('deleteMagicLink DELETE /offboarding/{id}/magic-link', async () => {
        mockDelete.mockResolvedValueOnce({ data: null })
        await deleteMagicLink(6)
        expect(mockDelete).toHaveBeenCalledWith('/offboarding/6/magic-link')
    })
})
