import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/signDocuments', () => ({
  listSignTemplates: vi.fn(),
  createSignTemplate: vi.fn(),
  updateSignTemplate: vi.fn(),
}))

import {
  listSignTemplates,
  createSignTemplate,
  updateSignTemplate,
} from '@/api/signDocuments'
import TemplateManagementPanel from '../TemplateManagementPanel.vue'

const mockList = listSignTemplates as ReturnType<typeof vi.fn>
const mockCreate = createSignTemplate as ReturnType<typeof vi.fn>
const mockUpdate = updateSignTemplate as ReturnType<typeof vi.fn>

// el-table 內部有 delayed（setTimeout）resize 檢查，元件卸載後才觸發會噴
// querySelector on null 的未捕捉例外（測試斷言仍全過，純噪音）；顯式 unmount
// 讓每個 wrapper 在下一個 test 開始前釋放，避免噪音跨測試洩漏。
let activeWrapper: VueWrapper | null = null

function mountPanel(canWrite = true) {
  activeWrapper = mount(TemplateManagementPanel, {
    props: { canWrite },
    global: { plugins: [ElementPlus] },
  })
  return activeWrapper
}

afterEach(async () => {
  // 讓 el-table 內部 delayed resize timer 在元件仍掛載時觸發完，避免卸載後
  // querySelector on null 炸成未捕捉例外（純計時序問題，見上方註解）。
  await new Promise((resolve) => setTimeout(resolve, 50))
  activeWrapper?.unmount()
  activeWrapper = null
})

const sampleTemplate = {
  id: 1,
  title: '入學契約',
  doc_type: 'contract',
  body_md: '### 標題\n{{student_name}}',
  is_active: true,
  version: 1,
  pending_count: 2,
  signed_count: 3,
}

describe('TemplateManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({ data: [sampleTemplate] })
  })

  it('掛載時載入範本列表', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(mockList).toHaveBeenCalledWith({ include_inactive: false })
    expect(w.text()).toContain('入學契約')
    expect(w.text()).toContain('2') // pending_count
  })

  it('canWrite=false 時不顯示新增按鈕', async () => {
    const w = mountPanel(false)
    await flushPromises()
    const addBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '新增範本')
    expect(addBtn).toBeUndefined()
  })

  it('canWrite=true 時顯示新增按鈕，點擊開啟空白表單', async () => {
    const w = mountPanel(true)
    await flushPromises()
    const addBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '新增範本')
    expect(addBtn).toBeDefined()
    await addBtn!.trigger('click')
    await flushPromises()
    expect(w.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(true)
  })

  it('新增範本：儲存呼叫 createSignTemplate 並帶入表單值', async () => {
    mockCreate.mockResolvedValue({ data: { ...sampleTemplate, id: 2 } })
    const w = mountPanel(true)
    await flushPromises()

    const addBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '新增範本')
    await addBtn!.trigger('click')
    await flushPromises()

    const titleInput = w.findComponent({ name: 'ElDialog' }).findComponent({ name: 'ElInput' })
    await titleInput.setValue('照片授權書')

    const textarea = w
      .findComponent({ name: 'ElDialog' })
      .findAllComponents({ name: 'ElInput' })
      .find((c) => c.props('type') === 'textarea')
    await textarea!.setValue('內容')

    const saveBtn = w
      .findAllComponents({ name: 'ElButton' })
      .find((b) => b.text() === '儲存')
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(mockCreate).toHaveBeenCalledWith({
      title: '照片授權書',
      doc_type: 'contract',
      body_md: '內容',
      is_active: true,
    })
  })

  it('編輯既有範本：儲存呼叫 updateSignTemplate 帶正確 id', async () => {
    mockUpdate.mockResolvedValue({ data: sampleTemplate })
    const w = mountPanel(true)
    await flushPromises()

    const editBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '編輯')
    await editBtn!.trigger('click')
    await flushPromises()

    const saveBtn = w
      .findAllComponents({ name: 'ElButton' })
      .find((b) => b.text() === '儲存')
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(mockUpdate).toHaveBeenCalledWith(1, {
      title: '入學契約',
      doc_type: 'contract',
      body_md: '### 標題\n{{student_name}}',
      is_active: true,
    })
  })

  it('顯示已停用範本勾選變更時重新載入含 include_inactive', async () => {
    const w = mountPanel(true)
    await flushPromises()
    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(mockList).toHaveBeenLastCalledWith({ include_inactive: true })
  })
})
