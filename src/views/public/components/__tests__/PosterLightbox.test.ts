import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PosterLightbox from '../PosterLightbox.vue'

const baseProps = {
  visible: true,
  title: '多才多藝',
  src: 'https://cdn.example.test/poster.png',
  downloadName: '多才多藝.jpg',
  canShare: false,
}

describe('PosterLightbox（海報放大檢視）', () => {
  it('visible=false → 不渲染 overlay', () => {
    const wrapper = mount(PosterLightbox, { props: { ...baseProps, visible: false } })
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
  })

  it('渲染海報圖，src 與 alt 正確', () => {
    const wrapper = mount(PosterLightbox, { props: baseProps })
    const img = wrapper.find('.poster-full')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(baseProps.src)
    expect(img.attributes('alt')).toBe('多才多藝 海報（放大檢視）')
  })

  it('用沉浸式變體 class（非 --dm 白底面板），overlay 也帶 --poster 變體', () => {
    const wrapper = mount(PosterLightbox, { props: baseProps })
    expect(wrapper.find('.modal-panel').classes()).toContain('modal-panel--poster')
    expect(wrapper.find('.modal-overlay').classes()).toContain('modal-overlay--poster')
  })

  it('下載連結指向原圖，帶 download 檔名與 rel=noopener', () => {
    const wrapper = mount(PosterLightbox, { props: baseProps })
    const link = wrapper.find('.poster-full-actions a.poster-action')
    expect(link.attributes('href')).toBe(baseProps.src)
    expect(link.attributes('download')).toBe('多才多藝.jpg')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
  })

  it('canShare=false → 不顯示分享鈕；true → 顯示且點擊 emit share', async () => {
    // 動作列固定有「再放大」按鈕，分享鈕要靠 aria-label 認，不能用「有沒有 button」判斷
    const off = mount(PosterLightbox, { props: baseProps })
    expect(off.find('button[aria-label="分享海報給家人"]').exists()).toBe(false)

    const on = mount(PosterLightbox, { props: { ...baseProps, canShare: true } })
    const btn = on.find('button[aria-label="分享海報給家人"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(on.emitted('share')).toBeTruthy()
  })

  it('點擊關閉鈕 → emit close', async () => {
    const wrapper = mount(PosterLightbox, { props: baseProps })
    await wrapper.find('.modal-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('點擊 overlay 本體（非面板）→ emit close', async () => {
    const wrapper = mount(PosterLightbox, { props: baseProps })
    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('面板具備 dialog a11y 屬性', () => {
    const panel = mount(PosterLightbox, { props: baseProps }).find('.modal-panel')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('true')
    expect(panel.attributes('aria-labelledby')).toBe('posterLightboxTitle')
  })

  it('點圖切換二段縮放，按鈕文案同步（手機 fit 螢幕只有 1.06 倍，放大才看得清小字）', async () => {
    const wrapper = mount(PosterLightbox, { props: baseProps })
    const img = wrapper.find('.poster-full')
    // 不能用 aria-label$="海報" —— 關閉鈕的「關閉海報」也會中
    const zoomBtn = () => wrapper.find('.poster-full-actions button[aria-label="縮小海報"]')

    expect(img.classes()).not.toContain('is-zoomed')
    expect(wrapper.text()).toContain('再放大')

    await img.trigger('click')
    expect(wrapper.find('.poster-full').classes()).toContain('is-zoomed')
    expect(wrapper.text()).toContain('縮小')

    await zoomBtn().trigger('click')
    expect(wrapper.find('.poster-full').classes()).not.toContain('is-zoomed')
  })

  it('關閉再開 → 回到未放大狀態，不沿用上次的縮放', async () => {
    const wrapper = mount(PosterLightbox, { props: baseProps })
    await wrapper.find('.poster-full').trigger('click')
    expect(wrapper.find('.poster-full').classes()).toContain('is-zoomed')

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    expect(wrapper.find('.poster-full').classes()).not.toContain('is-zoomed')
  })

  it('圖片可鍵盤觸發縮放（Enter）', async () => {
    const wrapper = mount(PosterLightbox, { props: baseProps })
    await wrapper.find('.poster-full').trigger('keydown.enter')
    expect(wrapper.find('.poster-full').classes()).toContain('is-zoomed')
  })

  it('Esc → emit close（useAccessibleDialog 接線）', async () => {
    const wrapper = mount(PosterLightbox, { props: baseProps })
    await wrapper.find('.modal-panel').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
