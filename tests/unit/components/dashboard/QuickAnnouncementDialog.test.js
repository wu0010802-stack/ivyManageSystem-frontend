import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import QuickAnnouncementDialog from '@/components/dashboard/quick-add/QuickAnnouncementDialog.vue'

const createAnnouncement = vi.fn()
vi.mock('@/api/announcements', () => ({
  createAnnouncement: (...args) => createAnnouncement(...args),
}))

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

const notify = vi.fn()
vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify }),
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: vi.fn(),
  }
})

const stubs = {
  'el-dialog': {
    template: '<div v-if="modelValue" class="dialog"><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-form': {
    template: '<form><slot /></form>',
    props: ['model', 'rules'],
    methods: {
      validate() {
        // 模擬 element-plus validate: title/content 必填
        const m = this.model
        if (!m?.title || !m?.content) return Promise.reject(false)
        return Promise.resolve(true)
      },
      clearValidate() {},
    },
  },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': {
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-radio-group': {
    template: '<div><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-radio': { template: '<label><slot /></label>' },
  'el-switch': {
    template: '<input type="checkbox" :checked="modelValue" />',
    props: ['modelValue'],
  },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
  },
}

describe('QuickAnnouncementDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未填 title/content 時 submit 不會呼叫 createAnnouncement', async () => {
    const wrapper = mount(QuickAnnouncementDialog, {
      props: { visible: true },
      global: { stubs },
    })
    await nextTick()
    // 點送出（footer 的第二個 button）
    const buttons = wrapper.findAll('button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()
    expect(createAnnouncement).not.toHaveBeenCalled()
  })

  it('填入 title + content 後 submit 呼叫 createAnnouncement 並關閉 dialog', async () => {
    createAnnouncement.mockResolvedValue({ data: { id: 1 } })
    const wrapper = mount(QuickAnnouncementDialog, {
      props: { visible: true },
      global: { stubs },
    })
    await nextTick()

    const inputs = wrapper.findAll('input')
    // 第一個 input 是 title
    await inputs[0].setValue('測試公告')
    // 第二個 textarea (我們的 stub 是 input) 是 content
    await inputs[1].setValue('測試內容')

    const buttons = wrapper.findAll('button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()

    expect(createAnnouncement).toHaveBeenCalledTimes(1)
    expect(createAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '測試公告',
        content: '測試內容',
        priority: 'normal',
        is_pinned: false,
      }),
    )
    // submit 成功應該 emit update:visible(false)
    const emitted = wrapper.emitted('update:visible')
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1]).toEqual([false])
  })

  it('API 失敗時呼叫 notify 並不關閉 dialog', async () => {
    createAnnouncement.mockRejectedValue(new Error('network'))
    const wrapper = mount(QuickAnnouncementDialog, {
      props: { visible: true },
      global: { stubs },
    })
    await nextTick()

    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('測試公告')
    await inputs[1].setValue('測試內容')

    const buttons = wrapper.findAll('button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()

    expect(notify).toHaveBeenCalledTimes(1)
    // submit 失敗不該 emit close
    const emitted = wrapper.emitted('update:visible') || []
    const closedEvents = emitted.filter((e) => e[0] === false)
    expect(closedEvents.length).toBe(0)
  })
})
