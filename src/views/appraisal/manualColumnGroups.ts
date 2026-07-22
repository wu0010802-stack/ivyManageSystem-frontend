/**
 * 13 欄手填表分組表頭：把 11 個手填欄（`useManualEventEntry.MANUAL_ITEM_CODES`）依性質分組，
 * 供 `ManualEventEntrySection.vue` 巢狀 `el-table-column` 生 group header 使用。
 *
 * ⚠ codes 必須為 MANUAL_ITEM_CODES 的實際字串（單一來源見該檔），不可自造骨架字串；
 * `assertGroupsCoverAllCodes` 為完整性守衛，確保三組合計恰好涵蓋全部 code、無重複無遺漏。
 */
export interface ManualColumnGroup {
  label: string
  codes: string[]
}

export const MANUAL_COLUMN_GROUPS: ManualColumnGroup[] = [
  {
    label: '會議',
    codes: ['SCHOOL_MEETING_ABSENCE', 'INSTITUTION_MEETING_0913', 'INSTITUTION_MEETING_1115'],
  },
  {
    label: '活動與異動',
    codes: ['SELF_IMPROVEMENT_ACTIVITY', 'STUDENT_WITHDRAWAL', 'CLASS_TRANSFER'],
  },
  {
    label: '分值',
    codes: ['EXAM_RESULT', 'RECRUIT_SCORE', 'SUPERVISOR_SCORE', 'EXCELLENCE_NOMINATION', 'OTHER'],
  },
]

/**
 * 完整性守衛：確認 `MANUAL_COLUMN_GROUPS` 涵蓋傳入的全部 `codes`、無重複、無多餘。
 * 不合規時丟例外（供測試與開發期防呆，避免分組漏收/錯收手填欄位）。
 */
export function assertGroupsCoverAllCodes(codes: string[]): void {
  const grouped = MANUAL_COLUMN_GROUPS.flatMap((g) => g.codes)
  const groupedSet = new Set(grouped)
  if (groupedSet.size !== grouped.length) {
    throw new Error('MANUAL_COLUMN_GROUPS 內有重複 code')
  }
  const codesSet = new Set(codes)
  const missing = codes.filter((c) => !groupedSet.has(c))
  const extra = grouped.filter((c) => !codesSet.has(c))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `MANUAL_COLUMN_GROUPS 未完整涵蓋所有 code（缺少：${missing.join(', ') || '無'}；多餘：${extra.join(', ') || '無'}）`,
    )
  }
}
