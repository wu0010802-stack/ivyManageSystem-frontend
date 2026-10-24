import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useAdmissionsTermFilter } from '../useAdmissionsTermFilter'

/**
 * 招生入學頁的共用「入學學年／學期」（2026-09-06 招生流程審查）。
 * 原本看板、明細、名額規劃、統計各自一份，切 tab 就重設。
 */
const routeMock = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
const replaceMock = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ replace: replaceMock }),
}))

beforeEach(() => {
  routeMock.query = {}
  replaceMock.mockClear()
})

describe('useAdmissionsTermFilter', () => {
  it('沒有 query 時兩者皆為 null（代表不限）', () => {
    const term = useAdmissionsTermFilter()
    expect(term.schoolYear.value).toBeNull()
    expect(term.semester.value).toBeNull()
  })

  it('從 URL query 還原，重整不掉狀態', () => {
    routeMock.query = { sy: '115', sem: '2' }
    const term = useAdmissionsTermFilter()
    expect(term.schoolYear.value).toBe(115)
    expect(term.semester.value).toBe(2)
  })

  it('學年超出民國三位數範圍時視為未指定', () => {
    routeMock.query = { sy: '99999' }
    expect(useAdmissionsTermFilter().schoolYear.value).toBeNull()
  })

  it('學期只接受 1 或 2', () => {
    routeMock.query = { sem: '3' }
    expect(useAdmissionsTermFilter().semester.value).toBeNull()
  })

  it('改值會寫回 URL', async () => {
    const term = useAdmissionsTermFilter()
    term.schoolYear.value = 115
    term.semester.value = 1
    await nextTick()

    expect(replaceMock).toHaveBeenCalled()
    const lastArg = replaceMock.mock.calls.at(-1)![0]
    expect(lastArg.query).toMatchObject({ sy: '115', sem: '1' })
  })

  it('清成 null 時移除該 query，不留下空字串', async () => {
    routeMock.query = { sy: '115', sem: '1' }
    const term = useAdmissionsTermFilter()
    term.schoolYear.value = null
    await nextTick()

    const lastArg = replaceMock.mock.calls.at(-1)![0]
    expect(lastArg.query.sy).toBeUndefined()
  })

  it('保留 URL 上其他 query（例如 tab）', async () => {
    routeMock.query = { tab: 'records' }
    const term = useAdmissionsTermFilter()
    term.schoolYear.value = 114
    await nextTick()

    const lastArg = replaceMock.mock.calls.at(-1)![0]
    expect(lastArg.query.tab).toBe('records')
  })

  it('semesterOrFirst 讓需要具體學期的面板有值可用', () => {
    const term = useAdmissionsTermFilter()
    expect(term.semesterOrFirst.value).toBe(1)
    term.semester.value = 2
    expect(term.semesterOrFirst.value).toBe(2)
  })

  it('setTerm 只改有傳的欄位', () => {
    const term = useAdmissionsTermFilter()
    term.schoolYear.value = 115
    term.semester.value = 2

    term.setTerm({ semester: 1 })

    expect(term.schoolYear.value).toBe(115)
    expect(term.semester.value).toBe(1)
  })
})
