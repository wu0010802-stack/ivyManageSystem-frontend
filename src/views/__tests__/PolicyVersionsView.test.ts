import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// --- Mock @/api/policy （vi.mock 被 hoist，factory 不可引用外部變數）---
vi.mock('@/api/policy', () => ({
  listPolicies: vi.fn().mockResolvedValue({
    data: [
      {
        id: 1,
        version: 'v1.0.0',
        effective_at: '2026-01-01T00:00:00',
        document_path: 'policies/privacy/v1.0.0.pdf',
        summary: '初版隱私政策',
        created_at: '2026-01-01T00:00:00',
      },
      {
        id: 2,
        version: 'v1.1.0',
        effective_at: '2026-06-01T00:00:00',
        document_path: 'policies/privacy/v1.1.0.pdf',
        summary: null,
        created_at: '2026-06-01T00:00:00',
      },
    ],
  }),
  createPolicy: vi.fn().mockResolvedValue({
    data: {
      id: 3,
      version: 'v1.2.0',
      effective_at: '2026-07-01T00:00:00',
      document_path: 'policies/privacy/v1.2.0.pdf',
      summary: '第三版',
      created_at: '2026-06-03T00:00:00',
    },
  }),
}))

vi.mock('@/utils/error', () => ({
  apiError: vi.fn((_err: unknown, fallback: string) => fallback),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { listPolicies, createPolicy } from '@/api/policy'
import { ElMessage } from 'element-plus'
import PolicyVersionsView from '../PolicyVersionsView.vue'

// 共用 stubs（避免 Element Plus 元件 teleport 問題）
const globalStubs = {
  teleport: true,
  'el-table': {
    template:
      '<table data-test="policy-table"><tbody><tr v-for="r in data" :key="r.id" :data-id="r.id"><td class="version-cell">{{ r.version }}</td><slot name="default" :row="r" /></tr></tbody></table>',
    props: ['data'],
  },
  'el-table-column': {
    template: '<td><slot :row="{}" /></td>',
  },
  'el-button': {
    template: '<button :class="[type]" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'loading'],
  },
  'el-dialog': {
    template:
      '<div v-if="modelValue" class="el-dialog-stub" :data-title="title"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue'],
  },
  'el-form': { template: '<form><slot /></form>', props: ['labelWidth'] },
  'el-form-item': {
    template: '<div class="form-item"><label>{{ label }}</label><slot /></div>',
    props: ['label', 'required'],
  },
  'el-input': {
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'type', 'rows', 'placeholder'],
    emits: ['update:modelValue'],
  },
  'el-date-picker': {
    template:
      '<input class="date-picker" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'type', 'valueFormat', 'placeholder', 'style'],
    emits: ['update:modelValue'],
  },
  'el-alert': {
    template: '<div class="el-alert" :data-desc="description"><slot /></div>',
    props: ['type', 'closable', 'showIcon', 'description'],
  },
}

const globalDirectives = {
  loading: { mounted: () => {}, updated: () => {} },
}

describe('PolicyVersionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(listPolicies as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 1,
          version: 'v1.0.0',
          effective_at: '2026-01-01T00:00:00',
          document_path: 'policies/privacy/v1.0.0.pdf',
          summary: '初版隱私政策',
          created_at: '2026-01-01T00:00:00',
        },
        {
          id: 2,
          version: 'v1.1.0',
          effective_at: '2026-06-01T00:00:00',
          document_path: 'policies/privacy/v1.1.0.pdf',
          summary: null,
          created_at: '2026-06-01T00:00:00',
        },
      ],
    })
    ;(createPolicy as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 3,
        version: 'v1.2.0',
        effective_at: '2026-07-01T00:00:00',
        document_path: 'policies/privacy/v1.2.0.pdf',
        summary: '第三版',
        created_at: '2026-06-03T00:00:00',
      },
    })
  })

  it('掛載時呼叫 listPolicies', async () => {
    mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(listPolicies).toHaveBeenCalledOnce()
  })

  it('渲染兩筆政策版本（id=1 與 id=2）', async () => {
    const wrapper = mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect((wrapper.vm as unknown as { records: unknown[] }).records).toHaveLength(2)
  })

  it('頁面包含標題「隱私政策版本管理」', async () => {
    const wrapper = mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('隱私政策版本管理')
  })

  it('頁面包含提示文字（重新簽署警告）', async () => {
    const wrapper = mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(wrapper.html()).toContain('重新簽署')
  })

  it('點擊「新增版本」→ 開啟 createDialogVisible', async () => {
    const wrapper = mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openCreateDialog: () => void
      createDialogVisible: boolean
    }
    vm.openCreateDialog()
    await flushPromises()

    expect(vm.createDialogVisible).toBe(true)
  })

  it('submitCreate 缺版本號 → 顯示警告，不呼叫 API', async () => {
    const wrapper = mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openCreateDialog: () => void
      submitCreate: () => Promise<void>
      formVersion: string
    }
    vm.openCreateDialog()
    vm.formVersion = ''
    await vm.submitCreate()

    expect(ElMessage.warning).toHaveBeenCalled()
    expect(createPolicy).not.toHaveBeenCalled()
  })

  it('submitCreate 缺生效時間 → 顯示警告，不呼叫 API', async () => {
    const wrapper = mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openCreateDialog: () => void
      submitCreate: () => Promise<void>
      formVersion: string
      formEffectiveAt: string
    }
    vm.openCreateDialog()
    vm.formVersion = 'v1.2.0'
    vm.formEffectiveAt = ''
    await vm.submitCreate()

    expect(ElMessage.warning).toHaveBeenCalled()
    expect(createPolicy).not.toHaveBeenCalled()
  })

  it('submitCreate 缺文件路徑 → 顯示警告，不呼叫 API', async () => {
    const wrapper = mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openCreateDialog: () => void
      submitCreate: () => Promise<void>
      formVersion: string
      formEffectiveAt: string
      formDocumentPath: string
    }
    vm.openCreateDialog()
    vm.formVersion = 'v1.2.0'
    vm.formEffectiveAt = '2026-07-01T00:00:00'
    vm.formDocumentPath = ''
    await vm.submitCreate()

    expect(ElMessage.warning).toHaveBeenCalled()
    expect(createPolicy).not.toHaveBeenCalled()
  })

  it('submitCreate 填寫完整 → 呼叫 createPolicy 並關閉 dialog + refetch', async () => {
    const wrapper = mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openCreateDialog: () => void
      submitCreate: () => Promise<void>
      formVersion: string
      formEffectiveAt: string
      formDocumentPath: string
      formSummary: string
      createDialogVisible: boolean
    }
    vm.openCreateDialog()
    vm.formVersion = 'v1.2.0'
    vm.formEffectiveAt = '2026-07-01T00:00:00'
    vm.formDocumentPath = 'policies/privacy/v1.2.0.pdf'
    vm.formSummary = '第三版'
    await vm.submitCreate()
    await flushPromises()

    expect(createPolicy).toHaveBeenCalledWith({
      version: 'v1.2.0',
      effective_at: '2026-07-01T00:00:00',
      document_path: 'policies/privacy/v1.2.0.pdf',
      summary: '第三版',
    })
    expect(ElMessage.success).toHaveBeenCalled()
    expect(vm.createDialogVisible).toBe(false)
    // 建立後重新 fetch（初始 + 建立後 = 2 次）
    expect(listPolicies).toHaveBeenCalledTimes(2)
  })

  it('submitCreate 無摘要 → summary 傳 null', async () => {
    const wrapper = mount(PolicyVersionsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openCreateDialog: () => void
      submitCreate: () => Promise<void>
      formVersion: string
      formEffectiveAt: string
      formDocumentPath: string
      formSummary: string
    }
    vm.openCreateDialog()
    vm.formVersion = 'v1.2.0'
    vm.formEffectiveAt = '2026-07-01T00:00:00'
    vm.formDocumentPath = 'policies/privacy/v1.2.0.pdf'
    vm.formSummary = ''
    await vm.submitCreate()
    await flushPromises()

    expect(createPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ summary: null }),
    )
  })
})
