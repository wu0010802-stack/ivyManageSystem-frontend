/**
 * RecapViewer — 回顧全螢幕輪播檢視器。
 *
 * 守的是「使用者接管後系統不搶回控制權」這條契約，以及換張邊界：
 *  - 第一張不能再往前、最後一張不能再往後
 *  - 自動播放播到最後一張停住，不循環
 *  - 任何手動換張（鍵盤／按鈕／膠卷）之後不恢復自動播放
 *  - prefers-reduced-motion 下預設就是暫停的
 *  - Esc 關閉
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import RecapViewer from '../RecapViewer.vue'
import type { PhotoRecap } from '../../../api/childPhotos'

const DWELL_MS = 3600

function makeRecap(count = 4): PhotoRecap {
  return {
    key: '1m',
    label: '1 個月前',
    anchor_date: '2026-08-16',
    range_start: '2026-08-11',
    range_end: '2026-08-21',
    photo_count: count,
    photos: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      owner_type: 'class_album',
      owner_id: 1,
      url: `/u${i + 1}.jpg`,
      display_url: `/d${i + 1}.jpg`,
      thumb_url: `/t${i + 1}.jpg`,
      original_filename: `${i + 1}.jpg`,
      photo_date: '2026-08-16',
      created_at: null,
      category: 'life' as const,
    })),
  }
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches, addEventListener() {}, removeEventListener() {} })))
}

/** 目前在第幾張——從 DOM 讀，不戳元件內部狀態。 */
function currentIndex(w: VueWrapper): number {
  const el = w.find('[data-test="recap-slide"].is-current')
  return el.exists() ? Number(el.attributes('data-slide-index')) : -1
}

function isPaused(w: VueWrapper): boolean {
  return w.find('[data-test="recap-viewer"]').classes().includes('is-paused')
}

async function advance(ms: number) {
  vi.advanceTimersByTime(ms)
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  stubReducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RecapViewer 換張邊界', () => {
  it('開啟時停在第一張，「上一張」是 disabled', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap() } })
    expect(currentIndex(w)).toBe(0)
    expect((w.find('[data-test="recap-prev"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((w.find('[data-test="recap-next"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('第一張按 ← 不會越界', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap() } })
    await w.find('[data-test="recap-viewer"]').trigger('keydown', { key: 'ArrowLeft' })
    expect(currentIndex(w)).toBe(0)
  })

  it('最後一張按 → 不會越界，且「下一張」是 disabled', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(3) } })
    // 直接用膠卷跳到最後一張
    await w.findAll('[data-test="recap-film-item"]')[2].trigger('click')
    expect(currentIndex(w)).toBe(2)
    expect((w.find('[data-test="recap-next"]').element as HTMLButtonElement).disabled).toBe(true)

    await w.find('[data-test="recap-viewer"]').trigger('keydown', { key: 'ArrowRight' })
    expect(currentIndex(w)).toBe(2)
  })

  it('膠卷縮圖數量＝照片數，當前張標 aria-current', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(5) } })
    const film = w.findAll('[data-test="recap-film-item"]')
    expect(film).toHaveLength(5)
    expect(film[0].attributes('aria-current')).toBe('true')
    await film[3].trigger('click')
    expect(w.findAll('[data-test="recap-film-item"]')[3].attributes('aria-current')).toBe('true')
    expect(currentIndex(w)).toBe(3)
  })
})

describe('RecapViewer 自動播放', () => {
  it('每 3.6 秒自動換一張', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(4) } })
    expect(isPaused(w)).toBe(false)
    expect(currentIndex(w)).toBe(0)

    await advance(DWELL_MS)
    expect(currentIndex(w)).toBe(1)

    await advance(DWELL_MS)
    expect(currentIndex(w)).toBe(2)
  })

  it('播到最後一張停住不循環', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(3) } })

    await advance(DWELL_MS * 2)
    expect(currentIndex(w)).toBe(2)
    expect(isPaused(w)).toBe(true)

    // 再等好幾輪也不會回到第一張
    await advance(DWELL_MS * 5)
    expect(currentIndex(w)).toBe(2)
  })

  it('手動換張後不恢復自動播放', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(6) } })
    await w.find('[data-test="recap-next"]').trigger('click')
    expect(currentIndex(w)).toBe(1)
    expect(isPaused(w)).toBe(true)

    await advance(DWELL_MS * 4)
    expect(currentIndex(w)).toBe(1)
  })

  it('播放鍵可暫停，再按可續播', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(6) } })
    const btn = () => w.find('[data-test="recap-playpause"]')
    expect(btn().attributes('aria-label')).toBe('暫停自動播放')

    await btn().trigger('click')
    expect(isPaused(w)).toBe(true)
    expect(btn().attributes('aria-label')).toBe('開始自動播放')
    await advance(DWELL_MS * 2)
    expect(currentIndex(w)).toBe(0)

    await btn().trigger('click')
    expect(isPaused(w)).toBe(false)
    await advance(DWELL_MS)
    expect(currentIndex(w)).toBe(1)
  })

  it('卸載時把計時器清乾淨（不是靠「沒 throw」矇混過去）', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(5) } })
    // 先證明真的有一顆在跑，否則下面那條斷言恆真
    expect(vi.getTimerCount()).toBe(1)
    w.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('RecapViewer prefers-reduced-motion', () => {
  it('預設暫停，進度條不跑也不自動換張', async () => {
    stubReducedMotion(true)
    const w = mount(RecapViewer, { props: { recap: makeRecap(4) } })

    expect(isPaused(w)).toBe(true)
    expect(w.find('[data-test="recap-playpause"]').attributes('aria-label')).toBe('開始自動播放')

    await advance(DWELL_MS * 3)
    expect(currentIndex(w)).toBe(0)
  })
})

describe('RecapViewer a11y', () => {
  it('Esc 關閉', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap() } })
    await w.find('[data-test="recap-viewer"]').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('關閉鈕也會 emit close', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap() } })
    await w.find('[data-test="recap-close"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('是 modal dialog，可聚焦，且標出屬於哪個回顧', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap() } })
    const root = w.find('[data-test="recap-viewer"]')
    expect(root.attributes('role')).toBe('dialog')
    expect(root.attributes('aria-modal')).toBe('true')
    expect(root.attributes('tabindex')).toBe('-1')
    expect(root.attributes('aria-label')).toContain('1 個月前')
  })

  it('頂部常駐 pill 標回顧名稱，下方標實際日期區間與張數', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(4) } })
    expect(w.find('[data-test="recap-badge"]').text()).toContain('1 個月前')
    expect(w.find('[data-test="recap-range"]').text()).toBe('2026/08/11 – 08/21 · 共 4 張')
  })

  it('有 sr-only live region 播報目前第幾張；自動播放中設 off 免得每 3.6 秒轟炸', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(4) } })
    const region = () => w.find('[data-test="recap-live-region"]')
    expect(region().exists()).toBe(true)
    expect(region().text()).toBe('第 1 張，共 4 張')
    expect(region().attributes('aria-live')).toBe('off')

    await w.find('[data-test="recap-next"]').trigger('click')
    expect(region().text()).toBe('第 2 張，共 4 張')
    expect(region().attributes('aria-live')).toBe('polite')
  })

  it('膠卷不冒充清單（role=list 的子元素必須是 listitem，這裡是裸 button）', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(3) } })
    expect(w.find('.filmstrip').attributes('role')).toBeUndefined()
  })

  it('每個可互動元素都有 aria-label', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(3) } })
    const buttons = w.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b.attributes('aria-label')).toBeTruthy()
  })
})

describe('RecapViewer 單張回顧（業主裁定 1 張也算回顧）', () => {
  it('不渲染播放鈕，也不排任何計時器', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(1) } })
    expect(w.find('[data-test="recap-playpause"]').exists()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('唯一那段進度條是填滿的，不是凍在 0% 等一個永遠不來的換張', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(1) } })
    const segs = w.findAll('[data-test="recap-seg"]')
    expect(segs).toHaveLength(1)
    expect(segs[0].classes()).toContain('done')
    expect(segs[0].classes()).not.toContain('live')
  })

  it('點中央不會空翻播放狀態', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(1) } })
    const stage = w.find('.v-stage')
    for (let i = 0; i < 3; i++) {
      await stage.trigger('pointerdown', { clientX: 100, pointerId: 1 })
      await stage.trigger('pointerup', { clientX: 100, pointerId: 1 })
    }
    expect(isPaused(w)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(currentIndex(w)).toBe(0)
  })
})

describe('RecapViewer 進度條', () => {
  it('播完最後一張時最後一段也填滿（不會前面全滿、最後一格全空）', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(3) } })
    await advance(DWELL_MS * 2)
    expect(currentIndex(w)).toBe(2)

    const segs = w.findAll('[data-test="recap-seg"]')
    expect(segs).toHaveLength(3)
    for (const seg of segs) {
      expect(seg.classes()).toContain('done')
      expect(seg.classes()).not.toContain('live')
    }
  })

  it('播放中只有當前那段是 live，之前的是 done', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(4) } })
    await advance(DWELL_MS)
    const segs = w.findAll('[data-test="recap-seg"]')
    expect(segs[0].classes()).toContain('done')
    expect(segs[1].classes()).toContain('live')
    expect(segs[2].classes()).not.toContain('live')
  })

  it('張數多到分段看不出來時改用單一條（後端每窗上限 40 張）', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(40) } })
    expect(w.findAll('[data-test="recap-seg"]')).toHaveLength(0)
    expect(w.find('[data-test="recap-seg-single"]').exists()).toBe(true)
  })

  it('20 張以內維持分段', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(20) } })
    expect(w.findAll('[data-test="recap-seg"]')).toHaveLength(20)
    expect(w.find('[data-test="recap-seg-single"]').exists()).toBe(false)
  })
})

describe('RecapViewer 指標手勢', () => {
  it('pointercancel（垂直捲動接手／來電）不算點擊，不得動到播放狀態', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(4) } })
    const stage = w.find('.v-stage')
    expect(isPaused(w)).toBe(false)

    await stage.trigger('pointerdown', { clientX: 100, pointerId: 1 })
    await stage.trigger('pointermove', { clientX: 102, pointerId: 1 })
    await stage.trigger('pointercancel', { pointerId: 1 })

    expect(isPaused(w)).toBe(false)
    expect(currentIndex(w)).toBe(0)
  })

  it('（對照）同樣位移下 pointerup 仍視為點擊，會暫停', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(4) } })
    const stage = w.find('.v-stage')

    await stage.trigger('pointerdown', { clientX: 100, pointerId: 1 })
    await stage.trigger('pointermove', { clientX: 102, pointerId: 1 })
    await stage.trigger('pointerup', { clientX: 102, pointerId: 1 })

    expect(isPaused(w)).toBe(true)
  })

  it('第二根手指（雙指縮放）不覆寫拖曳起點，不會跳張', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(4) } })
    const stage = w.find('.v-stage')

    await stage.trigger('pointerdown', { clientX: 200, pointerId: 1 })
    // 第二根手指按下並張開
    await stage.trigger('pointerdown', { clientX: 100, pointerId: 2 })
    await stage.trigger('pointermove', { clientX: 0, pointerId: 2 })
    await stage.trigger('pointerup', { clientX: 0, pointerId: 2 })

    expect(currentIndex(w)).toBe(0)

    // 第一根手指仍然可以正常滑動換張
    await stage.trigger('pointermove', { clientX: 100, pointerId: 1 })
    await stage.trigger('pointerup', { clientX: 100, pointerId: 1 })
    expect(currentIndex(w)).toBe(1)
  })
})

describe('RecapViewer 換回顧', () => {
  it('props.recap 換掉時 index／播放狀態歸零', async () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap(5) } })
    await advance(DWELL_MS * 2)
    expect(currentIndex(w)).toBe(2)

    await w.setProps({ recap: { ...makeRecap(2), label: '2 年前' } })
    expect(currentIndex(w)).toBe(0)
    expect(w.find('[data-test="recap-badge"]').text()).toContain('2 年前')
  })
})
