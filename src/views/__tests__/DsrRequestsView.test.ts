import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// --- Mock @/api/dsr ---
vi.mock('@/api/dsr', () => ({
  listDsrRequests: vi.fn().mockResolvedValue({
    data: [
      {
        id: 1,
        request_type: 'delete',
        status: 'pending',
        subject_entity_type: 'student',
        subject_entity_id: 42,
        reason: '學生已畢業，要求刪除資料',
        submitted_at: '2026-06-01T10:00:00',
        decided_at: null,
        decided_by: null,
        decision_note: null,
        field_name: null,
        new_value: null,
        scope: null,
        user_id: 10,
      },
      {
        id: 2,
        request_type: 'correct',
        status: 'approved',
        subject_entity_type: 'guardian',
        subject_entity_id: 7,
        reason: '聯絡電話錯誤',
        submitted_at: '2026-05-28T09:00:00',
        decided_at: '2026-05-29T10:00:00',
        decided_by: 1,
        decision_note: '已確認，請 admin 手動更正',
        field_name: 'phone',
        new_value: '0912345678',
        scope: null,
        user_id: 5,
      },
    ],
  }),
  approveDsrRequest: vi.fn().mockResolvedValue({ data: { id: 1, status: 'approved' } }),
  rejectDsrRequest: vi.fn().mockResolvedValue({ data: { id: 1, status: 'rejected' } }),
}))

vi.mock('@/utils/error', () => ({
  apiError: vi.fn((_err: unknown, fallback: string) => fallback),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { listDsrRequests, approveDsrRequest, rejectDsrRequest } from '@/api/dsr'
import { ElMessage } from 'element-plus'
import DsrRequestsView from '../DsrRequestsView.vue'

// 共用 stubs（避免 Element Plus 元件 teleport 到 body 的問題）
const globalStubs = {
  teleport: true,
  'el-table': {
    template:
      '<table data-test="dsr-table"><tbody><tr v-for="r in data" :key="r.id" :data-id="r.id"><td class="type-cell">{{ r.request_type }}</td><td class="status-cell">{{ r.status }}</td><slot name="default" :row="r" /></tr></tbody></table>',
    props: ['data'],
  },
  'el-table-column': {
    template: '<td><slot :row="{}" /></td>',
  },
  'el-tag': {
    template: '<span class="el-tag" :data-type="type"><slot /></span>',
    props: ['type', 'size'],
  },
  'el-button': {
    template: '<button :class="[type, link ? \'link\' : \'\']" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'link', 'loading'],
  },
  'el-dialog': {
    template:
      '<div v-if="modelValue" class="el-dialog-stub" :data-title="title"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue'],
  },
  'el-form': { template: '<form><slot /></form>', props: ['labelWidth'] },
  'el-form-item': { template: '<div class="form-item"><label>{{ label }}</label><slot /></div>', props: ['label'] },
  'el-input': {
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'type', 'rows', 'placeholder'],
    emits: ['update:modelValue'],
  },
}

const globalDirectives = {
  loading: { mounted: () => {}, updated: () => {} },
}

describe('DsrRequestsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('掛載時呼叫 listDsrRequests', async () => {
    mount(DsrRequestsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(listDsrRequests).toHaveBeenCalledOnce()
  })

  it('渲染兩筆 DSR 列（id=1 與 id=2）', async () => {
    const wrapper = mount(DsrRequestsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    // records 應含兩筆
    expect((wrapper.vm as unknown as { records: unknown[] }).records).toHaveLength(2)
  })

  it('頁面包含標題「個資請求佇列」', async () => {
    const wrapper = mount(DsrRequestsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('個資請求佇列')
  })

  it('點擊駁回按鈕 → 開啟 rejectDialogVisible', async () => {
    const wrapper = mount(DsrRequestsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    // 直接呼叫 openRejectDialog（id=1 的 row，status=pending）
    const vm = wrapper.vm as unknown as {
      openRejectDialog: (row: { id: number; request_type: string; status: string }) => void
      rejectDialogVisible: boolean
    }
    vm.openRejectDialog({ id: 1, request_type: 'delete', status: 'pending' })
    await flushPromises()

    expect(vm.rejectDialogVisible).toBe(true)
  })

  it('submitReject 無說明時 → 顯示警告，不呼叫 API', async () => {
    const wrapper = mount(DsrRequestsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openRejectDialog: (row: { id: number; request_type: string; status: string }) => void
      submitReject: () => Promise<void>
      rejectNote: string
    }
    vm.openRejectDialog({ id: 1, request_type: 'delete', status: 'pending' })
    vm.rejectNote = ''
    await vm.submitReject()

    expect(ElMessage.warning).toHaveBeenCalled()
    expect(rejectDsrRequest).not.toHaveBeenCalled()
  })

  it('submitReject 填寫說明 → 呼叫 rejectDsrRequest 並關閉 dialog', async () => {
    const wrapper = mount(DsrRequestsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openRejectDialog: (row: { id: number; request_type: string; status: string }) => void
      submitReject: () => Promise<void>
      rejectNote: string
      rejectDialogVisible: boolean
    }
    vm.openRejectDialog({ id: 1, request_type: 'delete', status: 'pending' })
    vm.rejectNote = '資料不符，無法處理'
    await vm.submitReject()
    await flushPromises()

    expect(rejectDsrRequest).toHaveBeenCalledWith(1, { decision_note: '資料不符，無法處理' })
    expect(ElMessage.success).toHaveBeenCalled()
    expect(vm.rejectDialogVisible).toBe(false)
    // 駁回後重新 fetch
    expect(listDsrRequests).toHaveBeenCalledTimes(2)
  })

  it('submitApprove → 呼叫 approveDsrRequest 並關閉 dialog', async () => {
    const wrapper = mount(DsrRequestsView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openApproveDialog: (row: { id: number; request_type: string; status: string }) => void
      submitApprove: () => Promise<void>
      approveNote: string
      approveDialogVisible: boolean
    }
    vm.openApproveDialog({ id: 1, request_type: 'delete', status: 'pending' })
    vm.approveNote = '已確認，核准刪除'
    await vm.submitApprove()
    await flushPromises()

    expect(approveDsrRequest).toHaveBeenCalledWith(1, { decision_note: '已確認，核准刪除' })
    expect(ElMessage.success).toHaveBeenCalled()
    expect(vm.approveDialogVisible).toBe(false)
    // 核准後重新 fetch
    expect(listDsrRequests).toHaveBeenCalledTimes(2)
  })
})
