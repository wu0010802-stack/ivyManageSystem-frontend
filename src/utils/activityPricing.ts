/**
 * 才藝公開報名「費用估算」純函式（ActivityPublicView 成功摘要 + ActivityPublicQueryView
 * 儲存前 feePreview 共用）。
 *
 * 兩頁的共通規則：
 *  - 以「名稱」查價（option 清單 / 既有品項 snapshot），price 字串/缺失/NaN 一律容錯為 0。
 *  - 課程加總「只算 enrolled」：候補 / promoted_pending 不計費。
 *  - 用品加總全計入（無候補概念）。
 *
 * ⚠ 兩種輸入模式不可混淆（先前退費預警 bug 的修補處）：
 *  - 新報名（ActivityPublicView）：無既有 snapshot → 一律用目前 option 價。
 *  - 編修（ActivityPublicQueryView）：既有品項保留後端 price_snapshot（courses[].price /
 *    supplies[].price），新增品項才用目前 option 價。否則後台調價後，家長保留原品項會被
 *    誤判退費而擋下儲存。
 * 本 util 用 resolvePrice callback 把「snapshot 優先 vs option 價」決策留在 caller，
 * util 本身只保留「名稱查價容錯 / enrolled 過濾 / 加總」這層共用邏輯。
 */

export interface PricedItem {
  name: string
  price?: unknown
}

/** 用品 snapshot 輸入：物件 {name, price} 或舊資料純字串。 */
export type SupplySnapshotInput = string | { name: string; price?: unknown }

/** 名稱查價：找不到 / 無價 / NaN → 0（字串數字皆容錯）。 */
export function priceFromList(name: string, list: ReadonlyArray<PricedItem>): number {
  const item = list.find((it) => it.name === name)
  return Number(item?.price) || 0
}

/**
 * 既有用品的 snapshot 價 map：supplies 回 {name, price}（後端 P2 後）；
 * 舊資料容錯為 string（不含價）→ 跳過不進 map。
 */
export function buildSupplySnapshotMap(
  supplies: ReadonlyArray<SupplySnapshotInput> | null | undefined,
): Map<string, number> {
  return new Map(
    (supplies ?? [])
      .filter(
        (s): s is { name: string; price?: unknown } => typeof s !== 'string',
      )
      .map((s) => [s.name, Number(s.price ?? 0) || 0]),
  )
}

/**
 * 用品價解析：既有品項用 snapshot 價（含 0），新增品項才用目前 option 價。
 * snapshot 命中（含 0）一律優先，避免後台調價影響家長保留品項。
 */
export function resolveSupplyPrice(
  name: string,
  snapshot: ReadonlyMap<string, number>,
  options: ReadonlyArray<PricedItem>,
): number {
  const snap = snapshot.get(name)
  if (snap !== undefined) return snap
  return priceFromList(name, options)
}

/**
 * 課程費用加總：只算 enrolled（isEnrolled 回 false 的課跳過），price 由 resolvePrice 決定。
 */
export function sumCourseFees(
  courseNames: ReadonlyArray<string>,
  opts: { isEnrolled: (name: string) => boolean; resolvePrice: (name: string) => number },
): number {
  return courseNames.reduce((sum, name) => {
    if (!opts.isEnrolled(name)) return sum
    return sum + opts.resolvePrice(name)
  }, 0)
}

/** 用品費用加總：全計入，price 由 resolvePrice 決定。 */
export function sumSupplyFees(
  supplyNames: ReadonlyArray<string>,
  opts: { resolvePrice: (name: string) => number },
): number {
  return supplyNames.reduce((sum, name) => sum + opts.resolvePrice(name), 0)
}
