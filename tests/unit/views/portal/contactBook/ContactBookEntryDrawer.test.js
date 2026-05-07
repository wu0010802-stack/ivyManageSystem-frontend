import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
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
