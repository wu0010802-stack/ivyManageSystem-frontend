import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useChildSelection } from '@/parent/composables/useChildSelection'

// 注意：useChildSelection 內部是 module-level singleton ref
// 每個 test 用 setSelected(null) 重置；不要重新 import（vi.resetModules 也救不回，
// 因為 sessionStorage 已被前一個 test 寫進去）
beforeEach(() => {
  sessionStorage.clear()
  const { setSelected } = useChildSelection()
  setSelected(null)
})

describe('useChildSelection', () => {
  it('setSelected 將 id 寫入 selectedId 並同步 sessionStorage', async () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected(42)
    expect(selectedId.value).toBe(42)
    await nextTick() // watch 是 async；要等微任務跑完
    expect(sessionStorage.getItem('parent_selected_student_id_v1')).toBe('42')
  })

  it('setSelected(null) 清空 selectedId 與 sessionStorage', async () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected(42)
    await nextTick()
    setSelected(null)
    await nextTick()
    expect(selectedId.value).toBe(null)
    expect(sessionStorage.getItem('parent_selected_student_id_v1')).toBe(null)
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
})
