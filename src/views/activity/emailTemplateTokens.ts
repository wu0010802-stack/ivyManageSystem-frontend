// 才藝通知信樣板的佔位符：中文名稱與預覽用範例值。
// 後端 services/registration_email._substitute_placeholders 是純字串 {key} 替換，
// 不認得的 token 原樣保留寄出，所以前端要把拼錯的找出來提醒。

export const EMAIL_TOKEN_LABELS: Record<string, string> = {
  org_name: '園所名稱',
  student_name: '學生姓名',
  class_name: '班級',
  school_year: '學年度',
  semester: '學期',
  course_name: '課程名稱',
  courses_list: '課程清單',
  supplies_section: '用品清單',
  total_amount: '應繳總額',
  query_token: '查詢碼',
  edit_url: '修改報名連結',
}

const SAMPLE_VALUES: Record<string, string> = {
  org_name: '○○幼兒園',
  student_name: '王小明',
  class_name: '大象班',
  school_year: '114',
  semester: '2',
  course_name: '兒童美術',
  courses_list: '・兒童美術　$3,600\n・幼兒律動　$3,200',
  supplies_section: '\n報名用品：\n・美術材料包　$500\n',
  total_amount: '7,300',
  query_token: 'A1B2C3',
  edit_url: 'https://example.com/activity/edit?token=A1B2C3',
}

const TOKEN_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

export function renderEmailPreview(template: string): string {
  return template.replace(TOKEN_RE, (whole, key: string) => SAMPLE_VALUES[key] ?? whole)
}

export function findUnknownTokens(text: string, allowed: string[]): string[] {
  const allow = new Set(allowed)
  const found = new Set<string>()
  for (const m of text.matchAll(TOKEN_RE)) {
    if (!allow.has(m[1])) found.add(m[1])
  }
  return [...found]
}
