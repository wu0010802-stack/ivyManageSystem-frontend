/**
 * 義華第二批裁定 Q6–Q9：BonusConfig 四個節慶計算開關（per-tenant，預設全關＝舊行為）。
 *
 * 後端 `PUT /config/bonus` 以 Optional[bool] 接收；`null`＝不異動。GET 會帶回布林值，
 * 但前端初值刻意用 `null`：GET 失敗或舊後端未回傳時原樣送 `null`，不讓前端預設值
 * 悄悄把租戶設定改成 false（同 warning_deduction 等懲處欄位的處理）。
 *
 * UI 用「開／關」單選而非 el-switch：el-switch 掛載時會把 null emit 成 inactive-value，
 * 三態欄位會被靜默改成 false。
 */

export type FestivalRuleToggleKey =
  | 'festival_leader_class_ratio'
  | 'festival_unassigned_teacher_school_ratio'
  | 'festival_new_class_guarantee'
  | 'festival_shared_assistant_simple_avg'

export interface FestivalRuleToggleDef {
  key: FestivalRuleToggleKey
  label: string
  hint: string
}

export const FESTIVAL_RULE_TOGGLES: readonly FestivalRuleToggleDef[] = [
  {
    key: 'festival_leader_class_ratio',
    label: '組長帶班按班級比例',
    hint: '開啟：本學期擔任班導／副班導的組長，節慶獎金改依所帶班級比例（組長紅利照發）。關閉：依主管全校比例。園長、主任不受影響。',
  },
  {
    key: 'festival_unassigned_teacher_school_ratio',
    label: '未帶班教保給全校比例',
    hint: '開啟：未帶班的教保人員以「等級職務基數 × 全校比例」發節慶獎金（類別顯示為「未帶班教保」）。關閉：未帶班教保不發。',
  },
  {
    key: 'festival_new_class_guarantee',
    label: '新班／新接班保障 80%',
    hint: '開啟：新成立班（上學年無同名班）整學年、新接班（同名班上學期班導不同）該學期，班級比例至少 80%。依各學期班級資料判定，班名改動會被視為新班。',
  },
  {
    key: 'festival_shared_assistant_simple_avg',
    label: '共用副班導簡單平均',
    hint: '開啟：兩班共用副班導的節慶比例取兩班比例的簡單平均。關閉：依兩班在籍人數加權。',
  },
]

export type FestivalRuleToggleValues = Record<FestivalRuleToggleKey, boolean | null>

/** 前端初值：全部 null（＝未載入／不異動）。 */
export function emptyFestivalRuleToggles(): FestivalRuleToggleValues {
  return {
    festival_leader_class_ratio: null,
    festival_unassigned_teacher_school_ratio: null,
    festival_new_class_guarantee: null,
    festival_shared_assistant_simple_avg: null,
  }
}

/**
 * 從任意來源（GET 回應或 reactive 表單）挑出四個開關組 PUT body 片段。
 * 非布林值一律轉成 null（不異動），避免把字串或 undefined 送給後端。
 */
export function pickFestivalRuleToggles(source: Record<string, unknown>): FestivalRuleToggleValues {
  const out = emptyFestivalRuleToggles()
  for (const def of FESTIVAL_RULE_TOGGLES) {
    const v = source[def.key]
    out[def.key] = typeof v === 'boolean' ? v : null
  }
  return out
}

/** 與上次載入值相比，有哪些開關被改成「開」（用於儲存前的影響提示）。 */
export function newlyEnabledFestivalRules(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FestivalRuleToggleDef[] {
  return FESTIVAL_RULE_TOGGLES.filter((def) => after[def.key] === true && before[def.key] !== true)
}
