import { describe, it, expect, vi } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'

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
