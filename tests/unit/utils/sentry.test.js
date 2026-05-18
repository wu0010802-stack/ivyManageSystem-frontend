import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  sanitizeUrl,
  scrubMapping,
  scrubEvent,
  scrubBreadcrumb,
  initSentry,
  captureException,
} from '@/utils/sentry'

beforeEach(() => {
  // 每個 test 預設 DSN 缺，由具體 test 自行覆寫
  import.meta.env.VITE_SENTRY_DSN = ''
})

describe('sanitizeUrl', () => {
  it('replaces single numeric id segment', () => {
    expect(sanitizeUrl('/api/students/123')).toBe('/api/students/:id')
  })

  it('replaces multiple numeric segments', () => {
    expect(sanitizeUrl('/api/students/123/measurements/45')).toBe(
      '/api/students/:id/measurements/:id'
    )
  })

  it('keeps path templates intact', () => {
    expect(sanitizeUrl('/api/students/{student_id}')).toBe(
      '/api/students/{student_id}'
    )
  })

  it('leaves query-string numbers alone', () => {
    expect(sanitizeUrl('/api/salary/preview?year=2026&month=5')).toBe(
      '/api/salary/preview?year=2026&month=5'
    )
  })

  it('handles id followed by query', () => {
    expect(sanitizeUrl('/api/employees/77?include=salary')).toBe(
      '/api/employees/:id?include=salary'
    )
  })

  it('returns falsy / non-string passthrough', () => {
    expect(sanitizeUrl('')).toBe('')
    expect(sanitizeUrl(null)).toBe(null)
    expect(sanitizeUrl(undefined)).toBe(undefined)
  })
})

describe('scrubMapping', () => {
  it('filters finance / identity / medical PII keys', () => {
    const res = scrubMapping({
      base_salary: 50000,
      insured_amount: 45800,
      bonus_amount: 1000,
      id_number: 'A123456789',
      phone: '0912345678',
      child_name: '小明',
      medication: 'Tylenol',
      diagnosis: 'ADHD',
      growth_record: {},
      weight_kg: 15,
      name: 'Alice', // 非 PII 保留
      ok: 'yes',
    })
    expect(res.base_salary).toBe('[Filtered]')
    expect(res.insured_amount).toBe('[Filtered]')
    expect(res.bonus_amount).toBe('[Filtered]')
    expect(res.id_number).toBe('[Filtered]')
    expect(res.phone).toBe('[Filtered]')
    expect(res.child_name).toBe('[Filtered]')
    expect(res.medication).toBe('[Filtered]')
    expect(res.diagnosis).toBe('[Filtered]')
    expect(res.growth_record).toBe('[Filtered]')
    expect(res.weight_kg).toBe('[Filtered]')
    expect(res.name).toBe('Alice')
    expect(res.ok).toBe('yes')
  })

  it('filters auth keys case-insensitively', () => {
    const res = scrubMapping({
      Authorization: 'Bearer x',
      Cookie: 'session=y',
      password: 'z',
      jwt_token: 'abc',
      access_token: 'aaa',
      api_key: 'kkk',
      line_user_id: 'U123',
      liff_id: 'L456',
    })
    for (const k of [
      'Authorization',
      'Cookie',
      'password',
      'jwt_token',
      'access_token',
      'api_key',
      'line_user_id',
      'liff_id',
    ]) {
      expect(res[k]).toBe('[Filtered]')
    }
  })

  it('recurses into nested dict and list', () => {
    const res = scrubMapping({
      meta: { id_number: 'A1', ok: 'yes' },
      list: [{ password: 'x' }, { salary: 1 }, { normal: 'y' }],
    })
    expect(res.meta.id_number).toBe('[Filtered]')
    expect(res.meta.ok).toBe('yes')
    expect(res.list[0].password).toBe('[Filtered]')
    expect(res.list[1].salary).toBe('[Filtered]')
    expect(res.list[2].normal).toBe('y')
  })

  it('leaves primitives unchanged', () => {
    expect(scrubMapping('hello')).toBe('hello')
    expect(scrubMapping(42)).toBe(42)
    expect(scrubMapping(null)).toBe(null)
  })

  it('substring matches extended keys like parent_email', () => {
    const res = scrubMapping({
      parent_email: 'x@y.com',
      employee_salary_after_tax: 40000,
    })
    expect(res.parent_email).toBe('[Filtered]')
    expect(res.employee_salary_after_tax).toBe('[Filtered]')
  })

  it('exempts system / metric keys that would otherwise overmatch', () => {
    const res = scrubMapping({
      ip_address: '1.2.3.4',
      request_ip_addr_v6: '::1',
      health_check: 'ok',
      healthcheck_status: 'green',
      email_template_id: 5,
      email_subject: 'Welcome',
      growth_funnel_count: 30,
      growth_rate: 0.15,
      measurement_unit: 'kg',
      measurement_type: 'weight',
    })
    for (const [k, v] of Object.entries(res)) {
      expect(v, `${k} was wrongly filtered`).not.toBe('[Filtered]')
    }
  })

  it('still filters personal growth / measurement despite exempt', () => {
    const res = scrubMapping({
      growth_record: { data: '...' },
      growth_data: '...',
      measurement_value: 100,
      measurement_height: 95,
    })
    expect(res.growth_record).toBe('[Filtered]')
    expect(res.growth_data).toBe('[Filtered]')
    expect(res.measurement_value).toBe('[Filtered]')
    expect(res.measurement_height).toBe('[Filtered]')
  })
})

describe('scrubEvent', () => {
  it('sanitizes request.url and scrubs headers/data', () => {
    const ev = {
      request: {
        url: '/api/students/123/iep',
        headers: { Authorization: 'Bearer x', 'User-Agent': 'okay' },
        data: { password: 'x', child_name: '小明', title: '正常' },
      },
    }
    const res = scrubEvent(ev)
    expect(res.request.url).toBe('/api/students/:id/iep')
    expect(res.request.headers.Authorization).toBe('[Filtered]')
    expect(res.request.headers['User-Agent']).toBe('okay')
    expect(res.request.data.password).toBe('[Filtered]')
    expect(res.request.data.child_name).toBe('[Filtered]')
    expect(res.request.data.title).toBe('正常')
  })

  it('sanitizes transaction name', () => {
    const res = scrubEvent({ transaction: 'GET /api/students/123' })
    expect(res.transaction).toBe('GET /api/students/:id')
  })

  it('scrubs breadcrumb message URL and data', () => {
    const ev = {
      breadcrumbs: {
        values: [
          {
            message: 'fetch /api/employees/77',
            data: { phone: '0912', okay: true },
          },
        ],
      },
    }
    const res = scrubEvent(ev)
    const crumb = res.breadcrumbs.values[0]
    expect(crumb.message).toBe('fetch /api/employees/:id')
    expect(crumb.data.phone).toBe('[Filtered]')
    expect(crumb.data.okay).toBe(true)
  })

  it('scrubs user / extra / contexts', () => {
    const ev = {
      user: { id: 1, email: 'x@y.com' },
      extra: { base_salary: 50000, note: 'ok' },
      contexts: { runtime: { name: 'chrome' }, user: { phone: '0912' } },
    }
    const res = scrubEvent(ev)
    expect(res.user.email).toBe('[Filtered]')
    expect(res.user.id).toBe(1)
    expect(res.extra.base_salary).toBe('[Filtered]')
    expect(res.extra.note).toBe('ok')
    expect(res.contexts.runtime.name).toBe('chrome')
    expect(res.contexts.user.phone).toBe('[Filtered]')
  })

  it('non-object passthrough', () => {
    expect(scrubEvent(null)).toBe(null)
    expect(scrubEvent('s')).toBe('s')
  })
})

describe('scrubBreadcrumb', () => {
  it('sanitizes message URL and filters data', () => {
    const res = scrubBreadcrumb({
      message: 'GET /api/fees/records/789',
      data: { id_number: 'A1', okay: true },
    })
    expect(res.message).toBe('GET /api/fees/records/:id')
    expect(res.data.id_number).toBe('[Filtered]')
    expect(res.data.okay).toBe(true)
  })
})

describe('initSentry', () => {
  it('returns false when DSN missing', async () => {
    import.meta.env.VITE_SENTRY_DSN = ''
    const ok = await initSentry({}, { entry: 'admin' })
    expect(ok).toBe(false)
  })

  it('returns false when DSN is whitespace', async () => {
    import.meta.env.VITE_SENTRY_DSN = '   '
    const ok = await initSentry({}, { entry: 'admin' })
    expect(ok).toBe(false)
  })

  it('calls @sentry/vue init with expected args when DSN set', async () => {
    import.meta.env.VITE_SENTRY_DSN = 'https://pub@o0.ingest.sentry.io/0'
    import.meta.env.VITE_SENTRY_ENVIRONMENT = 'test-env'
    import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE = '0.25'

    const initSpy = vi.fn()
    const setTagSpy = vi.fn()
    vi.doMock('@sentry/vue', () => ({
      init: initSpy,
      setTag: setTagSpy,
      withScope: vi.fn(),
      captureException: vi.fn(),
    }))
    // 由於 doMock 在 import 前生效，需要重新 import 模組
    const mod = await import('@/utils/sentry?cachebust=' + Date.now())
    const ok = await mod.initSentry({}, { entry: 'admin' })
    expect(ok).toBe(true)
    expect(initSpy).toHaveBeenCalledOnce()
    const args = initSpy.mock.calls[0][0]
    expect(args.dsn).toBe('https://pub@o0.ingest.sentry.io/0')
    expect(args.environment).toBe('test-env')
    expect(args.tracesSampleRate).toBe(0.25)
    expect(args.sendDefaultPii).toBe(false)
    expect(typeof args.beforeSend).toBe('function')
    expect(typeof args.beforeBreadcrumb).toBe('function')
    // beforeSend 確實是我們的 scrubber
    const scrubbed = args.beforeSend({
      request: { url: '/api/x/1', data: { password: 'x' } },
    })
    expect(scrubbed.request.url).toBe('/api/x/:id')
    expect(scrubbed.request.data.password).toBe('[Filtered]')
    expect(setTagSpy).toHaveBeenCalledWith('entry', 'admin')
    vi.doUnmock('@sentry/vue')
  })
})

describe('captureException', () => {
  it('is a no-op when DSN missing (does not throw)', async () => {
    import.meta.env.VITE_SENTRY_DSN = ''
    await expect(
      captureException(new Error('test'), { url: '/x' })
    ).resolves.toBeUndefined()
  })
})
