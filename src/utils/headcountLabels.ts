/**
 * 註冊口徑（2026-10-19 spec「registered headcount」C1/C7/C8/C10）的顯示文字。
 *
 * - 「在籍」＝現態在學人數（舊口徑，名冊即時數）；
 * - 「註冊」＝基準日在學且當月月費已於基準日前繳清的人數（新口徑）。
 *
 * 後端以 `null` 表示「這個範圍沒有註冊數可報」（舊口徑租戶、非當期學期、該月
 * 尚無月費單），畫面一律顯示「—」，不得當 0——0 是「有算、真的沒人註冊」。
 */

export type DenominatorKind = 'registered' | 'enrolled'

export function formatRegistered(n: number | null | undefined): string {
  return n == null ? '—' : String(n)
}

/** `YYYY-MM-DD` → `M/D`（不經 Date，避免時區位移）；格式不符回 null。 */
function monthDay(isoDate: string | null | undefined): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(isoDate ?? '')
  if (!m) return null
  return `${Number(m[1])}/${Number(m[2])}`
}

/**
 * 才藝儀表板分母說明：註冊口徑標基準日（9/15、3/15），未到基準日時分母是
 * 今天的註冊數、屬暫估；舊口徑為「在籍」。
 */
export function denominatorCaption(
  kind: DenominatorKind,
  basisDate: string | null | undefined,
  provisional: boolean,
): string {
  if (kind !== 'registered') return '在籍'
  if (provisional) return '註冊（今天，暫估）'
  const md = monthDay(basisDate)
  return md ? `註冊（${md}）` : '註冊'
}

/** 考核招生實際人數「自動帶入」說明，例：「自動（9/15 註冊數）」。 */
export function autoEnrollmentCaption(basisDate: string | null | undefined): string {
  const md = monthDay(basisDate)
  return md ? `自動（${md} 註冊數）` : '自動（基準日註冊數）'
}

/** 合計註冊數：任一為 null（沒有註冊數可報）或空清單就整組回 null，不拿殘缺總和充數。 */
export function sumRegistered(values: ReadonlyArray<number | null | undefined>): number | null {
  if (!values.length) return null
  let total = 0
  for (const v of values) {
    if (v == null) return null
    total += v
  }
  return total
}
