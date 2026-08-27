import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Leaflet mock（動態 import 也走這裡）────────────────────────────────────
const polylineCalls: Array<{ points: Array<[number, number]>; opts: Record<string, unknown> }> = []
const markerCalls: Array<{ center: [number, number]; tooltip: string }> = []
const fitBoundsCalls: Array<Array<[number, number]>> = []
const setViewCalls: Array<[number, number]> = []
/** 每個 marker 目前套用的 icon（divIcon 的 opts），用來斷言高亮放大 */
const markerIcons: Array<Record<string, unknown>> = []
const panToCalls: Array<{ lat: number; lng: number }> = []
/** 測試可切換：模擬高亮點在／不在目前視野內 */
let boundsContains = true

vi.mock('leaflet', () => {
  const fakeMap = {
    fitBounds: (bounds: Array<[number, number]>) => {
      fitBoundsCalls.push(bounds)
      return fakeMap
    },
    setView: (center: [number, number]) => {
      setViewCalls.push(center)
      return fakeMap
    },
    getBounds: () => ({ contains: () => boundsContains }),
    panTo: (pos: { lat: number; lng: number }) => {
      panToCalls.push(pos)
      return fakeMap
    },
    remove: vi.fn(),
  }
  return {
    default: {
      map: () => fakeMap,
      tileLayer: () => ({ addTo: () => undefined }),
      divIcon: (opts: Record<string, unknown>) => opts,
      polyline: (points: Array<[number, number]>, opts: Record<string, unknown>) => {
        polylineCalls.push({ points, opts })
        const layer = {
          addTo: () => layer,
          bringToFront: () => undefined,
          remove: () => undefined,
        }
        return layer
      },
      marker: (center: [number, number], opts: { icon: Record<string, unknown> }) => {
        const marker = {
          _icon: opts.icon,
          setIcon: (icon: Record<string, unknown>) => {
            marker._icon = icon
            markerIcons.push(icon)
          },
          getLatLng: () => ({ lat: center[0], lng: center[1] }),
          addTo: () => ({
            bindTooltip: (tooltip: string) => {
              markerCalls.push({ center, tooltip })
              return marker
            },
          }),
        }
        return marker
      },
    },
  }
})
vi.mock('leaflet/dist/leaflet.css', () => ({}))

import BusRoutePreviewMap from '../BusRoutePreviewMap.vue'

const ORIGIN = { lat: 22.689, lng: 120.302 }
const STOPS = [
  { seq: 1, label: '王小明', lat: 22.70, lng: 120.31 },
  { seq: 2, label: '李小美', lat: 22.71, lng: 120.32 },
]
const LINE = [[22.689, 120.302], [22.70, 120.31], [22.71, 120.32]]
/** legs[0]＝園所→站1、legs[1]＝站1→站2、legs[2]＝站2→回園所 */
const LEGS = [
  { polyline: [[22.689, 120.302], [22.695, 120.305], [22.70, 120.31]] },
  { polyline: [[22.70, 120.31], [22.705, 120.315], [22.71, 120.32]] },
  { polyline: [[22.71, 120.32], [22.689, 120.302]] },
]

const mountMap = async (props: Record<string, unknown> = {}) => {
  const w = mount(BusRoutePreviewMap, {
    props: { polyline: LINE, stops: STOPS, origin: ORIGIN, ...props },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}

describe('BusRoutePreviewMap', () => {
  beforeEach(() => {
    polylineCalls.length = 0
    markerCalls.length = 0
    fitBoundsCalls.length = 0
    setViewCalls.length = 0
    markerIcons.length = 0
    panToCalls.length = 0
    boundsContains = true
  })

  it('有道路幾何時畫實線路徑，並依新順序標號站點與園所', async () => {
    const w = await mountMap()
    expect(polylineCalls).toHaveLength(1)
    expect(polylineCalls[0].points).toEqual(LINE)
    expect(polylineCalls[0].opts.dashArray).toBeUndefined()
    // 園所 + 兩站
    expect(markerCalls.map((m) => m.tooltip)).toEqual([
      '園所（起點／終點）', '1. 王小明', '2. 李小美',
    ])
    expect(fitBoundsCalls).toHaveLength(1)
    expect(w.find('[data-test="route-preview-legend"]').text()).toContain('實際道路')
    w.unmount()
  })

  /**
   * 沒有幾何時畫實線會讓人誤以為車真的那樣開——降級成虛線，並由圖例講明白。
   */
  it('沒有道路幾何時降級成示意虛線並明講', async () => {
    const w = await mountMap({ polyline: [] })
    expect(polylineCalls).toHaveLength(1)
    expect(polylineCalls[0].opts.dashArray).toBe('6 6')
    // 園所 → 兩站 → 回園所
    expect(polylineCalls[0].points).toEqual([
      [22.689, 120.302], [22.70, 120.31], [22.71, 120.32], [22.689, 120.302],
    ])
    expect(w.find('[data-test="route-preview-legend"]').text()).toContain('不代表實際走法')
    w.unmount()
  })

  it('缺座標的站不畫在地圖上，其餘站照畫', async () => {
    const w = await mountMap({
      polyline: [],
      stops: [
        { seq: 1, label: '無座標', lat: null, lng: null },
        { seq: 2, label: '李小美', lat: 22.71, lng: 120.32 },
      ],
    })
    expect(markerCalls.map((m) => m.tooltip)).toEqual(['園所（起點／終點）', '2. 李小美'])
    w.unmount()
  })

  it('沒有任何座標可用時退租戶預設中心，不炸掉', async () => {
    const w = await mountMap({ polyline: [], stops: [], origin: null })
    expect(polylineCalls).toHaveLength(0)
    expect(markerCalls).toHaveLength(0)
    expect(setViewCalls).toHaveLength(1)
    w.unmount()
  })

  it('visible=false 不建立地圖', async () => {
    const w = await mountMap({ visible: false })
    expect(polylineCalls).toHaveLength(0)
    expect(markerCalls).toHaveLength(0)
    w.unmount()
  })
})

describe('BusRoutePreviewMap 單段高亮', () => {
  beforeEach(() => {
    polylineCalls.length = 0
    markerCalls.length = 0
    fitBoundsCalls.length = 0
    setViewCalls.length = 0
    markerIcons.length = 0
    panToCalls.length = 0
    boundsContains = true
  })

  /**
   * hover 第 1 位＝園所 → 第 1 站那一段（`legs[0]`）。段序與點序對齊，
   * 對錯了會標到別人家門口。
   */
  it('hover 第 1 位標出園所到第 1 站的紅色路段', async () => {
    const w = await mountMap({ legs: LEGS, highlightSeq: 1 })
    const red = polylineCalls.filter((c) => c.opts.color === '#f56c6c')
    expect(red).toHaveLength(1)
    expect(red[0].points).toEqual(LEGS[0].polyline)
    expect(red[0].opts.dashArray).toBeUndefined()
    w.unmount()
  })

  it('hover 第 2 位標出第 1 站到第 2 站那一段', async () => {
    const w = await mountMap({ legs: LEGS, highlightSeq: 2 })
    const red = polylineCalls.filter((c) => c.opts.color === '#f56c6c')
    expect(red[0].points).toEqual(LEGS[1].polyline)
    w.unmount()
  })

  it('高亮的站換成放大的 icon，其餘維持原大小', async () => {
    const w = await mountMap({ legs: LEGS, highlightSeq: 2 })
    // applyHighlight 會對每個 marker setIcon：seq 2 放大、seq 1 維持
    const active = markerIcons.filter((i) => String(i.className).includes('is-active'))
    expect(active).toHaveLength(1)
    expect(active[0].iconSize).toEqual([38, 38])
    const inactive = markerIcons.filter((i) => !String(i.className).includes('is-active'))
    expect(inactive.every((i) => JSON.stringify(i.iconSize) === JSON.stringify([26, 26]))).toBe(true)
    w.unmount()
  })

  it('highlightSeq=null 時不畫紅線', async () => {
    const w = await mountMap({ legs: LEGS, highlightSeq: null })
    expect(polylineCalls.filter((c) => c.opts.color === '#f56c6c')).toHaveLength(0)
    w.unmount()
  })

  /** 沒有那一段的道路幾何時，退成「上一點 → 這一站」的紅色虛線，不假裝是實際路徑。 */
  it('缺該段幾何時退成紅色虛線直線', async () => {
    const w = await mountMap({ legs: [{ polyline: [] }, { polyline: [] }], highlightSeq: 2 })
    const red = polylineCalls.filter((c) => c.opts.color === '#f56c6c')
    expect(red).toHaveLength(1)
    expect(red[0].opts.dashArray).toBe('6 6')
    // 站1 → 站2
    expect(red[0].points).toEqual([[22.70, 120.31], [22.71, 120.32]])
    w.unmount()
  })

  it('高亮點已在視野內就不 panTo（避免每次 hover 都跳動）', async () => {
    boundsContains = true
    const w = await mountMap({ legs: LEGS, highlightSeq: 2 })
    expect(panToCalls).toHaveLength(0)
    w.unmount()
  })

  it('高亮點落在視野外才 panTo', async () => {
    boundsContains = false
    const w = await mountMap({ legs: LEGS, highlightSeq: 2 })
    expect(panToCalls).toEqual([{ lat: 22.71, lng: 120.32 }])
    w.unmount()
  })
})
