// @vitest-environment jsdom
// 用 jsdom（瀏覽器精確解析）而非預設 happy-dom：DOMPurify 的 <script>/javascript: 剝除
// 依賴瀏覽器級 HTML parser，happy-dom 解析差異會讓清洗輸出形態不同（雖仍安全），
// 改用 jsdom 才能對齊 prod（真實 Chrome）行為，讓這支 XSS 清洗回歸有意義。
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import FaqAnswer from '../FaqAnswer.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/contact-book', component: { template: '<div />' } },
  ],
})

function mountFaq(answer: string) {
  return mount(FaqAnswer, {
    props: { item: { answer } },
    global: { plugins: [router] },
  })
}

describe('FaqAnswer：markdown 經 DOMPurify 清洗（dompurify 升級 XSS 回歸）', () => {
  it('剝除 <script> 標籤', () => {
    const w = mountFaq('正常內容\n\n<script>window.__pwned = 1</script>')
    expect(w.find('.markdown').html()).not.toContain('<script')
  })

  it('剝除 onerror 等事件處理器屬性', () => {
    const w = mountFaq('<img src="x" onerror="alert(1)">')
    expect(w.find('.markdown').html()).not.toContain('onerror')
  })

  it('javascript: 連結被清除', () => {
    const w = mountFaq('[click](javascript:alert(1))')
    expect(w.find('.markdown').html()).not.toContain('javascript:')
  })

  it('保留正常 markdown 格式（粗體 / 合法連結）', () => {
    const w = mountFaq('**重點** 與 [連結](https://example.com)')
    const html = w.find('.markdown').html()
    expect(html).toContain('<strong>')
    expect(html).toContain('href="https://example.com"')
  })
})

describe('FaqAnswer：外部連結動作經 sanitizeHref 守衛', () => {
  afterEach(() => vi.restoreAllMocks())

  function mountWithAction(url: string) {
    return mount(FaqAnswer, {
      props: { item: { action: { type: 'external', label: '前往', url } } },
      global: { plugins: [router] },
    })
  }

  it('javascript: 動作不觸發 window.open', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const w = mountWithAction('javascript:alert(1)')
    await w.find('button.cta').trigger('click')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('https 動作以安全 URL 開啟新分頁', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const w = mountWithAction('https://example.com/page')
    await w.find('button.cta').trigger('click')
    expect(openSpy).toHaveBeenCalledWith('https://example.com/page', '_blank', 'noopener')
  })
})
