import { describe, it, expect, beforeEach } from 'vitest'
import { useConsentGate } from '../useConsentGate'

describe('useConsentGate', () => {
  beforeEach(() => {
    // 模組 singleton：每個測試前重置，避免狀態洩漏
    useConsentGate().reset()
  })

  it('初始狀態 visible=false, pendingScope=null', () => {
    const gate = useConsentGate()
    expect(gate.visible.value).toBe(false)
    expect(gate.pendingScope.value).toBeNull()
  })

  it('require(scope) → visible=true, pendingScope=scope', () => {
    const gate = useConsentGate()
    gate.require('service_essential')
    expect(gate.visible.value).toBe(true)
    expect(gate.pendingScope.value).toBe('service_essential')
  })

  it('resolve() → visible=false, pendingScope=null', () => {
    const gate = useConsentGate()
    gate.require('service_essential')
    gate.resolve()
    expect(gate.visible.value).toBe(false)
    expect(gate.pendingScope.value).toBeNull()
  })

  it('reset() 清除所有狀態', () => {
    const gate = useConsentGate()
    gate.require('service_essential')
    gate.reset()
    expect(gate.visible.value).toBe(false)
    expect(gate.pendingScope.value).toBeNull()
  })

  it('多次呼叫 useConsentGate() 回同一 singleton', () => {
    const gate1 = useConsentGate()
    const gate2 = useConsentGate()
    gate1.require('service_essential')
    expect(gate2.visible.value).toBe(true)
  })
})
