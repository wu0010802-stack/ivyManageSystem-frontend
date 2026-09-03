import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MoodChip from '@/views/portal/components/contactBook/MoodChip.vue'
import { MOOD_KEYS, MOOD_META, MOOD_OPTIONS } from '@/views/portal/components/contactBook/moods'

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

describe('MoodChip（教師端心情色塊，不用 emoji）', () => {
  it.each(MOOD_KEYS)('%s → 文字標籤與 tone class', (key) => {
    const w = mount(MoodChip, { props: { mood: key } })
    expect(w.text()).toBe(MOOD_META[key].label)
    expect(w.classes()).toContain(`tone-${MOOD_META[key].tone}`)
    expect(w.text()).not.toMatch(EMOJI_RE)
  })

  it('null／未知值 → 中性「未記錄」不拋例外', () => {
    expect(mount(MoodChip, { props: { mood: null } }).text()).toBe('未記錄')
    expect(mount(MoodChip, { props: { mood: 'whatever' } }).text()).toBe('未記錄')
    expect(mount(MoodChip).classes()).toContain('tone-empty')
  })

  it('MOOD_OPTIONS 與 MOOD_META 同步且 label 不含 emoji', () => {
    expect(MOOD_OPTIONS.map((o) => o.value)).toEqual(MOOD_KEYS)
    for (const o of MOOD_OPTIONS) expect(o.label).not.toMatch(EMOJI_RE)
  })
})
