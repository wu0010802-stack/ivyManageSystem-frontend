/**
 * 以伺服器回應的 `Date` header 校正本機時鐘（純函式，內部不讀時鐘）。
 *
 * 動機：`src/utils/busPingBuffer.ts` 的時鐘暴衝防線（`nowAt` + `maxSkewMs`）擋得住
 * 「單顆時間戳暴衝」，卻擋不住「整支裝置時鐘系統性錯誤」——`at` 與 `nowAt` 都取自
 * 同一支壞掉的裝置時鐘時，兩者偏差為 0，全數放行。娃娃車的 `at` 會被後端寫進
 * `trip.last_ping_at`，家長端據此判「位置是否過時」；裝置時鐘差一天，家長看到的
 * 就是一整天前／後的「最後更新」。
 *
 * 解法是把「現在」的來源換成伺服器：任何一支娃娃車 API 的回應都帶 `Date` header
 * （HTTP 標準必帶，且是 CORS-safelisted，瀏覽器讀得到），用它推出本機時鐘的偏差，
 * 之後 `at` 與 `nowAt` **同時**加上這個偏差。這樣：
 * - 裝置時鐘系統性錯誤 → 兩者一起被校正回伺服器時間軸，`at` 落庫正確
 * - 單顆 `pos.timestamp` 暴衝 → 只有 `at` 偏掉、`nowAt` 不動，skew 防線照樣攔下
 *
 * 精度：`Date` header 只有秒級解析度，再加上網路延遲，偏差本身有 ~1 秒級誤差。
 * 對 1 小時的 skew 門檻與 1 秒的取樣節流都無影響，故不做 RTT 補償。
 *
 * 刻意**不**對偏差做上限夾擠：夾擠等於「裝置時鐘錯超過門檻就放棄校正」，正好在最需要
 * 校正的情境失效。伺服器時間由 NTP 保證，直接信任。
 */

/**
 * 回傳「伺服器時間 − 本機時間」的毫秒差；header 缺席或無法解析時回 `null`
 * （呼叫端應維持既有偏差，不要當成 0 覆蓋掉先前同步過的值）。
 *
 * `dateHeader` 標 `unknown`：axios 的 header 值可能是字串以外的型別（陣列／數字），
 * 而 `new Date(1690000000000)` 這種數字會被當成 epoch 毫秒解析成「合法日期」，
 * 靜默算出一個荒謬偏差。故先檢查型別再解析。
 */
export function serverClockOffsetMs(dateHeader: unknown, localNowMs: number): number | null {
  if (typeof dateHeader !== 'string' || dateHeader.trim() === '') return null
  if (!Number.isFinite(localNowMs)) return null
  const serverMs = Date.parse(dateHeader)
  if (!Number.isFinite(serverMs)) return null
  return serverMs - localNowMs
}

/** 把本機毫秒加上偏差，輸出伺服器時間軸上的 ISO 字串（UTC，後端會正規化成台北牆鐘）。 */
export function serverNowIso(localNowMs: number, offsetMs: number): string {
  return new Date(localNowMs + offsetMs).toISOString()
}
