import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import BankReconTab from '../BankReconTab.vue'
import CollectionReconTab from '../CollectionReconTab.vue'

const api = vi.hoisted(() => ({
  previewBankImport: vi.fn(), confirmBankImport: vi.fn(),
  previewCollectionImport: vi.fn(), confirmCollectionImport: vi.fn(),
  getBankTransactions: vi.fn(), getCollectionPayments: vi.fn(),
  batchCollectionCandidates: vi.fn(),
}))
vi.mock('@/api/fees', () => api)
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() }, ElMessageBox: {} }))
function deferred() {
  let resolve!: (value: object) => void
  let reject!: (error: Error) => void
  const promise = new Promise<object>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const preview = { row_count: 17, duplicate_count: 0, errors: [], credit_total: 1700, debit_total: 0 }
const stubs = {
  'el-table': { template: '<div />' },
  'el-table-column': { template: '<span />' },
  'el-upload': { props: ['onChange'], template: '<div><slot /></div>' },
  'el-button': { props: ['loading', 'disabled'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  AllocationDialog: true, CollectionAllocationDialog: true, CollectionBatchDrawer: true,
}
beforeEach(() => {
  vi.resetAllMocks()
  api.getBankTransactions.mockResolvedValue({ items: [], total: 0 })
  api.getCollectionPayments.mockResolvedValue({ items: [], total: 0 })
  api.batchCollectionCandidates.mockResolvedValue({ auto_high_count: 0 })
})
for (const [name, component, previewApi, importApi, previewSelector, importSelector] of [
  ['銀行', BankReconTab, api.previewBankImport, api.confirmBankImport, 'run-preview', 'run-import'],
  ['代收', CollectionReconTab, api.previewCollectionImport, api.confirmCollectionImport, 'run-preview', 'run-import'],
] as const) {
  describe(`${name}匯入檔案一致性`, () => {
    function setup() {
      const w = mount(component, { global: { stubs, directives: { loading: () => {} } } })
      const choose = async (file: File) => {
        w.findComponent(stubs['el-upload']).props('onChange')({ raw: file })
        await flushPromises()
      }
      return { w, choose }
    }
    it('選檔後必須先預覽，匯入失敗可重送同一份已預覽檔', async () => {
      previewApi.mockResolvedValue(preview)
      importApi.mockRejectedValueOnce(new Error('匯入失敗')).mockResolvedValueOnce({ id: 1, created: true, row_count: 17, duplicate_count: 0 })
      const { w, choose } = setup()
      const a = new File(['A'], 'A.csv')
      await choose(a)
      expect(w.find(`[data-test="${importSelector}"]`).exists()).toBe(false)
      await w.get(`[data-test="${previewSelector}"]`).trigger('click')
      await flushPromises()
      await w.get(`[data-test="${importSelector}"]`).trigger('click')
      await flushPromises()
      expect(w.get(`[data-test="${importSelector}"]`).attributes('disabled')).toBeUndefined()
      await w.get(`[data-test="${importSelector}"]`).trigger('click')
      await flushPromises()
      expect(importApi).toHaveBeenCalledTimes(2)
      expect(importApi).toHaveBeenNthCalledWith(1, a)
      expect(importApi).toHaveBeenNthCalledWith(2, a)
    })
    it('A 預覽未回來時換 B，不得顯示 A 的確認匯入', async () => {
      const pending = deferred()
      previewApi.mockReturnValueOnce(pending.promise)
      const { w, choose } = setup()
      await choose(new File(['A'], 'A.csv'))
      await w.get(`[data-test="${previewSelector}"]`).trigger('click')
      await choose(new File(['B'], 'B.csv'))
      pending.resolve(preview)
      await flushPromises()
      expect(w.find(`[data-test="${importSelector}"]`).exists()).toBe(false)
      expect(importApi).not.toHaveBeenCalled()
    })
    it('B 的新預覽先完成時，A 的舊回應不能覆蓋統計或切換實際匯入檔', async () => {
      const pending = deferred()
      previewApi.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...preview, row_count: 23 })
      importApi.mockResolvedValue({ id: 1, created: true, row_count: 23, duplicate_count: 0 })
      const { w, choose } = setup()
      await choose(new File(['A'], 'A.csv'))
      await w.get(`[data-test="${previewSelector}"]`).trigger('click')
      const b = new File(['B'], 'B.csv')
      await choose(b)
      await w.get(`[data-test="${previewSelector}"]`).trigger('click')
      await flushPromises()
      pending.resolve(preview)
      await flushPromises()
      expect(w.get('[data-test="import-preview"]').text()).toContain('23')
      await w.get(`[data-test="${importSelector}"]`).trigger('click')
      await flushPromises()
      expect(importApi).toHaveBeenCalledWith(b)
    })
    it('重新預覽失敗後不能使用前次成功結果匯入', async () => {
      previewApi.mockResolvedValueOnce(preview).mockRejectedValueOnce(new Error('預覽失敗'))
      const { w, choose } = setup()
      await choose(new File(['A'], 'A.csv'))
      await w.get(`[data-test="${previewSelector}"]`).trigger('click')
      await flushPromises()
      await w.get(`[data-test="${previewSelector}"]`).trigger('click')
      await flushPromises()
      expect(w.find(`[data-test="${importSelector}"]`).exists()).toBe(false)
    })
    it('匯入 A 期間選 B，A 完成不得清除 B，B 仍須自己預覽', async () => {
      previewApi.mockResolvedValue(preview)
      const pending = deferred()
      importApi.mockReturnValueOnce(pending.promise)
      const { w, choose } = setup()
      const a = new File(['A'], 'A.csv')
      await choose(a)
      await w.get(`[data-test="${previewSelector}"]`).trigger('click')
      await flushPromises()
      await w.get(`[data-test="${importSelector}"]`).trigger('click')
      expect(importApi).toHaveBeenCalledWith(a)
      expect(w.get(`[data-test="${previewSelector}"]`).attributes('disabled')).toBeDefined()
      await w.get(`[data-test="${importSelector}"]`).trigger('click')
      expect(importApi).toHaveBeenCalledTimes(1)
      await choose(new File(['B'], 'B.csv'))
      pending.resolve({ id: 1, created: true, row_count: 17, duplicate_count: 0 })
      await flushPromises()
      expect(w.text()).toContain('B.csv')
      expect(w.find(`[data-test="${importSelector}"]`).exists()).toBe(false)
    })
  })
}
