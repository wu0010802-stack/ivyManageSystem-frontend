import axios, { type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import 'fake-indexeddb/auto'
import api from '@/parent/api'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { enqueueParent, resetParentOfflineQueueRuntime } from '@/parent/utils/parentOfflineQueue'
import { clearAll, listOps, OP_KINDS } from '@/utils/offlineQueue'
import { performParentLogout, _resetParentLogoutIsolationForTesting, LOGOUT_FLUSH_TIMEOUT_MS } from '../useParentLogout'
const reportEvent = vi.hoisted(() => vi.fn())
vi.mock('@/parent/utils/clientEvents', () => ({ reportClientEvent: reportEvent }))
vi.mock('@/parent/services/liff', () => ({ liff: { isLoggedIn: () => false } }))
beforeEach(async () => {
  reportEvent.mockClear()
  setActivePinia(createPinia())
  _resetParentLogoutIsolationForTesting()
  resetParentOfflineQueueRuntime()
  await clearAll()
  useParentAuthStore().setUser({ user_id: 42 })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); _resetParentLogoutIsolationForTesting(); vi.unstubAllGlobals() })
it('真實queue在同步清auth後仍用原owner送出，再呼叫登出API', async () => {
  await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: { student_id: 1 } })
  const urls: string[] = []
  api.defaults.adapter = async config => {
    expect(useParentAuthStore().user).toBeNull()
    urls.push(config.url!)
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }
  const task = performParentLogout()
  expect(useParentAuthStore().user).toBeNull()
  await task
  expect(urls).toEqual(['/parent/student-leaves', '/parent/auth/logout'])
  expect(await listOps({ userId: 42 })).toHaveLength(0)
})
it('登出讀取queue期間新家長登入就停止送舊owner資料', async () => {
  await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: { student_id: 1 } })
  const urls: string[] = []
  api.defaults.adapter = async config => { urls.push(config.url!); return { data: {}, status: 200, statusText: 'OK', headers: {}, config } }
  const task = performParentLogout()
  useParentAuthStore().setUser({ user_id: 99 })
  await task
  expect(urls).not.toContain('/parent/student-leaves')
  expect(await listOps({ userId: 42 })).toHaveLength(1)
})
it('timeout中止送出，晚回應與新登入不繼續送下一筆舊資料', async () => {
  await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: { student_id: 1 } })
  await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: { student_id: 2 } })
  let entered!: () => void
  const dispatched = new Promise<void>(resolve => { entered = resolve })
  let finish!: () => void
  let request!: InternalAxiosRequestConfig
  const urls: string[] = []
  api.defaults.adapter = async config => {
    urls.push(config.url!)
    if (config.url === '/parent/student-leaves') {
      request = config
      entered()
      await new Promise<void>(resolve => { finish = resolve })
    }
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const task = performParentLogout()
  await dispatched
  await vi.advanceTimersByTimeAsync(LOGOUT_FLUSH_TIMEOUT_MS + 1)
  await task
  expect(request.signal?.aborted).toBe(true)
  useParentAuthStore().setUser({ user_id: 99 })
  finish()
  await Promise.resolve()
  await Promise.resolve()
  expect(urls.filter(url => url === '/parent/student-leaves')).toHaveLength(1)
  expect(await listOps({ userId: 42 })).toHaveLength(2)
})
it('request interceptor前換身分，受控queue不得進adapter', async () => {
  await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: { student_id: 1 } })
  const urls: string[] = []
  api.defaults.adapter = async config => { urls.push(config.url!); return { data: {}, status: 200, statusText: 'OK', headers: {}, config } }
  const interceptor = api.interceptors.request.use(config => {
    if (config.url === '/parent/student-leaves') useParentAuthStore().setUser({ user_id: 99 })
    return config
  })
  try {
    await performParentLogout()
    expect(urls).not.toContain('/parent/student-leaves')
    expect(reportEvent).not.toHaveBeenCalled()
    expect(await listOps({ userId: 42 })).toHaveLength(1)
  } finally { api.interceptors.request.eject(interceptor) }
})
it('跨分頁logout-start取消受控queue，保留尚未完成的資料', async () => {
  let channel: { onmessage: ((event: MessageEvent) => void) | null } | undefined
  vi.stubGlobal('BroadcastChannel', class {
    onmessage: ((event: MessageEvent) => void) | null = null
    constructor() { channel = this }
    postMessage() {}
    close() {}
  })
  await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: { student_id: 1 } })
  let entered!: () => void
  const dispatched = new Promise<void>(resolve => { entered = resolve })
  const urls: string[] = []
  api.defaults.adapter = config => {
    urls.push(config.url!)
    if (config.url === '/parent/student-leaves') {
      entered()
      return new Promise((_, reject) => config.signal?.addEventListener?.('abort', () => reject(new axios.CanceledError()), { once: true }))
    }
    return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
  }
  const task = performParentLogout()
  await dispatched
  channel?.onmessage?.({ data: { type: 'logout-start' } } as MessageEvent)
  await task
  expect(urls.filter(url => url === '/parent/student-leaves')).toHaveLength(1)
  expect(await listOps({ userId: 42 })).toHaveLength(1)
})


it('登出送出遇401保留queue，不啟動獨立refresh或重送', async () => {
  await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: { student_id: 1 } })
  const refresh = vi.spyOn(axios, 'post').mockRejectedValue(new Error('模擬拒絕refresh'))
  const urls: string[] = []
  api.defaults.adapter = async config => {
    urls.push(config.url!)
    if (config.url === '/parent/student-leaves') {
      const response = { data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config }
      throw new axios.AxiosError('模擬登入失效', 'ERR_BAD_REQUEST', config, undefined, response)
    }
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }
  await performParentLogout()
  expect(refresh).not.toHaveBeenCalled()
  expect(urls).toEqual(['/parent/student-leaves', '/parent/auth/logout'])
  expect(await listOps({ userId: 42 })).toHaveLength(1)
})
