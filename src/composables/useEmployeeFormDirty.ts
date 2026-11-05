import { ref, computed } from 'vue'

const isEqualLoose = (a: unknown, b: unknown) => {
    if (a === b) return true
    if (a == null && b == null) return true
    if (typeof a !== typeof b) return String(a) === String(b)
    return false
}

/**
 * 比對 reactive form 與 originalForm 快照，回傳兩個 tab 各自的 dirty diff。
 * 新增模式（reset 未呼叫）→ originalForm = null，所有 dirty 為空（直接 POST 整包）。
 */
export function useEmployeeFormDirty(form: Record<string, unknown>, basicFields: string[], salaryFields: string[]) {
    const originalForm = ref<Record<string, unknown> | null>(null)

    /**
     * 重設基準快照。
     * - 不帶 fields：整份重設（開窗／populate 用）。
     * - 帶 fields：只重設這些欄位的基準，其餘欄位保留原基準——某個 tab 儲存成功時只能
     *   標記「該 tab 的欄位已儲存」，不可把另一個 tab 尚未儲存的異動一併當成乾淨（否則另一個
     *   tab 的儲存鈕變 0、離開保護攔不到，其待存異動也無從帶出同一個異動生效日）。
     */
    const reset = (snapshot: Record<string, unknown>, fields?: readonly string[]) => {
        const next = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
        if (fields && originalForm.value) {
            const merged = { ...originalForm.value }
            for (const k of fields) merged[k] = next[k]
            originalForm.value = merged
            return
        }
        originalForm.value = next
    }

    const diffFor = (fields: string[]) => {
        if (!originalForm.value) return {}
        const out: Record<string, { before: unknown; after: unknown }> = {}
        for (const k of fields) {
            const before = originalForm.value[k]
            const after = form[k]
            if (!isEqualLoose(before, after)) {
                out[k] = { before, after }
            }
        }
        return out
    }

    const basicDirty = computed(() => diffFor(basicFields))
    const salaryDirty = computed(() => diffFor(salaryFields))

    return { originalForm, reset, basicDirty, salaryDirty }
}
