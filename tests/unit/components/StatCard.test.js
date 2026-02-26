import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import StatCard from '@/components/common/StatCard.vue'

// 模擬 Element Plus 元件
const ElCard = defineComponent({
    name: 'ElCard',
    setup(_, { slots }) {
        return () => h('div', { class: 'el-card' }, slots.default?.())
    }
})
const ElIcon = defineComponent({
    name: 'ElIcon',
    props: ['size'],
    setup(_, { slots }) {
        return () => h('span', { class: 'el-icon' }, slots.default?.())
    }
})

const MockIcon = defineComponent({
    name: 'MockIcon',
    render() { return h('svg') }
})

const globalConfig = {
    components: { ElCard, ElIcon }
}

describe('StatCard.vue', () => {
    it('渲染 label 和 value', () => {
        const wrapper = mount(StatCard, {
            props: { label: '總員工', value: 42, icon: MockIcon, color: 'primary' },
            global: globalConfig
        })
        expect(wrapper.text()).toContain('總員工')
        expect(wrapper.text()).toContain('42')
    })

    it('數字 0 也能正確渲染', () => {
        const wrapper = mount(StatCard, {
            props: { label: '請假', value: 0, icon: MockIcon, color: 'warning' },
            global: globalConfig
        })
        expect(wrapper.text()).toContain('0')
    })

    it('字串 value 正確渲染', () => {
        const wrapper = mount(StatCard, {
            props: { label: '狀態', value: '正常', icon: MockIcon, color: 'success' },
            global: globalConfig
        })
        expect(wrapper.text()).toContain('正常')
    })

    it('icon 區域存在', () => {
        const wrapper = mount(StatCard, {
            props: { label: '測試', value: 1, icon: MockIcon, color: 'primary' },
            global: globalConfig
        })
        expect(wrapper.find('.stat-card__icon').exists()).toBe(true)
    })

    it('不同 color 產生不同背景色', () => {
        const wrapper1 = mount(StatCard, {
            props: { label: 'A', value: 1, icon: MockIcon, color: 'primary' },
            global: globalConfig
        })
        const wrapper2 = mount(StatCard, {
            props: { label: 'B', value: 2, icon: MockIcon, color: 'danger' },
            global: globalConfig
        })
        const style1 = wrapper1.find('.stat-card__icon').attributes('style')
        const style2 = wrapper2.find('.stat-card__icon').attributes('style')
        expect(style1).not.toBe(style2)
    })
})
