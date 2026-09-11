import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import BillSlipTab from '@/components/fees/BillSlipTab.vue'
import BankReconTab from '@/components/fees/BankReconTab.vue'
import CollectionReconTab from '@/components/fees/CollectionReconTab.vue'
import RefundSuggestModal from '@/components/fees/RefundSuggestModal.vue'
import * as fees from '@/api/fees'

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/api/fees', async (original) => {
  const actual = await original()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn(), success: vi.fn() }, ElMessageBox: {} }))
const box = { template: '<div><slot /><slot name="footer" /></div>' }
const stubs = {
  ElOption: true, ElTableColumn: true, ElCheckbox: true, ElSkeleton: true, ElTag: true, ElPagination: true,
  ElDialog: box, ElForm: box, ElFormItem: box, ElDescriptions: box, ElDescriptionsItem: box,
  ElAlert: box, ElUpload: { name: 'ElUpload', props: ['onChange'], template: '<div><slot /></div>' },
  ElTable: { name: 'ElTable', props: ['data'], template: '<div>{{ JSON.stringify(data) }}</div>' },
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input />' },
  ElSelect: { props: ['modelValue'], emits: ['update:modelValue'], template: '<select />' },
  ElDatePicker: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input />' },
  ElInputNumber: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input />' },
}
const mount = (component, props = {}) => shallowMount(component, { props, global: { stubs, directives: { loading: (el, binding) => { el.setAttribute('aria-busy', String(binding.value)) } } } })
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise,resolve,reject} }
const button = (w, text) => w.findAll('button').find(b => b.text() === text)
beforeEach(() => { vi.resetAllMocks(); fees.getBillSlipBatches.mockResolvedValue([]) })

it('檢核檔換檔後不得顯示舊預覽或確認匯入', async () => {
  const pending = deferred()
  fees.previewBillSlipBatch.mockReturnValue(pending.promise)
  const w = mount(BillSlipTab)
  const upload = w.findComponent({name:'ElUpload'})
  upload.props('onChange')({raw: new File(['a'], 'a.xls')})
  await nextTick()
  await w.get('[data-test="run-preview"]').trigger('click')
  upload.props('onChange')({raw: new File(['b'], 'b.xls')})
  pending.resolve({bill_year:2026,bill_month:9,row_count:1})
  await flushPromises()
  expect(w.find('[data-test="slip-preview"]').exists()).toBe(false)
  expect(w.find('[data-test="run-import"]').exists()).toBe(false)
  w.unmount()
})

describe.each([
  ['存摺', BankReconTab, 'getBankTransactions', 'recon-scope-allocated'],
  ['代收', CollectionReconTab, 'getCollectionPayments', 'collection-scope-allocated'],
])('%s 查詢', (_name, component, method, selector) => {
  it('新查詢回覆後不被舊結果覆蓋', async () => {
    const old = deferred(), current = deferred()
    fees[method].mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const w = mount(component)
    await w.get(`[data-test="${selector}"]`).trigger('click')
    current.resolve({items:[{id:22}],total:1}); await flushPromises()
    old.resolve({items:[{id:11}],total:9}); await flushPromises()
    expect(w.findComponent({name:'ElTable'}).props('data')).toEqual([{id:22}])
    w.unmount()
  })
  it('舊請求失敗不解除新查詢 loading，也不顯示過期錯誤', async () => {
    const old = deferred(), current = deferred()
    fees[method].mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const w = mount(component)
    await w.get(`[data-test="${selector}"]`).trigger('click')
    old.reject(new Error('過期錯誤')); await flushPromises()
    expect(w.findComponent({name:'ElTable'}).attributes('aria-busy')).toBe('true')
    expect(ElMessage.error).not.toHaveBeenCalled()
    current.resolve({items:[{id:22}],total:1}); await flushPromises()
    expect(w.findComponent({name:'ElTable'}).attributes('aria-busy')).toBe('false')
    w.unmount()
  })
  it('新結果顯示後舊請求失敗不得清空新列或顯示錯誤', async () => {
    const old = deferred(), current = deferred()
    fees[method].mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const w = mount(component)
    await w.get(`[data-test="${selector}"]`).trigger('click')
    current.resolve({items:[{id:22}],total:1}); await flushPromises()
    old.reject(new Error('過期錯誤')); await flushPromises()
    expect(w.findComponent({name:'ElTable'}).props('data')).toEqual([{id:22}])
    expect(ElMessage.error).not.toHaveBeenCalled()
    w.unmount()
  })
  it('新查詢開始即清除可操作舊資料，失敗不保留舊列', async () => {
    const current = deferred()
    fees[method].mockResolvedValueOnce({items:[{id:11}],total:9}).mockReturnValueOnce(current.promise)
    const w = mount(component); await flushPromises()
    await w.get(`[data-test="${selector}"]`).trigger('click')
    expect(w.findComponent({name:'ElTable'}).props('data')).toEqual([])
    current.reject(new Error('合成查詢失敗')); await flushPromises()
    expect(w.findComponent({name:'ElTable'}).props('data')).toEqual([])
    w.unmount()
  })
})

const refund = () => mount(RefundSuggestModal, {modelValue:true,record:{id:5,fee_type:'registration',amount_paid:19000}})
const suggestion = {suggested_amount:5000,calc_method:'enrollment_ratio',calc_payload:{formula:'合成建議'}}
it('教保日數明確輸入零必須送出，未填欄位省略', async () => {
  fees.suggestRefund.mockResolvedValue(suggestion)
  const w = refund()
  w.vm.form.withdrawal_date = new Date(2026,8,1); w.vm.form.T_served_override = 0
  await nextTick(); await button(w,'自動計算建議').trigger('click'); await flushPromises()
  expect(fees.suggestRefund).toHaveBeenCalledWith(5,{withdrawal_date:'2026-09-01',T_served_override:0})
  w.unmount()
})
it('變更日期使尚未完成的建議失效', async () => {
  const pending = deferred(); fees.suggestRefund.mockReturnValue(pending.promise)
  const w = refund(); w.vm.form.withdrawal_date = new Date(2026,8,1)
  await nextTick(); await button(w,'自動計算建議').trigger('click')
  w.vm.form.withdrawal_date = new Date(2026,8,20); await nextTick()
  pending.resolve(suggestion); await flushPromises()
  expect(button(w,'套用建議')).toBeUndefined()
  w.unmount()
})
it('套用後變更日數會清除建議金額，但仍可手動退費', async () => {
  fees.suggestRefund.mockResolvedValue(suggestion); fees.refundFeeRecord.mockResolvedValue({})
  const w = refund(); w.vm.form.withdrawal_date = new Date(2026,8,1)
  await nextTick(); await button(w,'自動計算建議').trigger('click'); await flushPromises()
  await button(w,'套用建議').trigger('click')
  w.vm.form.T_served_override=0; await nextTick()
  expect(button(w,'套用建議')).toBeUndefined()
  expect(w.vm.form.amount).toBe(0)
  w.vm.form.amount=1000; w.vm.form.reason='人工核實退費'; await nextTick()
  await button(w,'確認退費').trigger('click')
  await button(w,'確認退費 NT$1,000').trigger('click'); await flushPromises()
  expect(fees.refundFeeRecord).toHaveBeenCalledWith(5,expect.objectContaining({amount:1000,calc_payload:undefined,calc_method:undefined}))
  w.unmount()
})

it('檢核檔預覽失敗後即使直接觸發匯入也不得送出', async () => {
  fees.previewBillSlipBatch.mockRejectedValue(new Error('合成預覽失敗'))
  const w = mount(BillSlipTab)
  w.findComponent({name:'ElUpload'}).props('onChange')({raw:new File(['a'],'a.xls')})
  await nextTick()
  w.findComponent('[aria-label="發單批次名稱"]').vm.$emit('update:modelValue','合成批次')
  w.findComponent('[aria-label="批次類型"]').vm.$emit('update:modelValue','monthly')
  await w.get('[data-test="run-preview"]').trigger('click'); await flushPromises()
  await w.vm.$.setupState.runImport()
  expect(fees.importBillSlipBatch).not.toHaveBeenCalled()
  w.unmount()
})
it('檢核檔相符預覽可匯入原檔，連按只送一次', async () => {
  const pending = deferred()
  fees.previewBillSlipBatch.mockResolvedValue({bill_year:2026,bill_month:9,row_count:1})
  fees.importBillSlipBatch.mockReturnValue(pending.promise)
  const w = mount(BillSlipTab), file = new File(['a'],'a.xls')
  w.findComponent({name:'ElUpload'}).props('onChange')({raw:file})
  await nextTick()
  w.findComponent('[aria-label="批次類型"]').vm.$emit('update:modelValue','monthly')
  await w.get('[data-test="run-preview"]').trigger('click'); await flushPromises()
  await w.get('[data-test="run-import"]').trigger('click')
  await w.vm.$.setupState.runImport()
  expect(fees.importBillSlipBatch).toHaveBeenCalledTimes(1)
  expect(fees.importBillSlipBatch.mock.calls[0][0]).toBe(fees.previewBillSlipBatch.mock.calls[0][0])
  pending.reject(new Error('合成匯入失敗')); await flushPromises()
  w.unmount()
})

it('建議完成後修改日期立即禁止提交已套用的舊金額', async () => {
  fees.suggestRefund.mockResolvedValue(suggestion)
  const w = refund(); w.vm.form.withdrawal_date = new Date(2026,8,1)
  await nextTick(); await button(w,'自動計算建議').trigger('click'); await flushPromises()
  await button(w,'套用建議').trigger('click')
  w.vm.form.reason='人工核實退費'; await nextTick()
  await button(w,'確認退費').trigger('click')
  w.vm.form.withdrawal_date = new Date(2026,8,20)
  await w.vm.onSubmit(); await nextTick()
  expect(fees.refundFeeRecord).not.toHaveBeenCalled()
  expect(w.vm.form.amount).toBe(0)
  expect(w.vm.reviewing).toBe(false)
  w.unmount()
})
it('手動金額不因日期變動清空，舊建議計算資料不送出', async () => {
  fees.suggestRefund.mockResolvedValue(suggestion); fees.refundFeeRecord.mockResolvedValue({})
  const w = refund(); w.vm.form.withdrawal_date = new Date(2026,8,1)
  await nextTick(); await button(w,'自動計算建議').trigger('click'); await flushPromises()
  await button(w,'套用建議').trigger('click')
  w.vm.form.amount=1000; w.vm.form.reason='人工核實退費'
  w.vm.form.withdrawal_date = new Date(2026,8,20); await nextTick()
  expect(w.vm.form.amount).toBe(1000)
  await w.vm.onSubmit()
  expect(fees.refundFeeRecord).toHaveBeenCalledWith(5,expect.objectContaining({amount:1000,calc_payload:undefined,calc_method:undefined}))
  w.unmount()
})
