import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/api/academicTerms', () => ({
  listAcademicTerms: vi.fn().mockResolvedValue({
    data: [
      { id: 1, school_year: 115, semester: 1, start_date: '2026-08-30', end_date: '2027-01-31' },
    ],
  }),
  createAcademicTerm: vi.fn().mockResolvedValue({ data: {} }),
  updateAcademicTerm: vi.fn().mockResolvedValue({ data: {} }),
  deleteAcademicTerm: vi.fn().mockResolvedValue({ data: { ok: true } }),
}))

import SettingsAcademicTermsTab from '../SettingsAcademicTermsTab.vue'
import * as api from '@/api/academicTerms'

describe('SettingsAcademicTermsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists academic terms on mount', async () => {
    const wrapper = mount(SettingsAcademicTermsTab, { attachTo: document.body })
    await nextTick()
    await nextTick()
    expect(api.listAcademicTerms).toHaveBeenCalled()
    expect(wrapper.text()).toContain('115')
  })

  it('opens create modal on add button click', async () => {
    const wrapper = mount(SettingsAcademicTermsTab, { attachTo: document.body })
    await nextTick()
    await nextTick()
    await wrapper.find('.add-btn').trigger('click')
    await nextTick()
    expect(wrapper.find('.term-edit-dialog').exists()).toBe(true)
  })

  it('calls createAcademicTerm on form submit', async () => {
    const wrapper = mount(SettingsAcademicTermsTab, { attachTo: document.body })
    await nextTick()
    await nextTick()
    await wrapper.find('.add-btn').trigger('click')
    await nextTick()
    const vm = wrapper.vm as unknown as {
      dialogForm: { school_year: number; semester: number; start_date: string; end_date: string }
    }
    vm.dialogForm = {
      school_year: 116,
      semester: 1,
      start_date: '2027-08-30',
      end_date: '2028-01-31',
    }
    await nextTick()
    await wrapper.find('.confirm-create-btn').trigger('click')
    expect(api.createAcademicTerm).toHaveBeenCalled()
  })

  it('handles 409 duplicate error', async () => {
    ;(api.createAcademicTerm as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      response: { status: 409, data: { detail: '已存在 (116, 1) 的設定' } },
    })
    const wrapper = mount(SettingsAcademicTermsTab, { attachTo: document.body })
    await nextTick()
    await nextTick()
    await wrapper.find('.add-btn').trigger('click')
    await nextTick()
    const vm = wrapper.vm as unknown as {
      dialogForm: { school_year: number; semester: number; start_date: string; end_date: string }
    }
    vm.dialogForm = {
      school_year: 116,
      semester: 1,
      start_date: '2027-08-30',
      end_date: '2028-01-31',
    }
    await nextTick()
    await wrapper.find('.confirm-create-btn').trigger('click')
    await nextTick()
    await nextTick()
    expect(wrapper.exists()).toBe(true) // smoke - component survives error
  })
})
