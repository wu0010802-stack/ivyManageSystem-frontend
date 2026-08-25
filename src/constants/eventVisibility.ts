/** SchoolEvent 可見範圍（calimp01 分校行事曆整合）——與後端 EVENT_VISIBILITIES 對齊 */

export type EventVisibility = 'admin' | 'staff' | 'parent'

export const EVENT_VISIBILITY_OPTIONS: {
  value: EventVisibility
  label: string
  /** el-tag type */
  tagType: 'info' | 'warning' | 'danger'
  hint: string
}[] = [
  {
    value: 'admin',
    label: '行政限定',
    tagType: 'info',
    hint: '只出現在管理端（薪資、對帳、考核等內部事項）',
  },
  {
    value: 'staff',
    label: '教職員',
    tagType: 'warning',
    hint: '管理端＋教師 Portal 可見',
  },
  {
    value: 'parent',
    label: '家長',
    tagType: 'danger',
    hint: '管理端＋教師 Portal＋家長端全部可見',
  },
]

export const EVENT_VISIBILITY_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_VISIBILITY_OPTIONS.map((o) => [o.value, o.label]),
)

export const eventVisibilityTagType = (
  v: string | null | undefined,
): 'info' | 'warning' | 'danger' =>
  EVENT_VISIBILITY_OPTIONS.find((o) => o.value === v)?.tagType ?? 'info'

/** 分校工作分類——與後端 EVENT_CATEGORIES 對齊 */
export const EVENT_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'administration', label: '行政' },
  { value: 'teaching', label: '教學' },
  { value: 'activity', label: '活動' },
  { value: 'care', label: '保育' },
  { value: 'marketing', label: '行銷' },
  { value: 'parent_communication', label: '親師溝通' },
  { value: 'environment', label: '環境管理' },
  { value: 'general', label: '一般' },
]

export const EVENT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
)

export const EVENT_SEMESTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'first', label: '上學期' },
  { value: 'second', label: '下學期' },
]
