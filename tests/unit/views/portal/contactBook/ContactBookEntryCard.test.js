import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ContactBookEntryCard from '@/views/portal/components/contactBook/ContactBookEntryCard.vue'

// Mock Element Plus 元件
const ElCard = defineComponent({
  name: 'ElCard',
  props: ['shadow'],
  emits: ['click'],
  setup(_, { slots, emit }) {
    return () => h('div', { class: 'el-card', onClick: () => emit('click') }, slots.default?.())
  },
})

const ElTag = defineComponent({
  name: 'ElTag',
  props: ['type', 'size'],
  setup(_, { slots }) {
    return () => h('span', { class: 'el-tag' }, slots.default?.())
  },
})

const ElButton = defineComponent({
  name: 'ElButton',
  props: ['icon', 'size', 'type', 'plain'],
  setup(_, { slots }) {
    return () => h('button', slots.default?.())
  },
})

const ElIcon = defineComponent({
  name: 'ElIcon',
  setup(_, { slots }) {
    return () => h('span', { class: 'el-icon' }, slots.default?.())
  },
})

const globalConfig = {
  components: { ElCard, ElTag, ElButton, ElIcon },
  stubs: {
    Camera: { template: '<svg />' },
    Edit: { template: '<svg />' },
  },
}

const MOOD_EMOJI = { happy: '😄', normal: '🙂', tired: '😴', sad: '😢', sick: '🤒' }

const ITEM_NO_ENTRY = { student_id: 1, student_name: '小明', entry: null }
const ITEM_DRAFT = {
  student_id: 2,
  student_name: '小華',
  entry: {
    id: 10,
    mood: 'happy',
    published_at: null,
    teacher_note: '今日表現很好',
    photos: [],
    version: 1,
  },
}
const ITEM_PUBLISHED = {
  student_id: 3,
  student_name: '小美',
  entry: {
    id: 11,
    mood: 'sad',
    published_at: '2026-05-06T12:00:00',
    teacher_note: '',
    photos: [{ id: 1, thumb_url: '/t.jpg', display_url: '/d.jpg' }],
    version: 2,
  },
}
const ITEM_NO_MOOD = {
  student_id: 4,
  student_name: '小強',
  entry: {
    id: 12,
    mood: null,
    published_at: null,
    teacher_note: '',
    photos: [],
    version: 1,
  },
}

describe('ContactBookEntryCard', () => {
  it('renders student name', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_NO_ENTRY, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    expect(w.text()).toContain('小明')
  })

  it('shows 未填 tag when no entry', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_NO_ENTRY, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    expect(w.text()).toContain('未填')
  })

  it('shows 草稿 tag when entry has no published_at', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_DRAFT, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    expect(w.text()).toContain('草稿')
  })

  it('shows 已發布 tag when entry has published_at', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_PUBLISHED, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    expect(w.text()).toContain('已發布')
  })

  it('shows mood emoji when entry has mood', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_DRAFT, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    expect(w.text()).toContain('😄')
  })

  it('shows — when no mood', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_NO_MOOD, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    expect(w.text()).toContain('—')
  })

  it('shows teacher_note when present', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_DRAFT, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    expect(w.text()).toContain('今日表現很好')
  })

  it('shows 尚未填寫 when no teacher_note', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_NO_ENTRY, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    expect(w.text()).toContain('尚未填寫')
  })

  it('shows photo count when entry has photos', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_PUBLISHED, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    expect(w.text()).toContain('1 張')
  })

  it('emits click with item when card is clicked', async () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_PUBLISHED, moodEmoji: MOOD_EMOJI },
      global: globalConfig,
    })
    await w.findComponent({ name: 'ElCard' }).vm.$emit('click')
    expect(w.emitted('click')).toBeDefined()
    expect(w.emitted('click')[0][0]).toEqual(ITEM_PUBLISHED)
  })
})
