import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import StudentDetailPanel from '@/components/student/StudentDetailPanel.vue'

/**
 * Bug Sweep Round 4 (2026-05-14) F-FE-1：學生整併後，
 * 舊書籤 ?tab=timeline / photo_gallery / growth_report 必須補 ?sub= 才不會
 * 全部落到預設「milestones」sub-tab。
 *
 * StudentDetailPanel.LEGACY_TAB_MAP 把 4 個原獨立 tab 都 map 成 growth_profile，
 * 但 GrowthProfileTab.vue:24 是讀 route.query.sub（不是 tab），預設回
 * milestones。修補：legacy tab 名稱也要寫進 ?sub=。
 */

vi.mock('@/api/students', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getStudent: vi.fn().mockResolvedValue({ data: {} }),
    getStudentProfile: vi.fn().mockResolvedValue({ data: { id: 1 } }),
  }
})
vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))
vi.mock('@/utils/domainBus', () => ({
  domainBus: { on: vi.fn(), off: vi.fn() },
  STUDENT_EVENTS: { UPDATED: 'u', LIFECYCLE_CHANGED: 'l' },
  RECORD_EVENTS: { CREATED: 'c', UPDATED: 'u2', DELETED: 'd' },
}))

function makeRouter(initialQuery) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/students/profile/:id',
        name: 'student',
        component: { template: '<div/>' },
      },
    ],
  }).push({
    path: '/students/profile/1',
    query: initialQuery,
  }).then(() => null)
}

async function mountWithQuery(initialQuery, initialTab) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/students/profile/:id',
        name: 'student',
        component: { template: '<div/>' },
      },
    ],
  })
  await router.push({ path: '/students/profile/1', query: initialQuery })
  await router.isReady()

  const wrapper = mount(StudentDetailPanel, {
    props: {
      studentId: 1,
      mode: 'page',
      context: 'students',
      syncUrl: true,
      initialTab,
    },
    global: {
      plugins: [router],
      stubs: {
        StudentSummaryHeader: true,
        StudentEditDialog: true,
        LifecycleTransitionDialog: true,
        StudentEnrollmentCertButton: true,
        OverviewTab: true,
        BasicInfoTab: true,
        AttendanceTab: true,
        RecordsTab: true,
        FeesTab: true,
        ActivityTab: true,
        HealthGrowthTab: true,
        GrowthProfileTab: true,
        CommunicationTab: true,
        StudentDisabilityDocsPanel: true,
        'el-tabs': { template: '<div class="el-tabs"><slot /></div>' },
        'el-tab-pane': { template: '<div class="el-tab-pane"><slot /></div>' },
        'el-icon': true,
        'el-button': true,
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('StudentDetailPanel legacy tab → sub mapping', () => {
  it.each([
    ['timeline', 'timeline'],
    ['photo_gallery', 'photo_gallery'],
    ['growth_report', 'growth_report'],
    ['milestones', 'milestones'],
  ])('?tab=%s 應補 ?sub=%s', async (legacy, expectedSub) => {
    const { router } = await mountWithQuery({ tab: legacy }, legacy)
    // 修補前：?tab=timeline → activeTab=growth_profile 但 ?sub 未設
    // 修補後：URL 加 ?sub=<legacy>
    expect(router.currentRoute.value.query.sub).toBe(expectedSub)
    expect(router.currentRoute.value.query.tab).toBe('growth_profile')
  })

  it('非 legacy tab 不額外寫 sub', async () => {
    const { router } = await mountWithQuery({ tab: 'basic' }, 'basic')
    expect(router.currentRoute.value.query.sub).toBeUndefined()
    expect(router.currentRoute.value.query.tab).toBe('basic')
  })
})
