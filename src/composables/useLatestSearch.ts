import { ref, type Ref } from 'vue'

/**
 * 序列化非同步搜尋：只套用「最新一次」查詢的回應，丟棄較舊查詢的延遲回應。
 *
 * 解決 debounced 搜尋的 out-of-order 回應競態：使用者快速改字觸發多個請求，
 * 較慢的舊請求若晚於較快的新請求回來，會把畫面覆蓋成過時結果（與輸入框不一致）。
 * debounce 只能減少而非消除此競態。
 *
 * @param fetcher 以查詢字串取回結果的非同步函式
 * @returns result（最新結果或 null）、search（執行查詢）、reset（清空並使 in-flight 失效）
 */
export function useLatestSearch<T>(fetcher: (query: string) => Promise<T>) {
  const result = ref(null) as Ref<T | null>
  let seq = 0

  async function search(query: string): Promise<{ applied: boolean }> {
    const mySeq = ++seq
    try {
      const r = await fetcher(query)
      if (mySeq !== seq) return { applied: false } // 已有更新查詢，丟棄此回應
      result.value = r
      return { applied: true }
    } catch (e) {
      if (mySeq !== seq) return { applied: false } // 較舊查詢的錯誤，靜默忽略
      throw e // 最新查詢的錯誤才往外拋，供 caller 顯示
    }
  }

  function reset(): void {
    seq++ // 使 in-flight 回應失效
    result.value = null
  }

  return { result, search, reset }
}
