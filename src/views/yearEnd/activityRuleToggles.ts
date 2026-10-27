/**
 * 才藝獎勵規則（yhrulea01，2026-10-27）：BonusConfig 兩個布林開關與兩份員工名單的前端純邏輯。
 *
 * 後端 `PUT /config/bonus` 以 Optional 接收，`null`＝不異動；GET 會帶回布林值／名單。
 * 前端初值刻意用 `null`：GET 失敗或舊後端未回傳時原樣送 `null`，不讓前端預設值悄悄把租戶
 * 設定改成 false 或清空名單（同 `salary/festivalRuleToggles.ts` 的處理）。
 *
 * 開關 UI 用「開／關」單選而非 el-switch：el-switch 掛載時會把 null emit 成 inactive-value，
 * 三態欄位會被靜默改成 false。
 */

export type ActivityRuleToggleKey = 'teaching_extra_admin_half_rule' | 'after_class_award_midterm_rule'

export interface ActivityRuleToggleDef {
  key: ActivityRuleToggleKey
  /** 顯示在年終規則頁的哪一張卡片 */
  section: 'promo' | 'teaching'
  label: string
  hint: string
}

export const ACTIVITY_RULE_TOGGLES: readonly ActivityRuleToggleDef[] = [
  {
    key: 'after_class_award_midterm_rule',
    section: 'promo',
    label: '班導中途離職／接任不保障',
    hint: '開啟：該學期中途離職的班導，或在班級編制勾選「中途接任」的班導，該班不發班導推動獎（全校總人次與主管／行政推動獎不受影響）。關閉：照發。',
  },
  {
    key: 'teaching_extra_admin_half_rule',
    section: 'teaching',
    label: '未帶班行政教課獎勵減半',
    hint: '開啟：該學期未擔任班導／副班導者，課程金額由高到低排列，負責核算薪資的同事第 2 門起減半，其他未帶班者第 3 門起減半；帶班者不受影響。關閉：全額。',
  },
]

export type ActivityRuleToggleValues = Record<ActivityRuleToggleKey, boolean | null>

/** 前端初值：全部 null（＝未載入／不異動）。 */
export function emptyActivityRuleToggles(): ActivityRuleToggleValues {
  return {
    teaching_extra_admin_half_rule: null,
    after_class_award_midterm_rule: null,
  }
}

/**
 * 從任意來源（GET 回應或 reactive 表單）挑出兩個開關組 PUT body 片段。
 * 非布林值一律轉成 null（不異動），避免把字串或 undefined 送給後端。
 */
export function pickActivityRuleToggles(source: Record<string, unknown>): ActivityRuleToggleValues {
  const out = emptyActivityRuleToggles()
  for (const def of ACTIVITY_RULE_TOGGLES) {
    const v = source[def.key]
    out[def.key] = typeof v === 'boolean' ? v : null
  }
  return out
}

/**
 * 員工 id 名單的載入容錯。
 * - 欄位不存在（舊後端、載入失敗）→ `null`：呼叫端據此不送出，不把既有名單洗成空。
 * - 欄位為 null（新後端尚未設定）→ `[]`。
 * - 陣列 → 轉成數字並丟掉無法轉換者。
 */
export function parseEmployeeIdList(raw: unknown): number[] | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw)) return []
  return raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
}
