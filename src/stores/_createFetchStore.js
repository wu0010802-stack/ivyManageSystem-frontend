import { defineStore } from 'pinia'

const DEFAULT_TTL = 5 * 60 * 1000 // 5 分鐘

/**
 * 建立具有 TTL 快取 + Promise 去重的 Pinia Store 工廠。
 *
 * @param {string}   storeName  - defineStore 的 id
 * @param {Function} apiFn      - 回傳 Promise<{ data }> 的 API 函式
 * @param {Object}   options
 *   @param {string}   dataKey    - state 中儲存資料的欄位名稱（預設 'items'）
 *   @param {string}   methodName - fetch action 名稱（預設 'fetch'，可傳 'fetchEmployees' 等保留原名）
 *   @param {number}   ttl        - 快取毫秒數（預設 5 分鐘）
 *   @param {boolean}  silentFail - true = 靜默失敗，不暴露 loading/error state
 *   @param {Object}   getters    - 額外的 getter 定義
 *   @param {string}   errorMsg   - 失敗時的預設錯誤訊息
 */
export function createFetchStore(storeName, apiFn, {
  dataKey = 'items',
  methodName = 'fetch',
  ttl = DEFAULT_TTL,
  silentFail = false,
  getters = {},
  errorMsg = '資料載入失敗',
} = {}) {
  const actions = {
    async [methodName](force = false) {
      if (!force && this[dataKey].length && Date.now() - this._fetchedAt < ttl) return
      if (this._pending) return this._pending

      if (!silentFail) {
        this.loading = true
        this.error = null
      }

      this._pending = apiFn()
        .then(res => {
          this[dataKey] = res.data
          this._fetchedAt = Date.now()
        })
        .catch(err => {
          if (!silentFail) this.error = err?.response?.data?.detail || errorMsg
        })
        .finally(() => {
          if (!silentFail) this.loading = false
          this._pending = null
        })

      return this._pending
    },

    async refresh() {
      this._fetchedAt = 0
      return this[methodName](true)
    },

    invalidate() {
      this._fetchedAt = 0
    },
  }

  return defineStore(storeName, {
    state: () => ({
      [dataKey]: [],
      _fetchedAt: 0,
      _pending: null,
      ...(silentFail ? {} : { loading: false, error: null }),
    }),
    getters,
    actions,
  })
}
