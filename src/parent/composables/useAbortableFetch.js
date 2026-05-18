/**
 * useAbortableFetch — 包 axios（或任何接受 `{ signal }` config）的 fetcher
 * 並提供 AbortController 生命週期管理。
 *
 * 為什麼需要：家長端 18 個 view 在 watch(selectedStudentId) 切換小孩時，
 * 舊 request 的 response 還是會回來；如果回來的時序晚於新 request，會把
 * 顯示資料蓋回上一個小孩，造成「列表閃前一個孩子的資料」的競態。
 *
 * 用法：
 *   const fetcher = (config) => listMedicationOrders({ student_id: sid }, config)
 *   const { data, error, pending, refresh, abort } = useAbortableFetch(fetcher)
 *   watch(selectedStudentId, () => refresh())
 *
 * axios v1 原生支援 `{ signal }`；元件 unmount 時自動 abort。
 *
 * @template T
 * @param {(config: { signal: AbortSignal }) => Promise<T>} fetcher
 * @param {Object} [options]
 * @param {T|null} [options.initialData=null]
 * @returns {{ data: import('vue').Ref<T|null>, error: import('vue').Ref<Error|null>, pending: import('vue').Ref<boolean>, refresh: () => Promise<T|null>, abort: () => void }}
 */

import { onUnmounted, ref } from 'vue'

function _isAbortError(err) {
  if (!err) return false
  // axios canceled: err.name === 'CanceledError' or err.code === 'ERR_CANCELED'
  // fetch / DOM AbortController: err.name === 'AbortError'
  return (
    err.name === 'CanceledError' ||
    err.name === 'AbortError' ||
    err.code === 'ERR_CANCELED' ||
    err.__CANCEL__ === true
  )
}

export function useAbortableFetch(fetcher, options = {}) {
  const { initialData = null } = options

  const data = ref(initialData)
  const error = ref(null)
  const pending = ref(false)

  let controller = null

  function abort() {
    if (controller) {
      controller.abort()
      controller = null
    }
  }

  async function refresh() {
    // 切換前先 abort 舊的
    abort()
    const ac = new AbortController()
    controller = ac
    pending.value = true
    error.value = null

    try {
      const result = await fetcher({ signal: ac.signal })
      // 若期間又被 abort，不要覆蓋（race 保護）
      if (ac.signal.aborted) return data.value
      data.value = result
      return result
    } catch (err) {
      if (_isAbortError(err) || ac.signal.aborted) {
        // 被自己 abort 掉的 → 不更新 error；data 維持上次有效值
        return data.value
      }
      error.value = err
      throw err
    } finally {
      // 只有「自己這輪」的 controller 才負責清 pending
      // 後續輪會把 pending 再設回 true
      if (controller === ac) {
        pending.value = false
        controller = null
      }
    }
  }

  onUnmounted(() => {
    abort()
  })

  return { data, error, pending, refresh, abort }
}
