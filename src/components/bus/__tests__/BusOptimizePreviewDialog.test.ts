import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BusOptimizePreviewDialog, { type OptimizePreview } from '../BusOptimizePreviewDialog.vue'

const preview: OptimizePreview = {
  order: [
    { student_id: 1, student_name: '王小明', old_seq: 2, new_seq: 1, pinned: false, eta: '07:41', moved: true },
    { student_id: 2, student_name: '李小美', old_seq: 1, new_seq: 2, pinned: true, eta: '07:52', moved: false },
  ],
  end_time_planned: '08:35',
  moved_unpinned_count: 1,
}

const mountDialog = async (
  props: Partial<{ visible: boolean; loading: boolean; preview: OptimizePreview | null; error: string | null }> = {},
) => {
  const w = mount(BusOptimizePreviewDialog, {
    props: { visible: true, loading: false, preview, error: null, ...props },
    global: { plugins: [ElementPlus] },
    attachTo: document.body, // el-dialog teleport 到 body，需 attach 才查得到內容
  })
  await flushPromises()
  return w
}

describe('BusOptimizePreviewDialog', () => {
  it('diff 對照：moved 站高亮、釘選站標示、ETA 與結束時間呈現', async () => {
    const w = await mountDialog()
    const movedCell = document.querySelector('[data-test="stop-1"]')
    expect(movedCell?.classList.contains('bus-optimize-preview__moved')).toBe(true)
    const stayCell = document.querySelector('[data-test="stop-2"]')
    expect(stayCell?.classList.contains('bus-optimize-preview__moved')).toBe(false)
    expect(document.body.textContent).toContain('釘選')
    expect(document.body.textContent).toContain('07:41')
    expect(document.body.textContent).toContain('預計 08:35 結束全程')
    expect(document.body.textContent).toContain('1 個未釘選站點將被重新排序')
    expect(document.body.textContent).toContain('系統建議順序')
    w.unmount()
  })

  it('error 態顯示錯誤與重試鈕，套用鈕 disabled，retry emit', async () => {
    const w = await mountDialog({ error: '路徑引擎暫時無法使用，請稍後重試', preview: null })
    expect(document.querySelector('[data-test="error"]')?.textContent).toContain('請稍後重試')
    const retry = document.querySelector('[data-test="retry-btn"]') as HTMLButtonElement
    retry.click()
    await flushPromises()
    expect(w.emitted('retry')).toHaveLength(1)
    const apply = document.querySelector('[data-test="apply-btn"]') as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    w.unmount()
  })

  it('apply / cancel emit', async () => {
    const w = await mountDialog()
    ;(document.querySelector('[data-test="apply-btn"]') as HTMLButtonElement).click()
    ;(document.querySelector('[data-test="cancel-btn"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(w.emitted('apply')).toHaveLength(1)
    expect(w.emitted('cancel')).toHaveLength(1)
    w.unmount()
  })

  it('loading 態不可套用', async () => {
    const w = await mountDialog({ loading: true })
    const apply = document.querySelector('[data-test="apply-btn"]') as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    w.unmount()
  })
})
