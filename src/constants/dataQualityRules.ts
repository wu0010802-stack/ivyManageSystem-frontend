/**
 * 資料品質規則的呈現層 metadata（dqview01）。
 *
 * 後端 `services/data_quality/rules/` 的 `code` 為事實來源；此處只補「給人看」
 * 的部分：中文名、影響、修正指引、可跳轉的業務頁面。這些知識（尤其是路由）
 * 本質屬於前端，故不從後端 `Rule.description` 取。
 *
 * 代價是新增規則需兩端同步，以 fallback 吸收：未知 code 降級顯示原始代碼，
 * 後端新增規則時本頁不會壞，只是暫時沒有中文說明。
 */

export interface DataQualityRuleMeta {
  /** 表格內顯示的中文規則名 */
  label: string
  /** 這是什麼 */
  what: string
  /** 放著不管會怎樣 */
  impact: string
  /** 怎麼修 */
  howToFix: string
  /** 能否由管理者自行在介面上修正（false = 需工程處理） */
  selfServiceable: boolean
}

export const DATA_QUALITY_RULES: Record<string, DataQualityRuleMeta> = {
  contact_book_orphan_student: {
    label: '聯絡簿指向已不存在的學生',
    what: '有聯絡簿記錄關聯到一筆已經不存在的學生資料。',
    impact: '開啟相關聯絡簿可能出錯，聯絡簿的統計數字也會失真。',
    howToFix:
      '請先確認該學生是否被誤刪。這是資料庫層級的殘留記錄，無法從管理介面清除，需由工程人員處理後再回到本頁標記已修正。',
    selfServiceable: false,
  },
  salary_record_orphan_employee: {
    label: '薪資記錄指向已不存在的員工',
    what: '有薪資記錄關聯到一筆已經不存在的員工資料。',
    impact: '薪資報表可能出現無主的金額，影響帳務核對與勞健保申報。',
    howToFix:
      '請先確認該員工是否被誤刪。這是資料庫層級的殘留記錄，無法從管理介面清除，需由工程人員處理後再回到本頁標記已修正。',
    selfServiceable: false,
  },
  guardian_orphan_user: {
    label: '家長資料指向已不存在的帳號',
    what: '家長資料綁定到一個已經不存在的使用者帳號。',
    impact: '該家長無法登入家長端，LINE 綁定與推播通知也會失效。',
    howToFix:
      '需由工程人員重新綁定或解除綁定該家長的帳號，無法從管理介面處理。',
    selfServiceable: false,
  },
  employee_active_but_offboarded: {
    label: '員工已過離職日但仍為在職',
    what: '這位員工的離職日期已經過了，但「在職中」的狀態沒有關掉。',
    impact: '此員工仍會出現在在職名單、排班與薪資計算範圍內，可能算到不該算的薪水。',
    howToFix:
      '點擊右側員工編號前往員工管理頁，確認離職日正確後，將「在職中」取消勾選並儲存。',
    selfServiceable: true,
  },
  student_active_but_lifecycle_terminal: {
    label: '學生已離校但仍為在學',
    what: '這位學生的就學狀態已是畢業／轉學／退學，但「在學中」沒有關掉。',
    impact: '此學生仍會出現在班級名冊、出勤點名與學費計算範圍內。',
    howToFix:
      '點擊右側學生編號前往學生資料頁，確認就學狀態後，將「在學中」取消並儲存。',
    selfServiceable: true,
  },
}

/** 未知 rule_code 的降級呈現——後端新增規則時本頁不致壞掉。 */
export function getRuleMeta(code: string): DataQualityRuleMeta {
  return (
    DATA_QUALITY_RULES[code] ?? {
      label: code,
      what: '這條規則尚未有中文說明。',
      impact: '請參考下方的原始偵測訊息判斷影響範圍。',
      howToFix: '若不確定如何處理，請聯繫工程人員協助判讀。',
      selfServiceable: false,
    }
  )
}

export interface DataQualityEntityMeta {
  label: string
  /** 對應的管理頁路由；無對應頁面時為 null（顯示純文字，不可點） */
  toRoute: ((id: string) => string) | null
}

export const DATA_QUALITY_ENTITY_TYPES: Record<string, DataQualityEntityMeta> = {
  student: { label: '學生', toRoute: (id) => `/students/profile/${id}` },
  employee: { label: '員工', toRoute: (id) => `/employees/${id}` },
  // 以下三者為資料庫層級的殘留記錄，沒有對應的管理頁可跳轉。
  contact_book_entry: { label: '聯絡簿記錄', toRoute: null },
  guardian: { label: '家長資料', toRoute: null },
  salary_record: { label: '薪資記錄', toRoute: null },
}

export function getEntityMeta(entityType: string): DataQualityEntityMeta {
  return (
    DATA_QUALITY_ENTITY_TYPES[entityType] ?? { label: entityType, toRoute: null }
  )
}

export const SEVERITY_LABELS: Record<string, string> = {
  P0: '嚴重',
  P1: '警告',
  P2: '提示',
}

/** Element Plus el-tag 的 type prop 只吃這組字面量，不能放寬成 string。 */
type ElTagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

export const SEVERITY_TAG_TYPES: Record<string, ElTagType> = {
  P0: 'danger',
  P1: 'warning',
  P2: 'info',
}

export const STATUS_LABELS: Record<string, string> = {
  open: '待處理',
  ack: '已確認',
  fixed: '已修正',
  ignored: '已忽略',
}

export const STATUS_TAG_TYPES: Record<string, ElTagType> = {
  open: 'danger',
  ack: 'warning',
  fixed: 'success',
  ignored: 'info',
}

/** 篩選下拉的選項來源：狀態。 */
export const STATUS_FILTER_OPTIONS = Object.entries(STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
)

/** 篩選下拉的選項來源：嚴重度。保留 P2（目前無 P2 規則，但未來相容）。 */
export const SEVERITY_FILTER_OPTIONS = Object.entries(SEVERITY_LABELS).map(
  ([value, label]) => ({ value, label: `${value} ${label}` }),
)

/** 篩選下拉的選項來源：規則。僅列出已知規則，未知 code 靠 fallback 顯示。 */
export const RULE_FILTER_OPTIONS = Object.entries(DATA_QUALITY_RULES).map(
  ([value, meta]) => ({ value, label: meta.label }),
)
