import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ElDescriptions, ElDescriptionsItem } from 'element-plus'
import BasicSection from '@/components/employee/detail/BasicSection.vue'

const mountWith = (employee: Record<string, unknown>) =>
  mount(BasicSection, {
    props: { employee },
    global: {
      components: { ElDescriptions, ElDescriptionsItem },
    },
  })

describe('BasicSection 顯示規範', () => {
  // 自舊 EmployeeView.test.js「詳情渲染生日值」斷言承接（render 語意），順手鎖 phone/email
  it('渲染員工生日 / 電話 / Email 值', () => {
    const w = mountWith({ birthday: '1990-03-15', phone: '0912-345-678', email: 'a@b.c' })
    expect(w.text()).toContain('1990-03-15')
    expect(w.text()).toContain('0912-345-678')
    expect(w.text()).toContain('a@b.c')
  })

  it('空 employee → 各欄 fallback 顯示 —', () => {
    const w = mountWith({})
    // BasicSection 共 9 個欄位（聯絡電話/生日/身分證/眷屬人數/Email/性別/通訊地址/緊急聯絡人/緊急聯絡電話），
    // 全空時每欄各 fallback 一個「—」；labels 不含「—」故計數即欄位數
    expect((w.text().match(/—/g) || []).length).toBe(9)
    expect(w.text()).toContain('生日')
    expect(w.text()).not.toContain('undefined')
    expect(w.text()).not.toContain('null')
  })
})
