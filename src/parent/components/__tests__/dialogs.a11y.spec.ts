import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('../../api/consent', () => ({
  CONSENT_SCOPES: ['service_essential', 'photo_publish', 'line_push', 'cross_border_transfer'],
  CONSENT_SCOPE_SERVICE_ESSENTIAL: 'service_essential',
  SCOPE_LABELS: {
    service_essential: '服務必要', photo_publish: '照片公開', line_push: 'LINE 推播', cross_border_transfer: '跨境傳輸',
  },
  SCOPE_DESCRIPTIONS: {
    service_essential: '合成說明一', photo_publish: '合成說明二', line_push: '合成說明三', cross_border_transfer: '合成說明四',
  },
  writeConsent: vi.fn().mockResolvedValue({}),
}))

import AppModal from '../AppModal.vue'
import ConsentModal from '../ConsentModal.vue'
import ParentBottomSheet from '../ParentBottomSheet.vue'

const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.style.overflow = ''
})

const POLICY = { id: 1, version: 'v-合成', effective_at: '2026-01-01T00:00:00', summary: '' }

describe('AppModal 捲動鎖走 ref-count（巢狀彈窗）', () => {
  it('外層 modal 開著時，關掉內層 modal 不會解鎖背景', async () => {
    const outer = ref(false)
    const inner = ref(false)
    const Host = defineComponent({
      setup: () => () => [
        h(AppModal, { open: outer.value }, () => h('button', '外層')),
        h(AppModal, { open: inner.value }, () => h('button', '內層')),
      ],
    })
    const w = mount(Host, { attachTo: document.body, global: { stubs: { teleport: true } } })
    wrappers.push(w)

    outer.value = true
    await flushPromises()
    inner.value = true
    await flushPromises()
    expect(document.body.style.overflow).toBe('hidden')

    inner.value = false
    await flushPromises()
    expect(document.body.style.overflow).toBe('hidden')

    outer.value = false
    await flushPromises()
    expect(document.body.style.overflow).toBe('')
  })

  it('AppModal 疊在 ParentBottomSheet 上，關掉 modal 後 sheet 背景仍鎖著', async () => {
    const sheet = ref(false)
    const modal = ref(false)
    const Host = defineComponent({
      setup: () => () => [
        h(ParentBottomSheet, { modelValue: sheet.value, title: '合成' }, () => h('p', '內容')),
        h(AppModal, { open: modal.value }, () => h('button', '確認')),
      ],
    })
    const w = mount(Host, { attachTo: document.body, global: { stubs: { teleport: true } } })
    wrappers.push(w)
    sheet.value = true
    await flushPromises()
    modal.value = true
    await flushPromises()
    modal.value = false
    await flushPromises()
    expect(document.body.style.overflow).toBe('hidden')
  })
})

describe('ConsentModal 對話框行為', () => {
  it('掛上即鎖背景捲動、焦點移到第一個勾選框；卸載後解鎖', async () => {
    const w = mount(ConsentModal, { props: { policy: POLICY }, attachTo: document.body })
    await flushPromises()
    expect(document.body.style.overflow).toBe('hidden')
    const boxes = w.findAll('input[type="checkbox"]')
    expect(document.activeElement).toBe(boxes[0].element)
    w.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('Tab 在最後一個可聚焦元素時繞回第一個，不會跑到遮罩後面', async () => {
    const w = mount(ConsentModal, { props: { policy: POLICY }, attachTo: document.body })
    wrappers.push(w)
    await flushPromises()
    const boxes = w.findAll('input[type="checkbox"]')
    // 送出鈕在未勾「服務必要」前 disabled，不在循環內；最後一個是第四個勾選框
    ;(boxes[3].element as HTMLElement).focus()
    await w.find('[role="dialog"]').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(boxes[0].element)

    await w.find('[role="dialog"]').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(boxes[3].element)
  })

  it('強制關卡：Esc 不會關閉（不 emit、仍在畫面上）', async () => {
    const w = mount(ConsentModal, { props: { policy: POLICY }, attachTo: document.body })
    wrappers.push(w)
    await flushPromises()
    await w.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('consented')).toBeFalsy()
    expect(w.find('[role="dialog"]').exists()).toBe(true)
  })

  it('卸載時焦點還給開啟前的元素', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const w = mount(ConsentModal, { props: { policy: POLICY }, attachTo: document.body })
    await flushPromises()
    expect(document.activeElement).not.toBe(opener)
    w.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

describe('ParentBottomSheet 高度用 dvh（保留 vh fallback）', () => {
  it('inline style 同時給 vh 與 dvh 兩種 snap 高度', async () => {
    const w = mount(ParentBottomSheet, {
      props: { modelValue: true, snapPoints: ['mid', 'full'], defaultSnap: 'mid' },
      attachTo: document.body,
      global: { stubs: { teleport: true } },
    })
    wrappers.push(w)
    await flushPromises()
    const el = w.find('.pt-bsheet-dialog').element as HTMLElement
    expect(el.style.getPropertyValue('--pt-bsheet-h')).toBe('60vh')
    expect(el.style.getPropertyValue('--pt-bsheet-h-dvh')).toBe('60dvh')
  })

  it('CSS：vh 為基準、@supports dvh 時改用 dvh（var() 內的 dvh 不能靠連寫兩條退回）', () => {
    const raw = readFileSync(resolve(__dirname, '../ParentBottomSheet.vue'), 'utf-8')
    const css = raw.slice(raw.indexOf('<style')).replace(/\s+/g, ' ')
    expect(css).toMatch(/\.pt-bsheet-dialog \{[^}]*height: var\(--pt-bsheet-h, 60vh\);[^}]*max-height: 92vh;/)
    expect(css).toMatch(
      /@supports \(height: 1dvh\) \{ \.pt-bsheet-dialog \{ height: var\(--pt-bsheet-h-dvh, 60dvh\); max-height: 92dvh; \} \}/,
    )
  })
})
