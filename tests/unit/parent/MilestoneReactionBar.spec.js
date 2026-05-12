import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MilestoneReactionBar from '@/parent/components/MilestoneReactionBar.vue'

describe('MilestoneReactionBar', () => {
  it('renders three reaction buttons', () => {
    const w = mount(MilestoneReactionBar)
    expect(w.findAll('.reaction')).toHaveLength(3)
  })

  it('emits select with reaction key when clicked', async () => {
    const w = mount(MilestoneReactionBar)
    await w.findAll('.reaction')[1].trigger('click')  // index 1 is 'love'
    const emitted = w.emitted('select')
    expect(emitted).toBeTruthy()
    expect(emitted[0]).toEqual(['love'])
  })

  it('highlights active reaction', () => {
    const w = mount(MilestoneReactionBar, { props: { current: 'celebrate' } })
    const buttons = w.findAll('.reaction')
    expect(buttons[2].classes()).toContain('active')
  })
})
