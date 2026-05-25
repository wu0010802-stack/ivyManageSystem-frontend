import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AnnouncementDetailModal from '@/parent/components/announcements/AnnouncementDetailModal.vue'

const stubs = { AppModal: { template: '<div data-testid="app-modal" v-if="open"><slot /></div>', props: ['open', 'labelledBy'] }, ParentIcon: true }

const SAMPLE = {
  id: 1,
  priority: 'important',
  is_read: false,
  created_at: '2026-05-21T08:30:00',
  title: '運動會通知',
  content: '本週六舉行家庭運動會，請穿運動服。',
}

describe('AnnouncementDetailModal', () => {
  it('modelValue=false 不渲染內容', () => {
    const w = mount(AnnouncementDetailModal, {
      props: { modelValue: false, announcement: SAMPLE },
      global: { stubs },
    })
    expect(w.find('[data-testid="app-modal"]').exists()).toBe(false)
  })

  it('modelValue=true 顯示 title / content / priority chip / time', () => {
    const w = mount(AnnouncementDetailModal, {
      props: { modelValue: true, announcement: SAMPLE },
      global: { stubs },
    })
    expect(w.text()).toContain('運動會通知')
    expect(w.text()).toContain('家庭運動會')
    expect(w.text()).toContain('重要')
    expect(w.text()).toContain('2026-05-21 08:30')
  })

  it('priority 未知值 fallback 為原字串 + info tone', () => {
    const w = mount(AnnouncementDetailModal, {
      props: { modelValue: true, announcement: { ...SAMPLE, priority: 'oddvalue' } },
      global: { stubs },
    })
    expect(w.text()).toContain('oddvalue')
    const pill = w.find('.pt-pill')
    expect(pill.classes()).toContain('pt-pill-info')
  })

  it('announcement=null 即使 open=true 也不爆炸（無 detail 區）', () => {
    const w = mount(AnnouncementDetailModal, {
      props: { modelValue: true, announcement: null },
      global: { stubs },
    })
    expect(w.find('.detail-title').exists()).toBe(false)
  })

  it('close 按鈕 emit update:modelValue false', async () => {
    const w = mount(AnnouncementDetailModal, {
      props: { modelValue: true, announcement: SAMPLE },
      global: { stubs },
    })
    await w.find('.close').trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toBe(false)
  })

  it('三種 priority 各有對應中文 label', () => {
    const cases = [
      ['normal', '一般'],
      ['important', '重要'],
      ['urgent', '緊急'],
    ]
    for (const [p, label] of cases) {
      const w = mount(AnnouncementDetailModal, {
        props: { modelValue: true, announcement: { ...SAMPLE, priority: p } },
        global: { stubs },
      })
      expect(w.text(), `priority ${p}`).toContain(label)
    }
  })
})
