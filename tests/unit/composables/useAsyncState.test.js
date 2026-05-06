import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useAsyncState } from '@/composables/useAsyncState'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn() },
}))

describe('useAsyncState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initial state has data=null, loading=false, error=null', () => {
    const { data, loading, error } = useAsyncState(() => Promise.resolve('x'))
    expect(data.value).toBe(null)
    expect(loading.value).toBe(false)
    expect(error.value).toBe(null)
  })

  it('execute sets loading then data on success', async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 1 })
    const { data, loading, execute } = useAsyncState(fetcher)
    const p = execute()
    expect(loading.value).toBe(true)
    await p
    expect(loading.value).toBe(false)
    expect(data.value).toEqual({ id: 1 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('execute captures error and shows ElMessage by default', async () => {
    const { ElMessage } = await import('element-plus')
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'))
    const { error, loading, execute } = useAsyncState(fetcher)
    await execute()
    expect(loading.value).toBe(false)
    expect(error.value).toBeInstanceOf(Error)
    expect(error.value.message).toBe('boom')
    expect(ElMessage.error).toHaveBeenCalledWith('boom')
  })

  it('toast=false suppresses ElMessage', async () => {
    const { ElMessage } = await import('element-plus')
    const fetcher = vi.fn().mockRejectedValue(new Error('silent'))
    const { execute } = useAsyncState(fetcher, { toast: false })
    await execute()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('refresh shadow=true keeps loading false but updates data', async () => {
    let counter = 0
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(++counter))
    const { data, loading, execute, refresh } = useAsyncState(fetcher)
    await execute()
    expect(data.value).toBe(1)
    const p = refresh({ shadow: true })
    expect(loading.value).toBe(false)
    await p
    expect(data.value).toBe(2)
  })

  it('immediate=true triggers execute on creation', async () => {
    const fetcher = vi.fn().mockResolvedValue('init')
    const { data } = useAsyncState(fetcher, { immediate: true })
    await nextTick()
    await nextTick()
    expect(data.value).toBe('init')
  })

  it('initialData sets data before first fetch', () => {
    const { data } = useAsyncState(() => Promise.resolve('y'), { initialData: 'init-value' })
    expect(data.value).toBe('init-value')
  })
})
