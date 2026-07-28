/**
 * 聯絡簿「套用範本到全班」是死路：整個前端沒有任何建立範本的入口（bug-hunt 2026-07-27）。
 *
 * 後端 api/portal/contact_book_templates.py 五個端點（list/create/update/archive/promote）
 * 齊全且都有 response_model，前端 api client 與 composable 也都包好了——但
 * create / update / archive / promote 四支**runtime 零 caller**，唯一的 consumer
 * PortalContactBookView 只用了 load / templates。
 *
 * 於是老師點「套用範本到全班」永遠看到空清單，加上一句
 * 「可先到管理介面建立個人或園所共用範本」——而全 repo 根本沒有這個管理介面，
 * DB 也沒有 seed 範本，只能直接打 API 才建得出來。
 *
 * 個人範本其實只需要 PORTFOLIO_WRITE，本來就該由老師自己在教師端建立。
 * 最自然的入口是聯絡簿抽屜：它的 form 與後端 TemplateFields 完全同構，
 * buildPayload() 產出的正是 fields 需要的形狀，而且不依賴 entry.id
 * （尚未存成草稿也能存為範本）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

import ContactBookEntryDrawer from '@/views/portal/components/contactBook/ContactBookEntryDrawer.vue'

describe('聯絡簿抽屜的「存為範本」入口', () => {
  function mountDrawer(entry: Record<string, unknown> | null = null) {
    return mount(ContactBookEntryDrawer, {
      // 不可 stub teleport：stub 後 el-drawer 內容整個不渲染（<teleport-stub> 為空）。
      // 改為讓它自然 teleport 到 document.body，再從 document 查詢。
      global: { plugins: [ElementPlus] },
      props: {
        modelValue: true,
        entry,
        studentName: '王小明',
        saving: false,
        publishing: false,
        photoUploading: false,
      },
      attachTo: document.body,
    })
  }

  function findButton(wrapper: ReturnType<typeof mountDrawer>, text: string) {
    return Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(text),
    )
  }

  it('抽屜要有「存為範本」按鈕', () => {
    const wrapper = mountDrawer()

    expect(findButton(wrapper, '存為範本')).toBeTruthy()
  })

  it('按下後帶出目前欄位內容，形狀與後端 TemplateFields 一致', async () => {
    const wrapper = mountDrawer({
      id: 1,
      version: 2,
      mood: 'happy',
      meal_lunch: 3,
      nap_minutes: 90,
      teacher_note: '今天很專注',
    })
    await flushPromises()

    findButton(wrapper, '存為範本')!.click()
    await flushPromises()

    const emitted = wrapper.emitted('save-as-template')
    expect(emitted, '應 emit save-as-template').toBeTruthy()

    const fields = emitted![0][0] as Record<string, unknown>
    expect(Object.keys(fields).sort()).toEqual(
      [
        'bowel',
        'learning_highlight',
        'meal_lunch',
        'meal_snack',
        'mood',
        'nap_minutes',
        'teacher_note',
        'temperature_c',
      ].sort(),
    )
    expect(fields.mood).toBe('happy')
    expect(fields.teacher_note).toBe('今天很專注')
  })

  it('尚未存成草稿（無 entry.id）時也能存為範本', async () => {
    const wrapper = mountDrawer(null)
    await flushPromises()

    const btn = findButton(wrapper, '存為範本')
    expect(btn?.hasAttribute('disabled')).toBeFalsy()

    btn!.click()
    await flushPromises()
    expect(wrapper.emitted('save-as-template')).toBeTruthy()
  })
})
