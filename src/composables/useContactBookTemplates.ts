/**
 * 聯絡簿範本 composable。
 *
 * 對外提供：
 * - templates：ref 陣列（含 personal + shared）
 * - load() / refresh()
 * - applyTemplateToFields(template, currentFields, { onlyFillBlank = true })  純函式
 *
 * 純函式 applyTemplateToFields 與後端 services/contact_book_service.apply_template_fields
 * 行為一致，方便預覽（drawer 開啟時即時看到範本套用後的草稿）。
 */

import { ref } from 'vue'
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  archiveTemplate,
  promoteTemplate,
} from '../api/contactBookTemplates'

const FILLABLE_FIELDS = [
  'mood',
  'meal_lunch',
  'meal_snack',
  'nap_minutes',
  'bowel',
  'temperature_c',
  'teacher_note',
  'learning_highlight',
]

/**
 * 純函式：把範本欄位套用到 entry fields。
 * @param {object} templateFields 範本（如 { mood: 'happy', teacher_note: 'x' }）
 * @param {object} currentFields  目前 entry 欄位
 * @param {object} opts
 * @param {boolean} opts.onlyFillBlank 預設 true，只填空欄位
 * @returns {{ result: object, changedFields: string[] }}
 */
export function applyTemplateToFields(
  templateFields: Record<string, unknown> | null | undefined,
  currentFields: Record<string, unknown> | null | undefined,
  { onlyFillBlank = true } = {},
) {
  const result: Record<string, unknown> = { ...(currentFields || {}) }
  const changed: string[] = []
  if (!templateFields) return { result, changedFields: changed }
  for (const key of FILLABLE_FIELDS) {
    if (!(key in templateFields)) continue
    const newVal = templateFields[key]
    if (onlyFillBlank) {
      const cur = result[key]
      const isBlank = cur === null || cur === undefined || cur === ''
      const newIsBlank = newVal === null || newVal === undefined || newVal === ''
      if (!isBlank || newIsBlank) continue
    }
    result[key] = newVal
    changed.push(key)
  }
  return { result, changedFields: changed }
}

export function useContactBookTemplates() {
  const templates = ref<{ id: unknown; [key: string]: unknown }[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<unknown>(null)

  async function load(force = false) {
    if (loaded.value && !force) return templates.value
    loading.value = true
    error.value = null
    try {
      const { data } = await listTemplates()
      templates.value = (data as { items?: { id: unknown; [key: string]: unknown }[] })?.items || []
      loaded.value = true
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  async function create(payload: unknown) {
    const { data } = await createTemplate(payload)
    templates.value = [(data as { id: unknown; [key: string]: unknown }), ...templates.value]
    return data
  }

  async function update(id: number, payload: unknown) {
    const { data } = await updateTemplate(id, payload)
    templates.value = templates.value.map((t) => (t.id === id ? (data as { id: unknown; [key: string]: unknown }) : t))
    return data
  }

  async function archive(id: number) {
    await archiveTemplate(id)
    templates.value = templates.value.filter((t) => t.id !== id)
  }

  async function promote(id: number) {
    const { data } = await promoteTemplate(id)
    templates.value = templates.value.map((t) => (t.id === id ? (data as { id: unknown; [key: string]: unknown }) : t))
    return data
  }

  return {
    templates,
    loading,
    loaded,
    error,
    load,
    create,
    update,
    archive,
    promote,
  }
}
