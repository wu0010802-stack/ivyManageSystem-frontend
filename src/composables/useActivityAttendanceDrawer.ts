import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

export interface AttendanceStudent {
  registration_id: unknown
  is_present: boolean | null
  attendance_notes?: string
  class_name?: string
  classroom_id?: number | null
  student_name?: string
}

export interface AttendanceStudentGroup {
  classroom_id: number | null
  classroom_name: string
  students: AttendanceStudent[]
}

interface SessionData {
  id: unknown
  course_name: string
  session_date: string
  students: AttendanceStudent[]
}

/**
 * 才藝點名 Drawer 共用邏輯
 *
 * @param {Object} options
 * @param {Function} options.getSessionFn  - 取得場次詳情的 API 函式，接受 session id
 * @param {Function} options.updateFn      - 批次儲存點名的 API 函式，接受 (id, records)
 */
export function useActivityAttendanceDrawer({ getSessionFn, updateFn }: { getSessionFn: (...args: unknown[]) => Promise<{ data: SessionData }>; updateFn: (...args: unknown[]) => Promise<unknown> }) {
  const drawerVisible = ref(false)
  const drawerLoading = ref(false)
  const drawerSession = ref<SessionData | null>(null)
  const saveLoading = ref(false)

  // 未存變更守衛：載入/儲存後存點名輸入的快照（is_present + 備註），
  // 與目前值比對即得 isDirty，供 drawer before-close 攔截 ESC/X 靜默丟失。
  const dirtySnapshot = ref<string>('')

  // F2：載入時逐 registration 記下基準（is_present + 備註），handleSave 只送
  // 相對基準有異動的列。否則送整份名冊快照，兩位老師同編一場時，後存者會用過期
  // 快照把前者對「其他學生」的點名回沖（跨學生 lost update），並連帶影響退費堂數。
  const baseline = ref<Map<unknown, { is_present: boolean | null; notes: string }>>(
    new Map(),
  )
  function captureBaseline() {
    const m = new Map<unknown, { is_present: boolean | null; notes: string }>()
    if (drawerSession.value) {
      for (const s of drawerSession.value.students) {
        m.set(s.registration_id, {
          is_present: s.is_present,
          notes: s.attendance_notes || '',
        })
      }
    }
    baseline.value = m
  }

  // F6：openDrawer/reloadCurrentSession 競態守衛。先開 A、關閉後開 B，若 A 較晚
  // 回應，過期回應不得覆寫 B 的名冊或使用者已輸入內容。每次載入遞增序號，回應
  // 落地前比對序號，非當前載入即丟棄。
  let loadSeq = 0

  function serializeAttendanceInputs(session: SessionData | null): string {
    if (!session) return ''
    return JSON.stringify(
      session.students.map(s => [s.registration_id, s.is_present, s.attendance_notes || '']),
    )
  }

  function captureSnapshot() {
    dirtySnapshot.value = serializeAttendanceInputs(drawerSession.value)
  }

  function isDirty(): boolean {
    if (!drawerSession.value) return false
    return serializeAttendanceInputs(drawerSession.value) !== dirtySnapshot.value
  }

  // 先按班級聚集（跨班名冊好找），班級內未點名優先
  const sortedStudents = computed(() => {
    if (!drawerSession.value) return []
    return [...drawerSession.value.students].sort((a, b) => {
      const ca = a.class_name || ''
      const cb = b.class_name || ''
      if (ca !== cb) return ca.localeCompare(cb, 'zh-Hant')
      const aNone = a.is_present === null
      const bNone = b.is_present === null
      if (aNone && !bNone) return -1
      if (!aNone && bNone) return 1
      return 0
    })
  })

  // 分組視圖：由前端從扁平 students 分組（單一資料源）。
  // group 內物件「直接引用」扁平樹同一物件（不可 clone），
  // 分組模式 v-model 的異動才會反映到 handleSave 序列化來源與統計 counts。
  // 分組語意對齊後端 group_by=classroom：按 classroom_id 分組、
  // 未分班（classroom_id null）歸「未分班」排最後、其餘按班名 zh-Hant 排序。
  const groupedStudents = computed<AttendanceStudentGroup[]>(() => {
    if (!drawerSession.value) return []
    const groupMap = new Map<number | 'unassigned', AttendanceStudentGroup>()
    for (const s of drawerSession.value.students) {
      const cid = s.classroom_id ?? null
      const key = cid === null ? 'unassigned' : cid
      let group = groupMap.get(key)
      if (!group) {
        group = {
          classroom_id: cid,
          classroom_name: cid === null ? '未分班' : (s.class_name || '未分班'),
          students: [],
        }
        groupMap.set(key, group)
      }
      group.students.push(s)
    }
    const groups = [...groupMap.values()]
    const classified = groups
      .filter(g => g.classroom_id !== null)
      .sort((a, b) => a.classroom_name.localeCompare(b.classroom_name, 'zh-Hant'))
    const unassigned = groups.find(g => g.classroom_id === null)
    return unassigned ? [...classified, unassigned] : classified
  })

  const drawerTitle = computed(() => {
    if (!drawerSession.value) return '點名'
    return `點名｜${drawerSession.value.course_name}｜${drawerSession.value.session_date}`
  })

  const drawerPresentCount = computed(() =>
    drawerSession.value
      ? drawerSession.value.students.filter(s => s.is_present === true).length
      : 0
  )

  const drawerAbsentCount = computed(() =>
    drawerSession.value
      ? drawerSession.value.students.filter(s => s.is_present === false).length
      : 0
  )

  const drawerUnmarkedCount = computed(() =>
    drawerSession.value
      ? drawerSession.value.students.filter(s => s.is_present === null).length
      : 0
  )

  async function openDrawer(row: { id: unknown }, params: Record<string, unknown> = {}) {
    const seq = ++loadSeq
    drawerVisible.value = true
    drawerLoading.value = true
    drawerSession.value = null
    try {
      const res = await getSessionFn(row.id, params)
      if (seq !== loadSeq) return // 過期回應：已有更新的開啟，丟棄不覆寫
      drawerSession.value = res.data
      captureBaseline()
      captureSnapshot()
    } catch {
      if (seq !== loadSeq) return
      ElMessage.error('載入點名資料失敗')
      drawerVisible.value = false
    } finally {
      if (seq === loadSeq) drawerLoading.value = false
    }
  }

  async function reloadCurrentSession(params: Record<string, unknown> = {}) {
    if (!drawerSession.value) return
    const seq = ++loadSeq
    drawerLoading.value = true
    const sid = drawerSession.value.id
    try {
      const res = await getSessionFn(sid, params)
      if (seq !== loadSeq) return
      drawerSession.value = res.data
      captureBaseline()
      captureSnapshot()
    } catch {
      if (seq !== loadSeq) return
      ElMessage.error('重新載入點名資料失敗')
    } finally {
      if (seq === loadSeq) drawerLoading.value = false
    }
  }

  function setAllPresent(value: boolean) {
    if (!drawerSession.value) return
    drawerSession.value.students.forEach(s => {
      s.is_present = value
    })
  }

  async function handleSave(onSuccess?: () => void) {
    if (!drawerSession.value) return
    const records = drawerSession.value.students
      // 後端 AttendanceRecordItem.is_present 為必填 bool，未點名（null）無法寫入
      .filter(s => s.is_present !== null)
      // F2：只送相對載入基準有異動的列（is_present 或備註改變），避免回沖其他老師
      .filter(s => {
        const base = baseline.value.get(s.registration_id)
        if (!base) return true // 基準無此列（理論上不會）→ 視為新異動送出
        return base.is_present !== s.is_present || base.notes !== (s.attendance_notes || '')
      })
      .map(s => ({
        registration_id: s.registration_id,
        is_present: s.is_present,
        notes: s.attendance_notes || '',
      }))
    // F4b：無任何異動就不打 API（否則空陣列撞後端 min_length=1 得 422）。
    if (records.length === 0) {
      ElMessage.warning('沒有需要儲存的點名異動')
      return
    }
    saveLoading.value = true
    try {
      await updateFn(drawerSession.value.id, records)
      captureBaseline()
      captureSnapshot()
      ElMessage.success('點名儲存成功')
      drawerVisible.value = false
      if (onSuccess) onSuccess()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      const msg = err?.response?.data?.detail || '儲存失敗'
      ElMessage.error(msg)
    } finally {
      saveLoading.value = false
    }
  }

  return {
    drawerVisible,
    drawerLoading,
    drawerSession,
    saveLoading,
    sortedStudents,
    groupedStudents,
    drawerTitle,
    drawerPresentCount,
    drawerAbsentCount,
    drawerUnmarkedCount,
    openDrawer,
    reloadCurrentSession,
    setAllPresent,
    handleSave,
    isDirty,
  }
}
