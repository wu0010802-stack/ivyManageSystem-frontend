import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// P3：reload 無請求序號守衛。快速切年級 A(慢)→B(快) 時，較舊 A 回應遲到 resolve
// 會覆寫最新 B 的 reservedCount/prospects。修正：加 reloadSeq，過期回應丟棄不寫。

const getIntakePlanMock = vi.hoisted(() => vi.fn())
const getRecruitmentRecordsMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/recruitmentIntake', () => ({ getIntakePlan: getIntakePlanMock }))
vi.mock('@/api/recruitment', () => ({ getRecruitmentRecords: getRecruitmentRecordsMock }))

import { useClassroomProspects } from '../useClassroomProspects'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

describe('useClassroomProspects.reload 請求序號守衛（P3）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('切年級 A(慢)→B(快)：較舊 A 回應遲到 resolve 後不得覆寫最新 B 的 reservedCount', async () => {
    getRecruitmentRecordsMock.mockResolvedValue({ data: { records: [] } })
    const dA = deferred<{ data: { rows: { grade_id: number; reserved_count: number }[] } }>()
    const dB = deferred<{ data: { rows: { grade_id: number; reserved_count: number }[] } }>()
    getIntakePlanMock.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise)

    const opts = ref({ grade_id: 1, school_year: 114, semester: 1 })
    const { reservedCount, reload } = useClassroomProspects(opts)

    const runA = reload() // 年級 1（慢）
    opts.value = { grade_id: 2, school_year: 114, semester: 1 }
    const runB = reload() // 年級 2（快）

    dB.resolve({ data: { rows: [{ grade_id: 2, reserved_count: 22 }] } })
    await runB
    expect(reservedCount.value).toBe(22)

    dA.resolve({ data: { rows: [{ grade_id: 1, reserved_count: 11 }] } }) // 遲到舊回應
    await runA
    expect(reservedCount.value).toBe(22) // 未被較舊 A 覆寫
  })
})
