import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const previewMock = vi.fn(async () => ({ data: { participants: [] } }))
const syncMock = vi.fn(async () => ({ data: { deleted_count: 1, inserted_count: 2, skipped_manual_count: 0, items: [] } }))
vi.mock('@/api/appraisal', () => ({
  previewAppraisalScore: (...a: unknown[]) => previewMock(...a),
  syncAppraisalScoreItems: (...a: unknown[]) => syncMock(...a),
}))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn(async () => true) } }))

import ScorePreviewDialog from '../components/ScorePreviewDialog.vue'

// ⚠ 本 repo `vitest.config.js`（獨立於 `vite.config.js`，vitest 不會 merge 兩者）未掛
// unplugin-vue-components，`el-*` 標籤在測試環境下不會解析成真元件。直接 mount 只 stub
// teleport（brief Step 1 給的骨架）會讓 `el-table-column` 的 `#default="{ row }"` 這類
// scoped slot 在 Vue 的 normalizeChildren「未解析元件→視為原生元素」分支被以 0 參數呼叫，
// 炸出 `Cannot destructure property 'row' of undefined`（footer 按鈕因而整棵渲染中斷、
// 測試斷言不到 confirm-sync-btn）。沿用同目錄既有測試慣例（原 ScorePreviewDialog.spec.js /
// CurrentSemesterOverview.spec.js）改用輕量 stub 元件，行為斷言仍與 brief 給的一致。
function flattenVnodes(vnodes: unknown[]): { type: unknown; props: unknown; children: unknown }[] {
  const out: { type: unknown; props: unknown; children: unknown }[] = []
  for (const v of (vnodes || []) as { type: unknown; props: unknown; children: unknown }[]) {
    if (!v) continue
    if (Array.isArray(v.children) && typeof v.type === 'symbol') {
      out.push(...flattenVnodes(v.children))
    } else if (v.type) {
      out.push(v)
    }
  }
  return out
}

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      (props.data as unknown[]).map((row, index) =>
        h('div', { key: index }, slots.default ? slots.default({ row }) : []),
      ),
    )
  },
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => {
      const children = flattenVnodes(slots.default?.() || [])
      return h(
        'div',
        { class: 'el-table' },
        children.map((vnode, index) =>
          h(vnode.type as never, { ...(vnode.props as object), data: props.data, key: index }, vnode.children as never),
        ),
      )
    }
  },
})

const STUBS = {
  teleport: true,
  'el-dialog': {
    props: ['modelValue'],
    template: '<div v-if="modelValue" data-test="score-preview-dialog"><slot /><slot name="footer" /></div>',
  },
  'el-alert': { template: '<div class="el-alert"><slot /></div>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-button': { template: '<button><slot /></button>' },
  'el-switch': { template: '<label class="el-switch"><input type="checkbox" /></label>' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<button><slot /></button>' },
  'el-tooltip': { template: '<span class="el-tooltip-stub"><slot /></span>' },
}

const mountOpts = (props: Record<string, unknown>) => ({
  props: { visible: true, cycleId: 1, canWrite: false, hasNonParticipant: false, ...props },
  global: { stubs: STUBS, directives: { loading: () => {} } },
})

describe('統一分數同步 dialog', () => {
  beforeEach(() => { previewMock.mockClear(); syncMock.mockClear() })

  it('開啟即載入 26 欄預覽與同步差異摘要', async () => {
    mount(ScorePreviewDialog, mountOpts({ canWrite: true, hasNonParticipant: false, cycleStatus: 'OPEN' }))
    await flushPromises()
    expect(previewMock).toHaveBeenCalledWith(1)
    expect(syncMock).toHaveBeenCalledWith(1, { dryRun: true })
  })

  it('無寫入權限不顯示確認寫入，且不觸發 sync dry-run', async () => {
    const w = mount(ScorePreviewDialog, mountOpts({ canWrite: false, hasNonParticipant: false, cycleStatus: 'OPEN' }))
    await flushPromises()
    expect(w.find('[data-test="confirm-sync-btn"]').exists()).toBe(false)
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('有非成員時確認寫入 disabled', async () => {
    const w = mount(ScorePreviewDialog, mountOpts({ canWrite: true, hasNonParticipant: true, cycleStatus: 'OPEN' }))
    await flushPromises()
    expect(w.find('[data-test="confirm-sync-btn"]').attributes('disabled')).toBeDefined()
  })

  it('確認寫入呼叫 dry_run=false 並 emit synced', async () => {
    const w = mount(ScorePreviewDialog, mountOpts({ canWrite: true, hasNonParticipant: false, cycleStatus: 'OPEN' }))
    await flushPromises()
    await w.find('[data-test="confirm-sync-btn"]').trigger('click')
    await flushPromises()
    expect(syncMock).toHaveBeenCalledWith(1, { dryRun: false })
    expect(w.emitted('synced')).toBeTruthy()
  })

  // Important #1（真回歸）：score_preview 只需 APPRAISAL_READ、不檢查 cycle 狀態，
  // 但 sync_score_items（含 dry_run）後端一律要求 APPRAISAL_EVENT_WRITE 且 cycle
  // 非 OPEN 直接 400。只有 READ 沒有 WRITE 權限、或 cycle 非 OPEN 的使用者一開
  // dialog 不該撞 403/400——唯讀矩陣仍要載入，sync dry-run 必須跳過且不可誤顯示
  // 成「可重試的錯誤」，而是中性訊息。
  it('canWrite 但週期非 OPEN 時：仍載入唯讀矩陣、不觸發 sync dry-run、無錯誤 banner、顯示中性唯讀訊息', async () => {
    const w = mount(ScorePreviewDialog, mountOpts({ canWrite: true, hasNonParticipant: false, cycleStatus: 'LOCKED' }))
    await flushPromises()
    expect(previewMock).toHaveBeenCalledWith(1)
    expect(syncMock).not.toHaveBeenCalled()
    expect(w.find('[data-test="sync-diff-error-alert"]').exists()).toBe(false)
    expect(w.find('[data-test="sync-diff-banner"]').exists()).toBe(false)
    expect(w.find('[data-test="confirm-sync-btn"]').exists()).toBe(false)
    const note = w.find('[data-test="sync-diff-skipped-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('無寫入權限或此週期非進行中，僅顯示唯讀分數矩陣')
  })

  it('無寫入權限但週期為 OPEN 時：同樣跳過 sync dry-run、顯示中性唯讀訊息', async () => {
    const w = mount(ScorePreviewDialog, mountOpts({ canWrite: false, hasNonParticipant: false, cycleStatus: 'OPEN' }))
    await flushPromises()
    expect(previewMock).toHaveBeenCalledWith(1)
    expect(syncMock).not.toHaveBeenCalled()
    expect(w.find('[data-test="sync-diff-error-alert"]').exists()).toBe(false)
    expect(w.find('[data-test="sync-diff-skipped-note"]').exists()).toBe(true)
  })
})
