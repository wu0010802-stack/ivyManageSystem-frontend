import { ref, shallowRef } from 'vue'

/**
 * 統一的非同步資料載入 composable。
 *
 * @param {(signal: AbortSignal) => Promise<any>} fetcher
 * @param {Object} [options]
 * @param {boolean} [options.immediate=false]
 * @param {number}  [options.minShowMs=300]
 * @param {boolean} [options.dedupe=true]
 * @param {any}     [options.initialData=null]
 */
export function useAsyncState(fetcher, options = {}) {
  const {
    immediate = false,
    minShowMs = 300,
    dedupe = true,
    initialData = null,
  } = options

  const data = shallowRef(initialData)
  const error = ref(null)
  const pending = ref(false)

  let inflight = null
  let currentController = null

  function reset() {
    data.value = initialData
    error.value = null
    pending.value = false
    if (currentController) {
      currentController.abort()
      currentController = null
    }
    inflight = null
  }

  function execute() {
    if (dedupe && inflight) return inflight

    pending.value = true
    error.value = null

    const controller = new AbortController()
    currentController = controller
    const startedAt = Date.now()

    let fetcherResult
    try {
      fetcherResult = Promise.resolve(fetcher(controller.signal))
    } catch (err) {
      fetcherResult = Promise.reject(err)
    }

    const p = fetcherResult
      .then((result) => {
        if (controller.signal.aborted) return data.value
        data.value = result
        return result
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        error.value = err
      })
      .finally(() => {
        const elapsed = Date.now() - startedAt
        const remaining = Math.max(0, minShowMs - elapsed)
        const settle = () => {
          if (!controller.signal.aborted) pending.value = false
          if (inflight === p) inflight = null
        }
        if (remaining > 0) {
          return new Promise((r) => setTimeout(r, remaining)).then(settle)
        }
        settle()
      })

    inflight = p
    return p
  }

  if (immediate) execute()

  return { data, error, pending, execute, reset }
}
