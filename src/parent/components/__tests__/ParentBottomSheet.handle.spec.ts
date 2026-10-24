import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ParentBottomSheet from '../ParentBottomSheet.vue'

/**
 * 拖曳把手的非拖曳替代操作（WCAG 2.5.7 / 2.1.1）：
 * 舊版把手掛 role="button" tabindex="0" 卻沒有 keydown，鍵盤使用者 Tab 到了也按不動。
 */
const mountOpts = {
  global: { stubs: { teleport: true } },
  attachTo: document.body,
}

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

async function open(props: Record<string, unknown>): Promise<VueWrapper> {
  wrapper = mount(ParentBottomSheet, { ...mountOpts, props: { modelValue: true, ...props } })
  await new Promise((r) => setTimeout(r, 0))
  return wrapper
}

function height(w: VueWrapper): string {
  return (w.find('.pt-bsheet-dialog').element as HTMLElement).style.getPropertyValue('--pt-bsheet-h')
}

describe('ParentBottomSheet 把手', () => {
  it('多段 snap：把手是可聚焦按鈕，Enter 放大一段、到頂再按縮回最低段', async () => {
    const w = await open({ snapPoints: ['peek', 'mid', 'full'], defaultSnap: 'peek' })
    const handle = w.find('.pt-bsheet-handle')
    expect(handle.attributes('role')).toBe('button')
    expect(handle.attributes('tabindex')).toBe('0')
    expect(handle.attributes('aria-label')).toBe('放大面板')

    await handle.trigger('keydown', { key: 'Enter' })
    expect(height(w)).toBe('60vh')
    await handle.trigger('keydown', { key: ' ' })
    expect(height(w)).toBe('92vh')
    expect(handle.attributes('aria-label')).toBe('縮小面板')
    await handle.trigger('keydown', { key: 'Enter' })
    expect(height(w)).toBe('30vh')
    // 鍵盤操作只切 snap，不會把面板關掉
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })

  it('↑／↓ 逐段調整，到邊界不再動', async () => {
    const w = await open({ snapPoints: ['mid', 'full'], defaultSnap: 'mid' })
    const handle = w.find('.pt-bsheet-handle')
    await handle.trigger('keydown', { key: 'ArrowDown' })
    expect(height(w)).toBe('60vh')
    await handle.trigger('keydown', { key: 'ArrowUp' })
    expect(height(w)).toBe('92vh')
    await handle.trigger('keydown', { key: 'ArrowUp' })
    expect(height(w)).toBe('92vh')
    expect(w.emitted('snap-change')).toEqual([['full']])
  })

  it('單指點按（未拖曳）也能切換高度', async () => {
    const w = await open({ snapPoints: ['mid', 'full'], defaultSnap: 'mid' })
    await w.find('.pt-bsheet-handle').trigger('click')
    expect(height(w)).toBe('92vh')
  })

  it('真的拖過之後補發的 click 不會再切一次', async () => {
    const w = await open({ snapPoints: ['mid', 'full'], defaultSnap: 'mid' })
    const handle = w.find('.pt-bsheet-handle').element
    const pointer = (target: EventTarget, type: string, y: number): void => {
      const evt = new Event(type, { bubbles: true }) as Event & { clientY: number }
      Object.defineProperty(evt, 'clientY', { value: y })
      target.dispatchEvent(evt)
    }
    pointer(handle, 'pointerdown', 300)
    pointer(window, 'pointermove', 100)
    pointer(window, 'pointerup', 100)
    await w.vm.$nextTick()
    expect(height(w)).toBe('92vh')
    await w.find('.pt-bsheet-handle').trigger('click')
    expect(height(w)).toBe('92vh')
  })

  it('只有一段 snap：把手純裝飾，不進 tab 順序、對 AT 隱藏', async () => {
    const w = await open({ snapPoints: ['mid'], defaultSnap: 'mid' })
    const handle = w.find('.pt-bsheet-handle')
    expect(handle.exists()).toBe(true)
    expect(handle.attributes('role')).toBeUndefined()
    expect(handle.attributes('tabindex')).toBeUndefined()
    expect(handle.attributes('aria-hidden')).toBe('true')
  })

  it('開啟時初始焦點仍落在內容第一個元素，而不是把手', async () => {
    wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: false, snapPoints: ['mid', 'full'] },
      slots: { default: '<button class="first-btn">A</button>' },
    })
    await wrapper.setProps({ modelValue: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.activeElement?.classList.contains('first-btn')).toBe(true)
  })

  it('把手在 focus trap 的循環內（從最後一個內容元素 Tab 會繞回把手）', async () => {
    wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, snapPoints: ['mid', 'full'] },
      slots: { default: '<button class="only-btn">A</button>' },
    })
    await new Promise((r) => setTimeout(r, 0))
    const btn = wrapper.find('.only-btn').element as HTMLElement
    btn.focus()
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(wrapper.find('.pt-bsheet-handle').element)
  })
})
