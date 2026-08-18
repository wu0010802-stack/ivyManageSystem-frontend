// src/components/__tests__/GlobalSearch.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import GlobalSearch from '../GlobalSearch.vue'
import * as searchApi from '@/api/search'

const push = vi.fn()
const mockRoutes: Array<{ path: string; meta?: { title?: string } }> = []
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, getRoutes: () => mockRoutes }),
}))
vi.mock('@/utils/auth', () => ({ canAccessRoute: () => true }))
vi.mock('@/utils/highlight', () => ({ highlight: (s: string) => s }))
vi.mock('@/api/search')

const mountOpts = () => ({
  global: { stubs: { teleport: true } },
  attachTo: document.body,
})

const emptyData = {
  q: '', students: [], employees: [], guardians: [], classrooms: [],
  fees: [], activity_registrations: [], recruitment: [], announcements: [],
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    push.mockClear()
    mockRoutes.length = 0
    // NOTE: do NOT call mockReset here - it breaks the component's live binding
    // in subsequent tests. Instead set implementation fresh per test.
    vi.mocked(searchApi.globalSearch).mockResolvedValue({ data: emptyData } as never)
  })

  it('短於 2 字不呼叫 API', async () => {
    const wrapper = mount(GlobalSearch, mountOpts())
    ;(wrapper.vm as any).open()
    await nextTick()
    await wrapper.find('input').setValue('a')
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    expect(searchApi.globalSearch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('≥ 2 字呼叫 API 並渲染學生區塊 + 點擊跳檔案頁', async () => {
    vi.mocked(searchApi.globalSearch).mockResolvedValue({
      data: {
        ...emptyData,
        q: '王小',
        students: [{ id: 7, name: '王小明', student_id: 'S1', classroom_name: 'A班' }],
      },
    } as never)
    const wrapper = mount(GlobalSearch, mountOpts())
    ;(wrapper.vm as any).open()
    await nextTick()
    // 注意：單一 CJK 字 len==1，會被 ≥2 字門檻擋掉，用 2 字才會打 API
    await wrapper.find('input').setValue('王小')
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    expect(searchApi.globalSearch).toHaveBeenCalledWith('王小')
    expect(wrapper.text()).toContain('王小明')
    await nextTick()
    await wrapper.find('.gs-item').trigger('click')
    expect(push).toHaveBeenCalledWith('/students/profile/7')
    wrapper.unmount()
  })

  it('員工結果點擊直達員工詳情頁（非清單頁帶 search）', async () => {
    vi.mocked(searchApi.globalSearch).mockResolvedValue({
      data: {
        ...emptyData,
        q: '王老',
        employees: [{ id: 3, name: '王老師', employee_id: 'E1', title: '導師' }],
      },
    } as never)
    const wrapper = mount(GlobalSearch, mountOpts())
    ;(wrapper.vm as any).open()
    await nextTick()
    await wrapper.find('input').setValue('王老')
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    await nextTick()
    await wrapper.find('.gs-item').trigger('click')
    expect(push).toHaveBeenCalledWith('/employees/3')
    wrapper.unmount()
  })

  it('班級結果點擊帶 selected 深連結開啟該班抽屜', async () => {
    vi.mocked(searchApi.globalSearch).mockResolvedValue({
      data: {
        ...emptyData,
        q: '蘋果',
        classrooms: [{ id: 5, name: '蘋果班', school_year: 114, semester: 1 }],
      },
    } as never)
    const wrapper = mount(GlobalSearch, mountOpts())
    ;(wrapper.vm as any).open()
    await nextTick()
    await wrapper.find('input').setValue('蘋果')
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    await nextTick()
    await wrapper.find('.gs-item').trigger('click')
    expect(push).toHaveBeenCalledWith({ path: '/classrooms', query: { selected: '5' } })
    wrapper.unmount()
  })

  describe('頁面標題同義詞', () => {
    it('查「薪水」可命中標題含「薪資」的頁面', async () => {
      mockRoutes.push({ path: '/salary', meta: { title: '薪資管理' } })
      const wrapper = mount(GlobalSearch, mountOpts())
      ;(wrapper.vm as any).open()
      await nextTick()
      await wrapper.find('input').setValue('薪水')
      await new Promise(r => setTimeout(r, 350))
      await flushPromises()
      await nextTick()
      expect(wrapper.text()).toContain('薪資管理')
      wrapper.unmount()
    })

    it('無同義詞時仍走原本標題包含比對', async () => {
      mockRoutes.push({ path: '/salary', meta: { title: '薪資管理' } })
      const wrapper = mount(GlobalSearch, mountOpts())
      ;(wrapper.vm as any).open()
      await nextTick()
      await wrapper.find('input').setValue('不存在詞')
      await new Promise(r => setTimeout(r, 350))
      await flushPromises()
      await nextTick()
      expect(wrapper.text()).not.toContain('薪資管理')
      wrapper.unmount()
    })
  })

  describe('UX：最近搜尋 / 常用頁面 / skeleton', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('空 query 顯示常用頁面快捷（權限內），點擊導航並關閉', async () => {
      const wrapper = mount(GlobalSearch, mountOpts())
      ;(wrapper.vm as any).open()
      await nextTick()
      expect(wrapper.text()).toContain('常用頁面')
      const opts = wrapper.findAll('[role="option"]')
      expect(opts.length).toBeGreaterThan(0)
      await opts[0].trigger('click')
      expect(push).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('選擇結果後記錄最近搜尋；重開顯示且點擊回填 query 重新搜尋', async () => {
      vi.mocked(searchApi.globalSearch).mockResolvedValue({
        data: {
          ...emptyData,
          q: '王小',
          students: [{ id: 7, name: '王小明', student_id: 'S1', classroom_name: 'A班' }],
        },
      } as never)
      const wrapper = mount(GlobalSearch, mountOpts())
      ;(wrapper.vm as any).open()
      await nextTick()
      await wrapper.find('input').setValue('王小')
      await new Promise(r => setTimeout(r, 350))
      await flushPromises()
      await nextTick()
      await wrapper.find('.gs-item').trigger('click')

      // 重開：最近搜尋出現在空 query 狀態
      ;(wrapper.vm as any).open()
      await nextTick()
      expect(wrapper.text()).toContain('最近搜尋')
      expect(wrapper.text()).toContain('王小')

      // 點最近搜尋 → 回填 query → debounce 後重打 API
      vi.mocked(searchApi.globalSearch).mockClear()
      await wrapper.find('.gs-item').trigger('click')
      await new Promise(r => setTimeout(r, 350))
      await flushPromises()
      expect(searchApi.globalSearch).toHaveBeenCalledWith('王小')
      wrapper.unmount()
    })

    it('清除最近搜尋後空狀態不再顯示', async () => {
      localStorage.setItem('gs_recent_searches_v1', JSON.stringify(['王小明']))
      const wrapper = mount(GlobalSearch, mountOpts())
      ;(wrapper.vm as any).open()
      await nextTick()
      expect(wrapper.text()).toContain('最近搜尋')
      await wrapper.find('.gs-clear-btn').trigger('click')
      await nextTick()
      expect(wrapper.text()).not.toContain('最近搜尋')
      expect(localStorage.getItem('gs_recent_searches_v1')).toBeNull()
      wrapper.unmount()
    })

    it('API 載入中顯示 skeleton', async () => {
      vi.mocked(searchApi.globalSearch).mockReturnValue(new Promise(() => {}) as never)
      const wrapper = mount(GlobalSearch, mountOpts())
      ;(wrapper.vm as any).open()
      await nextTick()
      await wrapper.find('input').setValue('王小')
      await new Promise(r => setTimeout(r, 350))
      await nextTick()
      expect(wrapper.find('.gs-skel-row').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  describe('combobox ARIA 契約', () => {
    /**
     * 為什麼要測：這個元件是「焦點留在 input、方向鍵移動 highlight」的 combobox，
     * 選項本身沒有 tabindex（加了會讓 Tab 逐筆走過結果、破壞方向鍵導航）。
     * 螢幕閱讀器唯一能知道「現在停在哪一筆」的途徑就是 aria-activedescendant
     * 指到正確的 option id —— 這個對應一旦錯位，視覺上完全看不出來。
     *
     * 刻意跨兩個區塊各放資料：flatIndex 是**全域連續**編號，若哪天改成每個
     * 區塊各自從 0 編，單一區塊的測試會照樣綠，但 id 會在第二個區塊開始撞號。
     */
    const twoSectionData = {
      ...emptyData,
      q: '王',
      students: [
        { id: 7, name: '王小明', student_id: 'S1', classroom_name: 'A班' },
        { id: 8, name: '王小華', student_id: 'S2', classroom_name: 'B班' },
      ],
      employees: [{ id: 3, name: '王老師', employee_id: 'E1', title: '導師' }],
    }

    const openWithResults = async () => {
      vi.mocked(searchApi.globalSearch).mockResolvedValue({ data: twoSectionData } as never)
      const wrapper = mount(GlobalSearch, mountOpts())
      ;(wrapper.vm as any).open()
      await nextTick()
      await wrapper.find('input').setValue('王小')
      await new Promise(r => setTimeout(r, 350))
      await flushPromises()
      await nextTick()
      return wrapper
    }

    it('結果容器是 listbox，每筆是 option，id 跨區塊連續不撞號', async () => {
      const wrapper = await openWithResults()

      expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
      const options = wrapper.findAll('[role="option"]')
      expect(options).toHaveLength(3)

      // 2 個學生 + 1 個員工 → id 必須是 0,1,2 而不是 0,1,0
      expect(options.map(o => o.attributes('id'))).toEqual([
        'gs-opt-0', 'gs-opt-1', 'gs-opt-2',
      ])
      // input 必須宣告自己控制這個 listbox
      expect(wrapper.find('input').attributes('role')).toBe('combobox')
      expect(wrapper.find('input').attributes('aria-controls')).toBe('gs-listbox')
      expect(wrapper.find('[role="listbox"]').attributes('id')).toBe('gs-listbox')

      wrapper.unmount()
    })

    it('尚未選取時不宣告 activedescendant，方向鍵後指向對應的 option', async () => {
      const wrapper = await openWithResults()
      const input = wrapper.find('input')
      const modal = wrapper.find('.gs-modal')

      // activeIndex = -1：不能指向任何 option，否則 AT 會唸出一個沒 highlight 的項目
      expect(input.attributes('aria-activedescendant')).toBeUndefined()
      expect(wrapper.findAll('[aria-selected="true"]')).toHaveLength(0)

      await modal.trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      expect(input.attributes('aria-activedescendant')).toBe('gs-opt-0')

      // 走到第三筆（跨到員工區塊）——aria-selected 必須跟著移動且只有一個
      await modal.trigger('keydown', { key: 'ArrowDown' })
      await modal.trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      expect(input.attributes('aria-activedescendant')).toBe('gs-opt-2')

      const selected = wrapper.findAll('[aria-selected="true"]')
      expect(selected).toHaveLength(1)
      expect(selected[0].attributes('id')).toBe('gs-opt-2')

      wrapper.unmount()
    })
  })
})
