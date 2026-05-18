import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getManualEventCounts, batchUpsertManualEventCounts } from '@/api/appraisal'
import { apiError } from '@/utils/error'

export const MANUAL_ITEM_CODES = [
  'SCHOOL_MEETING_ABSENCE',
  'INSTITUTION_MEETING_0913',
  'INSTITUTION_MEETING_1115',
  'SELF_IMPROVEMENT_ACTIVITY',
  'CHILD_ACCIDENT',
  'CLASS_HEADCOUNT_BONUS',
  'OTHER',
]

export const MANUAL_LABEL: Record<string, string> = {
  SCHOOL_MEETING_ABSENCE: '園務會議',
  INSTITUTION_MEETING_0913: '機構會議9/13',
  INSTITUTION_MEETING_1115: '機構會議11/15',
  SELF_IMPROVEMENT_ACTIVITY: '自強活動',
  CHILD_ACCIDENT: '幼兒意外',
  CLASS_HEADCOUNT_BONUS: '帶班人數',
  OTHER: '其他',
}

type CountMap = Record<string, Record<string, number>>

export function useManualEventEntry(cycleIdRef: Ref<number | null | undefined>) {
  const counts = ref<CountMap>({})
  const original = ref<CountMap>({})
  const loading = ref(false)
  const saving = ref(false)

  async function load() {
    if (!cycleIdRef.value) return
    loading.value = true
    try {
      const { data } = await getManualEventCounts(cycleIdRef.value)
      const m: CountMap = {}
      const entries = (data as { entries?: { participant_id: number | string; item_code: string; count: number | string }[] }).entries ?? []
      for (const e of entries) {
        const pid = String(e.participant_id)
        if (!m[pid]) m[pid] = {}
        m[pid][e.item_code] = Number(e.count)
      }
      counts.value = JSON.parse(JSON.stringify(m)) as CountMap
      original.value = JSON.parse(JSON.stringify(m)) as CountMap
    } catch (e) {
      ElMessage.error(apiError(e, '載入手填事件失敗'))
    } finally {
      loading.value = false
    }
  }

  const dirtyEntries = computed(() => {
    const out: { participant_id: number; item_code: string; count: number }[] = []
    for (const pid of Object.keys(counts.value)) {
      for (const code of MANUAL_ITEM_CODES) {
        const cur = counts.value[pid]?.[code] ?? 0
        const orig = original.value[pid]?.[code] ?? 0
        if (Number(cur) !== Number(orig)) {
          out.push({ participant_id: Number(pid), item_code: code, count: Number(cur) })
        }
      }
    }
    return out
  })

  async function saveAll() {
    if (dirtyEntries.value.length === 0) {
      ElMessage.info('沒有變更')
      return
    }
    saving.value = true
    try {
      await batchUpsertManualEventCounts(cycleIdRef.value!, dirtyEntries.value)
      ElMessage.success(`已儲存 ${dirtyEntries.value.length} 筆變更`)
      await load()
    } catch (e) {
      ElMessage.error(apiError(e, '儲存失敗'))
    } finally {
      saving.value = false
    }
  }

  function getCount(pid: string | number, code: string) {
    return counts.value[String(pid)]?.[code] ?? 0
  }

  function setCount(pid: string | number, code: string, value: number) {
    const key = String(pid)
    if (!counts.value[key]) counts.value[key] = {}
    counts.value[key][code] = value
  }

  watch(cycleIdRef, () => load(), { immediate: true })

  return { counts, dirtyEntries, loading, saving, load, saveAll, getCount, setCount }
}
