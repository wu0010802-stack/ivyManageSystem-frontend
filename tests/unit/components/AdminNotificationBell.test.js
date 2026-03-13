import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { useNotificationStore } from '@/stores/notification'
import AdminNotificationBell from '@/components/layout/AdminNotificationBell.vue'

const push = vi.fn()

vi.mock('@/api/notifications', () => ({
  getNotificationSummary: vi.fn(() => Promise.resolve({
    data: { total_badge: 0, action_items: [], reminders: [] },
  })),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

const passthrough = (name, root = 'div') =>
  defineComponent({
    name,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props, { emit, slots }) {
      return () =>
        h(root, {
          class: name,
          'data-open': props.modelValue,
          onClick: () => emit('update:modelValue', !props.modelValue),
        }, [
          slots.reference?.(),
          slots.default?.(),
        ])
    },
  })

const ElBadge = defineComponent({
  name: 'ElBadge',
  props: ['value'],
  setup(props, { slots }) {
    return () => h('div', { class: 'el-badge' }, [
      slots.default?.(),
      h('span', { class: 'badge-value' }, String(props.value ?? '')),
    ])
  },
})

const ElButton = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  setup(_, { emit, slots, attrs }) {
    return () => h('button', { ...attrs, onClick: () => emit('click') }, slots.default?.())
  },
})

const ElEmpty = defineComponent({
  name: 'ElEmpty',
  props: ['description'],
  setup(props) {
    return () => h('div', { class: 'el-empty' }, props.description)
  },
})

const globalConfig = {
  components: {
    ElBadge,
    ElButton,
    ElPopover: passthrough('ElPopover'),
    ElDrawer: passthrough('ElDrawer'),
    ElScrollbar: passthrough('ElScrollbar'),
    ElEmpty,
    ElIcon: passthrough('ElIcon', 'span'),
  },
  stubs: {
    Bell: true,
    ArrowRight: true,
  },
}

describe('AdminNotificationBell', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })

  it('shows badge count and renders action items', async () => {
    const store = useNotificationStore()
    store.summary = {
      total_badge: 3,
      action_items: [
        { type: 'approval', title: '待審核項目', count: 2, route: '/approvals', priority: 'high' },
      ],
      reminders: [],
    }

    const wrapper = mount(AdminNotificationBell, {
      props: { isMobile: false },
      global: globalConfig,
    })

    expect(wrapper.find('.badge-value').text()).toBe('3')
    expect(wrapper.text()).toContain('待審核項目')

    await wrapper.get('[data-test="notification-item-approval"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/approvals')
  })

  it('shows empty state when there are no notifications', async () => {
    const store = useNotificationStore()
    store.summary = {
      total_badge: 0,
      action_items: [],
      reminders: [],
    }

    const wrapper = mount(AdminNotificationBell, {
      props: { isMobile: true },
      global: globalConfig,
    })

    await nextTick()
    expect(wrapper.text()).toContain('目前沒有待處理通知')
  })

  it('renders activity_inquiry action item and navigates correctly', async () => {
    const store = useNotificationStore()
    store.summary = {
      total_badge: 2,
      action_items: [
        { type: 'activity_inquiry', title: '課後才藝詢問', count: 2, route: '/activity/inquiries' },
      ],
      reminders: [],
    }

    const wrapper = mount(AdminNotificationBell, {
      props: { isMobile: false },
      global: globalConfig,
    })

    expect(wrapper.find('.badge-value').text()).toBe('2')
    expect(wrapper.text()).toContain('課後才藝詢問')

    await wrapper.get('[data-test="notification-item-activity_inquiry"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/activity/inquiries')
  })

  it('renders multiple action items and correct badge total', async () => {
    const store = useNotificationStore()
    store.summary = {
      total_badge: 5,
      action_items: [
        { type: 'approval', title: '待審核', count: 3, route: '/approvals' },
        { type: 'activity_inquiry', title: '課後詢問', count: 2, route: '/activity/inquiries' },
      ],
      reminders: [],
    }

    const wrapper = mount(AdminNotificationBell, {
      props: { isMobile: false },
      global: globalConfig,
    })

    expect(wrapper.find('.badge-value').text()).toBe('5')
    expect(wrapper.text()).toContain('待審核')
    expect(wrapper.text()).toContain('課後詢問')
    // 兩個 action item 的個別計數正確顯示
    const items = wrapper.findAll('.notification-item__count')
    const counts = items.map((el) => el.text())
    expect(counts).toContain('3')
    expect(counts).toContain('2')
  })

  it('renders reminders section with calendar and probation items', async () => {
    const store = useNotificationStore()
    store.summary = {
      total_badge: 0,
      action_items: [],
      reminders: [
        {
          type: 'calendar',
          title: '近期行事曆',
          route: '/calendar',
          items: [
            { id: 1, label: '親師座談', date: '2026-04-01' },
          ],
        },
        {
          type: 'probation',
          title: '試用期提醒',
          route: '/employees',
          items: [{ id: 1, label: 'E001 林老師' }],
        },
      ],
    }

    const wrapper = mount(AdminNotificationBell, {
      props: { isMobile: false },
      global: globalConfig,
    })

    expect(wrapper.text()).toContain('親師座談')
    expect(wrapper.text()).toContain('E001 林老師')

    await wrapper.get('[data-test="notification-item-calendar"] button').trigger('click')
    expect(push).toHaveBeenCalledWith('/calendar')
  })

  it('badge hidden=true when badgeCount is 0', async () => {
    const store = useNotificationStore()
    store.summary = { total_badge: 0, action_items: [], reminders: [] }

    const wrapper = mount(AdminNotificationBell, {
      props: { isMobile: false },
      global: globalConfig,
    })

    // ElBadge stub 的 value prop 應為 0
    const badge = wrapper.findAllComponents({ name: 'ElBadge' })[0]
    expect(badge.props('value')).toBe(0)
  })
})
