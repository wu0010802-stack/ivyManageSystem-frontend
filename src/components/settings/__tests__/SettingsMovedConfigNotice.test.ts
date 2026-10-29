/**
 * 「分校設定」搬家說明（後台 IA 重整 S5）：每項設定指到新位置，進不去目標頁就只顯示文字不給連結。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

import SettingsMovedConfigNotice from '../SettingsMovedConfigNotice.vue'
import { setUserInfo } from '@/utils/auth'

const RouterLinkStub = {
  props: ['to'],
  template: '<a class="rl" :href="to"><slot /></a>',
}

function mountNotice(perms: string[]) {
  setUserInfo({ role: 'admin', permission_names: perms })
  return mount(SettingsMovedConfigNotice, {
    global: { plugins: [ElementPlus], stubs: { 'router-link': RouterLinkStub } },
  })
}

const link = (w: ReturnType<typeof mountNotice>, key: string) =>
  w.find(`[data-test="moved-${key}"] a.rl`)

describe('SettingsMovedConfigNotice', () => {
  beforeEach(() => setUserInfo(null))

  it('wildcard：五項都有連結，指到新位置（含頁籤 query）', () => {
    const w = mountNotice(['*'])
    expect(link(w, 'bus').attributes('href')).toBe('/bus/settings')
    expect(link(w, 'attendance').attributes('href')).toBe('/attendance')
    expect(link(w, 'gov').attributes('href')).toBe('/admin/gov-reports/monthly')
    expect(link(w, 'pos').attributes('href')).toBe('/activity/settings?tab=cash')
    expect(link(w, 'salary').attributes('href')).toBe('/salary/settings?tab=rule_switches')
  })

  it('只持 SETTINGS_READ：進不去目標頁，不給連結但仍列出新位置文字', () => {
    const w = mountNotice(['SETTINGS_READ'])
    expect(w.findAll('a.rl')).toHaveLength(0)
    expect(w.find('[data-test="moved-salary"]').text()).toContain('薪資設定 › 計算規則開關')
    expect(w.find('[data-test="moved-attendance"]').text()).toContain('出勤核對頁首「打卡設定」')
  })

  it('政府申報：只持 GOV_REPORTS_EXPORT 時連結改指 /gov-reports（申報單位設定在每個頁籤列都有）', () => {
    const w = mountNotice(['GOV_REPORTS_EXPORT'])
    expect(link(w, 'gov').attributes('href')).toBe('/gov-reports')
    expect(w.findAll('a.rl')).toHaveLength(1)
  })

  it('各項只依各自目標頁的權限給連結', () => {
    const w = mountNotice(['SALARY_READ', 'ATTENDANCE_READ'])
    expect(link(w, 'salary').exists()).toBe(true)
    expect(link(w, 'attendance').exists()).toBe(true)
    expect(link(w, 'bus').exists()).toBe(false)
    expect(link(w, 'pos').exists()).toBe(false)
    expect(link(w, 'gov').exists()).toBe(false)
  })
})
