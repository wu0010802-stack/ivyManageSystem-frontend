/**
 * 聯絡簿 PhotoGrid：點縮圖開共用 lightbox（不再 <a target=_blank> 開新分頁），
 * 可左右瀏覽全部照片——包含 slice(0, 6) 之後被收進「+N」的第 7 張以後。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PhotoGrid from '../PhotoGrid.vue'

const photos = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  thumb_url: `/thumb/${i + 1}.jpg`,
  display_url: `/full/${i + 1}.jpg`,
}))

function lightbox(): HTMLElement | null {
  return document.querySelector('[data-testid="photo-lightbox"]')
}

describe('PhotoGrid', () => {
  it('縮圖是按鈕而非開新分頁的連結；最多排 6 格，第 6 格標 +2', () => {
    const w = mount(PhotoGrid, { props: { photos }, attachTo: document.body })
    expect(w.findAll('a').length).toBe(0)
    const tiles = w.findAll('button.tile')
    expect(tiles).toHaveLength(6)
    expect(tiles[5].text()).toContain('+2')
    expect(tiles[5].attributes('aria-label')).toContain('還有 2 張')
    w.unmount()
  })

  it('點「+N」那格開 lightbox，可一路瀏覽到第 8 張；ESC 關閉', async () => {
    const w = mount(PhotoGrid, { props: { photos }, attachTo: document.body })
    await w.findAll('button.tile')[5].trigger('click')
    await nextTick()
    expect(lightbox()).not.toBeNull()
    expect(lightbox()!.textContent).toContain('6 / 8')

    const nextBtn = () => lightbox()!.querySelector('[aria-label="下一張"]') as HTMLButtonElement
    nextBtn().click()
    await nextTick()
    nextBtn().click()
    await nextTick()
    expect(lightbox()!.textContent).toContain('8 / 8')
    expect((lightbox()!.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('/full/8.jpg')
    expect(nextBtn().disabled).toBe(true)

    lightbox()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(lightbox()).toBeNull()
    w.unmount()
  })

  it('←／→ 鍵換張', async () => {
    const w = mount(PhotoGrid, { props: { photos }, attachTo: document.body })
    await w.findAll('button.tile')[0].trigger('click')
    await nextTick()
    lightbox()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(lightbox()!.textContent).toContain('2 / 8')
    lightbox()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await nextTick()
    expect(lightbox()!.textContent).toContain('1 / 8')
    w.unmount()
  })
})
