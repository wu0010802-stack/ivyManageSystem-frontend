import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useQuickActionSlots } from '../useQuickActionSlots'

const getQuickActions = vi.fn()
const updateQuickActions = vi.fn()

vi.mock('../../api/quickActions', () => ({
  getQuickActions: (...a: unknown[]) => getQuickActions(...a),
  updateQuickActions: (...a: unknown[]) => updateQuickActions(...a),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useQuickActionSlots — load()', () => {
  it('初始值為預設三格（load 前）', () => {
    const { slots, isDefault } = useQuickActionSlots()
    expect(slots.value).toEqual(['pickup', 'proxy', 'announce'])
    expect(isDefault.value).toBe(true)
  })

  it('load 成功：套用後端回傳值', async () => {
    getQuickActions.mockResolvedValue({
      data: { slots: ['bus', 'fees', 'calendar'], is_default: false },
    })
    const { slots, isDefault, load } = useQuickActionSlots()
    await load()
    expect(slots.value).toEqual(['bus', 'fees', 'calendar'])
    expect(isDefault.value).toBe(false)
  })

  it('load 失敗：降級成預設三格，不拋例外', async () => {
    getQuickActions.mockRejectedValue(new Error('boom'))
    const { slots, isDefault, load } = useQuickActionSlots()
    await expect(load()).resolves.toBeUndefined()
    expect(slots.value).toEqual(['pickup', 'proxy', 'announce'])
    expect(isDefault.value).toBe(true)
  })

  it('load 拿到壞資料（格數不對）：resolveQuickActionSlots 退回預設', async () => {
    getQuickActions.mockResolvedValue({ data: { slots: ['pickup'], is_default: false } })
    const { slots, load } = useQuickActionSlots()
    await load()
    expect(slots.value).toEqual(['pickup', 'proxy', 'announce'])
  })
})

describe('useQuickActionSlots — swap()', () => {
  it('成功：本地立即更新，PUT 帶正確 payload', async () => {
    updateQuickActions.mockResolvedValue({ data: {} })
    const { slots, isDefault, swap } = useQuickActionSlots()
    await swap(0, 'bus')
    expect(slots.value).toEqual(['bus', 'proxy', 'announce'])
    expect(isDefault.value).toBe(false)
    expect(updateQuickActions).toHaveBeenCalledWith({ slots: ['bus', 'proxy', 'announce'] })
  })

  it('PUT 失敗：回滾成呼叫前的值，並向外拋錯', async () => {
    updateQuickActions.mockRejectedValue(new Error('boom'))
    const { slots, swap } = useQuickActionSlots()
    await expect(swap(0, 'bus')).rejects.toThrow('boom')
    expect(slots.value).toEqual(['pickup', 'proxy', 'announce'])
  })

  it('目標模組已在其他格：忽略，不呼叫 PUT', async () => {
    const { slots, swap } = useQuickActionSlots()
    await swap(0, 'proxy') // proxy 已在 slot 1
    expect(slots.value).toEqual(['pickup', 'proxy', 'announce'])
    expect(updateQuickActions).not.toHaveBeenCalled()
  })

  it('不存在的模組 key：忽略', async () => {
    const { slots, swap } = useQuickActionSlots()
    await swap(0, 'not-a-module')
    expect(slots.value).toEqual(['pickup', 'proxy', 'announce'])
    expect(updateQuickActions).not.toHaveBeenCalled()
  })

  it('slotIndex 超出範圍：忽略', async () => {
    const { slots, swap } = useQuickActionSlots()
    await swap(3, 'bus')
    await swap(-1, 'bus')
    expect(slots.value).toEqual(['pickup', 'proxy', 'announce'])
    expect(updateQuickActions).not.toHaveBeenCalled()
  })
})

describe('useQuickActionSlots — resetToDefault()', () => {
  it('把三格改回預設並呼叫 PUT', async () => {
    getQuickActions.mockResolvedValue({
      data: { slots: ['bus', 'fees', 'calendar'], is_default: false },
    })
    updateQuickActions.mockResolvedValue({ data: {} })
    const { slots, load, resetToDefault } = useQuickActionSlots()
    await load()
    expect(slots.value).toEqual(['bus', 'fees', 'calendar'])
    await resetToDefault()
    expect(slots.value).toEqual(['pickup', 'proxy', 'announce'])
    expect(updateQuickActions).toHaveBeenCalledWith({ slots: ['pickup', 'proxy', 'announce'] })
  })
})

describe('useQuickActionSlots — availableModules()', () => {
  it('排除目前三格已用的模組', () => {
    const { availableModules } = useQuickActionSlots()
    const keys = availableModules().map((m) => m.key)
    expect(keys).toEqual(expect.arrayContaining(['bus', 'fees', 'sign', 'calendar']))
    expect(keys).not.toEqual(expect.arrayContaining(['pickup', 'proxy', 'announce']))
  })
})
