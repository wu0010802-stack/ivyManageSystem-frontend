import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DmPreviewModal from '../DmPreviewModal.vue'

describe('DmPreviewModal（Task 8）', () => {
  it('visible=false → 不渲染 overlay', () => {
    const wrapper = mount(DmPreviewModal, {
      props: { visible: false, title: '圍棋', pages: ['/api/x/1.png'], pdfUrl: null },
    })
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
  })

  it('pages 3 筆 → 渲染 3 個 img，各帶 loading=lazy 與遞增頁碼 alt', () => {
    const pages = ['/api/x/1.png', '/api/x/2.png', '/api/x/3.png']
    const wrapper = mount(DmPreviewModal, {
      props: { visible: true, title: '圍棋', pages, pdfUrl: null },
    })
    const imgs = wrapper.findAll('.dm-pages img')
    expect(imgs).toHaveLength(3)
    imgs.forEach((img, i) => {
      expect(img.attributes('src')).toBe(pages[i])
      expect(img.attributes('loading')).toBe('lazy')
      expect(img.attributes('alt')).toBe(`圍棋 簡介第 ${i + 1} 頁`)
    })
  })

  it('pdfUrl 為 null → 不顯示下載列', () => {
    const wrapper = mount(DmPreviewModal, {
      props: { visible: true, title: '圍棋', pages: ['/api/x/1.png'], pdfUrl: null },
    })
    expect(wrapper.find('.dm-download-row').exists()).toBe(false)
    expect(wrapper.find('.dm-download-link').exists()).toBe(false)
  })

  it('pdfUrl 有值 → 顯示下載連結，href 正確、target=_blank、rel=noopener', () => {
    const wrapper = mount(DmPreviewModal, {
      props: { visible: true, title: '圍棋', pages: ['/api/x/1.png'], pdfUrl: '/api/x/original.pdf' },
    })
    const link = wrapper.find('.dm-download-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/api/x/original.pdf')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
    expect(link.text()).toBe('下載 PDF')
  })

  it('點擊關閉按鈕 → emit close', async () => {
    const wrapper = mount(DmPreviewModal, {
      props: { visible: true, title: '圍棋', pages: ['/api/x/1.png'], pdfUrl: null },
    })
    await wrapper.find('.modal-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('點擊 overlay（非 panel 本體）→ emit close', async () => {
    const wrapper = mount(DmPreviewModal, {
      props: { visible: true, title: '圍棋', pages: ['/api/x/1.png'], pdfUrl: null },
    })
    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('modal-panel 帶 modal-panel--dm 變體 class', () => {
    const wrapper = mount(DmPreviewModal, {
      props: { visible: true, title: '圍棋', pages: ['/api/x/1.png'], pdfUrl: null },
    })
    expect(wrapper.find('.modal-panel').classes()).toContain('modal-panel--dm')
  })
})
