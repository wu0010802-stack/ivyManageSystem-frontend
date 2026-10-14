import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { useLeaveConfirm, useSheetCloseGuard } from '../useUnsavedGuard'

const dirty = ref(false)
let api: ReturnType<typeof useLeaveConfirm> | null = null

const FormPage = defineComponent({
  setup() {
    api = useLeaveConfirm(() => dirty.value)
    return () => h('div', { class: 'form-page' })
  },
})

async function setup() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/form', component: FormPage },
      { path: '/other', component: { render: () => h('div', { class: 'other' }) } },
    ],
  })
  router.push('/form')
  await router.isReady()
  const w = mount(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
  await flushPromises()
  return { router, w }
}

describe('useLeaveConfirm', () => {
  it('沒有修改 → 直接放行', async () => {
    dirty.value = false
    const { router } = await setup()
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('有修改 → 暫停導覽並開確認；選「離開」才放行', async () => {
    dirty.value = true
    const { router } = await setup()
    const nav = router.push('/other')
    await flushPromises()
    expect(api!.dialogOpen.value).toBe(true)
    expect(router.currentRoute.value.path).toBe('/form')
    api!.confirmLeave()
    await nav
    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('有修改 → 關閉確認框（點背景／ESC／繼續填寫）＝留在原頁', async () => {
    dirty.value = true
    const { router } = await setup()
    const nav = router.push('/other')
    await flushPromises()
    api!.dialogOpen.value = false
    await nav
    expect(router.currentRoute.value.path).toBe('/form')
  })

  it('allowLeave 之後（例如送出成功）程式導頁不再確認', async () => {
    dirty.value = true
    const { router } = await setup()
    api!.allowLeave()
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/other')
  })
})

describe('useSheetCloseGuard', () => {
  it('有修改時擋下關閉並顯示放棄確認；放棄才關', () => {
    const open = ref(true)
    const isDirty = ref(true)
    const g = useSheetCloseGuard(open, () => isDirty.value)
    expect(g.beforeClose()).toBe(false)
    expect(g.promptVisible.value).toBe(true)
    g.keepEditing()
    expect(g.promptVisible.value).toBe(false)
    expect(open.value).toBe(true)
    g.requestClose()
    expect(open.value).toBe(true)
    g.discard()
    expect(open.value).toBe(false)
  })

  it('沒有修改時直接關閉', () => {
    const open = ref(true)
    const g = useSheetCloseGuard(open, () => false)
    expect(g.beforeClose()).toBe(true)
    g.requestClose()
    expect(open.value).toBe(false)
  })
})
