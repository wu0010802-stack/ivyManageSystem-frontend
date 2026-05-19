import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { h } from 'vue'
import { useErrorNotify } from '@/composables/useErrorNotify'

type SubmitOptions<T> = {
  label: string
  listPath: string
  listLabel: string
  submit: () => Promise<T>
  context: string
}

/**
 * 共用主頁 quick-add submit：呼叫 create API → 成功 toast 帶「前往管理頁 →」連結 → 失敗用 useErrorNotify。
 *
 * Why：避免每個 Quick*Dialog 重複寫 submit + toast + navigate 樣板（5 處）。
 */
export function useQuickAddSubmit() {
  const router = useRouter()
  const { notify } = useErrorNotify()
  const submitting = ref(false)

  async function run<T>(opts: SubmitOptions<T>): Promise<T | null> {
    if (submitting.value) return null
    submitting.value = true
    try {
      const result = await opts.submit()
      ElMessage({
        type: 'success',
        duration: 6000,
        showClose: true,
        message: h('span', [
          `已新增${opts.label}`,
          h('a', {
            href: '#',
            style: 'margin-left:8px;color:var(--el-color-primary);text-decoration:underline;',
            onClick: (e: MouseEvent) => {
              e.preventDefault()
              router.push(opts.listPath)
            },
          }, `前往${opts.listLabel} →`),
        ]),
      })
      return result
    } catch (e) {
      notify(e, opts.context, `新增${opts.label}失敗`)
      return null
    } finally {
      submitting.value = false
    }
  }

  return { submitting, run }
}
