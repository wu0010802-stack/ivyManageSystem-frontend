import { ref } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * 統一非同步狀態管理。
 *
 * @param {() => Promise<T>} fetcher 任何回傳 promise 的函式
 * @param {Object} [opts]
 * @param {boolean} [opts.immediate=false] 創建時立即 execute
 * @param {boolean} [opts.toast=true]      失敗時顯示 ElMessage.error
 * @param {T|null}  [opts.initialData=null] 初始 data 值
 * @returns {{ data, loading, error, execute, refresh }}
 */
export function useAsyncState<T = unknown>(fetcher: (...args: unknown[]) => Promise<T>, opts: { immediate?: boolean; toast?: boolean; initialData?: T | null } = {}) {
  const { immediate = false, toast = true, initialData = null } = opts

  const data = ref<T | null>(initialData)
  const loading = ref(false)
  const error = ref<unknown>(null)

  const execute = async (...args: unknown[]) => {
    loading.value = true
    error.value = null
    try {
      const result = await fetcher(...args)
      data.value = result
      return result
    } catch (e) {
      error.value = e
      if (toast) {
        const err = e as { response?: { data?: { detail?: string } }; message?: string }
        const msg = err?.response?.data?.detail || err?.message || '操作失敗'
        ElMessage.error(typeof msg === 'string' ? msg : '操作失敗')
      }
      return undefined
    } finally {
      loading.value = false
    }
  }

  // shadow=true：背景重抓不顯示 loading，避免 spinner 閃爍
  const refresh = async ({ shadow = false, ...rest }: { shadow?: boolean; [k: string]: unknown } = {}) => {
    if (shadow) {
      try {
        const result = await fetcher(rest)
        data.value = result
        return result
      } catch (e) {
        error.value = e
        if (toast) {
          const err = e as { response?: { data?: { detail?: string } }; message?: string }
          const msg = err?.response?.data?.detail || err?.message || '操作失敗'
          ElMessage.error(typeof msg === 'string' ? msg : '操作失敗')
        }
        return undefined
      }
    }
    return execute(rest)
  }

  if (immediate) {
    execute()
  }

  return { data, loading, error, execute, refresh }
}
