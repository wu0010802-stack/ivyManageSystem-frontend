import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// ── Leaflet mock（動態 import 也走這裡）────────────────────────────────────
const setViewCalls: Array<[number, number]> = []
const setViewZooms: Array<number | undefined> = []
const markerCalls: Array<[number, number]> = []
let dragendHandler: (() => void) | null = null
let markerPos: { lat: number; lng: number } = { lat: 0, lng: 0 }

vi.mock('leaflet', () => {
  const fakeMap = {
    setView: (center: [number, number], zoom?: number) => {
      setViewCalls.push(center)
      setViewZooms.push(zoom)
      return fakeMap
    },
    remove: vi.fn(),
  }
  return {
    default: {
      map: () => fakeMap,
      tileLayer: () => ({ addTo: () => undefined }),
      marker: (center: [number, number]) => {
        markerCalls.push(center)
        return {
          addTo: () => ({
            on: (_event: string, handler: () => void) => {
              dragendHandler = handler
            },
            getLatLng: () => markerPos,
          }),
        }
      },
    },
  }
})
vi.mock('leaflet/dist/leaflet.css', () => ({}))

// 租戶 branding 的地圖中心：預設＝義華（BRANDING_DEFAULTS），F65 測試改成 null（非預設租戶未設定）
const brandingMap = vi.hoisted(() => ({
  current: { lat: 22.642, lng: 120.3243 } as { lat: number; lng: number } | null,
}))
vi.mock('@/composables/useTenantBranding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useTenantBranding')>()
  return { ...actual, getBranding: () => ({ ...actual.BRANDING_DEFAULTS, map: brandingMap.current }) }
})

import BusStopMapTuner from '../BusStopMapTuner.vue'
import { NEUTRAL_MAP_VIEW } from '@/composables/useTenantBranding'

const SCHOOL = { lat: 22.689, lng: 120.302 }

const mountTuner = async (
  props: Partial<{
    visible: boolean
    lat: number | null
    lng: number | null
    label: string
    schoolCoords: { lat: number; lng: number } | null
  }> = {},
) => {
  const w = mount(BusStopMapTuner, {
    props: {
      visible: true,
      lat: null,
      lng: null,
      label: '王小明',
      schoolCoords: SCHOOL,
      ...props,
    },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}

describe('BusStopMapTuner', () => {
  beforeEach(() => {
    setViewCalls.length = 0
    setViewZooms.length = 0
    brandingMap.current = { lat: 22.642, lng: 120.3243 }
    markerCalls.length = 0
    dragendHandler = null
    markerPos = { lat: 0, lng: 0 }
  })

  it('無座標時以 schoolCoords 為初始中心', async () => {
    const w = await mountTuner({ lat: null, lng: null })
    expect(setViewCalls[0]).toEqual([SCHOOL.lat, SCHOOL.lng])
    expect(markerCalls[0]).toEqual([SCHOOL.lat, SCHOOL.lng])
    w.unmount()
  })

  it('有座標時以既有座標為中心', async () => {
    const w = await mountTuner({ lat: 22.61, lng: 120.28 })
    expect(setViewCalls[0]).toEqual([22.61, 120.28])
    w.unmount()
  })

  it('拖曳後 confirm emit 最終座標', async () => {
    const w = await mountTuner({ lat: 22.61, lng: 120.28 })
    markerPos = { lat: 22.615, lng: 120.285 }
    dragendHandler?.()
    ;(document.querySelector('[data-test="confirm-btn"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(w.emitted('confirm')?.[0]).toEqual([22.615, 120.285])
    w.unmount()
  })

  it('未拖曳直接 confirm 回傳初始座標（園所中心可直接採用）', async () => {
    const w = await mountTuner({ lat: null, lng: null })
    ;(document.querySelector('[data-test="confirm-btn"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(w.emitted('confirm')?.[0]).toEqual([SCHOOL.lat, SCHOOL.lng])
    w.unmount()
  })

  it('無座標也無 schoolCoords 時退租戶 branding.map（預設租戶＝原行為）', async () => {
    const w = await mountTuner({ lat: null, lng: null, schoolCoords: null })
    expect(setViewCalls[0]).toEqual([22.642, 120.3243])
    expect(setViewZooms[0]).toBe(16)
    expect(document.querySelector('[data-test="tune-neutral-hint"]')).toBeNull()
    expect((document.querySelector('[data-test="confirm-btn"]') as HTMLButtonElement).disabled).toBe(false)
    w.unmount()
  })

  /**
   * F65（MT-59）：非預設租戶沒設園所座標時 branding.map 為 null——不再把圖釘放在
   * 義華校門口（直接按確認就把別校學生的站點存成義華座標），改成中性全台視角，
   * 並要求先拖曳圖釘才能確認，避免把「台灣中心」當成真實座標存下去。
   */
  it('非預設租戶未設園所座標時退中性全台視角，拖曳前不可確認（F65）', async () => {
    brandingMap.current = null
    const w = await mountTuner({ lat: null, lng: null, schoolCoords: null })
    expect(setViewCalls[0]).toEqual([NEUTRAL_MAP_VIEW.lat, NEUTRAL_MAP_VIEW.lng])
    expect(setViewZooms[0]).toBe(NEUTRAL_MAP_VIEW.zoom)
    expect(setViewCalls[0]).not.toEqual([22.642, 120.3243])
    expect(document.querySelector('[data-test="tune-neutral-hint"]')?.textContent).toContain('尚未設定園所座標')

    const confirmBtn = () => document.querySelector('[data-test="confirm-btn"]') as HTMLButtonElement
    expect(confirmBtn().disabled).toBe(true)
    confirmBtn().click()
    await flushPromises()
    expect(w.emitted('confirm')).toBeUndefined()

    markerPos = { lat: 22.73, lng: 120.33 }
    dragendHandler?.()
    await flushPromises()
    expect(confirmBtn().disabled).toBe(false)
    confirmBtn().click()
    await flushPromises()
    expect(w.emitted('confirm')?.[0]).toEqual([22.73, 120.33])
    w.unmount()
  })

  it('cancel emit 且 label 顯示於提示', async () => {
    const w = await mountTuner({ label: '園所位置' })
    expect(document.querySelector('[data-test="tune-hint"]')?.textContent).toContain('園所位置')
    ;(document.querySelector('[data-test="cancel-btn"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(w.emitted('cancel')).toHaveLength(1)
    w.unmount()
  })
})
