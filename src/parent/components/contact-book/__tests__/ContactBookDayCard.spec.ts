// src/parent/components/contact-book/__tests__/ContactBookDayCard.spec.ts
//
// 今日卡三態：full（老師已填）/ awaiting（上學日尚未填）/ offday（假日或請假）。
// 三態共用同一張卡的骨架，避免首頁 hero 在不同日子之間視覺跳動。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactBookDayCard from '../ContactBookDayCard.vue'
import type { ContactBookEntry } from '../../../api/contactBook'

const fullEntry = {
  id: 1,
  log_date: '2026-08-10',
  mood: 'happy',
  meal_lunch: 3,
  nap_minutes: 90,
  temperature_c: 36.5,
  teacher_note: '今天小明主動幫忙收玩具',
  photos: [{ id: 1, display_url: 'a.jpg' }],
  isRead: true,
} as unknown as ContactBookEntry

describe('ContactBookDayCard', () => {
  describe('full 態（老師已填寫）', () => {
    it('渲染量化 chip、老師留言與照片', () => {
      const w = mount(ContactBookDayCard, {
        props: { entry: fullEntry, studentName: '小明', classroomName: '中班' },
      })
      expect(w.text()).toContain('小明')
      expect(w.text()).toContain('中班')
      expect(w.text()).toContain('午餐')
      expect(w.text()).toContain('午睡')
      expect(w.text()).toContain('今天小明主動幫忙收玩具')
      expect(w.findAll('.stat').length).toBeGreaterThan(0)
      expect(w.find('.photos-row').exists()).toBe(true)
    })

    it('statusLabel 有值時渲染出席狀態 pill', () => {
      const w = mount(ContactBookDayCard, {
        props: {
          entry: fullEntry,
          studentName: '小明',
          statusLabel: '已離園',
          statusTone: 'ok',
        },
      })
      expect(w.find('.status-pill').exists()).toBe(true)
      expect(w.text()).toContain('已離園')
    })

    it('無 statusLabel 不渲染 pill', () => {
      const w = mount(ContactBookDayCard, {
        props: { entry: fullEntry, studentName: '小明' },
      })
      expect(w.find('.status-pill').exists()).toBe(false)
    })
  })

  describe('awaiting 態（上學日、老師尚未填寫）', () => {
    it('不渲染量化 chip 與留言，改顯示記錄中提示', () => {
      const w = mount(ContactBookDayCard, {
        props: {
          variant: 'awaiting',
          studentName: '小明',
          classroomName: '中班',
          dateLine: '8 月 10 日　星期一',
        },
      })
      expect(w.findAll('.stat').length).toBe(0)
      expect(w.find('.note').exists()).toBe(false)
      expect(w.find('.photos-row').exists()).toBe(false)
      expect(w.text()).toContain('老師正在記錄今天的點滴')
    })

    it('仍顯示孩子姓名、班級、日期與出席狀態', () => {
      const w = mount(ContactBookDayCard, {
        props: {
          variant: 'awaiting',
          studentName: '小明',
          classroomName: '中班',
          dateLine: '8 月 10 日　星期一',
          statusLabel: '在園中',
          statusTone: 'ok',
        },
      })
      expect(w.text()).toContain('小明')
      expect(w.text()).toContain('中班')
      expect(w.text()).toContain('8 月 10 日')
      expect(w.text()).toContain('在園中')
    })

    it('無 entry 時不因存取 entry 欄位而爆錯', () => {
      expect(() =>
        mount(ContactBookDayCard, {
          props: { variant: 'awaiting', studentName: '小明' },
        }),
      ).not.toThrow()
    })
  })

  describe('offday 態（假日或請假）', () => {
    it('顯示休息文案且不顯示量化 chip', () => {
      const w = mount(ContactBookDayCard, {
        props: {
          variant: 'offday',
          studentName: '小明',
          dateLine: '8 月 9 日　星期日',
          statusLabel: '今天放假',
          statusTone: 'neutral',
        },
      })
      expect(w.findAll('.stat').length).toBe(0)
      expect(w.text()).toContain('今天放假')
      expect(w.text()).toContain('好好休息')
    })

    it('父層可用 hint 覆寫預設文案（例如請假中）', () => {
      const w = mount(ContactBookDayCard, {
        props: {
          variant: 'offday',
          studentName: '小明',
          statusLabel: '請假',
          statusTone: 'info',
          hint: '今天請假，祝早日康復',
        },
      })
      expect(w.text()).toContain('今天請假，祝早日康復')
      expect(w.text()).not.toContain('好好休息')
    })
  })
})
