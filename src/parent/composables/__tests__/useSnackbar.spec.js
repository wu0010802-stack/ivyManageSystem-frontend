import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSnackbar } from '../useSnackbar'

describe('useSnackbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('show() 新增一筆到 entries', () => {
    const { show, snackbars } = useSnackbar()
    show({ message: '已儲存' })
    expect(snackbars.value).toHaveLength(1)
    expect(snackbars.value[0].message).toBe('已儲存')
  })

  it('id 唯一遞增', () => {
    const { show, snackbars } = useSnackbar()
    show({ message: 'a' })
    show({ message: 'b' })
    expect(snackbars.value[0].id).not.toBe(snackbars.value[1].id)
  })

  it('預設 duration = 4000ms', () => {
    const { show, snackbars } = useSnackbar()
    show({ message: 'x' })
    expect(snackbars.value[0].duration).toBe(4000)
  })

  it('dismiss(id) 移除對應 entry', () => {
    const { show, dismiss, snackbars } = useSnackbar()
    show({ message: 'a' })
    show({ message: 'b' })
    const id0 = snackbars.value[0].id
    dismiss(id0)
    expect(snackbars.value).toHaveLength(1)
    expect(snackbars.value[0].message).toBe('b')
  })

  it('action 可包 label + onClick', () => {
    const { show, snackbars } = useSnackbar()
    const onClick = vi.fn()
    show({ message: 'x', action: { label: 'undo', onClick } })
    expect(snackbars.value[0].action.label).toBe('undo')
    snackbars.value[0].action.onClick()
    expect(onClick).toHaveBeenCalled()
  })
})
