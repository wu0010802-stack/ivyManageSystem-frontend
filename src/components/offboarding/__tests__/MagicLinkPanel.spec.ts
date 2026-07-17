import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/offboarding', () => ({
    previewOffboarding: vi.fn(),
    processOffboarding: vi.fn(),
    getOffboardingDetail: vi.fn(),
    getOffboardingCertificate: vi.fn(),
    patchNhiUnenroll: vi.fn(),
    postMagicLink: vi.fn(),
    deleteMagicLink: vi.fn(),
    closeOffboarding: vi.fn(),
}))

import { postMagicLink } from '@/api/offboarding'
import MagicLinkPanel from '../MagicLinkPanel.vue'

const mockPostMagicLink = postMagicLink as unknown as ReturnType<typeof vi.fn>

function mountPanel(props: Record<string, unknown> = {}) {
    return mount(MagicLinkPanel, {
        props: {
            employeeId: 9,
            active: false,
            expiresAt: null,
            downloadCount: 0,
            lastUsedAt: null,
            ...props,
        },
        global: { plugins: [ElementPlus] },
    })
}

describe('MagicLinkPanel 下載連結文案（非技術行政可理解）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('產生連結後 dialog 只展示下載連結，不再單獨展示原始 Token 欄', async () => {
        mockPostMagicLink.mockResolvedValue({
            data: {
                employee_id: 9,
                token: 'RAW-TOKEN-SECRET',
                expires_at: '2026-08-16T10:00:00',
                download_url: '/api/offboarding/download?token=RAW-TOKEN-SECRET',
            },
        })

        const w = mountPanel()
        await w.find('.generate-button').trigger('click')
        await flushPromises()

        expect(w.find('.token-url').exists()).toBe(true)
        // Token 獨立欄位移除：連結本身已含 token，行政只需複製連結
        expect(w.find('.token-text').exists()).toBe(false)
        expect(w.text()).not.toContain('Token')
    })

    it('一次性提示須說明「可重新產生」的緩解路徑', async () => {
        mockPostMagicLink.mockResolvedValue({
            data: {
                employee_id: 9,
                token: 'RAW-TOKEN-SECRET',
                expires_at: '2026-08-16T10:00:00',
                download_url: '/api/offboarding/download?token=RAW-TOKEN-SECRET',
            },
        })

        const w = mountPanel()
        await w.find('.generate-button').trigger('click')
        await flushPromises()

        expect(w.text()).toContain('重新產生')
        expect(w.text()).toContain('離職員工')
    })
})
