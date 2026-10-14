import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RouteLocationNormalized } from 'vue-router'
import {
  ENTER_TIMEOUT_MS,
  RESTORE_MAX_WAIT_MS,
  RESTORE_POLL_MS,
  createParentScrollBehavior,
  notifyPageEntered,
} from '../scrollRestoration'
import router from '../../router'

/**
 * scrollBehavior（2026-10-14）：列表進詳情再返回要回到原位置、進新頁要從頂端開始。
 * out-in 轉場會延後新頁掛載、列表資料非同步載入，所以要等「新頁已插入」與
 * 「頁面撐得夠高」兩件事。
 */

const route = (fullPath: string, matched = 1) =>
  ({ fullPath, path: fullPath, matched: new Array(matched).fill({}) }) as unknown as RouteLocationNormalized
const START = route('/', 0)

let scrollHeight = 0

beforeEach(() => {
  vi.useFakeTimers()
  scrollHeight = 0
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
})

afterEach(() => {
  vi.useRealTimers()
})

/** 讓 pending promise 有機會 settle（不推進計時器） */
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

describe('createParentScrollBehavior', () => {
  it('進新頁（無 savedPosition）：等新頁插入後才捲到頂，不捲正在淡出的舊頁', async () => {
    const behavior = createParentScrollBehavior(() => true)
    let result: unknown = 'pending'
    void Promise.resolve(behavior(route('/events/1'), route('/events'), null)).then((r) => { result = r })
    await settle()
    expect(result).toBe('pending')

    notifyPageEntered()
    await settle()
    expect(result).toEqual({ left: 0, top: 0 })
  })

  it('等不到 enter（轉場被打斷）時逾時保底，仍捲到頂', async () => {
    const behavior = createParentScrollBehavior(() => true)
    let result: unknown = 'pending'
    void Promise.resolve(behavior(route('/fees'), route('/home'), null)).then((r) => { result = r })
    await vi.advanceTimersByTimeAsync(ENTER_TIMEOUT_MS - 1)
    expect(result).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toEqual({ left: 0, top: 0 })
  })

  it('首次導覽不等轉場（首屏沒有 enter 可等）', async () => {
    const behavior = createParentScrollBehavior(() => true)
    const result = await behavior(route('/home'), START, null)
    expect(result).toEqual({ left: 0, top: 0 })
  })

  it('返回：等列表資料把頁面撐高到能捲到原位置才還原', async () => {
    const behavior = createParentScrollBehavior(() => true)
    let result: unknown = 'pending'
    void Promise.resolve(behavior(route('/events'), route('/events/1'), { left: 0, top: 1200 }))
      .then((r) => { result = r })
    notifyPageEntered()
    await settle()
    // 剛插入時只有骨架，頁面太矮
    scrollHeight = 900
    await vi.advanceTimersByTimeAsync(RESTORE_POLL_MS * 2)
    expect(result).toBe('pending')

    // 資料載入完成
    scrollHeight = 3000
    await vi.advanceTimersByTimeAsync(RESTORE_POLL_MS)
    expect(result).toEqual({ left: 0, top: 1200 })
  })

  it('返回：資料遲遲不來時，最多等 RESTORE_MAX_WAIT_MS 就捲到能到的位置', async () => {
    const behavior = createParentScrollBehavior(() => true)
    let result: unknown = 'pending'
    void Promise.resolve(behavior(route('/events'), route('/events/1'), { left: 0, top: 1200 }))
      .then((r) => { result = r })
    notifyPageEntered()
    await settle()
    await vi.advanceTimersByTimeAsync(RESTORE_MAX_WAIT_MS + RESTORE_POLL_MS)
    expect(result).toEqual({ left: 0, top: 1200 })
  })

  it('等待還原期間家長自己捲動／觸控 → 放棄還原，不跟手搶', async () => {
    const behavior = createParentScrollBehavior(() => true)
    let result: unknown = 'pending'
    void Promise.resolve(behavior(route('/events'), route('/events/1'), { left: 0, top: 1200 }))
      .then((r) => { result = r })
    notifyPageEntered()
    await settle()
    window.dispatchEvent(new Event('touchstart'))
    scrollHeight = 3000
    await vi.advanceTimersByTimeAsync(RESTORE_POLL_MS)
    expect(result).toBe(false)
  })

  it('等待期間又導覽到別頁 → 舊導覽的捲動結果不套用', async () => {
    let current = '/events/1'
    const behavior = createParentScrollBehavior((fullPath) => fullPath === current)
    let result: unknown = 'pending'
    void Promise.resolve(behavior(route('/events/1'), route('/events'), null)).then((r) => { result = r })
    current = '/fees'
    notifyPageEntered()
    await settle()
    expect(result).toBe(false)
  })
})

describe('接線', () => {
  it('家長端 router 有掛 scrollBehavior', () => {
    expect(typeof router.options.scrollBehavior).toBe('function')
  })

  it('App.vue 的路由轉場在新頁插入時通知 scrollBehavior（@enter="notifyPageEntered"）', () => {
    const app = readFileSync(resolve(__dirname, '../../App.vue'), 'utf8')
    expect(app).toMatch(/<transition[^>]*@enter="notifyPageEntered"/)
  })
})
