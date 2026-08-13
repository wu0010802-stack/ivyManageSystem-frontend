/**
 * ConfirmDialog emit 順序回歸測試（2026-08-13 家長端 QA 巡檢）。
 *
 * defect class：`onConfirm` 先 emit `update:open=false` 再 emit `confirm`，
 * 而呼叫端的慣用 pattern 是
 *
 *   const xOpen = computed({
 *     get: () => target.value !== null,
 *     set: (v) => { if (!v) target.value = null },   // ← update:open 先到會清空 target
 *   })
 *   <ConfirmDialog v-model:open="xOpen" @confirm="doX" />  // doX 讀 target
 *
 * update:open 先到 → doX 讀到 null → 早退，API 從未被呼叫且無錯誤提示。
 * 全家長端七條確認流程（撤回訊息／取消接送授權／刪除常用接送人／刪除聯絡簿
 * 回覆／刪除用藥單／刪除請假附件／取消請假）因此全部靜默 no-op。
 * 既有測試都 `stubs: { ConfirmDialog: true }`，stub 不會重現真實 emit 順序，
 * 假綠放行——本檔用真元件＋canonical 呼叫端 pattern 夾住。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import ConfirmDialog from '../ConfirmDialog.vue'

const Harness = defineComponent({
  components: { ConfirmDialog },
  setup() {
    const target = ref<number | null>(7)
    const seenByHandler = ref<number | null>(-1)
    const open = computed({
      get: () => target.value !== null,
      set: (v: boolean) => {
        if (!v) target.value = null
      },
    })
    function doConfirm() {
      seenByHandler.value = target.value
    }
    return { target, seenByHandler, open, doConfirm }
  },
  template: `
    <ConfirmDialog
      v-model:open="open"
      title="確定？"
      confirm-label="確定刪除"
      cancel-label="取消"
      @confirm="doConfirm"
    />
  `,
})

function mountHarness() {
  return mount(Harness, { global: { stubs: { teleport: true } } })
}

describe('ConfirmDialog emit 順序（canonical 呼叫端 pattern）', () => {
  it('confirm handler 讀得到尚未被 open-setter 清空的 target', async () => {
    const w = mountHarness()
    const confirmBtn = w
      .findAll('button')
      .find((b) => b.text().includes('確定刪除'))
    expect(confirmBtn, '找不到確認鍵——AppModal/teleport stub 失效').toBeTruthy()
    await confirmBtn!.trigger('click')

    // 修前：update:open 先清 target → handler 讀到 null
    expect(w.vm.seenByHandler).toBe(7)
    // 對話框仍要正常關閉（target 最終被 open-setter 清空）
    expect(w.vm.target).toBe(null)
  })

  it('cancel 一樣先發事件再關閉（同 class 預防）', async () => {
    const w = mountHarness()
    const cancelBtn = w.findAll('button').find((b) => b.text().includes('取消'))
    await cancelBtn!.trigger('click')
    expect(w.vm.target).toBe(null)
    expect(w.vm.seenByHandler).toBe(-1) // confirm handler 未被觸發
  })
})
