import { describe, expect, it, vi } from 'vitest'

describe('Vitest network isolation', () => {
  it('blocks unmocked fetch calls before they reach localhost or the internet', async () => {
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true)
    await expect(globalThis.fetch('/unmocked-test-request')).rejects.toThrow(
      'Unexpected unmocked fetch in Vitest',
    )
  })

  it('blocks unmocked XMLHttpRequest before an adapter can open a socket', () => {
    expect(() => new globalThis.XMLHttpRequest()).toThrow(
      'Unexpected unmocked XMLHttpRequest in Vitest',
    )
  })

  it('turns an unmocked Axios request into the same deterministic rejection', async () => {
    const { default: axios } = await import('axios')

    await expect(axios.get('/unmocked-axios-request')).rejects.toThrow(
      'Unexpected unmocked XMLHttpRequest in Vitest',
    )
  })

  describe('when a test needs to exercise an XMLHttpRequest adapter', () => {
    class TestXMLHttpRequest {}

    beforeEach(() => {
      vi.stubGlobal('XMLHttpRequest', TestXMLHttpRequest)
    })

    it('lets the test install a scoped XMLHttpRequest implementation', () => {
      expect(new globalThis.XMLHttpRequest()).toBeInstanceOf(TestXMLHttpRequest)
    })
  })
})
