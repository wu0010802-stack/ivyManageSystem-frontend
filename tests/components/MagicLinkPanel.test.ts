import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MagicLinkPanel from '@/components/offboarding/MagicLinkPanel.vue'

// stub ElDialog：把 slot content 原地渲染
const ElDialogStub = {
    template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title'],
}

vi.mock('@/api/offboarding', () => ({
    previewOffboarding: vi.fn(),
    processOffboarding: vi.fn(),
    getOffboardingDetail: vi.fn(),
    getOffboardingCertificate: vi.fn(),
    patchNhiUnenroll: vi.fn(),
    postMagicLink: vi.fn(),
    deleteMagicLink: vi.fn(),
}))

import * as offboardingApi from '@/api/offboarding'

const mountPanel = (overrides: Record<string, unknown> = {}) =>
    mount(MagicLinkPanel, {
        props: {
            employeeId: 1,
            active: false,
            expiresAt: null,
            downloadCount: 0,
            lastUsedAt: null,
            ...overrides,
        },
        global: {
            plugins: [ElementPlus],
            stubs: {
                ElDialog: ElDialogStub,
            },
        },
    })

describe('MagicLinkPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders inactive state when no token', () => {
        const wrapper = mountPanel({ active: false })
        expect(wrapper.text()).toContain('尚未產生下載連結')
        expect(wrapper.find('.generate-button').exists()).toBe(true)
        expect(wrapper.find('.revoke-button').exists()).toBe(false)
    })

    it('renders active state with metadata', () => {
        const wrapper = mountPanel({
            active: true,
            expiresAt: '2026-06-25T00:00:00',
            downloadCount: 2,
            lastUsedAt: '2026-05-20T10:30:00',
        })
        // active tag
        const tag = wrapper.find('.el-tag')
        expect(tag.exists()).toBe(true)
        expect(tag.text()).toContain('啟用中')
        // metadata
        expect(wrapper.text()).toContain('已下載：2 次')
        // buttons
        expect(wrapper.find('.revoke-button').exists()).toBe(true)
        expect(wrapper.find('.generate-button').exists()).toBe(true)
    })

    it('shows token dialog after generate', async () => {
        const mockToken = {
            employee_id: 1,
            token: 'abc123token',
            download_url: 'https://example.com/download?token=abc123token',
            expires_at: '2026-06-25T00:00:00',
        }
        ;(offboardingApi.postMagicLink as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: mockToken,
        })

        const wrapper = mountPanel({ active: false })
        const generateBtn = wrapper.find('.generate-button')
        expect(generateBtn.exists()).toBe(true)

        await generateBtn.trigger('click')

        // 等 async 完成
        await vi.waitUntil(() =>
            (offboardingApi.postMagicLink as ReturnType<typeof vi.fn>).mock.calls.length > 0,
        )
        await wrapper.vm.$nextTick()

        // token 應顯示在 dialog
        expect(wrapper.text()).toContain('abc123token')
        expect(wrapper.text()).toContain('https://example.com/download?token=abc123token')
    })

    it('revoke-button exists and is clickable when active', () => {
        const wrapper = mountPanel({
            active: true,
            expiresAt: '2026-06-25T00:00:00',
            downloadCount: 1,
            lastUsedAt: null,
        })
        const revokeBtn = wrapper.find('.revoke-button')
        expect(revokeBtn.exists()).toBe(true)
        // 確認 button 可點（不實際觸發 ElMessageBox confirm）
        expect(revokeBtn.attributes('disabled')).toBeUndefined()
    })
})
