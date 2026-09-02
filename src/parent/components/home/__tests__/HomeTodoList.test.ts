/**
 * HomeTodoList — 首頁「待辦」區塊。
 *
 * 涵蓋：
 *  - 空清單整區不渲染（首頁不為「沒事」佔位）
 *  - 標題副標只算 action/alert 列
 *  - 每列 aria-label 含名稱與筆數
 *  - 三態：pending 且無資料→骨架；error 且無資料→可重試；部分失敗→仍渲染列
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, computed } from 'vue'
import type { ParentTodo } from '@/parent/composables/useParentTodos'

const todosRef = ref<ParentTodo[]>([])
const pendingRef = ref(false)
const errorRef = ref<unknown>(null)
const refreshMock = vi.fn()

vi.mock('@/parent/composables/useParentTodos', () => ({
  useParentTodos: () => ({
    todos: computed(() => todosRef.value),
    actionCount: computed(() =>
      todosRef.value.filter((t) => t.tone !== 'info').reduce((s, t) => s + t.count, 0),
    ),
    signDocsCount: computed(() => 0),
    pickupActiveCount: computed(() => 0),
    pending: computed(() => pendingRef.value),
    error: computed(() => errorRef.value),
    refresh: refreshMock,
  }),
}))

import HomeTodoList from '@/parent/components/home/HomeTodoList.vue'

const stubs = {
  'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
}

function makeTodo(over: Partial<ParentTodo> = {}): ParentTodo {
  return {
    key: 'fees',
    label: '待繳學費',
    count: 2,
    sub: '2 筆',
    tone: 'action',
    icon: 'payments',
    to: '/fees',
    ...over,
  }
}

beforeEach(() => {
  todosRef.value = []
  pendingRef.value = false
  errorRef.value = null
  refreshMock.mockClear()
})

describe('HomeTodoList', () => {
  it('沒有待辦時整區不渲染', () => {
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.find('[data-testid="home-todo-list"]').exists()).toBe(false)
  })

  it('有待辦時渲染標題「待辦」與每列的名稱與副標', () => {
    todosRef.value = [makeTodo(), makeTodo({ key: 'eventAcks', label: '待簽文件', count: 3, sub: '3 份待簽收', to: '/events' })]
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.find('[data-testid="home-todo-list"]').exists()).toBe(true)
    expect(w.text()).toContain('待辦')
    expect(w.text()).toContain('待繳學費')
    expect(w.text()).toContain('待簽文件')
    expect(w.text()).toContain('3 份待簽收')
  })

  it('副標「N 件」只計 action 與 alert 列', () => {
    todosRef.value = [
      makeTodo({ count: 2 }),
      makeTodo({ key: 'announcements', label: '未讀公告', count: 99, tone: 'info', to: '/announcements' }),
    ]
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.find('[data-testid="home-todo-count"]').text()).toBe('2 件')
  })

  it('每列連到對應路由，aria-label 含名稱與筆數', () => {
    todosRef.value = [makeTodo({ label: '待繳學費', count: 2, to: '/fees' })]
    const w = mount(HomeTodoList, { global: { stubs } })
    const row = w.find('[data-testid="home-todo-row-fees"]')
    expect(row.attributes('href')).toBe('/fees')
    expect(row.attributes('aria-label')).toContain('待繳學費')
    expect(row.attributes('aria-label')).toContain('2')
  })

  it('逾期列帶 alert 樣式類名', () => {
    todosRef.value = [makeTodo({ tone: 'alert', sub: '逾期 $1,200' })]
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.find('[data-testid="home-todo-row-fees"]').classes().join(' ')).toContain('alert')
  })

  it('載入中且無資料：顯示骨架、不顯示錯誤態', () => {
    pendingRef.value = true
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
  })

  it('錯誤且無資料：顯示可重試錯誤態，點重試呼叫 refresh', async () => {
    errorRef.value = new Error('boom')
    const w = mount(HomeTodoList, { global: { stubs } })
    const retry = w.findComponent({ name: 'MobileErrorRetry' })
    expect(retry.exists()).toBe(true)
    await retry.vm.$emit('retry')
    expect(refreshMock).toHaveBeenCalled()
  })

  it('部分失敗但已有列：渲染清單而非錯誤態', () => {
    errorRef.value = new Error('sign docs down')
    todosRef.value = [makeTodo()]
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.find('[data-testid="home-todo-list"]').exists()).toBe(true)
  })
})
