import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// ── Leaflet mock（動態 import 也走這裡）────────────────────────────────────
const setViewCalls: Array<[number, number]> = []
const markerCalls: Array<[number, number]> = []
let dragendHandler: (() => void) | null = null
let markerPos: { lat: number; lng: number } = { lat: 0, lng: 0 }

vi.mock('leaflet', () => {
  const fakeMap = {
    setView: (center: [number, number]) => {
      setViewCalls.push(center)
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

import BusStopMapTuner from '../BusStopMapTuner.vue'

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

  it('cancel emit 且 label 顯示於提示', async () => {
    const w = await mountTuner({ label: '園所位置' })
    expect(document.querySelector('[data-test="tune-hint"]')?.textContent).toContain('園所位置')
    ;(document.querySelector('[data-test="cancel-btn"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(w.emitted('cancel')).toHaveLength(1)
    w.unmount()
  })
})
