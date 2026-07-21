import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h, Fragment } from 'vue'
import YearEndGridView from '../YearEndGridView.vue'
import { BONUS_COL_KEYS, loadVisibleBonusCols } from '../gridColumns'

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
    props: { cycleId: 7 },
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

  // Task 4（批次2b-1）：手改 dialog（openEdit/submitEdit/editForm）已整支移除，
  // 就地編輯的預填/diff-only 送出邏輯改由 GridRowDetailDrawer 承接，完整覆蓋見
  // GridRowDetailDrawer.spec.ts。這裡只驗證 grid 層「開抽屜」的接線本身。
  it('openDrawer(row) 設定 drawerRow/drawerVisible，供「明細」按鈕觸發', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      drawerVisible: boolean
      drawerRow: GridRow | null
      openDrawer: (row: GridRow) => void
    }

    expect(vm.drawerVisible).toBe(false)
    expect(vm.drawerRow).toBeNull()

    vm.openDrawer(vm.rows[0])
    await nextTick()

    expect(vm.drawerVisible).toBe(true)
    expect(vm.drawerRow).toBe(vm.rows[0])
  })

  // 明細抽屜 @saved 觸發 loadGrid 重新載入（取代舊 submitEdit 內直接 await loadGrid()）。
  it('drawer 的 saved 事件觸發 loadGrid 重新載入 grid', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)

    const wrapper = await mountView()
    const drawer = wrapper.findComponent({ name: 'GridRowDetailDrawer' })
    expect(drawer.exists()).toBe(true)

    drawer.vm.$emit('saved')
    await nextTick()

    // mount 的 initGrid 一次 + saved 事件觸發一次 = 2 次
    expect(api.getYearEndGrid).toHaveBeenCalledTimes(2)
  })

  // Case 4（改版）：「明細」按鈕不再受 DRAFT 狀態或 canWrite 限制——所有 status
  // 皆可開抽屜看 breakdown，就地編輯區的顯示/隱藏改由 GridRowDetailDrawer 內部
  // canEdit 負責（見 GridRowDetailDrawer.spec.ts），grid 層不再需要重複這道判斷。
  it('FINALIZED row 仍可 openDrawer（明細按鈕不受狀態限制）', async () => {
    const finalizedRow = makeRow({ status: 'FINALIZED', settlement_id: 99 })
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [finalizedRow],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      drawerVisible: boolean
      drawerRow: GridRow | null
      openDrawer: (row: GridRow) => void
    }

    vm.openDrawer(vm.rows[0])
    await nextTick()

    expect(vm.drawerVisible).toBe(true)
    expect(vm.drawerRow?.status).toBe('FINALIZED')
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
// Task 3（批次2b-1）：獎金欄改條件渲染（v-for over visibleBonusColumns，長度可能為 0）
// 後，Vue 編譯器把帶 v-for 的元件子節點包成單一 Fragment vnode（.children 才是真正
// 逐項的 el-table-column vnode 陣列）。原本 slots.default() 攤平邏輯只認頂層 vnode，
// 直接把 Fragment 整個當一個 vnode 轉送給 h(vnode.type, { data, ... })——data 這個
// prop 因此從未落到 Fragment 內真正的各個 el-table-column 子 vnode 上（Fragment 不會
// 像元件一樣把 props 轉發給 children），造成 v-for 產生的欄位縱使數量對了、內容卻是
// 空的（ElTableColumnStubEx 的 data prop 退回宣告的 default: []）。normalize() 遞迴
// 展開 Fragment，讓 data 能正確轉送到每個實際欄位 vnode。
function normalizeColumnVnodes(vnodes: unknown[]): { type: unknown; props: Record<string, unknown> | null; children: unknown }[] {
  return vnodes.flatMap((vnode) => {
    const v = vnode as { type: unknown; props: Record<string, unknown> | null; children: unknown }
    if (v.type === Fragment) {
      return normalizeColumnVnodes(Array.isArray(v.children) ? v.children : [])
    }
    return [v]
  })
}

const ElTableStubEx = defineComponent({
  name: 'ElTableStubEx',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table' },
      normalizeColumnVnodes(slots.default?.() || []).map((vnode, index) =>
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
    props: { cycleId: 7 },
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

  // Task 8③：展開列金額格式改對齊主列（moneyInt，顯示層四捨五入到整數元），
  // 不再用 formatCurrency 顯示原始精度——同一筆金額主列/展開列應顯示同一個數字。
  it('expandFields(row) 攤平主結算/動態獎金/合計/狀態/備註為 label-value pairs（moneyInt 對齊主列，四捨五入到整數元）', async () => {
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

    // moneyInt 四捨五入到整數元（29044.71 → 29045），與主列同一筆金額顯示一致
    expect(byLabel['主結算']).toBe('NT$29,045')
    expect(byLabel['考核上']).toBe('NT$3,312')
    expect(byLabel['超額']).toBe('NT$2,000')
    expect(byLabel['合計']).toBe('NT$40,107')
    expect(byLabel['狀態']).toBe('草稿')
    expect(byLabel['備註']).toBe('114.08 到職')
  })

  // Task 3（批次2b-1）：expand 欄已移除（改列內就地展開讓位給明細抽屜，Task 4 承接），
  // el-table 不再渲染 type="expand" 欄；expandFields() 函式本身仍保留供 Task 4 抽屜沿用
  // （見下方 vm-layer 測試），這裡只驗證 DOM 不再有 expand 把手。
  it('el-table 不再渲染 expand 欄（改摘要表 + 明細另由 Task 4 抽屜承接）', async () => {
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 1, skipped_finalized: 0, unmatched_count: 0, fallback_classes: 0, warnings: [] },
    } as never)
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()
    expect(wrapper.find('[data-test="expand-column"]').exists()).toBe(false)
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

// ── Task 3（批次2b-1）：grid 改 6 欄摘要表＋獎金欄位開關 chips ──────────────
// 7 欄 + 9 個常駐獎金欄 ≈1767px 必橫捲；改預設全不顯示獎金欄（只 6 欄摘要：姓名/
// 主結算/特別獎金合計/合計/狀態/操作，零橫捲），勾選表頭上方 chip 才插回該獎金欄，
// 勾選狀態存 localStorage。
//
// 注意：ElTableColumnStubEx（見上方）只呼叫 slots.default（每列 cell 內容），不會
// 渲染 label / #header——因此「欄位是否存在」改用兩種可靠訊號斷言：① 直接數
// `.el-table-column-stub` 的渲染數量（等同實際欄數）② 該獎金欄唯一的金額字串是否
// 出現在 grid-table 範圍內（chips 本身在 el-table 外，不會誤命中）。
describe('YearEndGridView（Task 3：grid 6 欄摘要表＋獎金欄位開關 chips）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(hasPermission).mockReturnValue(true)
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 7, status: 'OPEN' }],
    } as never)
  })

  it('預設 visibleBonusCols 為空集合，主表只渲染 6 欄（零橫捲）', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()
    const vm = wrapper.vm as unknown as { visibleBonusCols: Set<string> }

    expect(vm.visibleBonusCols.size).toBe(0)
    // 姓名/主結算/特別獎金合計/合計/狀態/操作 = 6 欄，動態獎金欄 0 個
    expect(wrapper.findAll('.el-table-column-stub')).toHaveLength(6)
    // 該筆列的考核上金額（NT$3,312）不應出現在表格範圍內（欄位未渲染）
    expect(wrapper.find('[data-test="grid-table"]').text()).not.toContain('NT$3,312')
  })

  it('特別獎金合計欄加總 special_bonuses 各項（3312+2000=5312）', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      specialBonusTotal: (row: GridRow) => number
    }

    expect(vm.specialBonusTotal(vm.rows[0]!)).toBe(5312)
    expect(wrapper.find('[data-test="grid-table"]').text()).toContain('NT$5,312')
  })

  it('勾選 chip 後該獎金欄插回主表（7 欄），並持久化到 localStorage；再次勾選還原 6 欄', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()
    const vm = wrapper.vm as unknown as {
      visibleBonusCols: Set<string>
      toggleBonusCol: (key: string) => void
    }

    vm.toggleBonusCol('APPRAISAL_HALF_BONUS_FIRST')
    await nextTick()

    expect(vm.visibleBonusCols.has('APPRAISAL_HALF_BONUS_FIRST')).toBe(true)
    expect(wrapper.findAll('.el-table-column-stub')).toHaveLength(7)
    expect(wrapper.find('[data-test="grid-table"]').text()).toContain('NT$3,312')
    // 持久化：獨立重讀 localStorage（不透過 vm）驗證真的寫入，非僅記憶體 ref
    expect(loadVisibleBonusCols().has('APPRAISAL_HALF_BONUS_FIRST')).toBe(true)

    // 再點一次 toggle 回去
    vm.toggleBonusCol('APPRAISAL_HALF_BONUS_FIRST')
    await nextTick()

    expect(vm.visibleBonusCols.has('APPRAISAL_HALF_BONUS_FIRST')).toBe(false)
    expect(wrapper.findAll('.el-table-column-stub')).toHaveLength(6)
    expect(loadVisibleBonusCols().has('APPRAISAL_HALF_BONUS_FIRST')).toBe(false)
  })

  it('mount 時讀取既有 localStorage 勾選狀態（跨頁/重整記得住）', async () => {
    localStorage.setItem('ye-grid-visible-bonus-cols', JSON.stringify(['EXCESS_ENROLLMENT']))
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()
    const vm = wrapper.vm as unknown as { visibleBonusCols: Set<string> }

    expect(vm.visibleBonusCols.has('EXCESS_ENROLLMENT')).toBe(true)
    expect(wrapper.findAll('.el-table-column-stub')).toHaveLength(7)
  })

  it('BONUS_COL_KEYS 9 個 key 各渲染一個 chip，label 對應中文標籤', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()

    expect(BONUS_COL_KEYS).toHaveLength(9)
    for (const key of BONUS_COL_KEYS) {
      expect(wrapper.find(`[data-test="bonus-col-chip-${key}"]`).exists()).toBe(true)
    }
    expect(wrapper.findAll('[data-test^="bonus-col-chip-"]')).toHaveLength(9)

    const chipsText = wrapper.find('[data-test="bonus-col-chips"]').text()
    expect(chipsText).toContain('考核上')
    expect(chipsText).toContain('其他')
  })

  it('el-table 不再有 max-height 以外的橫捲隱患：預設狀態下欄寬總和遠小於原本 ~1767px', async () => {
    // 迴歸防線：6 欄的既有 width（120+130+140+145+110+200）遠小於原本 7+9 欄總和，
    // 不需要真的量測 DOM 寬度，只需確認動態欄位為 0（見上方測試）＋欄數為 6 即可
    // 代表零橫捲——此案僅作意圖說明，實際斷言已由「只渲染 6 欄」涵蓋，故此處只
    // 再次確認 visibleBonusColumns 預設為空陣列（供 template v-for 直接消費）。
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)

    const wrapper = await mountViewWithTable()
    const vm = wrapper.vm as unknown as { visibleBonusColumns: { key: string; label: string }[] }

    expect(vm.visibleBonusColumns).toEqual([])
  })
})
