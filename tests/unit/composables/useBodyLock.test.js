import { describe, it, expect, beforeEach } from 'vitest'
import { useBodyLock } from '@/composables/useBodyLock'

const LOCK_KEY = '__ivy_bodylock_count__'
const PREV_KEY = '__ivy_bodylock_prev_overflow__'

beforeEach(() => {
  document.body.style.overflow = ''
  delete window[LOCK_KEY]
  delete window[PREV_KEY]
})

describe('useBodyLock', () => {
  it('lock 把 body overflow 設為 hidden、計數 = 1', () => {
    const { lock } = useBodyLock()
    lock()
    expect(document.body.style.overflow).toBe('hidden')
    expect(window[LOCK_KEY]).toBe(1)
  })

  it('unlock 還原原本的 overflow（空字串）', () => {
    const { lock, unlock } = useBodyLock()
    lock()
    expect(document.body.style.overflow).toBe('hidden')
    unlock()
    expect(document.body.style.overflow).toBe('')
    expect(window[LOCK_KEY]).toBe(0)
  })

  it('保留原本的 overflow 值（例：auto）', () => {
    document.body.style.overflow = 'auto'
    const { lock, unlock } = useBodyLock()
    lock()
    expect(document.body.style.overflow).toBe('hidden')
    unlock()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('多層疊加：內層 unlock 不會釋放外層的鎖', () => {
    const outer = useBodyLock()
    const inner = useBodyLock()
    outer.lock()
    inner.lock()
    expect(window[LOCK_KEY]).toBe(2)
    expect(document.body.style.overflow).toBe('hidden')

    inner.unlock()
    // 仍然鎖住
    expect(document.body.style.overflow).toBe('hidden')
    expect(window[LOCK_KEY]).toBe(1)

    outer.unlock()
    expect(document.body.style.overflow).toBe('')
    expect(window[LOCK_KEY]).toBe(0)
  })

  it('同一實例 lock 兩次只增加一次計數（owns 旗標守衛）', () => {
    const { lock } = useBodyLock()
    lock()
    lock()
    expect(window[LOCK_KEY]).toBe(1)
  })

  it('未 lock 直接 unlock 是 no-op', () => {
    document.body.style.overflow = 'scroll'
    const { unlock } = useBodyLock()
    unlock()
    expect(document.body.style.overflow).toBe('scroll')
    expect(window[LOCK_KEY] || 0).toBe(0)
  })

  it('unlock 不會把計數壓到負值', () => {
    const a = useBodyLock()
    a.lock()
    a.unlock()
    a.unlock() // 第二次 unlock 已經 owns=false → no-op
    expect(window[LOCK_KEY]).toBe(0)
  })
})
