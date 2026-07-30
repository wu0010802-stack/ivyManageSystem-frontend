import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn().mockResolvedValue({ data: [{ id: 1, name: '小班' }] }),
}))

import { useAllClassroomStore } from '../classroomAll'
import { useClassroomStore } from '../classroom'
import { getClassrooms } from '@/api/classrooms'

describe('classroomAll store — 跨學期班級清單', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // 這是整包修復的關鍵：後端預設 current_only=true 只回當期班級，
  // 對照既有資料的畫面一定要明確關掉才拿得到跨學年的班。
  it('抓取時帶 current_only=false', async () => {
    const store = useAllClassroomStore()
    await store.fetchClassrooms()
    expect(getClassrooms).toHaveBeenCalledWith({ current_only: false })
    expect(store.classrooms).toEqual([{ id: 1, name: '小班' }])
  })

  it('與當期 classroomStore 是各自獨立的快取，不互相污染', async () => {
    const all = useAllClassroomStore()
    const current = useClassroomStore()
    await all.fetchClassrooms()
    expect(current.classrooms).toEqual([])
    expect(getClassrooms).toHaveBeenCalledTimes(1)
  })

  it('當期 classroomStore 仍舊不帶參數（維持只回當期的既有語意）', async () => {
    const current = useClassroomStore()
    await current.fetchClassrooms()
    expect(getClassrooms).toHaveBeenCalledWith()
  })
})
