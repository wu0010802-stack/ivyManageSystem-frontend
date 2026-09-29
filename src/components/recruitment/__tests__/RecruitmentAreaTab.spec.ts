import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

// RecruitmentAddressHeatmap 是 1930 行 async leaflet 元件，測試 stub 掉
const AreaTab = () => import('../RecruitmentAreaTab.vue')

const baseProps = (over: Record<string, unknown> = {}) => ({
  campus: { campus_name: '常春藤幼兒園', campus_address: '台中市西屯區' },
  marketSnapshot: {},
  hotspotsSummary: {},
  fmtPct: (d: number, v: number) => (v ? `${((d / v) * 100).toFixed(1)}%` : '0%'),
  ...over,
})

const mountArea = async (over: Record<string, unknown> = {}) => {
  const Comp = (await AreaTab()).default
  return mount(Comp, {
    props: baseProps(over),
    global: {
      stubs: {
        RecruitmentAddressHeatmap: true,
        IvyCampusCompetition: true,
      },
    },
  })
}

describe('RecruitmentAreaTab 行政區分組', () => {
  it('有資料的行政區渲染成完整卡片、無資料的收進精簡區塊', async () => {
    const wrapper = await mountArea({
      marketSnapshot: {
        districts: [
          { district: '西屯區', lead_count_90d: 5, deposit_rate_90d: 40, competitor_count: 8 },
          { district: '北屯區', competitor_count: 3, population_0_6: 1200 },
          { district: '中山區' }, // 全空
          { district: '大安區' }, // 全空
        ],
      },
    })
    // 有資料（含競爭/人口）的兩區是完整卡片
    expect(wrapper.findAll('.district-card').length).toBe(2)
    // 全空的兩區收進 muted chip 區
    const chips = wrapper.findAll('.district-chip')
    expect(chips.length).toBe(2)
    expect(wrapper.text()).toContain('尚無市場情報')
  })

  it('全部行政區皆無資料時仍顯示精簡區塊、無完整卡片', async () => {
    const wrapper = await mountArea({
      marketSnapshot: { districts: [{ district: '中山區' }, { district: '大安區' }] },
    })
    expect(wrapper.findAll('.district-card').length).toBe(0)
    expect(wrapper.findAll('.district-chip').length).toBe(2)
  })

  it('完全沒有行政區資料時顯示原空狀態', async () => {
    const wrapper = await mountArea({ marketSnapshot: { districts: [] } })
    expect(wrapper.find('.district-empty').exists()).toBe(true)
  })
})

describe('RecruitmentAreaTab KPI 零值中性化', () => {
  it('KPI 為 0 時加上 kpi-val--zero 樣式', async () => {
    const wrapper = await mountArea({ marketSnapshot: { districts: [] }, hotspotsSummary: {} })
    const vals = wrapper.findAll('.kpi-val')
    expect(vals.length).toBe(4)
    expect(vals.every((v) => v.classes().includes('kpi-val--zero'))).toBe(true)
  })

  it('KPI 有值時不加 zero 樣式', async () => {
    const wrapper = await mountArea({
      marketSnapshot: { districts: [{ district: '西屯區', lead_count_90d: 5, competitor_count: 8 }] },
      hotspotsSummary: { geocoded_hotspots: 3 },
    })
    const vals = wrapper.findAll('.kpi-val')
    // 已定位=3、覆蓋區=1、競爭校=8 皆非零
    expect(vals[0].classes()).not.toContain('kpi-val--zero')
    expect(vals[2].classes()).not.toContain('kpi-val--zero')
  })
})

describe('RecruitmentAreaTab 本園座標未設定（F65）', () => {
  // 熱點圖是 async 元件、被 stub 掉，拿不到宣告的 props——改讀傳進去的原始 attrs 值（未字串化）
  const heatmapCoords = async (campus: Record<string, unknown>) => {
    const wrapper = await mountArea({ campus })
    const heatmap = wrapper.findComponent({ name: 'RecruitmentAddressHeatmap' })
    expect(heatmap.exists()).toBe(true)
    const attrs = heatmap.vm.$attrs as Record<string, unknown>
    expect('school-lat' in attrs && 'school-lng' in attrs).toBe(true)
    return { lat: attrs['school-lat'], lng: attrs['school-lng'] }
  }

  /**
   * 上游（RecruitmentStatsPanel）對非預設租戶未設座標時給 null。這裡以前用 `|| 0`
   * 把「未設定」轉成 0,0（大西洋上的 Null Island），熱點圖會把「本園」畫在那裡。
   * 未設定必須以非有限值往下傳，讓熱點圖走「尚未設定本園座標」的空狀態。
   */
  it('campus_lat／lng 為 null 時傳給熱點圖的 school-lat／lng 不是 0，而是非有限值', async () => {
    const { lat, lng } = await heatmapCoords({ campus_name: '本園', campus_lat: null, campus_lng: null })
    expect(typeof lat).toBe('number')
    expect(Number.isFinite(lat)).toBe(false)
    expect(Number.isFinite(lng)).toBe(false)
  })

  it('有座標時照傳（含 0 不被吃掉）', async () => {
    expect(await heatmapCoords({ campus_lat: 22.73, campus_lng: 120.33 })).toEqual({ lat: 22.73, lng: 120.33 })
    expect(await heatmapCoords({ campus_lat: 0, campus_lng: 0 })).toEqual({ lat: 0, lng: 0 })
  })
})
