import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useClientTableFilter } from '@/composables/useClientTableFilter'

interface Row { id: number; name: string; active: boolean }
const DATA: Row[] = [
  { id: 1, name: '王小明', active: true },
  { id: 2, name: '陳大文', active: false },
  { id: 3, name: '王美麗', active: true },
]

describe('useClientTableFilter', () => {
  it('預設無 search 無 filter → filtered === source，total/shown 為長度', () => {
    const { filtered, total, shown } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
    })
    expect(filtered.value).toHaveLength(3)
    expect(total.value).toBe(3)
    expect(shown.value).toBe(3)
  })

  it('search 以 searchFields 子字串（大小寫不敏感）過濾', () => {
    const { searchQuery, filtered, shown } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name, String(r.id)],
    })
    searchQuery.value = '王'
    expect(shown.value).toBe(2)
    expect(filtered.value.map((r) => r.id)).toEqual([1, 3])
    searchQuery.value = '2'
    expect(filtered.value.map((r) => r.id)).toEqual([2])
  })

  it('空白 search 不過濾', () => {
    const { searchQuery, shown } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
    })
    searchQuery.value = '   '
    expect(shown.value).toBe(3)
  })

  it('filter predicate 過濾；空值（undefined/空字串）視為不過濾', () => {
    const { filterValues, filtered } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
      filters: { onlyActive: (r, v) => v !== 'yes' || r.active === true },
    })
    expect(filtered.value).toHaveLength(3)
    filterValues.value = { onlyActive: 'yes' }
    expect(filtered.value.map((r) => r.id)).toEqual([1, 3])
    filterValues.value = { onlyActive: '' }
    expect(filtered.value).toHaveLength(3)
  })

  it('search 與多個 filter 為 AND', () => {
    const { searchQuery, filterValues, filtered } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
      filters: { onlyActive: (r, v) => v !== 'yes' || r.active === true },
    })
    searchQuery.value = '王'
    filterValues.value = { onlyActive: 'yes' }
    expect(filtered.value.map((r) => r.id)).toEqual([1, 3])
  })

  it('source 為 reactive getter → 來源變動即反映', () => {
    const src = ref<Row[]>([])
    const { total } = useClientTableFilter<Row>({
      source: () => src.value,
      searchFields: (r) => [r.name],
    })
    expect(total.value).toBe(0)
    src.value = DATA
    expect(total.value).toBe(3)
  })

  it('reset 清空 search 與 filterValues', () => {
    const { searchQuery, filterValues, shown, reset } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
      filters: { onlyActive: (r, v) => v !== 'yes' || r.active === true },
    })
    searchQuery.value = '王'
    filterValues.value = { onlyActive: 'yes' }
    reset()
    expect(searchQuery.value).toBe('')
    expect(filterValues.value).toEqual({})
    expect(shown.value).toBe(3)
  })
})
