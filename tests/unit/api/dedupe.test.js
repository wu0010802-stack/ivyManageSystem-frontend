import { describe, expect, it } from 'vitest'
import axios from 'axios'
import { applyDedupe } from '@/utils/apiDedupe'

function makeInstance() {
  const instance = axios.create()
  instance._calls = 0
  instance.defaults.adapter = (config) => {
    instance._calls += 1
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          data: { ok: true, callIndex: instance._calls },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        })
      }, 20)
    })
  }
  applyDedupe(instance)
  return instance
}

describe('apiDedupe', () => {
  it('相同 method+url+body 的 POST 併發只打一次 adapter', async () => {
    const api = makeInstance()
    const [r1, r2] = await Promise.all([
      api.post('/foo', { x: 1 }),
      api.post('/foo', { x: 1 }),
    ])
    expect(api._calls).toBe(1)
    expect(r1.data.callIndex).toBe(1)
    expect(r2.data.callIndex).toBe(1)
  })

  it('body 不同的併發 POST 不去重', async () => {
    const api = makeInstance()
    await Promise.all([
      api.post('/foo', { x: 1 }),
      api.post('/foo', { x: 2 }),
    ])
    expect(api._calls).toBe(2)
  })

  it('GET 不去重', async () => {
    const api = makeInstance()
    await Promise.all([
      api.get('/foo', { params: { x: 1 } }),
      api.get('/foo', { params: { x: 1 } }),
    ])
    expect(api._calls).toBe(2)
  })

  it('meta.allowConcurrent 繞過去重', async () => {
    const api = makeInstance()
    await Promise.all([
      api.post('/foo', { x: 1 }, { meta: { allowConcurrent: true } }),
      api.post('/foo', { x: 1 }, { meta: { allowConcurrent: true } }),
    ])
    expect(api._calls).toBe(2)
  })

  it('第一次完成後，第二次相同請求會重新發出', async () => {
    const api = makeInstance()
    await api.post('/foo', { x: 1 })
    await api.post('/foo', { x: 1 })
    expect(api._calls).toBe(2)
  })

  it('object key 順序不影響 dedupe', async () => {
    const api = makeInstance()
    await Promise.all([
      api.post('/foo', { a: 1, b: 2 }),
      api.post('/foo', { b: 2, a: 1 }),
    ])
    expect(api._calls).toBe(1)
  })
})
