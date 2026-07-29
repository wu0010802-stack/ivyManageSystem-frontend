import { describe, it, expect } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import router from '@/router'

describe('student workbench routing', () => {
  it('/students resolves to StudentWorkbenchView', () => {
    const resolved = router.resolve('/students')
    expect(resolved.matched[0]?.components?.default).toBeDefined()
    expect(resolved.name).toBe('students')
  })

  it('/student-academic-affairs redirects to /students', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: router.options.routes,
    })
    await testRouter.push('/student-academic-affairs')
    expect(testRouter.currentRoute.value.path).toBe('/students')
  })

  it('/students?tab=enrollment legacy deep link redirects to /classrooms', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: router.options.routes,
    })
    await testRouter.push('/students?tab=enrollment')
    expect(testRouter.currentRoute.value.path).toBe('/classrooms')
    expect(testRouter.currentRoute.value.query.tab).toBeUndefined()
  })

  it('/student-enrollment redirects to /classrooms', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: router.options.routes,
    })
    await testRouter.push('/student-enrollment')
    expect(testRouter.currentRoute.value.path).toBe('/classrooms')
    expect(testRouter.currentRoute.value.query.tab).toBeUndefined()
  })

  it('/enrollment-stats resolves to EnrollmentStatsView', () => {
    const resolved = router.resolve('/enrollment-stats')
    expect(resolved.matched[0]?.components?.default).toBeDefined()
    expect(resolved.name).toBe('enrollment-stats')
  })
})
