/**
 * 入帳媒合（代收明細／存摺明細）的「末四碼」篩選。
 *
 * 後端兩支清單端點的 suffix 都是 `min_length=4, max_length=4`：打到一半的
 * 1–3 碼送出去會整支 422，清單變空、使用者以為「沒有待媒合」。因此只有空值
 * 或剛好 4 位數字才送查詢；不足時顯示行內提示、不打 API。
 */
const SUFFIX_FILTER_RE = /^\d{4}$/

/** 行內提示文案（兩個來源共用，避免講法不一） */
export const SUFFIX_FILTER_HINT = '末四碼需為 4 位數字'

/** 篩選值是否可以送查詢（空值＝不篩） */
export function isSuffixFilterReady(value: string): boolean {
  return value === '' || SUFFIX_FILTER_RE.test(value)
}

/** 要送給後端的 suffix；空值或不完整一律不送 */
export function suffixFilterParam(value: string): string | undefined {
  return value !== '' && SUFFIX_FILTER_RE.test(value) ? value : undefined
}
