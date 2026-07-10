import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import YearEndGridView from '../YearEndGridView.vue'

vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    listYearEndCycles: vi.fn(),
    getYearEndGrid: vi.fn(),
    buildSettlements: vi.fn(),
    manualPatchSettlement: vi.fn(),
  }
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

// Task 12：router.push 改成共用 hoisted mock，讓「展開不再 push 到 404 路由」這件事
// 可被斷言（openDetail 已整支刪除，理論上不會再有任何呼叫）。
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' }, query: {} }),
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

// Mock api index so baseURL resolves in the component without errors
vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import * as api from '@/api/yearEnd'
import { ElMessage } from 'element-plus'
import { hasPermission } from '@/utils/auth'

// ---- helpers ----

type GridRow = {
  settlement_id: number
  employee_id: number
  employee_name: string
  payable_amount: string
  special_bonuses: Record<string, string>
  total_amount: string
  status: string
  remark?: string | null
}

function makeRow(overrides: Partial<GridRow> = {}): GridRow {
  return {
    settlement_id: 1,
    employee_id: 10,
    employee_name: '蔡宜倩',
    payable_amount: '29044.71',
    special_bonuses: {
      APPRAISAL_HALF_BONUS_FIRST: '3312',
      EXCESS_ENROLLMENT: '2000',
    },
    total_amount: '40106.71',
    status: 'DRAFT',
    ...overrides,
  }
}

async function mountView() {
  const wrapper = mount(YearEndGridView, {
    global: {
      stubs: {
        'el-table': true,
        'el-table-column': true,
        'el-button': true,
        'el-tag': true,
        'el-dialog': true,
        'el-form': true,
        'el-form-item': true,
        'el-input-number': true,
        // Task 12②③：頁頂新增 el-alert（build 摘要 / 失敗 banner）；既有 describe 區塊
        // 都是 vm-layer 斷言，真渲染 el-alert 沒有必要也增加不相關的失敗面，比照其餘
        // 元件一律 auto-stub。
        'el-alert': true,
        'el-descriptions': true,
        'el-descriptions-item': true,
      },
    },
  })
  // Task 9: onMounted(initGrid) chains listYearEndCycles → (buildSettlements) → loadGrid
  // — multiple sequential awaits, so flushPromises() (not just nextTick) is needed to
  // drain the whole chain before assertions run.
  await flushPromises()
  await nextTick()
  await nextTick()
  return wrapper
}

describe('YearEndGridView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Task 9 進頁自動 build 預設值：canWrite=true + OPEN cycle（多數既有測試場景），
    // 個別測試如需 CLOSED / 無 WRITE 權限 / listYearEndCycles 失敗，於各自 it() 內覆寫。
    vi.mocked(hasPermission).mockReturnValue(true)
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 7, status: 'OPEN' }],
    } as never)
  })

  // Case 1: renders rows with employee name + total + bonus columns (vm-layer)
  it('loads and exposes rows with correct employee name, total, and bonus columns', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      bonusColumns: { key: string; label: string }[]
    }

    // employee name is present in rows
    expect(vm.rows).toHaveLength(1)
    expect(vm.rows[0].employee_name).toBe('蔡宜倩')

    // total amount is the raw string from the server
    expect(vm.rows[0].total_amount).toBe('40106.71')

    // bonus columns include 考核上 (APPRAISAL_HALF_BONUS_FIRST)
    const labels = vm.bonusColumns.map((c) => c.label)
    expect(labels).toContain('考核上')

    expect(api.getYearEndGrid).toHaveBeenCalledWith(7)
  })

  // F-2: 總表金額顯示層統一四捨五入到整數元，row 原始字串值（送出/核對用）不受影響
  it('F-2: moneyInt 顯示層四捨五入到整數元，不改動 row 原始字串值', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow({ payable_amount: '60443.41', total_amount: '65443.41' })],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      moneyInt: (val: unknown) => string
    }

    // 原始資料值不動（送出/核對仍用原始精度）
    expect(vm.rows[0].payable_amount).toBe('60443.41')
    expect(vm.rows[0].total_amount).toBe('65443.41')

    // 顯示層四捨五入到整數元
    expect(vm.moneyInt(vm.rows[0].payable_amount)).toBe('NT$60,443')
    expect(vm.moneyInt(vm.rows[0].total_amount)).toBe('NT$65,443')
    // 既有整數欄（考核上）維持不變
    expect(vm.moneyInt(vm.rows[0].special_bonuses.APPRAISAL_HALF_BONUS_FIRST)).toBe('NT$3,312')
    // null/空值仍走既有「—」fallback
    expect(vm.moneyInt(null)).toBe('—')
  })

  // Case 2: build button calls buildSettlements then reloads grid (no gaps → no warning)
  it('build button calls buildSettlements then reloads (getYearEndGrid called twice)', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 3, skipped_finalized: 1, unmatched_count: 0, fallback_classes: 0, warnings: [] },
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      onBuild: () => Promise<void>
    }

    // Trigger build directly via exposed method
    await vm.onBuild()
    await nextTick()

    expect(api.buildSettlements).toHaveBeenCalledWith(7, { included_resigned_employee_ids: [] })
    // getYearEndGrid called on mount + after build = 2 times
    expect(api.getYearEndGrid).toHaveBeenCalledTimes(2)
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('已試算 3 筆，略過已簽 1 筆')
    // No gaps → warning must NOT fire
    expect(vi.mocked(ElMessage.warning)).not.toHaveBeenCalled()
  })

  // Case 6: build returns unmatched/fallback gaps → success msg + warning with counts
  it('build with unmatched_count and fallback_classes shows success then gap warning', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 5, skipped_finalized: 0, unmatched_count: 2, fallback_classes: 1, warnings: [] },
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { onBuild: () => Promise<void> }

    await vm.onBuild()
    await nextTick()

    // Basic success message is always shown
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('已試算 5 筆，略過已簽 0 筆')

    // Gap warning must include both counts
    const warningCalls = vi.mocked(ElMessage.warning).mock.calls
    expect(warningCalls).toHaveLength(1)
    const warningText = warningCalls[0]![0] as string
    expect(warningText).toContain('2 筆才藝報名未配對班級，未計入鼓勵獎金')
    expect(warningText).toContain('1 班學號未回填，沿用手填舊生率')
  })

  // Case 7: build with only one gap → only that gap appears in warning
  it('build with only fallback_classes gap shows partial warning', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 4, skipped_finalized: 2, unmatched_count: 0, fallback_classes: 3, warnings: [] },
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { onBuild: () => Promise<void> }

    await vm.onBuild()
    await nextTick()

    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('已試算 4 筆，略過已簽 2 筆')

    const warningCalls = vi.mocked(ElMessage.warning).mock.calls
    expect(warningCalls).toHaveLength(1)
    const warningText = warningCalls[0]![0] as string
    expect(warningText).toContain('3 班學號未回填，沿用手填舊生率')
    expect(warningText).not.toContain('未配對班級')
  })

  // 年終批次2 G7/G8：後端新增 warnings 明細（如超額覆寫、教課獎勵缺配對班級等），
  // 應與既有 unmatched_count/fallback_classes 缺口提示合併顯示（同一則 warning）。
  it('build 回傳 warnings 非空時，與既有缺口提示合併顯示（同一則 warning）', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: {
        built: 2,
        skipped_finalized: 0,
        unmatched_count: 1,
        fallback_classes: 0,
        warnings: ['員工 10 教課獎勵金找不到負責課程班級'],
      },
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { onBuild: () => Promise<void> }

    await vm.onBuild()
    await nextTick()

    const warningCalls = vi.mocked(ElMessage.warning).mock.calls
    expect(warningCalls).toHaveLength(1)
    const warningText = warningCalls[0]![0] as string
    expect(warningText).toContain('1 筆才藝報名未配對班級，未計入鼓勵獎金')
    expect(warningText).toContain('員工 10 教課獎勵金找不到負責課程班級')
  })

  it('build 回傳 warnings 非空但無其他缺口時，仍單獨顯示 warning', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: {
        built: 2,
        skipped_finalized: 0,
        unmatched_count: 0,
        fallback_classes: 0,
        warnings: ['某筆超額獎金已被手動覆寫，未隨試算更新'],
      },
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { onBuild: () => Promise<void> }

    await vm.onBuild()
    await nextTick()

    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalledWith('某筆超額獎金已被手動覆寫，未隨試算更新')
  })

  // Case 3: manual edit dialog patches and reloads (user sets deduction → IS sent)
  it('manual edit dialog patches settlement and reloads', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({
      data: {},
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      openEdit: (row: GridRow) => void
      submitEdit: () => Promise<void>
      editForm: {
        deduction_disciplinary: number | null
        excess_amount: number | null
        hire_months_override: number | null
        remark: string | null
      }
    }

    // Open edit for the first DRAFT row
    vm.openEdit(vm.rows[0])
    await nextTick()

    // Set deduction (user explicitly enters -6000)
    vm.editForm.deduction_disciplinary = -6000

    // Submit
    await vm.submitEdit()
    await nextTick()

    // When user sets a value, it IS sent
    expect(api.manualPatchSettlement).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ deduction_disciplinary: -6000 })
    )
    // getYearEndGrid called on mount + after patch = 2 times
    expect(api.getYearEndGrid).toHaveBeenCalledTimes(2)
  })

  it('manual edit can update remark without touching amount fields', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow({ remark: '舊備註' })],
    } as never)
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({
      data: {},
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      openEdit: (row: GridRow) => void
      submitEdit: () => Promise<void>
      editForm: {
        deduction_disciplinary: number | null
        excess_amount: number | null
        hire_months_override: number | null
        remark: string | null
      }
    }

    vm.openEdit(vm.rows[0])
    await nextTick()
    expect(vm.editForm.remark).toBe('舊備註')

    vm.editForm.remark = '114.08 到職'
    await vm.submitEdit()
    await nextTick()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { remark: '114.08 到職' })
  })

  // Case 5: manual patch omits untouched deduction/excess (no silent zero-wipe)
  it('manual patch omits untouched deduction/excess (no silent zero-wipe)', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({
      data: {},
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      openEdit: (row: GridRow) => void
      submitEdit: () => Promise<void>
      editForm: { deduction_disciplinary: number | null; excess_amount: number | null; hire_months_override: number | null }
    }

    // Open edit for a DRAFT row
    vm.openEdit(vm.rows[0])
    await nextTick()

    // Only set hire_months_override — leave deduction/excess untouched (null)
    expect(vm.editForm.deduction_disciplinary).toBeNull()
    expect(vm.editForm.excess_amount).toBeNull()
    vm.editForm.hire_months_override = 8

    // Submit
    await vm.submitEdit()
    await nextTick()

    expect(api.manualPatchSettlement).toHaveBeenCalledOnce()
    const arg = vi.mocked(api.manualPatchSettlement).mock.calls[0]![1]

    // hire_months_override IS sent
    expect(arg).toHaveProperty('hire_months_override', 8)

    // deduction_disciplinary and excess_amount must NOT be in the payload at all
    // (so backend keeps its prior persisted value — no silent zero-wipe)
    expect('deduction_disciplinary' in arg).toBe(false)
    expect('excess_amount' in arg).toBe(false)
  })

  // Case 4: finalized row hides manual edit button
  it('exposes canWrite=true but FINALIZED row must not show edit button (vm check)', async () => {
    const finalizedRow = makeRow({ status: 'FINALIZED', settlement_id: 99 })
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [finalizedRow],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      canWrite: boolean
    }

    expect(vm.rows[0].status).toBe('FINALIZED')
    // canWrite is true (mocked), but template guards with `row.status === 'DRAFT' && canWrite`
    // we verify the DRAFT condition is false → button should NOT render
    expect(vm.rows[0].status === 'DRAFT' && vm.canWrite).toBe(false)
  })
})

// ── Task 9：進頁自動 build（依 cycle 狀態 + canWrite）─────────────────────
describe('YearEndGridView 進頁自動 build（Task 9）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasPermission).mockReturnValue(true)
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 7, status: 'OPEN' }],
    } as never)
  })

  it('OPEN + canWrite：mount 時 buildSettlements 在 getYearEndGrid 之前被呼叫', async () => {
    const callOrder: string[] = []
    vi.mocked(api.buildSettlements).mockImplementationOnce(async () => {
      callOrder.push('build')
      return {
        data: { built: 1, skipped_finalized: 0, unmatched_count: 0, fallback_classes: 0, warnings: [] },
      } as never
    })
    vi.mocked(api.getYearEndGrid).mockImplementationOnce(async () => {
      callOrder.push('grid')
      return { data: [makeRow()] } as never
    })

    await mountView()

    expect(api.buildSettlements).toHaveBeenCalledWith(7, { included_resigned_employee_ids: [] })
    expect(callOrder).toEqual(['build', 'grid'])
  })

  // 年終批次2 G2：後端 build-settlements 現在對 LOCKED cycle 一律拒絕（cycle_guard），
  // 故前端不應再對 LOCKED cycle 自動觸發 build——這與舊行為（LOCKED 仍視為 buildable）相反。
  it('LOCKED + canWrite：後端現一律拒絕 build（cycle_guard），mount 時不觸發 buildSettlements', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 7, status: 'LOCKED' }],
    } as never)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { rows: GridRow[]; cycleStatus: string | null }

    expect(api.buildSettlements).not.toHaveBeenCalled()
    expect(api.getYearEndGrid).toHaveBeenCalledWith(7)
    expect(vm.rows).toHaveLength(1)
    expect(vm.cycleStatus).toBe('LOCKED')
  })

  it('CLOSED cycle：不呼叫 buildSettlements，仍 loadGrid', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 7, status: 'CLOSED' }],
    } as never)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { rows: GridRow[]; cycleStatus: string | null }

    expect(api.buildSettlements).not.toHaveBeenCalled()
    expect(api.getYearEndGrid).toHaveBeenCalledWith(7)
    expect(vm.rows).toHaveLength(1)
    expect(vm.cycleStatus).toBe('CLOSED')
  })

  it('無 WRITE 權限（hasPermission 回 false）：不呼叫 buildSettlements，仍 loadGrid', async () => {
    vi.mocked(hasPermission).mockReturnValue(false)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { rows: GridRow[] }

    expect(api.buildSettlements).not.toHaveBeenCalled()
    expect(api.getYearEndGrid).toHaveBeenCalledWith(7)
    expect(vm.rows).toHaveLength(1)
  })

  it('buildSettlements reject 時仍 loadGrid（靜默降級，不噴錯誤訊息）', async () => {
    vi.mocked(api.buildSettlements).mockRejectedValueOnce(new Error('build failed'))
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { rows: GridRow[] }

    expect(api.buildSettlements).toHaveBeenCalledWith(7, { included_resigned_employee_ids: [] })
    expect(api.getYearEndGrid).toHaveBeenCalledWith(7)
    expect(vm.rows).toHaveLength(1)
    // 靜默降級：不彈 dialog、不顯示訊息
    expect(vi.mocked(ElMessage.error)).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.warning)).not.toHaveBeenCalled()
  })

  it('listYearEndCycles 失敗時 fail-closed：不 build，仍 loadGrid（不白屏，狀態未知不重算）', async () => {
    vi.mocked(api.listYearEndCycles).mockRejectedValue(new Error('network error'))
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { rows: GridRow[]; cycleStatus: string | null }

    // fail-closed：cycle 狀態未知（null）→ 不對可能是 CLOSED 的 cycle 自動重算
    expect(api.buildSettlements).not.toHaveBeenCalled()
    expect(api.getYearEndGrid).toHaveBeenCalledWith(7)
    expect(vm.rows).toHaveLength(1)
    expect(vm.cycleStatus).toBeNull()
  })

  it('cycleId 不在清單（回 [] 或不含該 id）：fail-closed 不 build，仍 loadGrid', async () => {
    // 清單有資料但找不到 cycleId=7（例如清單只含其他週期），cycleStatus 退為 null
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 99, status: 'OPEN' }],
    } as never)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { rows: GridRow[]; cycleStatus: string | null }

    expect(api.buildSettlements).not.toHaveBeenCalled()
    expect(api.getYearEndGrid).toHaveBeenCalledWith(7)
    expect(vm.rows).toHaveLength(1)
    expect(vm.cycleStatus).toBeNull()
  })

  it('toolbar 於試算後顯示「最後試算」與格式化時間（HH:MM）', async () => {
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 1, skipped_finalized: 0, unmatched_count: 0, fallback_classes: 0, warnings: [] },
    } as never)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountView()

    const el = wrapper.find('[data-test="last-built-at"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('最後試算')
    expect(el.text()).toMatch(/\d{2}:\d{2}/)
  })

  it('手動「↻ 重新試算」按鈕維持現狀（onBuild 邏輯不受 initGrid 影響）', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 3, skipped_finalized: 1, unmatched_count: 0, fallback_classes: 0, warnings: [] },
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { onBuild: () => Promise<void> }

    // mount 已自動觸發一次 build + loadGrid；手動再觸發一次
    await vm.onBuild()
    await nextTick()

    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('已試算 3 筆，略過已簽 1 筆')
    // getYearEndGrid: mount 的 initGrid 一次 + 手動 onBuild 一次 = 2 次
    expect(api.getYearEndGrid).toHaveBeenCalledTimes(2)
  })
})

// ── Task 12：修 404（展開列內化）＋ build 摘要列／失敗降級 banner ──────────────
// el-table / el-table-column 需要真的執行 scoped #default slot 才能斷言展開列內容；
// 頂層 mountView() 的 true-stub 不會呼叫 scoped slot，只能驗證 vm 狀態。比照
// YearEndDetailView.spec.ts／InstitutionEventPanel.spec.ts 慣例另開一個會真渲染
// slot 的 mount helper，只給本區塊「渲染內容」相關案例用。
const ElTableStubEx = defineComponent({
  name: 'ElTableStubEx',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table' },
      (slots.default?.() || []).map((vnode, index) =>
        // @ts-expect-error TODO(ts-strict): 測試 stub 需要動態轉發任意 vnode.props，型別無法精準表達
        h(vnode.type, { ...(vnode.props ?? {}), data: props.data, key: index }, vnode.children),
      ),
    )
  },
})

const ElTableColumnStubEx = defineComponent({
  name: 'ElTableColumnStubEx',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table-column-stub' },
      (props.data as unknown[]).map((row: unknown, index: number) =>
        h('div', { key: index }, slots.default ? slots.default({ row }) : []),
      ),
    )
  },
})

const ElAlertStubEx = defineComponent({
  name: 'ElAlertStubEx',
  props: { title: { type: String, default: '' }, description: { type: String, default: '' } },
  inheritAttrs: false,
  setup(props, { attrs }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h('div', { class: 'el-alert', ...dataAttrs }, [
      h('div', { class: 'el-alert-title' }, props.title),
      h('div', { class: 'el-alert-desc' }, props.description),
    ])
  },
})

const ElButtonStubEx = defineComponent({
  name: 'ElButtonStubEx',
  inheritAttrs: false,
  setup(_, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h('button', { ...dataAttrs, onClick: () => emit('click') }, slots.default?.())
  },
})

async function mountViewWithTable() {
  const wrapper = mount(YearEndGridView, {
    global: {
      stubs: {
        'el-table': ElTableStubEx,
        'el-table-column': ElTableColumnStubEx,
        'el-descriptions': { template: '<div class="el-descriptions"><slot /></div>' },
        'el-descriptions-item': {
          template: '<div class="el-descriptions-item">{{ $attrs.label }}:<slot /></div>',
        },
        'el-alert': ElAlertStubEx,
        'el-button': ElButtonStubEx,
        'el-tag': { template: '<span><slot /></span>' },
        'el-dialog': true,
        'el-form': true,
        'el-form-item': true,
        'el-input-number': true,
      },
    },
  })
  await flushPromises()
  await nextTick()
  await nextTick()
  return wrapper
}

describe('YearEndGridView（Task 12：展開列修 404／build 摘要列／失敗降級 banner）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasPermission).mockReturnValue(true)
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 7, status: 'OPEN' }],
    } as never)
  })

  // 案①：原「展開」按鈕 push 到不存在的 /year_end/cycles/:id/settlements/:id
  // （本輪最嚴重的 404 硬傷）。修復後：操作欄不再有 detail-button，也不再呼叫
  // router.push。
  it('不再有「展開」按鈕、不再 router.push（原 404 硬傷已移除）', async () => {
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 1, skipped_finalized: 0, unmatched_count: 0, fallback_classes: 0, warnings: [] },
    } as never)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()

    expect(wrapper.find('[data-test="detail-button"]').exists()).toBe(false)
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('expandFields(row) 攤平主結算/動態獎金/合計/狀態/備註為 label-value pairs（formatCurrency 原始精度顯示）', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow({ remark: '114.08 到職' })],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      expandFields: (row: GridRow) => { label: string; value: string }[]
    }

    const fields = vm.expandFields(vm.rows[0]!)
    const byLabel = Object.fromEntries(fields.map((f) => [f.label, f.value]))

    // formatCurrency 不四捨五入（跟主表 moneyInt 不同——展開列供稽核核對用原始精度）
    expect(byLabel['主結算']).toBe('NT$29,044.71')
    expect(byLabel['考核上']).toBe('NT$3,312')
    expect(byLabel['超額']).toBe('NT$2,000')
    expect(byLabel['合計']).toBe('NT$40,106.71')
    expect(byLabel['狀態']).toBe('草稿')
    expect(byLabel['備註']).toBe('114.08 到職')
  })

  // 審查修繕（Important）：Element Plus 內部欄位排序（watcher.mjs）會把所有 fixed:left
  // 欄放最前、不保留模板宣告順序——expand 欄若未 fixed，實際渲染會被重排到姓名欄
  // （fixed="left"）之後；且本表欄寬總和 ~1767px 必觸發橫向捲動，未 fixed 的 expand 欄
  // 捲動後會滾出視窗，使用者失去展開把手。expand 欄必須帶 fixed="left" 併入 fixed 群組。
  it('展開欄（type=expand）帶 fixed="left"，避免被 Element Plus 重排到姓名欄後與橫向捲動流失', async () => {
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 1, skipped_finalized: 0, unmatched_count: 0, fallback_classes: 0, warnings: [] },
    } as never)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()
    const expandCol = wrapper.find('[data-test="expand-column"]')
    expect(expandCol.exists()).toBe(true)
    expect(expandCol.attributes('type')).toBe('expand')
    expect(expandCol.attributes('fixed')).toBe('left')
  })

  it('展開列（type=expand）實際渲染 el-descriptions，內容含主結算/合計/備註', async () => {
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 1, skipped_finalized: 0, unmatched_count: 0, fallback_classes: 0, warnings: [] },
    } as never)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow({ remark: '114.08 到職' })],
    } as never)

    const wrapper = await mountViewWithTable()
    const text = wrapper.text()

    expect(text).toContain('主結算')
    expect(text).toContain('NT$29,044.71')
    expect(text).toContain('合計')
    expect(text).toContain('NT$40,106.71')
    expect(text).toContain('114.08 到職')
  })

  // 案②：buildSettlements 回傳現在只彈一次 ElMessage——改為頁頂常駐摘要列，
  // 欄位以 BuildResultOut schema.d.ts 為準（built/skipped_finalized/unmatched_count/
  // fallback_classes/warnings）。既有 ElMessage.success 單次提示不受影響（仍保留）。
  it('build 成功後頁頂顯示摘要列（built/skipped_finalized/unmatched_count/fallback_classes），既有 ElMessage 不受影響', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 5, skipped_finalized: 2, unmatched_count: 3, fallback_classes: 1, warnings: [] },
    } as never)

    const wrapper = await mountViewWithTable()
    const vm = wrapper.vm as unknown as { onBuild: () => Promise<void> }

    await vm.onBuild()
    await nextTick()

    const banner = wrapper.find('[data-test="build-summary-banner"]')
    expect(banner.exists()).toBe(true)
    const bannerText = banner.text()
    expect(bannerText).toContain('建立 5')
    expect(bannerText).toContain('跳過已核定 2')
    expect(bannerText).toContain('未匹配 3')
    expect(bannerText).toContain('沿用舊生率 1')

    // 既有「只彈一次」的 ElMessage.success 仍保留，摘要列是額外常駐提示，不是取代
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('已試算 5 筆，略過已簽 2 筆')
  })

  // 案③：進頁自動 build 的 catch 原本完全靜默（不彈 dialog、不顯示訊息）；
  // 改為顯示 stale banner，既有靜默（不噴 ElMessage）行為不變——只改「失敗回饋」。
  it('進頁自動 build 失敗 → 顯示 stale banner（非靜默），仍不噴 ElMessage', async () => {
    vi.mocked(api.buildSettlements).mockRejectedValueOnce(new Error('build failed'))
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()
    const vm = wrapper.vm as unknown as { buildFailed: boolean }

    expect(vm.buildFailed).toBe(true)
    const banner = wrapper.find('[data-test="build-failed-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('自動試算失敗，目前顯示上次試算資料')
    // 尚未成功試算過（第一次就失敗）→ fallback 文案
    expect(banner.text()).toContain('尚無成功試算紀錄')

    // 既有靜默降級行為不變：仍不噴 ElMessage.error / warning
    expect(vi.mocked(ElMessage.error)).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.warning)).not.toHaveBeenCalled()
  })

  it('buildFailedDescription：曾成功試算過時改顯示最後成功時間（非 fallback 文案）', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)
    vi.mocked(api.buildSettlements).mockRejectedValueOnce(new Error('x'))

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      buildFailedDescription: string
      lastBuiltAt: Date | null
    }

    expect(vm.buildFailedDescription).toContain('尚無成功試算紀錄')

    vm.lastBuiltAt = new Date(2026, 0, 1, 9, 30)
    await nextTick()
    expect(vm.buildFailedDescription).toMatch(/09:30/)
  })

  // 案④（非 TDD 三案，但同批修繕）：狀態 tag/標籤改用單一來源常數
  // SIGN_STATUS_LABEL/SIGN_STATUS_TAG（@/constants/appraisalYearEnd），不再各自
  // 維護一份本地 STATUS_LABELS/STATUS_TAG_TYPE。
  it('狀態欄位改用 SIGN_STATUS_LABEL／SIGN_STATUS_TAG 單一來源', async () => {
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 1, skipped_finalized: 0, unmatched_count: 0, fallback_classes: 0, warnings: [] },
    } as never)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow({ status: 'ACCOUNTING_SIGNED' })],
    } as never)

    const wrapper = await mountViewWithTable()
    expect(wrapper.text()).toContain('會計已簽')
  })
})
