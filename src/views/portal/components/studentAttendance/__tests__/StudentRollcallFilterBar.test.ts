import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ElementPlus from 'element-plus'
import StudentRollcallFilterBar from '../StudentRollcallFilterBar.vue'

/**
 * 點名狀態列（2026-09-14 UI/UX 審查 P1）。
 *
 * 改版前「還有幾人沒點」只藏在批次按鈕的括號裡（「未點名者出席（27 人）」），
 * 而且點不了——老師無法只看還沒點的人。這排 chip 同時是統計與篩選。
 */

const SUMMARY = { total: 27, unmarked: 3, present: 21, absent: 1, leave: 2, late: 0 }

function mountBar(props = {}) {
  return mount(StudentRollcallFilterBar, {
    props: { summary: SUMMARY, modelValue: 'all', search: '', ...props },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

describe('狀態統計 chip', () => {
  it('六類各自帶出人數', () => {
    const w = mountBar()
    try {
      const labels = w.findAll('.filter-chip').map((c) => c.text().replace(/\s+/g, ''))
      expect(labels).toEqual(['全部27', '未點3', '出席21', '缺席1', '請假2', '遲到0'])
    } finally {
      w.unmount()
    }
  })

  it('數字為 0 的類別仍然顯示，讓老師知道是 0 而不是消失了', () => {
    const w = mountBar()
    try {
      expect(w.text()).toContain('遲到')
      expect(w.text()).toContain('0')
    } finally {
      w.unmount()
    }
  })

  it('目前選中的 chip 標記 is-active', () => {
    const w = mountBar({ modelValue: 'unmarked' })
    try {
      const active = w.findAll('.filter-chip').filter((c) => c.classes().includes('is-active'))
      expect(active).toHaveLength(1)
      expect(active[0].text()).toContain('未點')
    } finally {
      w.unmount()
    }
  })

  it('還有人沒點時「未點」chip 要看得出是待辦', () => {
    const w = mountBar()
    try {
      const chip = w.findAll('.filter-chip').find((c) => c.text().includes('未點'))
      expect(chip!.classes()).toContain('is-pending')
    } finally {
      w.unmount()
    }
  })

  it('全部點完後「未點」chip 不再標成待辦', () => {
    const w = mountBar({ summary: { ...SUMMARY, unmarked: 0 } })
    try {
      const chip = w.findAll('.filter-chip').find((c) => c.text().includes('未點'))
      expect(chip!.classes()).not.toContain('is-pending')
    } finally {
      w.unmount()
    }
  })
})

describe('篩選', () => {
  it('點「未點」送出 unmarked', async () => {
    const w = mountBar()
    try {
      const chip = w.findAll('.filter-chip').find((c) => c.text().includes('未點'))
      await chip!.trigger('click')
      expect(w.emitted('update:modelValue')![0]).toEqual(['unmarked'])
    } finally {
      w.unmount()
    }
  })

  it('點「請假」送出 leave，病假事假一起看', async () => {
    const w = mountBar()
    try {
      const chip = w.findAll('.filter-chip').find((c) => c.text().includes('請假'))
      await chip!.trigger('click')
      expect(w.emitted('update:modelValue')![0]).toEqual(['leave'])
    } finally {
      w.unmount()
    }
  })

  it('再點一次已選中的 chip 回到全部，不會卡在篩選裡', async () => {
    const w = mountBar({ modelValue: 'unmarked' })
    try {
      const chip = w.findAll('.filter-chip').find((c) => c.text().includes('未點'))
      await chip!.trigger('click')
      expect(w.emitted('update:modelValue')![0]).toEqual(['all'])
    } finally {
      w.unmount()
    }
  })
})

describe('搜尋姓名', () => {
  it('輸入姓名時往外送', async () => {
    const w = mountBar()
    try {
      await w.find('input').setValue('小明')
      expect(w.emitted('update:search')!.at(-1)).toEqual(['小明'])
    } finally {
      w.unmount()
    }
  })
})

describe('停用', () => {
  it('儲存中整排不可操作', () => {
    const w = mountBar({ disabled: true })
    try {
      expect(w.findAll('.filter-chip[disabled]')).toHaveLength(6)
    } finally {
      w.unmount()
    }
  })
})
