import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppraisalProcessGuide from '../components/AppraisalProcessGuide.vue'

const statuses = {
  create: 'done', participants: 'done', manual: 'current',
  sync: 'todo', recompute: 'disabled', sign: 'disabled',
} as const

describe('AppraisalProcessGuide', () => {
  it('渲染六步且標示 current/done/disabled', () => {
    const w = mount(AppraisalProcessGuide, { props: { statuses, current: 'manual' } })
    expect(w.find('[data-test="guide-step-create"]').classes()).toContain('is-done')
    expect(w.find('[data-test="guide-step-manual"]').classes()).toContain('is-current')
    expect(w.find('[data-test="guide-step-recompute"]').attributes('disabled')).toBeDefined()
  })

  it('點可用步驟 emit navigate；點 disabled 不 emit', async () => {
    const w = mount(AppraisalProcessGuide, { props: { statuses, current: 'manual' } })
    await w.find('[data-test="guide-step-sync"]').trigger('click')
    expect(w.emitted('navigate')?.[0]).toEqual(['sync'])
    await w.find('[data-test="guide-step-recompute"]').trigger('click')
    // disabled 步驟不得再 emit
    expect(w.emitted('navigate')?.length).toBe(1)
  })
})
