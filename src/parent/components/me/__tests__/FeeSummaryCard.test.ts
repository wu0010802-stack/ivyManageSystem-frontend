/**
 * 繳費中心卡（我的頁）按鈕契約：
 * 原本「查看明細」「繳費紀錄」兩顆按鈕連到同一個 /fees（假選擇），
 * 收斂成單一入口，文字隨狀態（有待繳→查看待繳明細；無→查看繳費紀錄）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeSummaryCard from '../FeeSummaryCard.vue'

const STUBS = { 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } }

describe('FeeSummaryCard', () => {
  it('有待繳時單一入口文字為「查看待繳明細」', () => {
    const w = mount(FeeSummaryCard, {
      props: { outstanding: 16500, overdue: 16500 },
      global: { stubs: STUBS },
    })
    const links = w.findAll('a')
    expect(links.length).toBe(1)
    expect(links[0].text()).toContain('查看待繳明細')
  })

  it('無待繳時單一入口文字為「查看繳費紀錄」', () => {
    const w = mount(FeeSummaryCard, {
      props: { outstanding: 0, overdue: 0 },
      global: { stubs: STUBS },
    })
    const links = w.findAll('a')
    expect(links.length).toBe(1)
    expect(links[0].text()).toContain('查看繳費紀錄')
    expect(w.text()).toContain('目前無待繳費用')
  })
})
