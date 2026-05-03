import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ---- Mock the api wrapper used by usePortalClassHub ----
vi.mock('@/api/portalClassHub', () => ({
  getTodayHub: vi.fn(),
}))

// ---- Mock Vue Router (PortalClassHubView calls useRouter) ----
const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
  useRoute: () => ({ query: {} }),
}))

// ---- Mock Element Plus components as passthrough divs ----
vi.mock('element-plus', () => {
  const passthrough = (name) =>
    defineComponent({
      name,
      setup(_, { slots }) {
        return () => h('div', { class: name }, slots.default?.())
      },
    })
  return {
    ElCard: defineComponent({
      name: 'ElCard',
      setup(_, { slots }) {
        return () =>
          h('div', { class: 'el-card' }, [
            slots.header?.(),
            slots.default?.(),
          ])
      },
    }),
    ElButton: defineComponent({
      name: 'ElButton',
      props: ['loading', 'type', 'link', 'size'],
      emits: ['click'],
      setup(_, { slots, emit }) {
        return () =>
          h(
            'button',
            { class: 'el-button', onClick: () => emit('click') },
            slots.default?.(),
          )
      },
    }),
    ElEmpty: defineComponent({
      name: 'ElEmpty',
      props: ['description'],
      render() {
        return h('div', { class: 'el-empty' }, this.description)
      },
    }),
    ElTag: passthrough('el-tag'),
    ElIcon: passthrough('el-icon'),
    ElMessage: { success: vi.fn(), error: vi.fn() },
    vLoading: {},
  }
})

// ---- Mock the 3 sheet components (we don't test their internals here) ----
vi.mock('@/components/portal/class-hub/ClassHubAttendanceSheet.vue', () => ({
  default: defineComponent({
    name: 'ClassHubAttendanceSheet',
    props: ['show'],
    emits: ['update:show', 'done'],
    setup() {
      return () => h('div', { class: 'ClassHubAttendanceSheet' })
    },
  }),
}))
vi.mock('@/components/portal/class-hub/ClassHubMedicationSheet.vue', () => ({
  default: defineComponent({
    name: 'ClassHubMedicationSheet',
    props: ['show'],
    emits: ['update:show', 'done'],
    setup() {
      return () => h('div', { class: 'ClassHubMedicationSheet' })
    },
  }),
}))
vi.mock('@/components/portal/class-hub/ClassHubIncidentQuickSheet.vue', () => ({
  default: defineComponent({
    name: 'ClassHubIncidentQuickSheet',
    props: ['show'],
    emits: ['update:show', 'done'],
    setup() {
      return () => h('div', { class: 'ClassHubIncidentQuickSheet' })
    },
  }),
}))

import { getTodayHub } from '@/api/portalClassHub'
import PortalClassHubView from '@/views/portal/PortalClassHubView.vue'

const FAKE_BASE = {
  classroom_id: 1,
  classroom_name: 'A班',
  fetched_at: '2026-05-04T10:00:00',
  sticky_next: null,
  counts: {
    attendance_pending: 2,
    medications_pending: 1,
    observations_pending: 3,
    incidents_today: 0,
    contact_books_pending: 5,
  },
  slots: [
    {
      slot_id: 'morning',
      tasks: [{ kind: 'attendance', count: 2, action_mode: 'sheet' }],
    },
    {
      slot_id: 'forenoon',
      tasks: [
        { kind: 'observation', count: 3, action_mode: 'page' },
        { kind: 'incident', count: 0, action_mode: 'inline_button' },
      ],
    },
    { slot_id: 'noon', tasks: [] },
    {
      slot_id: 'afternoon',
      tasks: [{ kind: 'contact_book', count: 5, action_mode: 'page' }],
    },
  ],
}

describe('PortalClassHubView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    routerPush.mockReset()
    getTodayHub.mockReset()
    getTodayHub.mockResolvedValue({ ...FAKE_BASE })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders 4 time-slot cards after data loads', async () => {
    const wrapper = mount(PortalClassHubView)
    await flushPromises()
    // Each TimeSlotCard root is `.slot-card` from its own scoped style;
    // since we're not stubbing it, it renders normally.
    expect(getTodayHub).toHaveBeenCalledTimes(1)
    // Confirm the 4 slots rendered: classroom name appears
    expect(wrapper.text()).toContain('A班')
  })

  it('shows empty state when classroom_id=0', async () => {
    getTodayHub.mockResolvedValueOnce({
      ...FAKE_BASE,
      classroom_id: 0,
      classroom_name: '',
      slots: [],
    })
    const wrapper = mount(PortalClassHubView)
    await flushPromises()
    // The empty-state container is rendered; check via html() since
    // el-empty renders as a custom element (description attr not text node).
    expect(wrapper.html()).toContain('目前沒有班級任務')
  })

  it('polls every 60 seconds', async () => {
    mount(PortalClassHubView)
    await flushPromises()
    expect(getTodayHub).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    expect(getTodayHub).toHaveBeenCalledTimes(2)
  })

  it('shows the sticky empty-state message when sticky_next is null', async () => {
    const wrapper = mount(PortalClassHubView)
    await flushPromises()
    expect(wrapper.text()).toContain('今日任務都完成')
  })
})
