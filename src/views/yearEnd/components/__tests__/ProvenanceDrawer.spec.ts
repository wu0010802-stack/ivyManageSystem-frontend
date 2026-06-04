import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ProvenanceDrawer from '../ProvenanceDrawer.vue'

// ── Mock api ─────────────────────────────────────────────────────

vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    getProvenance: vi.fn(),
  }
})

vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '1' } }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

// ── Import after mocks ────────────────────────────────────────────

import { getProvenance } from '@/api/yearEnd'
import type { DerivedValue } from '@/types/provenance'

// ── Helpers ───────────────────────────────────────────────────────

const KEYS = [
  { key: 'attendance_late', label: '遲到/未打卡' },
  { key: 'personal_leave', label: '事假' },
  { key: 'sick_leave', label: '病假' },
  { key: 'meeting_absence', label: '會議缺席' },
]

function makeDerivedValue(overrides: Partial<DerivedValue> = {}): DerivedValue {
  return {
    key: 'attendance_late',
    value: '500',
    formula_summary: '遲到 2 次 × 250 元',
    breakdown: {},
    source_records: [
      { date: '2026-01-05', label: '遲到 15 分鐘', amount: '250', module: 'attendance', source_id: 101 },
      { date: '2026-01-12', label: '遲到 20 分鐘', amount: '250', module: 'attendance', source_id: 102 },
    ],
    deep_link: null,
    is_override: false,
    override_meta: null,
    ...overrides,
  }
}

function mountDrawer(props: {
  modelValue: boolean
  cycleId?: number
  employeeId?: number
}) {
  return mount(ProvenanceDrawer, {
    props: {
      modelValue: props.modelValue,
      cycleId: props.cycleId ?? 1,
      employeeId: props.employeeId ?? 10,
      provenanceKeys: KEYS,
    },
    global: {
      stubs: {
        'el-drawer': true,
        'el-skeleton': true,
        'el-empty': true,
        'el-tag': true,
        'el-button': true,
      },
    },
  })
}

// ── Vm accessor helper ─────────────────────────────────────────────

interface DrawerVm {
  sections: Array<{
    key: string
    label: string
    loading: boolean
    data: DerivedValue | null
    error: string | null
  }>
}

// ── Tests ─────────────────────────────────────────────────────────

describe('ProvenanceDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('(a) visible=true 時對每個 key 各呼叫一次 getProvenance', async () => {
    vi.mocked(getProvenance).mockResolvedValue({ data: makeDerivedValue() } as never)

    const wrapper = mountDrawer({ modelValue: true })
    await nextTick()
    await nextTick()

    expect(getProvenance).toHaveBeenCalledTimes(4)
    expect(getProvenance).toHaveBeenCalledWith('attendance_late', 1, 10)
    expect(getProvenance).toHaveBeenCalledWith('personal_leave', 1, 10)
    expect(getProvenance).toHaveBeenCalledWith('sick_leave', 1, 10)
    expect(getProvenance).toHaveBeenCalledWith('meeting_absence', 1, 10)

    wrapper.unmount()
  })

  it('(b) 成功後 sections 有 source_records 資料', async () => {
    const derived = makeDerivedValue()
    vi.mocked(getProvenance).mockResolvedValue({ data: derived } as never)

    const wrapper = mountDrawer({ modelValue: true })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as DrawerVm
    expect(vm.sections).toHaveLength(4)

    const first = vm.sections[0]
    expect(first.loading).toBe(false)
    expect(first.error).toBeNull()
    expect(first.data?.source_records).toHaveLength(2)
    expect(first.data?.source_records[0].amount).toBe('250')
    expect(first.data?.formula_summary).toBe('遲到 2 次 × 250 元')

    wrapper.unmount()
  })

  it('(c) source_records=[] 時 section.data.source_records 為空陣列', async () => {
    const derived = makeDerivedValue({ source_records: [] })
    vi.mocked(getProvenance).mockResolvedValue({ data: derived } as never)

    const wrapper = mountDrawer({ modelValue: true })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as DrawerVm
    expect(vm.sections[0].data?.source_records).toHaveLength(0)
    expect(vm.sections[0].loading).toBe(false)
    expect(vm.sections[0].error).toBeNull()

    wrapper.unmount()
  })

  it('(d) visible=false 時不呼叫 getProvenance', async () => {
    vi.mocked(getProvenance).mockResolvedValue({ data: makeDerivedValue() } as never)

    const wrapper = mountDrawer({ modelValue: false })
    await nextTick()
    await nextTick()

    expect(getProvenance).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('(f) employeeId 變更時（drawer 開著），重新呼叫 getProvenance（Fix 1 回歸）', async () => {
    vi.mocked(getProvenance).mockResolvedValue({ data: makeDerivedValue() } as never)

    const wrapper = mountDrawer({ modelValue: true, employeeId: 10 })
    await nextTick()
    await nextTick()

    // 清除初始掛載時的呼叫計數
    vi.mocked(getProvenance).mockClear()

    // 在 drawer 仍開著的情況下，切換 employeeId
    await wrapper.setProps({ employeeId: 99 })
    await nextTick()
    await nextTick()

    expect(getProvenance).toHaveBeenCalled()
    expect(getProvenance).toHaveBeenCalledWith(expect.any(String), expect.any(Number), 99)

    wrapper.unmount()
  })

  it('(e) API 部分失敗時，失敗的 section 有 error，其餘成功', async () => {
    vi.mocked(getProvenance).mockImplementation((key: string) => {
      if (key === 'sick_leave') {
        return Promise.reject(new Error('500 Internal Server Error')) as never
      }
      return Promise.resolve({ data: makeDerivedValue({ key }) }) as never
    })

    const wrapper = mountDrawer({ modelValue: true })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as DrawerVm
    const sickSection = vm.sections.find((s) => s.key === 'sick_leave')
    const lateSection = vm.sections.find((s) => s.key === 'attendance_late')

    expect(sickSection?.error).not.toBeNull()
    expect(lateSection?.error).toBeNull()
    expect(lateSection?.data).not.toBeNull()

    wrapper.unmount()
  })
})
