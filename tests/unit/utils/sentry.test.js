import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  sanitizeUrl,
  scrubMapping,
  scrubEvent,
  scrubBreadcrumb,
  scrubQueryString,
  hashUserId,
  redactPiiValue,
  redactPiiKvInText,
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

  it('filters PII values in query string', () => {
    // regression：query 內 PII key 過去完全繞過 scrubber，現在應遮值。
    const result = sanitizeUrl('/api/students/search?phone=0912345678')
    expect(result).not.toContain('0912345678')
    expect(result).toContain('phone=')
    expect(result).toContain('Filtered')
  })

  it('keeps non-PII metric keys in query intact', () => {
    expect(sanitizeUrl('/api/salary/preview?year=2026&month=5')).toBe(
      '/api/salary/preview?year=2026&month=5'
    )
  })

  it('handles mixed PII + metric in query', () => {
    const result = sanitizeUrl(
      '/api/students/search?email=alice@example.com&id_number=A123456789&year=2026'
    )
    expect(result).not.toContain('alice@example.com')
    expect(result).not.toContain('A123456789')
    expect(result).toContain('year=2026')
  })

  it('handles path id + query PII together', () => {
    const result = sanitizeUrl('/api/students/123?phone=0912345678')
    expect(result.startsWith('/api/students/:id?')).toBe(true)
    expect(result).not.toContain('0912345678')
  })

  it('handles full URL with query PII', () => {
    const result = sanitizeUrl(
      'https://x.com/api/students/123?phone=0912&include=name'
    )
    expect(result.startsWith('https://x.com/api/students/:id?')).toBe(true)
    expect(result).not.toContain('0912')
    expect(result).toContain('include=name')
  })
})

describe('scrubMapping', () => {
  it('filters finance / identity / medical PII keys', () => {
    const res = scrubMapping({
      base_salary: 50000,
      insured_amount: 45800,
      bonus_amount: 1000,
      unused_leave_payout: 5000,
      base_transfer_amount: 35000,
      employer_burden: 6500,
      total_employer_cost: 73000,
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
    expect(res.unused_leave_payout).toBe('[Filtered]')
    expect(res.base_transfer_amount).toBe('[Filtered]')
    expect(res.id_number).toBe('[Filtered]')
    expect(res.phone).toBe('[Filtered]')
    expect(res.child_name).toBe('[Filtered]')
    expect(res.medication).toBe('[Filtered]')
    expect(res.diagnosis).toBe('[Filtered]')
    expect(res.growth_record).toBe('[Filtered]')
    expect(res.weight_kg).toBe('[Filtered]')
    expect(res.employer_burden).toBe('[Filtered]')
    expect(res.total_employer_cost).toBe('[Filtered]')
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

  it('filters contacts 整包 (娃娃車司機端接送聯絡人，2026-08-26 bussch)', () => {
    // 為什麼整包遮而不是只靠內層的 phone：`contacts` 這個 key 不命中任何 needle，
    // scrubber 會遞迴進去，而內層的裸字 `name` 也不在清單裡（清單是逐一列舉
    // student_name / parent_name / person_name…），聯絡人姓名會原樣通過。
    // 裸字 `name` 刻意不加進 denylist——同檔下方那支測試釘住 `name: 'Alice'`
    // 不該被遮（會誤傷 route_name / classroom_name 等非 PII 欄位）。
    const res = scrubMapping({
      contacts: [{ name: '王媽媽', phone: '0912345678' }],
    })
    expect(res.contacts).toBe('[Filtered]')
    expect(JSON.stringify(res)).not.toContain('王媽媽')
  })

  it('filters 站點座標 lat/lng (接送地址 geocode 快照＝家庭住址，2026-08-26 bussch)', () => {
    // 走 PII_KEY_EXACT 而非 substring：'lat' 會誤傷 latest / related / translation。
    const res = scrubMapping({
      lat: 22.61, lng: 120.28, latest_version: 3, translation_key: 'bus.title',
    })
    expect(res.lat).toBe('[Filtered]')
    expect(res.lng).toBe('[Filtered]')
    // 整字相等比對不得誤傷這兩個
    expect(res.latest_version).toBe(3)
    expect(res.translation_key).toBe('bus.title')
  })

  it('filters 家長端座標鍵名 stop_lat/stop_lng (BusChildOut，2026-08-26 review 補漏)', () => {
    // 裸字 lat/lng 只涵蓋司機端 payload 鍵名；家長端 /parent/bus/today 與 WS
    // payload 的家庭座標鍵名是 stop_lat/stop_lng，同一類資料兩種鍵名缺一即漏。
    const res = scrubMapping({
      stop_lat: 22.61, stop_lng: 120.28, stop_status: 'pending', stops_ahead: 2,
    })
    expect(res.stop_lat).toBe('[Filtered]')
    expect(res.stop_lng).toBe('[Filtered]')
    // 整字相等比對不得誤傷同前綴的非座標欄位
    expect(res.stop_status).toBe('pending')
    expect(res.stops_ahead).toBe(2)
  })

  it('filters camelCase Vue prop 名 (attachProps 會把 props 塞進 contexts.vue.propsData)', () => {
    // @sentry/vue 預設 attachProps: true。denylist 詞條全是 snake_case，
    // 'childName'.toLowerCase() = 'childname' 不含 'child_name' 子字串，
    // 也不等於 PII_KEY_EXACT 的 'child'——原樣上傳。
    const res = scrubMapping({
      childName: '王小明',
      studentName: '王小明',
      parentName: '王媽媽',
      personName: '王阿嬤',
      routeName: 'A 線',
    })
    expect(res.childName).toBe('[Filtered]')
    expect(res.studentName).toBe('[Filtered]')
    expect(res.parentName).toBe('[Filtered]')
    expect(res.personName).toBe('[Filtered]')
    // 非 PII 的 camelCase 欄位不得誤遮
    expect(res.routeName).toBe('A 線')
  })

  it('filters exclude_reason (新學年預編班行政自由輸入，對齊既有 resign_reason 先例)', () => {
    const res = scrubMapping({
      exclude_reason: '家長要求轉學，疑似家庭因素',
      resign_reason: '健康因素',
      name: 'Alice',
    })
    expect(res.exclude_reason).toBe('[Filtered]')
    expect(res.resign_reason).toBe('[Filtered]')
    expect(res.name).toBe('Alice')
  })

  it('filters exempt_reason (機構活動缺席豁免原因，HR 自由輸入，對齊既有 exclude_reason 先例)', () => {
    const res = scrubMapping({
      exempt_reason: '當日有核准住院病假',
      title: '園務會議',
    })
    expect(res.exempt_reason).toBe('[Filtered]')
    expect(res.title).toBe('園務會議')
  })

  it('filters internal_note (才藝報名內部審核軌跡，含審核人帳號與駁回理由，對齊既有 exempt_reason 先例)', () => {
    const res = scrubMapping({
      internal_note: '[已拒絕 by admin] 家長要求延後入學，健康因素',
      title: '報名審核',
    })
    expect(res.internal_note).toBe('[Filtered]')
    expect(res.title).toBe('報名審核')
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

  it('redacts strong identifiers inside free-text string values (對齊後端 _scrub_mapping)', () => {
    // 後端 _scrub_mapping 對 string value 跑 _redact_pii_value；前端須對齊，否則
    // 自由文字欄位（reason/note/summary）內嵌的手機/身分證/LINE userId 會在前端側洩漏。
    const res = scrubMapping({
      reason: '家長電話 0912345678 請改期',
      note: '身分證 A123456789 已核',
      ok: '正常文字 編號 12345',
    })
    expect(res.reason).not.toContain('0912345678')
    expect(res.note).not.toContain('A123456789')
    expect(res.ok).toBe('正常文字 編號 12345') // 非識別子不誤遮
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

  // 資安稽核（2026-08-10）：三組漏網欄位補齊；與 BE
  // tests/test_sentry_pii_security_audit_2026_08_10.py 對應（陷阱 #8 要求兩端各自補測試）。
  it('filters labor insurance / student sensitive category / medical DEK keys', () => {
    const res = scrubMapping({
      labor_insurance_employee: 1234,
      labor_insurance_employer: 5678,
      health_insurance_employee: 900, // 既有行為，不得回歸
      nationality: '越南',
      is_disadvantaged: true,
      low_income_status: 'low',
      indigenous_status: '阿美族',
      medical_dek_wrapped: 'base64blob',
      medical_dek_lookup: 'hash',
      classroom_id: 3, // 非 PII 保留
    })
    expect(res.labor_insurance_employee).toBe('[Filtered]')
    expect(res.labor_insurance_employer).toBe('[Filtered]')
    expect(res.health_insurance_employee).toBe('[Filtered]')
    expect(res.nationality).toBe('[Filtered]')
    expect(res.is_disadvantaged).toBe('[Filtered]')
    expect(res.low_income_status).toBe('[Filtered]')
    expect(res.indigenous_status).toBe('[Filtered]')
    expect(res.medical_dek_wrapped).toBe('[Filtered]')
    expect(res.medical_dek_lookup).toBe('[Filtered]')
    expect(res.classroom_id).toBe(3)
  })

  it('does not overmatch insurance settings or gov-MoE aggregate stats', () => {
    // insurance_brackets / insurance_rates 是制度設定（非 PII）——若有人把詞條
    // 從 labor_insurance 放寬成 insurance，這裡會紅。
    // *_count / *_pct 是報教育部的班級人數統計，非個人身分屬性。
    const res = scrubMapping({
      insurance_brackets: [1, 2, 3],
      insurance_rates: { labor: 0.11 },
      disadvantaged_count: 2,
      disadvantaged_pct: 8,
      indigenous_count: 1,
      indigenous_pct: 4,
      disability_count: 1,
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

  // D2（課後才藝上線 bug 修復，2026-07-22）：ParentInquiry.name（家長真實姓名）改欄名
  // parent_name 根治（DB column/ORM attribute 改名，API 對外欄位仍叫 name）；
  // question/reply 為新增 substring，與後端同步。
  it('filters parent inquiry parent_name / question / reply (D2 2026-07-22)', () => {
    const res = scrubMapping({
      parent_name: '王家長',
      phone: '0912345678',
      question: '請問還有名額嗎？',
      reply: '已電話聯繫，家長確認了解上課時間。',
      is_read: false,
    })
    expect(res.parent_name).toBe('[Filtered]')
    expect(res.phone).toBe('[Filtered]')
    expect(res.question).toBe('[Filtered]')
    expect(res.reply).toBe('[Filtered]')
    expect(res.is_read).toBe(false)
  })

  // 臨時接送授權（2026-08-11）：接送人姓名快照/名單欄位 person_name 新增
  // substring；person_phone 已被既有 phone substring 命中，無需重複新增。
  it('filters pickup person_name / person_phone (2026-08-11)', () => {
    const res = scrubMapping({
      person_name: '王阿嬤',
      person_phone: '0912345678',
      person_relation: '祖母',
      status: 'active',
    })
    expect(res.person_name).toBe('[Filtered]')
    expect(res.person_phone).toBe('[Filtered]')
    // relation/status 非強識別欄位，不在 denylist，維持原值
    expect(res.person_relation).toBe('祖母')
    expect(res.status).toBe('active')
  })

  // T-020/T-024（2026-08-23）：授權列表 API 從一次性回應改為 active 授權每次都
  // 回傳解密明碼，與 BE _PII_KEY_SUBSTRINGS 同步新增 pickup_code。
  it('filters pickup_code (T-020/T-024 2026-08-23)', () => {
    const res = scrubMapping({
      pickup_code: '482913',
      effective_status: 'active',
    })
    expect(res.pickup_code).toBe('[Filtered]')
    expect(res.effective_status).toBe('active')
  })

  it('does not over-match bare name fields like course_name (D2 2026-07-22)', () => {
    const res = scrubMapping({
      name: 'Alice',
      course_name: '手作陶藝',
      classroom_name: '向日葵班',
    })
    expect(res.name).toBe('Alice')
    expect(res.course_name).toBe('手作陶藝')
    expect(res.classroom_name).toBe('向日葵班')
  })

  // #11 資安稽核（2026-07-30）：裸字 key（student=王小明）不含底線後綴，substring
  // denylist 攔不到；與後端 _PII_KEY_EXACT 對齊補精確比對。
  it('filters bare student/child/parent keys via exact match (#11 2026-07-30)', () => {
    const res = scrubMapping({
      student: '王小明',
      child: '陳小華',
      parent: '林小美',
      ok: 'yes',
    })
    expect(res.student).toBe('[Filtered]')
    expect(res.child).toBe('[Filtered]')
    expect(res.parent).toBe('[Filtered]')
    expect(res.ok).toBe('yes')
  })

  it('does not over-match extended keys like student_id / students_count via exact match (#11 2026-07-30)', () => {
    const res = scrubMapping({
      student_id: 42,
      students_count: 10,
    })
    expect(res.student_id).toBe(42)
    expect(res.students_count).toBe(10)
  })

  it('is case-insensitive for exact-match bare keys (#11 2026-07-30)', () => {
    const res = scrubMapping({ Student: '王小明', CHILD: '陳小華' })
    expect(res.Student).toBe('[Filtered]')
    expect(res.CHILD).toBe('[Filtered]')
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
    // user.id 對映 employees.id / parents.id —— hash 化避免直連個人
    expect(res.user.id).toBe(hashUserId(1))
    expect(res.user.id).not.toBe(1)
    expect(res.extra.base_salary).toBe('[Filtered]')
    expect(res.extra.note).toBe('ok')
    expect(res.contexts.runtime.name).toBe('chrome')
    expect(res.contexts.user.phone).toBe('[Filtered]')
  })

  it('contexts.vue.propsData 整包遮罩（通用鍵名 prop 承載 PII，2026-08-26 bussch）', () => {
    // attachProps 會把 render error 元件的整包 props 塞進來。key 比對攔得住
    // childName 等具名 PII prop，但 StatTile 的 `value` prop 承載學生姓名，而
    // 'value' 不可能進 denylist（會誤遮全站）——只能整包收掉。
    const ev = {
      contexts: {
        vue: { componentName: 'StatTile', propsData: { label: '今天不搭', value: '王小明' } },
        runtime: { name: 'chrome' },
      },
    }
    const res = scrubEvent(ev)
    expect(res.contexts.vue.propsData).toBe('[Filtered]')
    expect(JSON.stringify(res)).not.toContain('王小明')
    // 只收 propsData，vue context 的其他欄位與其他 context 不受影響
    expect(res.contexts.vue.componentName).toBe('StatTile')
    expect(res.contexts.runtime.name).toBe('chrome')
  })

  it('hashes string user.id', () => {
    const res = scrubEvent({ user: { id: 'U-12345' } })
    expect(res.user.id).toBe(hashUserId('U-12345'))
    expect(res.user.id).toHaveLength(8) // FNV-1a 32-bit → 8 hex chars
  })

  it('leaves null user.id alone', () => {
    const res = scrubEvent({ user: { id: null, email: 'x@y.com' } })
    expect(res.user.id).toBe(null)
    expect(res.user.email).toBe('[Filtered]')
  })

  it('scrubs request.query_string string form', () => {
    const ev = {
      request: { url: '/x', query_string: 'phone=0912&year=2026' },
    }
    const res = scrubEvent(ev)
    expect(res.request.query_string).not.toContain('0912')
    expect(res.request.query_string).toContain('year=2026')
  })

  it('non-object passthrough', () => {
    expect(scrubEvent(null)).toBe(null)
    expect(scrubEvent('s')).toBe('s')
  })

  it('redacts identifiers in exception.values[].value (對齊後端 _scrub_event P2-2)', () => {
    // 未捕捉 JS 錯誤訊息可能內嵌手機/身分證/LINE userId；後端對 exception.values[].value
    // 跑 _redact_pii_value，前端 scrubEvent 須對齊，否則前端側單邊洩漏。
    const res = scrubEvent({
      exception: {
        values: [
          { type: 'Error', value: '家長 0912345678 綁定失敗 身分證 A123456789' },
          { type: 'Error', value: 123 }, // 非字串原樣保留
        ],
      },
    })
    const exVal = res.exception.values[0].value
    expect(exVal).not.toContain('0912345678')
    expect(exVal).not.toContain('A123456789')
    expect(res.exception.values[1].value).toBe(123)
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

describe('scrubQueryString', () => {
  it('filters PII value in string form', () => {
    const res = scrubQueryString('phone=0912345678&name=Alice')
    expect(res).not.toContain('0912345678')
    expect(res).toContain('name=Alice')
  })

  it('preserves non-PII keys', () => {
    expect(scrubQueryString('year=2026&month=5')).toBe('year=2026&month=5')
  })

  it('falls through to scrubMapping for dict form', () => {
    expect(scrubQueryString({ phone: '0912', ok: 'yes' })).toEqual({
      phone: '[Filtered]',
      ok: 'yes',
    })
  })

  it('empty string passthrough', () => {
    expect(scrubQueryString('')).toBe('')
  })
})

describe('redactPiiValue (SEC-2026-0624-01：與後端 _redact_pii_value 對齊)', () => {
  const LINE_UID = 'U' + '0123456789abcdef0123456789abcdef' // 真實格式 U + 32 hex

  it('masks LINE userId (U + 32 hex)', () => {
    const out = redactPiiValue(`綁定成功 line_user_id=${LINE_UID} 完成`)
    expect(out).not.toContain(LINE_UID)
    expect(out).toContain('[Filtered]')
  })

  it('masks mobile / id / landline 自由文字（與後端對齊）', () => {
    const out = redactPiiValue('電話 0912345678 身分證 A123456789 市話 02-12345678')
    expect(out).not.toContain('0912345678')
    expect(out).not.toContain('A123456789')
    expect(out).not.toContain('02-12345678')
  })

  it('keeps plain text / 非 LINE-uid 格式 token 不誤遮', () => {
    expect(redactPiiValue('學生編號 12345 已報名')).toBe('學生編號 12345 已報名')
    expect(redactPiiValue('使用者 U_victim_parent_001 已綁定')).toBe(
      '使用者 U_victim_parent_001 已綁定'
    )
  })

  it('masks identifiers adjacent to CJK with no separator（JS \\b ASCII-only 已覆蓋）', () => {
    // JS \b 視中文為非詞字元，故中文緊鄰識別子無空白也會遮（前端本就正確；後端 Python
    // \b 為 Unicode-aware 反而漏遮，已於後端改顯式邊界對齊）。此測試鎖死前端此行為。
    const uid = 'U' + '0123456789abcdef'.repeat(2)
    const out = redactPiiValue(
      `電話0912345678請改期，身分證A123456789，市話02-12345678，綁定${uid}止`
    )
    expect(out).not.toContain('0912345678')
    expect(out).not.toContain('A123456789')
    expect(out).not.toContain('02-12345678')
    expect(out).not.toContain(uid)
  })

  it('does not mask digit subsequence inside a longer run', () => {
    expect(redactPiiValue('代碼1230912345678末')).toBe('代碼1230912345678末')
  })

  it('passes through non-string', () => {
    expect(redactPiiValue(null)).toBe(null)
    expect(redactPiiValue(42)).toBe(42)
  })

  it('scrubEvent 對 breadcrumb message 跑 value 遮罩（不只 sanitizeUrl）', () => {
    const res = scrubEvent({
      breadcrumbs: { values: [{ message: `[parent-bind] ${LINE_UID}` }] },
    })
    expect(res.breadcrumbs.values[0].message).not.toContain(LINE_UID)
  })

  it('scrubBreadcrumb 對 message 跑 value 遮罩', () => {
    const res = scrubBreadcrumb({ message: '家長電話 0912345678' })
    expect(res.message).not.toContain('0912345678')
  })
})

describe('hashUserId', () => {
  it('hashes int to 8-char hex', () => {
    const h = hashUserId(1)
    expect(typeof h).toBe('string')
    expect(h).toHaveLength(8)
    expect(/^[0-9a-f]{8}$/.test(h)).toBe(true)
  })

  it('hashes string deterministically', () => {
    expect(hashUserId('U-99')).toBe(hashUserId('U-99'))
  })

  it('different ids yield different hashes', () => {
    expect(hashUserId(1)).not.toBe(hashUserId(2))
  })

  it('passes through null / undefined / empty', () => {
    expect(hashUserId(null)).toBe(null)
    expect(hashUserId(undefined)).toBe(undefined)
    expect(hashUserId('')).toBe('')
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

// qa-loop round2（2026-06-29）：與後端 _redact_pii_kv_in_text 對齊——exception value 內
// key-based PII（email/姓名/帳號）須遮罩，value-level 正則攔不到。
describe('redactPiiKvInText', () => {
  it('filters denylist key values but keeps keys', () => {
    const out = redactPiiKvInText(
      "{'email': 'foo@bar.com', 'parent_name': '王小明', 'bank_account': '1234567890'}"
    )
    expect(out).not.toContain('foo@bar.com')
    expect(out).not.toContain('王小明')
    expect(out).not.toContain('1234567890')
    expect(out).toContain('[Filtered]')
    expect(out).toContain('email')
  })

  it('keeps non-PII key values', () => {
    const out = redactPiiKvInText("{'count': 5, 'status': 'ok'}")
    expect(out).toContain('5')
    expect(out).toContain('ok')
    expect(out).not.toContain('[Filtered]')
  })

  it('scrubEvent redacts key-based PII inside exception value', () => {
    const ev = {
      exception: {
        values: [
          {
            type: 'Error',
            value:
              "constraint violated [parameters: {'email': 'foo@bar.com', 'parent_name': '王小明'}]",
          },
        ],
      },
    }
    const res = scrubEvent(ev)
    const v = res.exception.values[0].value
    expect(v).not.toContain('foo@bar.com')
    expect(v).not.toContain('王小明')
    expect(v).toContain('[Filtered]')
  })
})

// 系統優化盤點 P1（2026-07-03）：logentry / top-level message 未過 PII scrub。
// 與後端 utils/sentry_init._scrub_event 對齊（PII 遮罩前後端必須同步，否則單側洩漏）。
describe('scrubEvent logentry / message PII', () => {
  it('redacts logentry.formatted / message PII', () => {
    const ev = {
      logentry: {
        message: '登入失敗 email=parent@example.com 手機 0912345678',
        formatted: '登入失敗 email=parent@example.com 手機 0912345678',
        params: ['parent@example.com', '0912345678'],
      },
    }
    const res = scrubEvent(ev)
    expect(res.logentry.formatted).not.toContain('parent@example.com')
    expect(res.logentry.formatted).not.toContain('0912345678')
    expect(res.logentry.message).not.toContain('parent@example.com')
    expect(res.logentry.formatted).toContain('[Filtered]')
  })

  it('redacts logentry.params dict keys', () => {
    const ev = {
      logentry: { message: '建立家長失敗', params: { email: 'foo@bar.com', parent_name: '王小明' } },
    }
    const res = scrubEvent(ev)
    expect(res.logentry.params.email).toBe('[Filtered]')
    expect(res.logentry.params.parent_name).toBe('[Filtered]')
  })

  it('redacts top-level message PII', () => {
    const res = scrubEvent({ message: '身分證 A123456789 綁定失敗，email=user@example.com' })
    expect(res.message).not.toContain('A123456789')
    expect(res.message).not.toContain('user@example.com')
    expect(res.message).toContain('[Filtered]')
  })
})
