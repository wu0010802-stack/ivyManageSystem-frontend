import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'
import { emptyVisitForm } from '@/constants/recruitment'

describe('RecruitmentRecordDialog 入學學期', () => {
  it('渲染入學學期選擇器並綁定 form', () => {
    const wrapper = mount(RecruitmentRecordDialog, {
      props: { visible: true, mode: 'add', form: emptyVisitForm() },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.html()).toContain('入學學期')
  })
})
