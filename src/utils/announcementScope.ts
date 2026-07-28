// 公告「家長端發送對象」的 scope 解析與 PUT payload 組裝。
// 後端 PUT /announcements/{id}/parent-recipients 為 replace-all 語意：
// custom 模式下 UI 只編輯 student rows，其餘 rows（guardian／混排 classroom）
// 必須原樣帶回，否則會被洗掉。

export interface ParentRecipientItem {
  scope: 'all' | 'classroom' | 'student' | 'guardian'
  classroom_id?: number | null
  student_id?: number | null
  guardian_id?: number | null
}

export interface ParentScopeState {
  visibility: 'off' | 'all' | 'classroom' | 'custom'
  classroomIds: number[]
  studentIds: number[]
  preservedItems: ParentRecipientItem[]
}

export function resolveParentScope(items: ParentRecipientItem[]): ParentScopeState {
  const empty: ParentScopeState = { visibility: 'off', classroomIds: [], studentIds: [], preservedItems: [] }
  if (items.length === 0) return empty
  if (items.some((it) => it.scope === 'all')) return { ...empty, visibility: 'all' }
  if (items.every((it) => it.scope === 'classroom' && it.classroom_id != null)) {
    return { ...empty, visibility: 'classroom', classroomIds: items.map((it) => it.classroom_id as number) }
  }
  return {
    visibility: 'custom',
    classroomIds: [],
    studentIds: items
      .filter((it) => it.scope === 'student' && it.student_id != null)
      .map((it) => it.student_id as number),
    preservedItems: items.filter((it) => it.scope !== 'student'),
  }
}

export function buildParentRecipientsPayload(state: {
  visibility: string
  classroomIds: number[]
  studentIds: number[]
  preservedItems: ParentRecipientItem[]
}): ParentRecipientItem[] | null {
  if (state.visibility === 'off') return []
  if (state.visibility === 'all') return [{ scope: 'all' }]
  if (state.visibility === 'classroom') {
    return state.classroomIds.map((cid) => ({ scope: 'classroom' as const, classroom_id: cid }))
  }
  if (state.visibility === 'custom') {
    return [
      ...state.studentIds.map((sid) => ({ scope: 'student' as const, student_id: sid })),
      ...state.preservedItems,
    ]
  }
  return null // 'unchanged'：讀取失敗保護，不變更既有設定
}
