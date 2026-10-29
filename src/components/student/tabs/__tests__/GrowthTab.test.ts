/**
 * 學生檔案「成長」頁籤（後台 IA 重整 S6）：原三層巢狀（一級 → 健康類／成長類 → 子頁籤）攤平成一層，
 * 七個區塊依序排成可展開區段。守：全部區塊都在、首次展開才掛載、?sub= 深連結展開對的區塊、
 * PORTFOLIO_READ 缺席時一個區塊都不掛。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { nextTick } from 'vue'

const granted = vi.hoisted(() => ({ codes: new Set<string>() }))
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => granted.codes.has(code) }))

import GrowthTab from '../GrowthTab.vue'

const CHILDREN = {
  PortfolioTab: 'portfolio',
  MilestonesTab: 'milestones',
  TimelineTab: 'timeline',
  PhotoGalleryTab: 'photo_gallery',
  GrowthReportTab: 'growth_report',
  MeasurementsSection: 'measurements',
  WorkSamplesSection: 'work_samples',
} as const

const stubs = Object.fromEntries(
  Object.keys(CHILDREN).map((name) => [name, { name, props: ['studentId'], template: `<div class="child" data-child="${name}" />` }]),
)

function mountTab(props: Record<string, unknown> = {}) {
  return mount(GrowthTab, {
    props: { studentId: 1, ...props },
    global: { plugins: [ElementPlus], stubs },
    attachTo: document.body,
  })
}
const mounted = (w: ReturnType<typeof mountTab>) => w.findAll('.child').map((c) => c.attributes('data-child'))

describe('GrowthTab', () => {
  beforeEach(() => {
    granted.codes = new Set(['PORTFOLIO_READ'])
  })

  it('七個區塊都在，標題依序：成長歷程、里程碑、時間軸、照片牆、成長報告、量測曲線、作品集', () => {
    const w = mountTab()
    const titles = w.findAll('.el-collapse-item__title').map((t) => t.text())
    expect(titles).toEqual(['成長歷程', '里程碑', '時間軸', '照片牆', '成長報告', '量測曲線', '作品集'])
    expect(w.findAll('[data-section]').map((n) => n.attributes('data-section'))).toEqual([
      'portfolio', 'milestones', 'timeline', 'photo_gallery', 'growth_report', 'measurements', 'work_samples',
    ])
  })

  it('沒有巢狀頁籤（不再有 el-tabs／分組切換）', () => {
    const w = mountTab()
    expect(w.find('.el-tabs').exists()).toBe(false)
    expect(w.find('.el-radio-group').exists()).toBe(false)
  })

  it('預設只掛載第一個區塊（保留原子頁籤 lazy：不一進頁籤就打七支 API）', () => {
    expect(mounted(mountTab())).toEqual(['PortfolioTab'])
  })

  it('展開區塊時才掛載，收合後仍保留（不重打 API）', async () => {
    const w = mountTab()
    const header = w.get('[data-section="timeline"] .el-collapse-item__header')
    await header.trigger('click')
    await nextTick()
    expect(mounted(w)).toEqual(['PortfolioTab', 'TimelineTab'])
    await header.trigger('click') // 收合
    await nextTick()
    expect(mounted(w)).toEqual(['PortfolioTab', 'TimelineTab'])
  })

  it.each(Object.entries(CHILDREN))('初始帶 sectionRequest（?sub=）→ 直接展開對應區塊：%s', (childName, section) => {
    const w = mountTab({ sectionRequest: { section, nonce: 1 } })
    expect(mounted(w)).toEqual([childName])
  })

  it('掛載後才收到請求：展開該區塊並捲動過去；同區塊再請求（新 nonce）仍會觸發捲動', async () => {
    const scrollIntoView = vi.fn()
    ;(Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView
    const w = mountTab()
    await w.setProps({ sectionRequest: { section: 'photo_gallery', nonce: 1 } })
    await flushPromises()
    expect(mounted(w)).toContain('PhotoGalleryTab')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    await w.setProps({ sectionRequest: { section: 'photo_gallery', nonce: 2 } })
    await flushPromises()
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('不認得的區塊（含屬於教務紀錄的 attendance）一律忽略，不展開也不報錯', async () => {
    const w = mountTab()
    await w.setProps({ sectionRequest: { section: 'attendance', nonce: 1 } })
    await flushPromises()
    expect(mounted(w)).toEqual(['PortfolioTab'])
  })

  it('沒有 PORTFOLIO_READ：一個區塊都不掛載（頁籤本身也不會顯示，這裡是直接掛載時的第二道）', () => {
    granted.codes = new Set()
    const w = mountTab({ sectionRequest: { section: 'timeline', nonce: 1 } })
    expect(mounted(w)).toEqual([])
    expect(w.find('.el-collapse').exists()).toBe(false)
  })
})
