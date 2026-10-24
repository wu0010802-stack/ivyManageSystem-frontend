import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ChildContextHeader from '../ChildContextHeader.vue'
import { useChildrenStore } from '../../stores/children'
import { useChildSelection } from '../../composables/useChildSelection'

/**
 * 版面契約：單一根節點（父層 class 可 fallthrough、不噴 extraneous attrs warn），
 * 預設自帶 16px 水平留白（舊版 padding:0 讓頭像貼齊螢幕左緣），容器已有 padding-inline
 * 的頁面以 :inset="false" 關掉，避免雙重留白。
 */
const stubs = {
  ParentBottomSheet: {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue" class="bsheet-stub"><slot /></div>',
  },
}

function seed(items: Array<{ student_id: number; name: string }>): void {
  const store = useChildrenStore()
  store.items = items as never
  store.loaded = true
  useChildSelection().setSelected(items[0]?.student_id ?? null)
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('ChildContextHeader 版面', () => {
  it.each([
    ['單孩', [{ student_id: 1, name: '小明' }]],
    ['多寶', [{ student_id: 1, name: '小明' }, { student_id: 2, name: '小華' }]],
  ])('%s：單一根節點，父層 class 會落在根上且不噴 Vue warn', (_label, items) => {
    seed(items)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = mount(ChildContextHeader, { attrs: { class: 'from-parent' }, global: { stubs } })
    expect(w.element.classList.contains('from-parent')).toBe(true)
    expect(w.element.classList.contains('cch-root')).toBe(true)
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/Extraneous non-props attributes/)
    warn.mockRestore()
  })

  it('預設自帶水平留白（cch-root--inset）', () => {
    seed([{ student_id: 1, name: '小明' }])
    const w = mount(ChildContextHeader, { global: { stubs } })
    expect(w.classes()).toContain('cch-root--inset')
  })

  it(':inset="false" 時不加留白', () => {
    seed([{ student_id: 1, name: '小明' }])
    const w = mount(ChildContextHeader, { props: { inset: false }, global: { stubs } })
    expect(w.classes()).not.toContain('cch-root--inset')
  })

  it('留白值 16px（--space-4），且元件本體不再 padding:0 貼邊', () => {
    const raw = readFileSync(resolve(__dirname, '../ChildContextHeader.vue'), 'utf-8')
    const css = raw.slice(raw.indexOf('<style')).replace(/\s+/g, ' ')
    expect(css).toMatch(/\.cch-root--inset \{ padding-inline: var\(--space-4, 16px\); \}/)
  })
})

describe('使用頁不雙重留白', () => {
  const read = (view: string): string =>
    readFileSync(resolve(__dirname, `../../views/${view}.vue`), 'utf-8')

  it.each(['FeesView', 'LeavesView', 'PickupView', 'ActivityView'])(
    '%s 容器已有 padding-inline → header 傳 :inset="false"',
    (view) => {
      const src = read(view)
      expect(src).toMatch(/padding-inline:\s*var\(--space-4/)
      expect(src).toMatch(/<ChildContextHeader[^>]*:inset="false"/)
    },
  )

  it.each(['ContactBookView', 'AttendanceView', 'MedicationListView', 'ChildHubView'])(
    '%s 容器不給左右 padding → header 用預設留白',
    (view) => {
      const src = read(view)
      expect(src).toMatch(/<ChildContextHeader(?![^>]*:inset="false")[^>]*\/>/)
    },
  )
})
