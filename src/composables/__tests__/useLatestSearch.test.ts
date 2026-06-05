import { describe, it, expect } from 'vitest'
import { useLatestSearch } from '@/composables/useLatestSearch'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useLatestSearch', () => {
  it('丟棄較舊查詢的延遲回應（防 out-of-order 覆蓋）', async () => {
    const dA = deferred<string[]>()
    const dB = deferred<string[]>()
    const calls = [dA, dB]
    let i = 0
    const { result, search } = useLatestSearch<string[]>(() => calls[i++].promise)

    const pA = search('陳') // seq 1 → dA（慢）
    const pB = search('陳大') // seq 2 → dB（快）

    dB.resolve(['B'])
    await pB
    expect(result.value).toEqual(['B'])

    dA.resolve(['A']) // 較舊查詢稍後才回 → 必須被丟棄
    await pA
    expect(result.value).toEqual(['B']) // 未被 stale A 覆蓋
  })

  it('最新查詢的錯誤會 propagate；較舊查詢的錯誤被吞掉', async () => {
    const dA = deferred<string[]>()
    const dB = deferred<string[]>()
    const calls = [dA, dB]
    let i = 0
    const { search } = useLatestSearch<string[]>(() => calls[i++].promise)

    const pA = search('a') // seq 1
    const pB = search('b') // seq 2

    dB.reject(new Error('latest fail'))
    await expect(pB).rejects.toThrow('latest fail')

    dA.reject(new Error('stale fail'))
    await expect(pA).resolves.toEqual({ applied: false }) // stale 錯誤不 throw
  })

  it('reset 清空結果並使 in-flight 失效', async () => {
    const dA = deferred<string[]>()
    const { result, search, reset } = useLatestSearch<string[]>(() => dA.promise)

    const pA = search('a')
    reset()
    expect(result.value).toBeNull()

    dA.resolve(['A'])
    await pA
    expect(result.value).toBeNull() // reset 後 in-flight 回應不得套用
  })
})
