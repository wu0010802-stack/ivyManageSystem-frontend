/**
 * 聯絡簿心情：教師端唯一定義處（列表卡片、編輯抽屜、頁面共用）。
 *
 * 2026-09-03 UI 收斂：教師端不再用 emoji 表示心情，改為文字色塊（MoodChip）。
 * `tone` 對應 MoodChip 的色系 class，值本身不進後端；後端仍只存 key（happy/normal/…）。
 */
export type MoodKey = 'happy' | 'normal' | 'tired' | 'sad' | 'sick'

export interface MoodMeta {
  label: string
  tone: 'sun' | 'neutral' | 'grape' | 'sky' | 'rose'
}

export const MOOD_META: Record<MoodKey, MoodMeta> = {
  happy: { label: '開心', tone: 'sun' },
  normal: { label: '普通', tone: 'neutral' },
  tired: { label: '疲倦', tone: 'grape' },
  sad: { label: '難過', tone: 'sky' },
  sick: { label: '不適', tone: 'rose' },
}

export const MOOD_KEYS = Object.keys(MOOD_META) as MoodKey[]

/** el-select 用：{ value, label } */
export const MOOD_OPTIONS = MOOD_KEYS.map((value) => ({ value, label: MOOD_META[value].label }))

export function moodLabel(mood: string | null | undefined): string | null {
  if (!mood) return null
  return MOOD_META[mood as MoodKey]?.label ?? null
}
