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
      props: { item: ITEM_NO_ENTRY },
      global: globalConfig,
    })
    expect(w.text()).toContain('小明')
  })

  it('shows 未填 tag when no entry', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_NO_ENTRY },
      global: globalConfig,
    })
    expect(w.text()).toContain('未填')
  })

  it('shows 草稿 tag when entry has no published_at', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_DRAFT },
      global: globalConfig,
    })
    expect(w.text()).toContain('草稿')
  })

  it('shows 已發布 tag when entry has published_at', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_PUBLISHED },
      global: globalConfig,
    })
    expect(w.text()).toContain('已發布')
  })

  it('shows mood label chip when entry has mood（教師端不用 emoji）', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_DRAFT },
      global: globalConfig,
    })
    const chip = w.find('[data-test="mood-chip"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('開心')
    expect(w.text()).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('shows 未記錄 when no mood', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_NO_MOOD },
      global: globalConfig,
    })
    expect(w.find('[data-test="mood-chip"]').text()).toBe('未記錄')
  })

  it('shows teacher_note when present', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_DRAFT },
      global: globalConfig,
    })
    expect(w.text()).toContain('今日表現很好')
  })

  it('shows 尚未填寫 when no teacher_note', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_NO_ENTRY },
      global: globalConfig,
    })
    expect(w.text()).toContain('尚未填寫')
  })

  it('shows photo count when entry has photos', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_PUBLISHED },
      global: globalConfig,
    })
    expect(w.text()).toContain('1 張')
  })

  it('emits click with item when card is clicked', async () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_PUBLISHED },
      global: globalConfig,
    })
    await w.findComponent({ name: 'ElCard' }).vm.$emit('click')
    expect(w.emitted('click')).toBeDefined()
    expect(w.emitted('click')[0][0]).toEqual(ITEM_PUBLISHED)
  })
})

describe('ContactBookEntryCard 家長回流訊號（2026-09-02 對齊稽核）', () => {
  it('已發布且有已讀／回覆時顯示「已讀 N」「回覆 M」', () => {
    const item = {
      ...ITEM_PUBLISHED,
      entry: { ...ITEM_PUBLISHED.entry, parent_ack_count: 1, parent_reply_count: 2 },
    }
    const w = mount(ContactBookEntryCard, {
      props: { item },
      global: globalConfig,
    })
    const box = w.find('[data-testid="cb-parent-signals"]')
    expect(box.exists()).toBe(true)
    expect(box.text()).toContain('已讀 1')
    expect(box.text()).toContain('回覆 2')
  })
  it('已發布但無互動時顯示「已讀 0」且不顯示回覆', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_PUBLISHED },
      global: globalConfig,
    })
    const box = w.find('[data-testid="cb-parent-signals"]')
    expect(box.text()).toContain('已讀 0')
    expect(box.text()).not.toContain('回覆')
  })
  it('草稿不顯示家長訊號（家長根本看不到草稿）', () => {
    const w = mount(ContactBookEntryCard, {
      props: { item: ITEM_DRAFT },
      global: globalConfig,
    })
    expect(w.find('[data-testid="cb-parent-signals"]').exists()).toBe(false)
  })
})
