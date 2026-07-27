/**
 * 全域搜尋（Cmd+K）點學生／家長／訊息都到不了（bug-hunt 2026-07-27）。
 *
 * - 學生／家長：push 的是 `/portal/students/{id}/detail`，但那是**後端 API 路徑**；
 *   前端 router 只有 `students/:studentId`（沒有 /detail）。無 route 匹配 → to.meta 為空
 *   → 命中「teacher 不可存取管理後台」分支被靜默導到 /portal/attendance。
 *   而搜尋是學生個案頁在 app 內唯一的導覽入口。
 * - 訊息：push `{ path: '/portal/messages', query: { thread_id } }`，但該路由是**靜態物件
 *   redirect**，新的 query 會整包覆蓋掉原 query；而且 class-hub 讀的 key 是 `thread`
 *   不是 `thread_id`。旁邊就有寫對的 `messages/:threadId` function redirect 沒人用。
 *
 * 本檔用真實 routes 建一個沒有守衛的 router 實際導航一次，斷言最終落點——
 * 只比對字串無法抓到「路由存在但 query 被 redirect 吃掉」這種情形。
 * 既有的 PortalSearchPalette.spec.js 把整個 vue-router mock 掉，看不到這類問題。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

import PortalSearchPalette from '@/components/portal/PortalSearchPalette.vue'
import { usePortalSearch } from '@/composables/usePortalSearch'
import { routes } from '@/router'

const pushMock = vi.fn()

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRouter: () => ({ push: pushMock }) }
})

vi.mock('@/api/portalSearch', () => ({
  searchPortal: vi.fn().mockResolvedValue({ data: {} }),
}))

/** 用真實 routes、但不掛任何守衛，單純驗「這個導航目標會落在哪」。 */
function makeRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes })
}

function mountPalette() {
  const { isOpen } = usePortalSearch()
  isOpen.value = true
  return mount(PortalSearchPalette, {
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

/** 觸發一次選取，回傳 palette 交給 router.push 的目標。 */
function targetFor(kind: string, payload: Record<string, unknown>) {
  const wrapper = mountPalette()
  ;(
    wrapper.vm as unknown as {
      selectItem: (i: { kind: string; payload: Record<string, unknown> }) => void
    }
  ).selectItem({ kind, payload })
  wrapper.unmount()
  expect(pushMock).toHaveBeenCalledTimes(1)
  return pushMock.mock.calls[0][0]
}

describe('PortalSearchPalette 的導航目標必須真的到得了', () => {
  let router: Router

  beforeEach(() => {
    pushMock.mockReset()
    router = makeRouter()
  })

  afterEach(() => {
    const { isOpen } = usePortalSearch()
    isOpen.value = false
  })

  it('點學生 → 落在學生個案頁', async () => {
    await router.push(targetFor('student', { id: 5, name: '王小明' }))

    expect(router.currentRoute.value.name).toBe('portal-student-detail')
    expect(String(router.currentRoute.value.params.studentId)).toBe('5')
  })

  it('點家長 → 落在該童的學生個案頁', async () => {
    await router.push(targetFor('guardian', { student_id: 5, name: '王媽媽' }))

    expect(router.currentRoute.value.name).toBe('portal-student-detail')
    expect(String(router.currentRoute.value.params.studentId)).toBe('5')
  })

  it('點親師訊息 → 開到該則對話，thread id 不得在 redirect 中遺失', async () => {
    await router.push(targetFor('message', { thread_id: 7, student_name: '王小明' }))

    const current = router.currentRoute.value
    expect(current.name).toBe('portal-class-hub')
    expect(current.query.panel).toBe('messages')
    expect(String(current.query.thread)).toBe('7')
  })
})
