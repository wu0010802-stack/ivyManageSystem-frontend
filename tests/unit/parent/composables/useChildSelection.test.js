import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useChildSelection } from '@/parent/composables/useChildSelection'

// useChildSelection 內部是 module-level singleton ref。
// 每個 test 用 setSelected(null) 重置；不要 vi.resetModules，因為 localStorage 已被寫進去。
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  const { setSelected } = useChildSelection()
  setSelected(null)
})

describe('useChildSelection', () => {
  it('setSelected 將 id 寫入 selectedId 並同步 localStorage（key v2）', async () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected(42)
    expect(selectedId.value).toBe(42)
    await nextTick()
    expect(localStorage.getItem('parent_selected_student_id_v2')).toBe('42')
  })

  it('setSelected(null) 清空 selectedId 與 localStorage', async () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected(42)
    await nextTick()
    setSelected(null)
    await nextTick()
    expect(selectedId.value).toBe(null)
    expect(localStorage.getItem('parent_selected_student_id_v2')).toBe(null)
  })

  it('v1 sessionStorage 殘留不影響 v2 行為', async () => {
    sessionStorage.setItem('parent_selected_student_id_v1', '999')
    const { selectedId, setSelected } = useChildSelection()
    setSelected(5)
    await nextTick()
    expect(selectedId.value).toBe(5)
    expect(localStorage.getItem('parent_selected_student_id_v2')).toBe('5')
  })

  it('ensureSelected：空 children → null', () => {
    const { ensureSelected, selectedId } = useChildSelection()
    const result = ensureSelected([])
    expect(result).toBe(null)
    expect(selectedId.value).toBe(null)
  })

  it('ensureSelected：未選過 → 預設選第一個', () => {
    const { ensureSelected, selectedId } = useChildSelection()
    const result = ensureSelected([
      { student_id: 1, name: 'A' },
      { student_id: 2, name: 'B' },
    ])
    expect(result).toBe(1)
    expect(selectedId.value).toBe(1)
  })

  it('ensureSelected：已選過且 id 在 children 中 → 保留', () => {
    const { ensureSelected, setSelected, selectedId } = useChildSelection()
    setSelected(2)
    const result = ensureSelected([
      { student_id: 1, name: 'A' },
      { student_id: 2, name: 'B' },
    ])
    expect(result).toBe(2)
    expect(selectedId.value).toBe(2)
  })

  it('ensureSelected：已選的 id 不在 children → 切到第一個', () => {
    const { ensureSelected, setSelected, selectedId } = useChildSelection()
    setSelected(999)
    const result = ensureSelected([
      { student_id: 1, name: 'A' },
      { student_id: 2, name: 'B' },
    ])
    expect(result).toBe(1)
    expect(selectedId.value).toBe(1)
  })

  it('selectedChild：回傳對應 children 的物件', () => {
    const { setSelected, selectedChild } = useChildSelection()
    const children = ref([
      { student_id: 1, name: 'A' },
      { student_id: 2, name: 'B' },
    ])
    setSelected(2)
    const c = selectedChild(children)
    expect(c.value).toEqual({ student_id: 2, name: 'B' })
  })

  it('selectedChild：找不到 → null', () => {
    const { setSelected, selectedChild } = useChildSelection()
    const children = ref([{ student_id: 1, name: 'A' }])
    setSelected(99)
    const c = selectedChild(children)
    expect(c.value).toBe(null)
  })

  it('selectedChild：children 為 null 時也回 null（不炸）', () => {
    const { selectedChild } = useChildSelection()
    const children = ref(null)
    const c = selectedChild(children)
    expect(c.value).toBe(null)
  })

  it('setSelected 字串 id 會被轉成 Number', () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected('7')
    expect(selectedId.value).toBe(7)
  })

  it('localStorage 拋例外時不 crash（private mode fallback）', async () => {
    const origSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('quota') }
    const { selectedId, setSelected } = useChildSelection()
    try {
      setSelected(11)
      await nextTick()
      expect(selectedId.value).toBe(11)
    } finally {
      Storage.prototype.setItem = origSetItem
    }
  })
})
