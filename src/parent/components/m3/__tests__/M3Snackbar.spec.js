import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Snackbar from '../M3Snackbar.vue'

describe('M3Snackbar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('snackbars 為空時不渲染', () => {
    const w = mount(M3Snackbar, { props: { snackbars: [] }, attachTo: document.body })
    expect(document.querySelector('.m3-snackbar')).toBeNull()
    w.unmount()
  })

  it('render 第一筆 snackbar 訊息', () => {
    const snackbars = [{ id: 1, message: '已儲存', action: null, duration: 4000 }]
    const w = mount(M3Snackbar, { props: { snackbars }, attachTo: document.body })
    const el = document.querySelector('.m3-snackbar')
    expect(el).not.toBeNull()
    expect(document.querySelector('.m3-snackbar-message').textContent).toBe('已儲存')
    w.unmount()
  })

  it('有 action 時渲染 action button', () => {
    const onClick = vi.fn()
    const snackbars = [{
      id: 1,
      message: '已刪除',
      action: { label: '復原', onClick },
      duration: 7000,
    }]
    const w = mount(M3Snackbar, { props: { snackbars }, attachTo: document.body })
    const btn = document.querySelector('.m3-snackbar-action')
    expect(btn).not.toBeNull()
    expect(btn.textContent).toContain('復原')
    w.unmount()
  })

  it('點 action button 觸發 onClick + emit dismiss', async () => {
    const onClick = vi.fn()
    const snackbars = [{
      id: 42,
      message: 'x',
      action: { label: 'undo', onClick },
      duration: 4000,
    }]
    const w = mount(M3Snackbar, { props: { snackbars }, attachTo: document.body })
    const btn = document.querySelector('.m3-snackbar-action')
    btn.click()
    await w.vm.$nextTick()
    expect(onClick).toHaveBeenCalled()
    expect(w.emitted('dismiss')).toEqual([[42]])
    w.unmount()
  })

  it('duration 到時自動 emit dismiss', async () => {
    const snackbars = [{ id: 7, message: 'x', action: null, duration: 4000 }]
    const w = mount(M3Snackbar, { props: { snackbars }, attachTo: document.body })
    vi.advanceTimersByTime(4000)
    await w.vm.$nextTick()
    expect(w.emitted('dismiss')).toEqual([[7]])
    w.unmount()
  })

  it('第一筆移除後若還有第二筆，自動顯示第二筆', async () => {
    const w = mount(M3Snackbar, {
      props: { snackbars: [{ id: 1, message: 'a', action: null, duration: 4000 }] },
      attachTo: document.body,
    })
    expect(document.querySelector('.m3-snackbar-message').textContent).toBe('a')
    await w.setProps({
      snackbars: [{ id: 2, message: 'b', action: null, duration: 4000 }],
    })
    expect(document.querySelector('.m3-snackbar-message').textContent).toBe('b')
    w.unmount()
  })
})
