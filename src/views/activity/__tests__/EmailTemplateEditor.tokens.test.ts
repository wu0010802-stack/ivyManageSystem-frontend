import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ElementPlus from 'element-plus'
import EmailTemplateEditor from '../EmailTemplateEditor.vue'
import { findUnknownTokens, renderEmailPreview } from '../emailTemplateTokens'

describe('emailTemplateTokens', () => {
  it('預覽以範例值替換已知佔位符，未知的原樣保留（與後端純字串替換一致）', () => {
    expect(renderEmailPreview('{student_name} 家長您好 {studnet_name}')).toBe('王小明 家長您好 {studnet_name}')
  })
  it('找出不在允許清單的佔位符', () => {
    expect(findUnknownTokens('{student_name}{studnet_name}{edit_url}', ['student_name', 'edit_url'])).toEqual(['studnet_name'])
  })
})

function mountEditor(subject: string | null, body: string | null) {
  return mount(EmailTemplateEditor, {
    global: { plugins: [ElementPlus] },
    props: {
      title: 't',
      placeholders: ['student_name', 'edit_url'],
      loading: false,
      subjectDefault: '預設主旨 {student_name}',
      bodyDefault: '預設內文',
      emailEnabled: true,
      saving: false,
      savedAt: '',
      testSending: false,
      dataTestPrefix: 'x',
      subject,
      body,
      testEmail: '',
      'onUpdate:subject': () => {},
      'onUpdate:body': () => {},
      'onUpdate:testEmail': () => {},
    },
  })
}

describe('EmailTemplateEditor', () => {
  it('佔位符鈕顯示中文名稱，含後端也支援的園所名稱', () => {
    const w = mountEditor(null, null)
    expect(w.find('[data-test="x-token-student_name"]').text()).toBe('學生姓名')
    expect(w.find('[data-test="x-token-org_name"]').exists()).toBe(true)
  })

  it('未自訂時預覽用預設內容並替換範例值', () => {
    const w = mountEditor(null, null)
    expect(w.find('[data-test="x-preview"]').text()).toContain('預設主旨 王小明')
  })

  it('拼錯的佔位符會警告', () => {
    const w = mountEditor('嗨 {studnet_name}', '內文')
    expect(w.find('[data-test="x-unknown-tokens"]').text()).toContain('{studnet_name}')
  })

  it('點佔位符鈕插入內文（預設插在結尾）', async () => {
    const w = mountEditor('主旨', 'Hello ')
    await w.find('[data-test="x-token-edit_url"]').trigger('click')
    const emitted = w.emitted('update:body') as unknown[][]
    expect(emitted.at(-1)?.[0]).toBe('Hello {edit_url}')
  })

  it('以預設內容為底：一次填入主旨與內文', async () => {
    const w = mountEditor(null, null)
    await w.find('[data-test="x-start-default"]').trigger('click')
    expect((w.emitted('update:subject') as unknown[][]).at(-1)?.[0]).toBe('預設主旨 {student_name}')
    expect((w.emitted('update:body') as unknown[][]).at(-1)?.[0]).toBe('預設內文')
  })
})
