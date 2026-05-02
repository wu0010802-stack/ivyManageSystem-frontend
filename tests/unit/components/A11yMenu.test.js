import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import A11yMenu from '@/components/common/A11yMenu.vue'
import { useA11yPreferenceStore } from '@/stores/a11yPreference'

/**
 * el-popover 的內容會透過 <Teleport> 送進 document.body，
 * 所以 wrapper.find 找不到。下面的 helper 直接從 document 抓元素，
 * 同時也為 wrapper attach 到 document.body 讓 trigger click 能正常觸發 teleport。
 */
async function openPopover(wrapper) {
  await wrapper.find('[data-testid="a11y-menu-trigger"]').trigger('click')
  // 等 popover 渲染（el-popover 內部用 nextTick 處理 visibility）
  await new Promise((r) => setTimeout(r, 0))
}

function $(testid) {
  return document.querySelector(`[data-testid="${testid}"]`)
}

describe('A11yMenu', () => {
  let wrappers = []

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers = []
    document.body.innerHTML = ''
  })

  function makeWrapper() {
    const wrapper = mount(A11yMenu, {
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    wrappers.push(wrapper)
    return wrapper
  }

  it('觸發按鈕有 aria-label「無障礙設定」', () => {
    const wrapper = makeWrapper()
    const trigger = wrapper.find('[data-testid="a11y-menu-trigger"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.attributes('aria-label')).toBe('無障礙設定')
  })

  it('點擊字級 lg button 會更新 store.fontSize 為 lg', async () => {
    const wrapper = makeWrapper()
    const store = useA11yPreferenceStore()
    expect(store.fontSize).toBe('md')

    await openPopover(wrapper)
    $('a11y-size-lg').click()

    expect(store.fontSize).toBe('lg')
  })

  it('點擊高對比 toggle 會更新 store.contrast 為 high', async () => {
    const wrapper = makeWrapper()
    const store = useA11yPreferenceStore()
    expect(store.contrast).toBe('normal')

    await openPopover(wrapper)
    $('a11y-contrast-toggle').click()

    expect(store.contrast).toBe('high')
  })

  it('點擊 reset 把所有值回到預設', async () => {
    const wrapper = makeWrapper()
    const store = useA11yPreferenceStore()
    store.fontSize = 'xl'
    store.contrast = 'high'

    await openPopover(wrapper)
    $('a11y-reset').click()

    expect(store.fontSize).toBe('md')
    expect(store.contrast).toBe('normal')
  })
})
