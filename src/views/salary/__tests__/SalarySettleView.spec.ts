import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SalarySettleView from '../SalarySettleView.vue'

const replaceMock = vi.fn()
let routeQuery: Record<string, string> = {}
vi.mock('vue-router', () => ({
    useRoute: () => ({ query: routeQuery }),
    useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}))

vi.mock('@/api/salary', () => ({
    getRecords: vi.fn().mockResolvedValue({ data: [] }),
}))

const STUBS = {
    'el-select': true,
    'el-option': true,
    'el-steps': { template: '<div class="steps-stub" :data-active="$attrs.active"><slot /></div>' },
    'el-step': { template: '<div class="step-stub" @click="$emit(\'click\')"><slot /></div>' },
    'el-button': true,
    'el-empty': true,
}

describe('SalarySettleView 嚮導外殼', () => {
    beforeEach(() => {
        replaceMock.mockReset()
        routeQuery = {}
    })

    it('?step=review 深連結 → active index = 2', async () => {
        routeQuery = { step: 'review', year: '2026', month: '5' }
        const wrapper = mount(SalarySettleView, { global: { stubs: STUBS } })
        await flushPromises()
        expect(wrapper.find('.steps-stub').attributes('data-active')).toBe('2')
        expect(wrapper.text()).toContain('2026 年 5 月結薪')
    })

    it('未帶 step → 預設第 0 步（結算前檢查）', async () => {
        const wrapper = mount(SalarySettleView, { global: { stubs: STUBS } })
        await flushPromises()
        expect(wrapper.find('.steps-stub').attributes('data-active')).toBe('0')
    })

    it('點步驟列跳轉 → router.replace 帶 step key', async () => {
        routeQuery = { step: 'precheck' }
        const wrapper = mount(SalarySettleView, { global: { stubs: STUBS } })
        await flushPromises()
        const steps = wrapper.findAll('.step-stub')
        expect(steps).toHaveLength(5)
        await steps[3].trigger('click')
        expect(replaceMock).toHaveBeenCalledWith(
            expect.objectContaining({ query: expect.objectContaining({ step: 'finalize' }) }),
        )
    })
})
