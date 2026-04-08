import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// ── API mocks ──────────────────────────────────────────────────────────────
const publicQueryRegistration = vi.fn()
const publicUpdateRegistration = vi.fn()

vi.mock('@/api/activityPublic', () => ({
  publicQueryRegistration: (...a) => publicQueryRegistration(...a),
  publicUpdateRegistration: (...a) => publicUpdateRegistration(...a),
}))

// ── Element Plus mocks ─────────────────────────────────────────────────────
const ElMessageSuccess = vi.fn()
const ElMessageError = vi.fn()
const ElMessageWarning = vi.fn()

vi.mock('element-plus', () => ({
  ElMessage: {
    success: (...a) => ElMessageSuccess(...a),
    error: (...a) => ElMessageError(...a),
    warning: (...a) => ElMessageWarning(...a),
  },
}))

// ────────────────────────────────────────────────────────────────── //

import { usePublicQueryForm } from '@/composables/usePublicQueryForm'

function makeComposable(overrides = {}) {
  const courses = ref([
    { name: '美術', price: 1000 },
    { name: '舞蹈', price: 1500 },
  ])
  const supplies = ref([
    { name: '畫筆', price: 200 },
  ])
  const availability = ref({ 美術: 5, 舞蹈: -1 })
  const registrationOpen = ref(true)

  return usePublicQueryForm({
    courses,
    supplies,
    availability,
    registrationOpen,
    ...overrides,
  })
}

const mockQueryResult = {
  id: 1,
  name: '王小明',
  class_name: '大班',
  courses: [{ name: '美術' }],
  supplies: ['畫筆'],
  remark: '備注一',
}

describe('usePublicQueryForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicQueryRegistration.mockResolvedValue({ data: mockQueryResult })
    publicUpdateRegistration.mockResolvedValue({ data: {} })
  })

  it('handleQuery 404 時顯示 warning', async () => {
    const err = { response: { status: 404 } }
    publicQueryRegistration.mockRejectedValue(err)

    const { queryForm, handleQuery } = makeComposable()
    queryForm.name = '王小明'
    queryForm.birthday = '2020-01-01'

    await handleQuery()

    expect(ElMessageWarning).toHaveBeenCalledWith('查無此幼兒的報名資料')
  })

  it('handleQuery 500 時顯示 error', async () => {
    const err = { response: { status: 500, data: { detail: '伺服器錯誤' } } }
    publicQueryRegistration.mockRejectedValue(err)

    const { queryForm, handleQuery } = makeComposable()
    queryForm.name = '王小明'
    queryForm.birthday = '2020-01-01'

    await handleQuery()

    expect(ElMessageError).toHaveBeenCalledWith('伺服器錯誤')
  })

  it('handleQuery 成功後設定 queryResult', async () => {
    const { queryForm, queryResult, handleQuery } = makeComposable()
    queryForm.name = '王小明'
    queryForm.birthday = '2020-01-01'

    await handleQuery()

    expect(queryResult.value).toEqual(mockQueryResult)
  })

  it('enterEditMode 從 queryResult 填充 editForm', async () => {
    const { queryForm, queryResult, editForm, handleQuery, enterEditMode } = makeComposable()
    queryForm.name = '王小明'
    queryForm.birthday = '2020-01-01'

    await handleQuery()
    enterEditMode()

    expect(editForm.selectedCourses).toEqual(['美術'])
    expect(editForm.selectedSupplies).toEqual(['畫筆'])
    expect(editForm.notes).toBe('備注一')
  })

  it('toggleEditCourse availability<0 且未選時不加入', () => {
    const { editForm, toggleEditCourse } = makeComposable()
    // editForm.selectedCourses 初始為空，舞蹈 availability = -1
    toggleEditCourse({ name: '舞蹈' })
    expect(editForm.selectedCourses).not.toContain('舞蹈')
  })

  it('handleEditSubmit 成功後 editMode 為 false 並重新查詢', async () => {
    const { queryForm, queryResult, enterEditMode, editMode, handleEditSubmit } = makeComposable()
    queryForm.name = '王小明'
    queryForm.birthday = '2020-01-01'
    queryResult.value = mockQueryResult

    enterEditMode()
    expect(editMode.value).toBe(true)

    await handleEditSubmit()

    expect(publicUpdateRegistration).toHaveBeenCalledOnce()
    expect(ElMessageSuccess).toHaveBeenCalledWith('修改成功')
    expect(editMode.value).toBe(false)
    // 成功後呼叫 handleQuery 重新查詢
    expect(publicQueryRegistration).toHaveBeenCalled()
  })

  it('handleEditSubmit 失敗後 editMode 維持 true', async () => {
    const err = { response: { data: { detail: '更新失敗' } } }
    publicUpdateRegistration.mockRejectedValue(err)

    const { queryResult, enterEditMode, editMode, handleEditSubmit } = makeComposable()
    queryResult.value = mockQueryResult
    enterEditMode()

    await handleEditSubmit()

    expect(ElMessageError).toHaveBeenCalledWith('更新失敗')
    expect(editMode.value).toBe(true)
  })

  it('toggleEditCourse 已額滿課程若已選則可移除（不受限制）', async () => {
    const { queryResult, editForm, enterEditMode, toggleEditCourse } = makeComposable()
    queryResult.value = {
      ...mockQueryResult,
      courses: [{ name: '舞蹈' }], // 已選且 availability = -1
      supplies: [],
    }
    enterEditMode()

    expect(editForm.selectedCourses).toContain('舞蹈')

    // 移除已選的額滿課程
    toggleEditCourse({ name: '舞蹈' })
    expect(editForm.selectedCourses).not.toContain('舞蹈')
  })
})
