import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BusOptimizePreviewDialog, { type OptimizePreview } from '../BusOptimizePreviewDialog.vue'

const preview: OptimizePreview = {
  order: [
    { student_id: 1, student_name: '王小明', old_seq: 2, new_seq: 1, pinned: false, eta: '07:41', moved: true,
      address: '高雄市三民區九如一路 000 號' },
    { student_id: 2, student_name: '李小美', old_seq: 1, new_seq: 2, pinned: true, eta: '07:52', moved: false,
      address: null },
  ],
  end_time_planned: '08:35',
  moved_unpinned_count: 1,
}

const mountDialog = async (
  props: Partial<{
    visible: boolean
    loading: boolean
    preview: OptimizePreview | null
    error: string | null
    canUnpinAll: boolean
  }> = {},
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

  /** 光看學生名無法判斷順序合不合理，地址才是對照地圖的依據。 */
  it('列出接送地址；缺地址顯示破折號而不是空白', async () => {
    const w = await mountDialog()
    expect(document.querySelector('[data-test="address-1"]')?.textContent?.trim())
      .toBe('高雄市三民區九如一路 000 號')
    expect(document.querySelector('[data-test="address-2"]')?.textContent?.trim()).toBe('—')
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

  /**
   * 全站釘選時後端的分段最佳化每段 0 個自由站，Azure 一次都不會被呼叫、順序原樣
   * 回傳。舊版此時完全不提示，使用者只看到「順序沒變」會誤判成排序算錯。
   */
  it('全站釘選：說明自動排序不會改變順序，並給解除全部釘選的出口', async () => {
    const allPinned: OptimizePreview = {
      order: preview.order.map((s) => ({ ...s, pinned: true, moved: false })),
      end_time_planned: '08:35',
      moved_unpinned_count: 0,
    }
    const w = await mountDialog({ preview: allPinned, canUnpinAll: true })
    expect(document.querySelector('[data-test="all-pinned-notice"]')).not.toBeNull()
    expect(document.body.textContent).toContain('所有站點都已釘選，自動排序不會改變順序')
    expect(document.querySelector('[data-test="already-optimal-notice"]')).toBeNull()
    ;(document.querySelector('[data-test="unpin-all-btn"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(w.emitted('unpin-all')).toHaveLength(1)
    w.unmount()
  })

  it('全站釘選但呼叫端不支援解除時，只提示不給按鈕', async () => {
    const allPinned: OptimizePreview = {
      order: preview.order.map((s) => ({ ...s, pinned: true, moved: false })),
      end_time_planned: null,
      moved_unpinned_count: 0,
    }
    const w = await mountDialog({ preview: allPinned })
    expect(document.querySelector('[data-test="all-pinned-notice"]')).not.toBeNull()
    expect(document.querySelector('[data-test="unpin-all-btn"]')).toBeNull()
    w.unmount()
  })

  /**
   * 路線幾何與 legs 來自最佳化同一次 Azure 回應（不額外計費），Dialog 用它算
   * 全程摘要；時間優先取含車流值，那才是這個出發時間實際會開多久。
   */
  it('有 legs 時顯示全程距離與含車流時間摘要', async () => {
    const withShape: OptimizePreview = {
      ...preview,
      polyline: [[22.68, 120.30], [22.70, 120.31]],
      legs: [
        { distance_m: 1200.5, duration_s: 300, duration_traffic_s: 360, polyline: [] },
        { distance_m: 800, duration_s: 200, duration_traffic_s: null, polyline: [] },
      ],
    }
    const w = await mountDialog({ preview: withShape })
    const summary = document.querySelector('[data-test="route-summary"]')?.textContent ?? ''
    expect(summary).toContain('2.0 公里')
    // 360s（含車流）+ 200s（無車流值時退回 duration_s）= 560s → 9 分鐘
    expect(summary).toContain('9 分鐘')
    w.unmount()
  })

  it('沒有 legs 時不顯示全程摘要（不臆造 0 公里）', async () => {
    const w = await mountDialog()
    expect(document.querySelector('[data-test="route-summary"]')).toBeNull()
    w.unmount()
  })

  /**
   * hover 名單某一位 → 地圖高亮「上一站 → 該站」那一段。這裡只驗證 Dialog 有把
   * hover 中的順位往下傳（地圖端的畫線行為由 BusRoutePreviewMap 自己的測試守）。
   */
  it('hover 名單某一列時把該順位傳給地圖，離開時清掉', async () => {
    const w = await mountDialog()
    const map = w.findComponent({ name: 'BusRoutePreviewMap' })
    expect(map.props('highlightSeq')).toBeNull()

    const table = w.findComponent({ name: 'ElTable' })
    table.vm.$emit('cell-mouse-enter', { new_seq: 2 })
    await flushPromises()
    expect(map.props('highlightSeq')).toBe(2)

    table.vm.$emit('cell-mouse-leave')
    await flushPromises()
    expect(map.props('highlightSeq')).toBeNull()
    w.unmount()
  })

  it('換一組預覽時清掉殘留的 hover 順位', async () => {
    const w = await mountDialog()
    w.findComponent({ name: 'ElTable' }).vm.$emit('cell-mouse-enter', { new_seq: 2 })
    await flushPromises()
    expect(w.findComponent({ name: 'BusRoutePreviewMap' }).props('highlightSeq')).toBe(2)

    await w.setProps({ preview: { ...preview, moved_unpinned_count: 0 } })
    await flushPromises()
    expect(w.findComponent({ name: 'BusRoutePreviewMap' }).props('highlightSeq')).toBeNull()
    w.unmount()
  })

  it('有未釘選站但沒有站需要移動：說明目前順序已是建議順序', async () => {
    const optimal: OptimizePreview = {
      order: preview.order.map((s) => ({ ...s, pinned: false, moved: false })),
      end_time_planned: '08:35',
      moved_unpinned_count: 0,
    }
    const w = await mountDialog({ preview: optimal })
    expect(document.querySelector('[data-test="already-optimal-notice"]')).not.toBeNull()
    expect(document.body.textContent).toContain('目前順序已是系統建議順序')
    expect(document.querySelector('[data-test="all-pinned-notice"]')).toBeNull()
    w.unmount()
  })
})
