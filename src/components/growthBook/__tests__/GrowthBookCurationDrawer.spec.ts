import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'

// draft 回傳的 candidates 形狀對齊後端 T13 follow-up（services/growth_book_service.py
// collect_book_candidates）：observations／work_samples 各 item 帶 attachment_thumbs
// [{"id","thumb_url"}]，collage_pool 為 [{"id","date","thumb_url"}]（非 tuple）。
function makeDraftResponse() {
  return {
    data: {
      manifest: {
        version: 1, cover_attachment_id: 11, observation_ids: [1],
        work_sample_ids: [5], collage_attachment_ids: [11], milestone_ids: [7],
        include_measurements: true,
      },
      candidates: {
        observations: [
          {
            id: 1, domain: '美感', narrative: '畫彩虹', observation_date: '2025-10-01',
            is_highlight: true, rating: 5, attachment_ids: [11],
            attachment_thumbs: [{ id: 11, thumb_url: '/api/uploads/portfolio/t11.jpg' }],
          },
          {
            id: 2, domain: '語文', narrative: '說故事', observation_date: '2025-11-01',
            is_highlight: false, rating: null, attachment_ids: [],
            attachment_thumbs: [],
          },
        ],
        work_samples: [
          {
            id: 5, title: '彩虹', work_date: '2025-10-01', domain: '美感',
            attachment_ids: [12],
            attachment_thumbs: [{ id: 12, thumb_url: '/api/uploads/portfolio/t12.jpg' }],
          },
        ],
        collage_pool: [{ id: 11, date: '2025-10-01', thumb_url: '/api/uploads/portfolio/t11.jpg' }],
        milestones: [{ id: 7, title: '第一天上學', date: '2025-08-01' }],
        measurement_count: 3,
      },
      period: { start: '2025-08-01', end: '2026-07-31', label: '114學年度成長冊' },
    },
  }
}

const draftGrowthBook = vi.fn(() => Promise.resolve(makeDraftResponse()))
const createGrowthBook = vi.fn(() => Promise.resolve({ data: { id: 9 } }))
// 依 controller 覆寫：@/api/growthBooks 實際只 export draftGrowthBook／createGrowthBook／
// getGrowthBookBatchStatus，無 sendGrowthReportLine 等函式——mock 只需元件實際會 import 的兩個。
vi.mock('@/api/growthBooks', () => ({
  draftGrowthBook: (...a: unknown[]) => draftGrowthBook(...a),
  createGrowthBook: (...a: unknown[]) => createGrowthBook(...a),
}))

import GrowthBookCurationDrawer from '../GrowthBookCurationDrawer.vue'

type VM = {
  selectedObservationIds: number[]
  selectedWorkSampleIds: number[]
  selectedCollageIds: number[]
  selectedMilestoneIds: number[]
  coverAttachmentId: number | null
  includeMeasurements: boolean
  teacherNarrative: string
  generate: () => Promise<void>
  conflictHint: string | null
}

function mountDrawer() {
  return mount(GrowthBookCurationDrawer, {
    props: { modelValue: true, studentId: 1, studentName: '王小明', academicYear: 114 },
    global: { plugins: [ElementPlus] },
  })
}

describe('GrowthBookCurationDrawer', () => {
  it('開啟即載入 draft，取消勾選觀察後生成帶調整後 manifest', async () => {
    const w = mountDrawer()
    await flushPromises()
    expect(draftGrowthBook).toHaveBeenCalledWith(1, { academic_year: 114 })
    expect(w.text()).toContain('畫彩虹')
    const vm = w.vm as unknown as VM
    vm.selectedObservationIds = []
    await vm.generate()
    expect(createGrowthBook).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        academic_year: 114,
        manifest: expect.objectContaining({ observation_ids: [] }),
      }),
    )
  })

  // 4 筆同域（美感）觀察，manifest 預選 [1,2,3]（已滿 OBS_PER_DOMAIN_LIMIT=3），
  // id=4 未選——供「已滿 disable」與「取消後恢復可勾」兩個測試共用。
  function makeFourObsSameDomainResponse() {
    return {
      data: {
        manifest: {
          version: 1, cover_attachment_id: null, observation_ids: [1, 2, 3],
          work_sample_ids: [], collage_attachment_ids: [], milestone_ids: [],
          include_measurements: false,
        },
        candidates: {
          observations: [
            { id: 1, domain: '美感', narrative: 'A', observation_date: '2025-10-01', is_highlight: false, rating: null, attachment_ids: [], attachment_thumbs: [] },
            { id: 2, domain: '美感', narrative: 'B', observation_date: '2025-10-02', is_highlight: false, rating: null, attachment_ids: [], attachment_thumbs: [] },
            { id: 3, domain: '美感', narrative: 'C', observation_date: '2025-10-03', is_highlight: false, rating: null, attachment_ids: [], attachment_thumbs: [] },
            { id: 4, domain: '美感', narrative: 'D', observation_date: '2025-10-04', is_highlight: false, rating: null, attachment_ids: [], attachment_thumbs: [] },
          ],
          work_samples: [],
          collage_pool: [],
          milestones: [],
          measurement_count: 0,
        },
        period: { start: '2025-08-01', end: '2026-07-31', label: '114學年度成長冊' },
      },
    }
  }

  it('每領域已勾滿 3 筆觀察時，該領域其餘 checkbox 應被 disable', async () => {
    draftGrowthBook.mockImplementationOnce(() => Promise.resolve(makeFourObsSameDomainResponse()))
    const w = mountDrawer()
    await flushPromises()
    // 用 el-checkbox 專屬 class 篩選（排除「成長曲線」el-switch 底層也是
    // input[type=checkbox] 但語意不同，不應誤算進來）。
    const checkboxes = w.findAll('input.el-checkbox__original')
    // 第 4 筆（id=4）未勾選，且同領域已勾滿 3 筆 → 應被 disable
    const disabledUnchecked = checkboxes.filter((c) => !(c.element as HTMLInputElement).checked)
    expect(disabledUnchecked.length).toBeGreaterThan(0)
    for (const c of disabledUnchecked) {
      expect((c.element as HTMLInputElement).disabled).toBe(true)
    }
  })

  it('勾滿 3 筆後取消其中一筆，同領域第 4 筆應恢復可勾選', async () => {
    draftGrowthBook.mockImplementationOnce(() => Promise.resolve(makeFourObsSameDomainResponse()))
    const w = mountDrawer()
    await flushPromises()
    const vm = w.vm as unknown as VM
    // 取消 id=1（原本已勾滿 3 筆之一），同域選取數降到 2 → id=4 應解除 disable
    // （早退分支 isObservationCheckboxDisabled 對「已選取」項目直接回 false，
    // 但本測試驗證的是「取消後，未選取的第 4 筆重新計算 disabled」這條路徑）。
    vm.selectedObservationIds = vm.selectedObservationIds.filter((id) => id !== 1)
    await w.vm.$nextTick()
    const checkboxes = w.findAll('input.el-checkbox__original')
    const fourthCheckbox = checkboxes.find((c) => (c.element as HTMLInputElement).value === '4')
    expect(fourthCheckbox).toBeTruthy()
    expect((fourthCheckbox!.element as HTMLInputElement).disabled).toBe(false)
  })

  it('全部取消勾選且無封面時，生成鈕 disabled 並提示至少選擇一項素材', async () => {
    const w = mountDrawer()
    await flushPromises()
    const vm = w.vm as unknown as VM
    vm.selectedObservationIds = []
    vm.selectedWorkSampleIds = []
    vm.selectedCollageIds = []
    vm.selectedMilestoneIds = []
    vm.coverAttachmentId = null
    await w.vm.$nextTick()
    expect(w.text()).toContain('至少選擇一項素材')
    const genBtn = w.findAll('button').find((b) => b.text().trim() === '生成')
    expect(genBtn).toBeTruthy()
    expect(genBtn!.attributes('disabled')).not.toBeUndefined()
  })

  it('409 衝突時顯示後端 detail 並提示先刪除舊冊', async () => {
    const detail = '同學年已有成長冊（report_id=99, status=ready）'
    createGrowthBook.mockImplementationOnce(() => Promise.reject({
      response: { status: 409, data: { detail } },
    }))
    const errorSpy = vi.spyOn(ElMessage, 'error')
    const w = mountDrawer()
    await flushPromises()
    const vm = w.vm as unknown as VM
    await vm.generate()
    await flushPromises()
    expect(errorSpy).toHaveBeenCalledWith(detail)
    expect(w.text()).toContain('請先於列表刪除舊冊')
    errorSpy.mockRestore()
  })
})
