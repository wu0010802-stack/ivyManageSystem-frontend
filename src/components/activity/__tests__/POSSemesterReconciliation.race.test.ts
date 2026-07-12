import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// 2026-06-29 audit F3：學期對帳 reload() 無請求序號守衛。切學期 / 快速切篩選時，較慢的
// 舊請求可最後覆寫 items/totals/truncated/totalActive，造成選擇器顯示新學期、金額卻屬舊
// 學期。修正：reload 加 reloadSeq，僅最新請求能寫入狀態。

const getReconMock = vi.hoisted(() => vi.fn())
const getClassroomsMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  getPOSSemesterReconciliation: getReconMock,
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: getClassroomsMock,
}))

import POSSemesterReconciliation from '../POSSemesterReconciliation.vue'
import { useAcademicTermStore } from '@/stores/academicTerm'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function mountRecon() {
  return mount(POSSemesterReconciliation, {
    global: {
      // stub 子元件與 el-table（避免展開列以精簡 row 資料渲染產生噪音；
      // 本測聚焦 reload 序號守衛狀態，不驗表格 DOM）。
      stubs: {
        AcademicTermSelector: true,
        StatCard: true,
        'el-table': true,
        'el-table-column': true,
      },
    },
  })
}

describe('POSSemesterReconciliation reload 序號守衛（F3）', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.clearAllMocks())

  it('舊回應不覆寫新學期：較慢的舊請求 resolve 後狀態仍為新學期', async () => {
    const d1 = deferred<unknown>() // mount 的 reload（舊學期）
    const d2 = deferred<unknown>() // 切學期後的 reload（新學期）
    getClassroomsMock.mockResolvedValue({ data: { items: [] } })
    getReconMock.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)

    const wrapper = mountRecon()
    await flushPromises() // mount 觸發 reload #1（d1 仍 pending）

    const termStore = useAcademicTermStore()
    termStore.setTerm(termStore.school_year + 1, termStore.semester) // 觸發 watch → reload #2
    await flushPromises()

    // 先 resolve 新（#2）
    d2.resolve({
      data: {
        items: [{ id: 'new' }, { id: 'new2' }],
        totals: { offline_paid_amount: 2000 },
        truncated: false,
        total_active: 2,
      },
    })
    await flushPromises()

    // 後 resolve 舊（#1）—不得覆寫
    d1.resolve({
      data: {
        items: [{ id: 'old' }],
        totals: { offline_paid_amount: 1000 },
        truncated: true,
        total_active: 99,
      },
    })
    await flushPromises()

    const ss = wrapper.vm.$.setupState as {
      items: { id: string }[]
      totals: { offline_paid_amount?: number }
      truncated: boolean
      totalActive: number
    }
    expect(ss.items.length).toBe(2)
    expect(ss.items[0].id).toBe('new')
    expect(ss.totals.offline_paid_amount).toBe(2000)
    expect(ss.truncated).toBe(false)
    expect(ss.totalActive).toBe(2)
    wrapper.unmount()
  })

  it('班級選項 loadClassroomOptions 同守衛：舊學期班級不覆寫新學期（review P3）', async () => {
    getReconMock.mockResolvedValue({
      data: { items: [], totals: {}, truncated: false, total_active: 0 },
    })
    const c1 = deferred<unknown>() // mount 的 loadClassroomOptions（舊學期）
    const c2 = deferred<unknown>() // 切學期後的 loadClassroomOptions（新學期）
    getClassroomsMock.mockReturnValueOnce(c1.promise).mockReturnValueOnce(c2.promise)

    const wrapper = mountRecon()
    await flushPromises() // mount → loadClassroomOptions #1（c1 pending）

    const termStore = useAcademicTermStore()
    termStore.setTerm(termStore.school_year + 1, termStore.semester) // watch → #2
    await flushPromises()

    c2.resolve({ data: { items: [{ name: '新學期班' }] } }) // 新
    await flushPromises()
    c1.resolve({ data: { items: [{ name: '舊學期班' }] } }) // 舊（遲到）
    await flushPromises()

    const ss = wrapper.vm.$.setupState as { classroomOptions: string[] }
    expect(ss.classroomOptions).toEqual(['新學期班'])
    wrapper.unmount()
  })

  it('最新請求正常寫入（無亂序時不受守衛影響）', async () => {
    getClassroomsMock.mockResolvedValue({ data: { items: [] } })
    getReconMock.mockResolvedValue({
      data: {
        items: [{ id: 'a' }],
        totals: { offline_paid_amount: 500 },
        truncated: false,
        total_active: 1,
      },
    })

    const wrapper = mountRecon()
    await flushPromises()

    const ss = wrapper.vm.$.setupState as {
      items: { id: string }[]
      totals: { offline_paid_amount?: number }
    }
    expect(ss.items.length).toBe(1)
    expect(ss.totals.offline_paid_amount).toBe(500)
    wrapper.unmount()
  })
})
