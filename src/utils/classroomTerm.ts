/**
 * 跨學期班級清單的顯示輔助。
 *
 * 後端 `GET /classrooms` 預設 current_only=true 只回當期學期的班級，凡是要對照
 * 「既有資料的 classroom_id」或「篩選歷史資料」的畫面都得改抓 current_only=false
 * （見 stores/classroomAll.ts）。抓了全學期就會冒出跨學年同班名，例如 114-2 與
 * 115-1 各有一個「向日葵」——下拉出現兩個同名選項無法分辨，故同名者補學期標籤。
 */

export interface ClassroomLike {
  id: number
  name: string
  school_year?: number
  semester?: number
  semester_label?: string
  [key: string]: unknown
}

export interface ClassroomLabeled {
  id: number
  name: string
  /** 顯示用：同名班級才帶學期後綴，其餘等同 name。 */
  label: string
}

/** 學期後綴：優先用後端 semester_label，退回 `114-2` 組字；都沒有則無後綴。 */
export function classroomTermSuffix(c: ClassroomLike): string | null {
  if (c.semester_label) return c.semester_label
  if (c.school_year != null && c.semester != null) return `${c.school_year}-${c.semester}`
  return null
}

/** 產生顯示標籤：僅當班名在清單中重複時才補學期後綴（避免無謂的雜訊）。 */
export function labelClassroomsByTerm(classrooms: ClassroomLike[]): ClassroomLabeled[] {
  const nameCount = new Map<string, number>()
  for (const c of classrooms) nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1)

  return classrooms.map(c => {
    const suffix = (nameCount.get(c.name) ?? 0) > 1 ? classroomTermSuffix(c) : null
    return { id: c.id, name: c.name, label: suffix ? `${c.name}（${suffix}）` : c.name }
  })
}
