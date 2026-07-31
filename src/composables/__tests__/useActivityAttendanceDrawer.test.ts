import { describe, it, expect, vi } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'
import { ElMessage } from 'element-plus'

interface StudentSeed {
  registration_id: number
  classroom_id: number | null
  class_name: string
  student_name: string
  is_present?: boolean | null
  attendance_notes?: string
}

interface SavedRecord {
  registration_id: unknown
  is_present: boolean | null
  notes: string
}

/**
 * 如實模擬後端 JSON 回應：groups 與 students 在 Python 端是同一批 dict，
 * 但 JSON 序列化後到前端變成兩棵「獨立」物件樹（深拷貝）。
 */
function buildApiResponse(seeds: StudentSeed[]) {
  const students = seeds.map(s => ({ is_present: null, attendance_notes: '', ...s }))
  const groupMap = new Map<string, { classroom_id: number | null; classroom_name: string; students: unknown[] }>()
  for (const s of students) {
    const key = s.classroom_id === null ? 'unassigned' : String(s.classroom_id)
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        classroom_id: s.classroom_id,
        classroom_name: s.classroom_id === null ? '未分班' : s.class_name,
        students: [],
      })
    }
    // 深拷貝：模擬 JSON 化後 groups 是獨立樹
    groupMap.get(key)!.students.push(JSON.parse(JSON.stringify(s)))
  }
  return {
    data: {
      id: 101,
      course_name: '音樂律動',
      session_date: '2026-06-13',
      students,
      total: students.length,
      groups: [...groupMap.values()],
    },
  }
}

const SEEDS: StudentSeed[] = [
  { registration_id: 11, classroom_id: 2, class_name: '櫻桃班', student_name: '王小明' },
  { registration_id: 12, classroom_id: 1, class_name: '蘋果班', student_name: '李小華' },
  { registration_id: 13, classroom_id: null, class_name: '', student_name: '陳小美' },
  { registration_id: 14, classroom_id: 2, class_name: '櫻桃班', student_name: '張小強' },
]

function setup(seeds: StudentSeed[] = SEEDS) {
  const getSessionFn = vi.fn(async (..._args: unknown[]) => buildApiResponse(seeds))
  const updateFn = vi.fn(async (..._args: unknown[]) => ({ data: { ok: true } }))
  const drawer = useActivityAttendanceDrawer({ getSessionFn, updateFn })
  return { drawer, getSessionFn, updateFn }
}

function savedRecords(updateFn: ReturnType<typeof vi.fn>): SavedRecord[] {
  return updateFn.mock.calls[0][1] as SavedRecord[]
}

describe('useActivityAttendanceDrawer — 分組點名單一資料源', () => {
  it('分組模式改 is_present 會反映到 handleSave payload（groups 為扁平樹的 computed 視圖）', async () => {
    const { drawer, updateFn } = setup()
    await drawer.openDrawer({ id: 101 })

    const groups = drawer.groupedStudents.value
    expect(groups.length).toBeGreaterThan(0)
    // 在「分組樹」上點名（對應分組模式 el-switch v-model）
    const target = groups[0].students[0]
    target.is_present = true

    await drawer.handleSave()
    expect(updateFn).toHaveBeenCalledTimes(1)
    const records = savedRecords(updateFn)
    expect(records).toEqual([
      { registration_id: target.registration_id, is_present: true, notes: '' },
    ])
  })

  it('新場次（全 null）分組點完名後 payload 非空且完整', async () => {
    const { drawer, updateFn } = setup()
    await drawer.openDrawer({ id: 101 })

    for (const g of drawer.groupedStudents.value) {
      for (const s of g.students) s.is_present = true
    }

    await drawer.handleSave()
    const records = savedRecords(updateFn)
    expect(records).toHaveLength(SEEDS.length)
    expect(records.map(r => r.registration_id).sort()).toEqual([11, 12, 13, 14])
    expect(records.every(r => r.is_present === true)).toBe(true)
  })

  it('「全部出席」與「全班出席」都反映到 payload 與統計 counts', async () => {
    const { drawer, updateFn } = setup()
    await drawer.openDrawer({ id: 101 })

    // 全部缺席（flat 路徑）
    drawer.setAllPresent(false)
    expect(drawer.drawerAbsentCount.value).toBe(SEEDS.length)

    // 全班出席（分組路徑：對 group.students 同引用物件操作）
    const cherryGroup = drawer.groupedStudents.value.find(g => g.classroom_id === 2)!
    cherryGroup.students.forEach(s => { s.is_present = true })
    expect(drawer.drawerPresentCount.value).toBe(2)
    expect(drawer.drawerAbsentCount.value).toBe(SEEDS.length - 2)

    await drawer.handleSave()
    const records = savedRecords(updateFn)
    expect(records).toHaveLength(SEEDS.length)
    const byId = new Map(records.map(r => [r.registration_id, r.is_present]))
    expect(byId.get(11)).toBe(true)
    expect(byId.get(14)).toBe(true)
    expect(byId.get(12)).toBe(false)
    expect(byId.get(13)).toBe(false)
  })

  it('分組規則：按 classroom_id 分組、未分班排最後、其餘按班名 zh-Hant 排序', async () => {
    const { drawer } = setup()
    await drawer.openDrawer({ id: 101 })

    const groups = drawer.groupedStudents.value
    expect(groups).toHaveLength(3)

    // 未分班（classroom_id null）永遠排最後
    const last = groups[groups.length - 1]
    expect(last.classroom_id).toBeNull()
    expect(last.classroom_name).toBe('未分班')
    expect(last.students.map(s => s.registration_id)).toEqual([13])

    // 其餘按班名 zh-Hant localeCompare 排序
    const classifiedNames = groups.slice(0, -1).map(g => g.classroom_name)
    expect(classifiedNames).toEqual(
      [...classifiedNames].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    )

    // 同班聚成同一組
    const cherry = groups.find(g => g.classroom_id === 2)!
    expect(cherry.classroom_name).toBe('櫻桃班')
    expect(cherry.students.map(s => s.registration_id).sort()).toEqual([11, 14])
  })

  it('groupedStudents 內物件與扁平 students 為同一引用（非 clone）', async () => {
    const { drawer } = setup()
    await drawer.openDrawer({ id: 101 })

    for (const g of drawer.groupedStudents.value) {
      for (const s of g.students) {
        const flat = drawer.drawerSession.value!.students.find(
          f => f.registration_id === s.registration_id
        )
        expect(s).toBe(flat)
      }
    }
  })
})

describe('useActivityAttendanceDrawer — F2 點名只送異動列（防跨學生 lost update）', () => {
  it('只送相對載入快照有異動的列，不回沖其他老師已點的學生', async () => {
    // 另一位老師已把 11 點為出席（載入快照即帶 is_present=true）
    const seeds: StudentSeed[] = [
      { registration_id: 11, classroom_id: 2, class_name: '櫻桃班', student_name: '王小明', is_present: true },
      { registration_id: 12, classroom_id: 1, class_name: '蘋果班', student_name: '李小華' },
      { registration_id: 13, classroom_id: null, class_name: '', student_name: '陳小美' },
    ]
    const { drawer, updateFn } = setup(seeds)
    await drawer.openDrawer({ id: 101 })

    // 本次只動 12（11 維持載入時的 true，未碰）
    const s12 = drawer.drawerSession.value!.students.find(s => s.registration_id === 12)!
    s12.is_present = true

    await drawer.handleSave()
    const records = savedRecords(updateFn)
    // 只能含 12；含 11 即代表用過期快照回沖了別人的點名
    expect(records).toEqual([{ registration_id: 12, is_present: true, notes: '' }])
  })

  it('未標記出缺席卻打了備註 → 擋下並指名，不得靜默丟棄（2026-07-31 稽核）', async () => {
    // 後端 AttendanceRecordItem.is_present 是必填 bool，備註無法單獨寫入。原本這種列
    // 會被 filter 直接丟掉，但流程照樣 captureBaseline（畫面標為乾淨）並顯示
    // 「點名儲存成功」→ 老師打的備註靜默消失，關掉 drawer 才發現。
    const seeds: StudentSeed[] = [
      { registration_id: 31, classroom_id: 1, class_name: '蘋果班', student_name: '甲', is_present: true },
      { registration_id: 32, classroom_id: 1, class_name: '蘋果班', student_name: '乙' },
    ]
    const { drawer, updateFn } = setup(seeds)
    await drawer.openDrawer({ id: 101 })

    const s31 = drawer.drawerSession.value!.students.find(s => s.registration_id === 31)!
    s31.attendance_notes = '早退'
    // 乙未標記出缺席，卻打了備註
    const s32 = drawer.drawerSession.value!.students.find(s => s.registration_id === 32)!
    s32.attendance_notes = '家長說今天請假'

    await drawer.handleSave()

    expect(updateFn).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith(
      expect.stringContaining('乙'),
    )
  })

  it('改備註亦算異動（present 不變但備註變）會被送出', async () => {
    const seeds: StudentSeed[] = [
      { registration_id: 21, classroom_id: 1, class_name: '蘋果班', student_name: '甲', is_present: true, attendance_notes: '' },
    ]
    const { drawer, updateFn } = setup(seeds)
    await drawer.openDrawer({ id: 101 })
    const s21 = drawer.drawerSession.value!.students.find(s => s.registration_id === 21)!
    s21.attendance_notes = '遲到 10 分鐘'

    await drawer.handleSave()
    expect(savedRecords(updateFn)).toEqual([
      { registration_id: 21, is_present: true, notes: '遲到 10 分鐘' },
    ])
  })
})

describe('useActivityAttendanceDrawer — F4b 全無異動不打 API（避免 422）', () => {
  it('全班未點名按儲存 → 不呼叫 updateFn、給友善提示', async () => {
    const { drawer, updateFn } = setup()
    await drawer.openDrawer({ id: 101 })

    await drawer.handleSave()
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('載入後完全沒改動按儲存 → 不呼叫 updateFn', async () => {
    const seeds: StudentSeed[] = [
      { registration_id: 31, classroom_id: 1, class_name: '蘋果班', student_name: '乙', is_present: true },
    ]
    const { drawer, updateFn } = setup(seeds)
    await drawer.openDrawer({ id: 101 })
    // 不做任何改動
    await drawer.handleSave()
    expect(updateFn).not.toHaveBeenCalled()
  })
})

describe('useActivityAttendanceDrawer — F6 openDrawer 過期回應競態守衛', () => {
  function buildResp(id: unknown, regId: number) {
    return {
      data: {
        id,
        course_name: `課-${id}`,
        session_date: '2026-06-13',
        students: [
          { registration_id: regId, is_present: null, attendance_notes: '', classroom_id: 1, class_name: 'X班', student_name: '生' },
        ],
      },
    }
  }

  it('先開 A 後開 B，A 較晚回應不得覆寫 B 的名冊', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    const getSessionFn = vi.fn(
      () => new Promise(resolve => { resolvers.push(resolve as (v: unknown) => void) })
    ) as unknown as (...args: unknown[]) => Promise<{ data: unknown }>
    const updateFn = vi.fn(async () => ({ data: { ok: true } }))
    const drawer = useActivityAttendanceDrawer({ getSessionFn, updateFn })

    const pA = drawer.openDrawer({ id: 'A' })
    const pB = drawer.openDrawer({ id: 'B' })

    // B 先回（較新的開啟）
    resolvers[1](buildResp('B', 99))
    // A 後回（過期）
    resolvers[0](buildResp('A', 11))
    await Promise.all([pA, pB])

    expect(drawer.drawerSession.value?.id).toBe('B')
  })
})

describe('useActivityAttendanceDrawer — F4 handleSave 過期儲存競態守衛', () => {
  function buildResp(id: unknown, regId: number) {
    return {
      data: {
        id,
        course_name: `課-${id}`,
        session_date: '2026-06-13',
        students: [
          { registration_id: regId, is_present: null, attendance_notes: '', classroom_id: 1, class_name: 'X班', student_name: '生' },
        ],
      },
    }
  }

  it('儲存 A 期間切到 B：A 的回應不得關閉 B、不得把 B 標記為乾淨', async () => {
    const getResolvers: Array<(v: unknown) => void> = []
    const getSessionFn = vi.fn(
      () => new Promise(resolve => { getResolvers.push(resolve as (v: unknown) => void) })
    ) as unknown as (...args: unknown[]) => Promise<{ data: unknown }>
    let saveResolve!: (v: unknown) => void
    const updateFn = vi.fn(
      () => new Promise(resolve => { saveResolve = resolve as (v: unknown) => void })
    ) as unknown as (...args: unknown[]) => Promise<unknown>
    const drawer = useActivityAttendanceDrawer({ getSessionFn, updateFn })

    // 開 A 並改動（dirty，使 handleSave 會真的打 API）
    const pA = drawer.openDrawer({ id: 'A' })
    getResolvers[0](buildResp('A', 11))
    await pA
    drawer.drawerSession.value!.students[0].is_present = true

    // 儲存 A（updateFn 卡住，模擬慢網路）
    const pSave = drawer.handleSave()

    // 儲存進行中切到 B
    const pB = drawer.openDrawer({ id: 'B' })
    getResolvers[1](buildResp('B', 99))
    await pB
    // 在 B 上輸入尚未儲存的點名
    drawer.drawerSession.value!.students[0].is_present = false

    // A 的儲存此刻才完成（B 已在畫面上）
    saveResolve({ data: { ok: true } })
    await pSave

    // A 的回應不得：① 關閉 B 的 drawer ② 覆蓋 B 的當前場次 ③ 把 B 標記為乾淨
    expect(drawer.drawerVisible.value).toBe(true)
    expect(drawer.drawerSession.value?.id).toBe('B')
    expect(drawer.isDirty()).toBe(true)
  })

  it('未切換場次的正常儲存：成功後關閉 drawer 並重置為乾淨（反回歸）', async () => {
    const getSessionFn = vi.fn(async () => buildResp('A', 11))
    const updateFn = vi.fn(async () => ({ data: { ok: true } }))
    const drawer = useActivityAttendanceDrawer({ getSessionFn, updateFn })

    await drawer.openDrawer({ id: 'A' })
    drawer.drawerSession.value!.students[0].is_present = true
    await drawer.handleSave()

    expect(updateFn).toHaveBeenCalledTimes(1)
    expect(drawer.drawerVisible.value).toBe(false)
    expect(drawer.isDirty()).toBe(false)
  })
})

describe('useActivityAttendanceDrawer — 部分成功須以伺服器名冊為準', () => {
  it('skipped > 0 時先重抓場次，再讓 callback 讀權威狀態且不宣告全成功', async () => {
    const before = buildApiResponse([
      { registration_id: 11, classroom_id: 1, class_name: '蘋果班', student_name: '甲' },
    ])
    const authoritative = buildApiResponse([
      {
        registration_id: 11,
        classroom_id: 1,
        class_name: '蘋果班',
        student_name: '甲',
        is_present: null,
      },
    ])
    const getSessionFn = vi.fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(authoritative)
    const updateFn = vi.fn().mockResolvedValue({
      data: { ok: true, updated: 0, skipped: 1 },
    })
    let callbackPresentCount = -1
    const onSuccess = vi.fn(() => {
      callbackPresentCount = drawer.drawerPresentCount.value
    })
    const drawer = useActivityAttendanceDrawer({ getSessionFn, updateFn })

    await drawer.openDrawer({ id: 101 })
    vi.mocked(ElMessage.success).mockClear()
    vi.mocked(ElMessage.warning).mockClear()
    drawer.drawerSession.value!.students[0].is_present = true
    await drawer.handleSave(onSuccess)

    expect(getSessionFn).toHaveBeenCalledTimes(2)
    expect(drawer.drawerSession.value!.students[0].is_present).toBeNull()
    expect(drawer.drawerVisible.value).toBe(true)
    expect(drawer.isDirty()).toBe(false)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(callbackPresentCount).toBe(0)
    expect(ElMessage.success).not.toHaveBeenCalledWith('點名儲存成功')
    expect(ElMessage.warning).toHaveBeenCalledWith('已更新 0 筆，略過 1 筆；名冊已重新載入')
  })
})
