import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ContactBookEntryDrawer from '@/views/portal/components/contactBook/ContactBookEntryDrawer.vue'

const ENTRY_DRAFT = {
  id: 10,
  version: 1,
  mood: 'happy',
  meal_lunch: 2,
  meal_snack: 1,
  nap_minutes: 60,
  bowel: 'normal',
  temperature_c: 36.5,
  teacher_note: 'Note A',
  learning_highlight: 'Highlight A',
  published_at: null,
  photos: [],
}

const ENTRY_PUBLISHED = {
  ...ENTRY_DRAFT,
  id: 11,
  version: 2,
  published_at: '2026-05-06T10:00:00',
}

const STUBS = {
  ElDrawer: {
    template: '<div class="drawer"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'direction', 'size', 'closeOnClickModal'],
    emits: ['update:modelValue', 'close'],
  },
  ElDialog: { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue'] },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: {
    template: '<div class="form-item"><label>{{ label }}</label><slot /></div>',
    props: ['label'],
  },
  ElAlert: {
    template: '<div class="alert"><slot name="title" /></div>',
    props: ['type', 'closable', 'showIcon'],
  },
  ElSelect: {
    template: '<select><slot /></select>',
    props: ['modelValue', 'placeholder', 'clearable'],
    emits: ['update:modelValue'],
  },
  ElOption: {
    template: '<option :value="value">{{ label }}</option>',
    props: ['label', 'value'],
  },
  ElInputNumber: {
    template: '<input type="number" :value="modelValue" />',
    props: ['modelValue', 'min', 'max', 'step', 'precision'],
    emits: ['update:modelValue'],
  },
  ElInput: {
    template: '<textarea :value="modelValue"></textarea>',
    props: ['modelValue', 'type', 'rows', 'maxlength', 'showWordLimit'],
    emits: ['update:modelValue'],
  },
  ElButton: {
    template: '<button :disabled="disabled || false" @click="$emit(\'click\')"><slot /></button>',
    props: ['disabled', 'loading', 'type', 'icon', 'size', 'text'],
    emits: ['click'],
  },
  ElUpload: {
    template: '<div class="upload"><slot /><slot name="tip" /></div>',
    props: ['autoUpload', 'showFileList', 'httpRequest', 'accept'],
  },
  ElImage: {
    template: '<img :src="src" />',
    props: ['src', 'previewSrcList', 'previewTeleported', 'fit', 'hideOnClickModal'],
  },
  ContactBookPhotoGrid: true,
}

function mountIt(entry = ENTRY_DRAFT, opts = {}) {
  return mount(ContactBookEntryDrawer, {
    props: { modelValue: true, entry, studentName: '小華', saving: false, ...opts },
    global: { stubs: STUBS },
    attachTo: document.body,
  })
}

describe('ContactBookEntryDrawer', () => {
  it('mounts with valid entry without crashing', () => {
    expect(() => mountIt()).not.toThrow()
  })

  it('emits save-draft with normalized form payload + version on draft button click', async () => {
    const w = mountIt()
    const buttons = w.findAll('button')
    const saveBtn = buttons.find((b) => b.text().includes('儲存草稿'))
    expect(saveBtn).toBeTruthy()
    await saveBtn.trigger('click')
    const events = w.emitted('save-draft')
    expect(events).toHaveLength(1)
    expect(events[0][1]).toBe(1) // version
    expect(events[0][0].mood).toBe('happy')
    expect(events[0][0].teacher_note).toBe('Note A')
    expect(events[0][0].learning_highlight).toBe('Highlight A')
  })

  it('emits publish with form payload + version on publish button click', async () => {
    const w = mountIt()
    const buttons = w.findAll('button')
    const publishBtn = buttons.find(
      (b) => b.text().includes('發布給家長') || b.text().includes('再次發布'),
    )
    expect(publishBtn).toBeTruthy()
    await publishBtn.trigger('click')
    const events = w.emitted('publish')
    expect(events).toHaveLength(1)
    expect(events[0][1]).toBe(1) // version
  })

  it('disables save-draft button when publishing is in progress', () => {
    const w = mountIt(ENTRY_DRAFT, { publishing: true })
    const saveBtn = w.findAll('button').find((b) => b.text().includes('儲存草稿'))
    expect(saveBtn.attributes('disabled') !== undefined).toBe(true)
  })

  it('publish button label changes for published entry', () => {
    const w = mountIt(ENTRY_PUBLISHED)
    expect(w.text()).toContain('再次發布')
  })

  it('publish button label shows 發布給家長 for draft entry', () => {
    const w = mountIt(ENTRY_DRAFT)
    expect(w.text()).toContain('發布給家長')
  })

  it('handles null entry without crashing', () => {
    expect(() => mountIt(null)).not.toThrow()
  })

  it('emits update:modelValue when close button clicked', async () => {
    const w = mountIt()
    const closeBtn = w.findAll('button').find((b) => b.text().includes('關閉'))
    expect(closeBtn).toBeTruthy()
    await closeBtn.trigger('click')
    expect(w.emitted('update:modelValue')).toBeTruthy()
  })

  it('emits close when close button clicked', async () => {
    const w = mountIt()
    const closeBtn = w.findAll('button').find((b) => b.text().includes('關閉'))
    await closeBtn.trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('normalizes empty string fields to null in emitted payload', async () => {
    const w = mountIt({ ...ENTRY_DRAFT, teacher_note: '', mood: null })
    const saveBtn = w.findAll('button').find((b) => b.text().includes('儲存草稿'))
    await saveBtn.trigger('click')
    const [payload] = w.emitted('save-draft')[0]
    expect(payload.teacher_note).toBeNull()
    expect(payload.mood).toBeNull()
  })
})

describe('ContactBookEntryDrawer 家長回應區（2026-09-02 對齊稽核）', () => {
  const mountWith = (entry) =>
    mount(ContactBookEntryDrawer, {
      props: { modelValue: true, entry, studentName: '小美' },
      global: { stubs: STUBS },
    })

  it('已發布＋有已讀與回覆：列出監護人稱謂、時間與回覆內容', () => {
    const w = mountWith({
      ...ENTRY_PUBLISHED,
      parent_acks: [{ guardian_user_id: 7, guardian_name: '媽媽', read_at: '2026-05-06T18:30:00' }],
      parent_replies: [
        { id: 1, guardian_user_id: 7, guardian_name: '媽媽', body: '謝謝老師', created_at: '2026-05-06T18:31:00' },
      ],
    })
    const box = w.find('[data-testid="cb-parent-signals"]')
    expect(box.exists()).toBe(true)
    expect(box.text()).toContain('家長回應')
    expect(box.text()).toContain('已讀：媽媽')
    expect(box.text()).toContain('05-06 18:30')
    expect(box.text()).toContain('謝謝老師')
  })

  it('已發布但家長尚未讀取：顯示提示、不列回覆', () => {
    const w = mountWith({ ...ENTRY_PUBLISHED, parent_acks: [], parent_replies: [] })
    const box = w.find('[data-testid="cb-parent-signals"]')
    expect(box.text()).toContain('家長尚未讀取')
    expect(w.find('.parent-signals__replies').exists()).toBe(false)
  })

  it('guardian_name 缺值（PII 已抹除）退「家長」', () => {
    const w = mountWith({
      ...ENTRY_PUBLISHED,
      parent_acks: [{ guardian_user_id: 9, guardian_name: null, read_at: '2026-05-06T18:30:00' }],
    })
    expect(w.find('[data-testid="cb-parent-signals"]').text()).toContain('已讀：家長')
  })

  it('草稿不顯示家長回應區', () => {
    const w = mountWith(ENTRY_DRAFT)
    expect(w.find('[data-testid="cb-parent-signals"]').exists()).toBe(false)
  })
})


describe('聯絡簿未儲存保護', () => {
  async function edit(w) {
    w.findAllComponents(STUBS.ElInput)[1].vm.$emit('update:modelValue', '合成測試提醒')
    await flushPromises()
  }

  it('關閉前保留未儲存內容，繼續編輯不關閉', async () => {
    const w = mountIt()
    await edit(w)
    await w.findAll('button').find(b => b.text() === '關閉').trigger('click')
    expect(w.emitted('close')).toBeUndefined()
    expect(w.text()).toContain('尚有未儲存的變更')
    await w.findAll('button').find(b => b.text() === '繼續編輯').trigger('click')
    expect(w.emitted('close')).toBeUndefined()
    expect(w.findAll('textarea')[1].element.value).toBe('合成測試提醒')
    w.unmount()
  })

  it('儲存失敗保留輸入，成功後才離開', async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const w = mountIt(ENTRY_DRAFT, { saveDraftForClose: save })
    await edit(w)
    await w.findAll('button').find(b => b.text() === '關閉').trigger('click')
    await w.find('[data-testid="save-before-close"]').trigger('click')
    await flushPromises()
    expect(w.emitted('close')).toBeUndefined()
    expect(w.findAll('textarea')[1].element.value).toBe('合成測試提醒')
    await w.find('[data-testid="save-before-close"]').trigger('click')
    await flushPromises()
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('捨棄才關閉；X／遮罩／Esc 走同一個 beforeClose', async () => {
    const w = mountIt()
    await edit(w)
    const drawer = w.findComponent(STUBS.ElDrawer)
    const done = vi.fn()
    drawer.vm.$attrs['before-close'](done)
    await flushPromises()
    expect(done).not.toHaveBeenCalled()
    await w.findAll('button').find(b => b.text() === '捨棄變更').trigger('click')
    await flushPromises()
    expect(done).toHaveBeenCalledOnce()
    w.unmount()
  })

  it('儲存等待期間不可捨棄或重複儲存，回應成功才關閉', async () => {
    let resolveSave
    const save = vi.fn(() => new Promise(resolve => { resolveSave = resolve }))
    const w = mountIt(ENTRY_DRAFT, { saveDraftForClose: save })
    await edit(w)
    await w.findAll('button').find(b => b.text() === '關閉').trigger('click')
    await w.find('[data-testid="save-before-close"]').trigger('click')
    expect(w.emitted('close')).toBeUndefined()
    expect(w.findAll('button').find(b => b.text() === '捨棄變更').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="save-before-close"]').attributes('disabled')).toBeDefined()
    resolveSave(true)
    await flushPromises()
    expect(save).toHaveBeenCalledOnce()
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('成功儲存後關閉不再提示，切下一位空白學生不沿用表單', async () => {
    const w = mountIt()
    await edit(w)
    await w.setProps({ entry: { ...ENTRY_DRAFT, version: 2, teacher_note: '合成測試提醒' } })
    await w.findAll('button').find(b => b.text() === '關閉').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    await w.setProps({ entry: null, studentId: 1 })
    await edit(w)
    await w.setProps({ studentId: 2 })
    expect(w.findAll('textarea')[1].element.value).toBe('')
    w.unmount()
  })

  it('儲存中禁止關閉，分頁關閉也會提醒', async () => {
    const w = mountIt(ENTRY_DRAFT, { saving: true })
    await w.findAll('button').find(b => b.text() === '關閉').trigger('click')
    expect(w.emitted('close')).toBeUndefined()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    w.unmount()
  })
})
