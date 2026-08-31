import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RecruitmentRecordDialog from '../RecruitmentRecordDialog.vue'
import { emptyVisitForm } from '@/constants/recruitment'

vi.setConfig({ testTimeout: 15000 })

// mock 形狀抄真實契約：options.source_categories 來自 GET /recruitment/options
const SOURCE_CATEGORIES = [
  { code: 'sibling_current', label: '在校生弟妹（兄姊老師）', points: 1.0 },
  { code: 'sibling_split', label: '在校兄姊二人均分', points: 0.5 },
  { code: 'self_report', label: '自報生（廣告／鄰居／網路／假日活動）', points: 0.3 },
]
// 真實契約：GET /classrooms/teacher-options（TeacherOptionOut）
const TEACHERS = [{ id: 11, name: '王雅玲', employee_id: 'T001', position: '教師' }]

function mountDialog(form = emptyVisitForm()) {
  return mount(RecruitmentRecordDialog, {
    props: {
      visible: true,
      form,
      sourceCategories: SOURCE_CATEGORIES,
      teacherOptions: TEACHERS,
    },
    global: { stubs: { teleport: true } },
  })
}

describe('RecruitmentRecordDialog 招生獎金欄位', () => {
  it('表單含來源分類與帶參觀老師欄位，原來源欄改標來源備註', () => {
    const wrapper = mountDialog()
    const html = wrapper.html()
    expect(html).toContain('來源分類')
    expect(html).toContain('帶參觀老師')
    expect(html).toContain('來源備註')
  })

  it('form 綁定新欄位（v-model 雙向）', async () => {
    const form = emptyVisitForm()
    const wrapper = mountDialog(form)
    form.source_category = 'self_report'
    form.tour_guide_employee_id = 11
    await wrapper.vm.$nextTick()
    expect(form.source_category).toBe('self_report')
    expect(form.tour_guide_employee_id).toBe(11)
  })

  it('選拆分類（sibling_split）顯示補建第二列提示', async () => {
    const form = emptyVisitForm()
    form.source_category = 'sibling_split'
    const wrapper = mountDialog(form)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('新增歸屬列')
  })
})
