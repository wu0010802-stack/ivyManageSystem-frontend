/**
 * 新租戶 onboarding 必填的 `system_configs` key 清單（純 UI 標籤用途）。
 *
 * 權威定義在後端 `utils/tenant_settings.py::ONBOARDING_REQUIRED_CONFIG_KEYS`
 * （12 項）；本檔只負責前端顯示用的標籤／說明文字與分區，**不是**跨 repo 共用
 * 契約，key 字面需與後端手動保持同步。新增/刪除 onboarding key 時比照更新本表。
 *
 * ⚠ 12 項中的 `bank.payer_name` / `bank.payer_account` 與薪資模組相關，UI 留在
 * `src/views/salary/SystemSettingsPanel.vue`（自有 `listSystemConfigs('bank')`
 * 邏輯，不吃本檔定義）；本檔僅收錄其餘 10 項機構層級設定，供
 * `src/components/settings/SettingsTenantConfigTab.vue`（系統設定頁「租戶基本
 * 設定」tab）使用。
 *
 * ⚠ 本表 ≠ onboarding 必填清單：除上述 10 項外，另收錄「POS 現金門檻」兩個
 * **選填** key（`pos.cash_count_required_threshold` /
 * `pos.cash_deposit_warning_threshold`），只是借用同一個 tab 讓人維護。新增
 * 選填 key 時**不可**同步加進後端 `ONBOARDING_REQUIRED_CONFIG_KEYS`，否則每個
 * 新租戶的 onboarding 進度都永遠不會齊。
 * 2026-10-23 起另收錄「薪資／請假／加班規則」五個選填 key（同理不屬 onboarding）。
 */

/**
 * - text：自由字串
 * - switch：布林開關（存 "true"/"false"）
 * - select：列舉（`options` 為後端 `_ENUM_CONFIG_VALUES` 的合法值，送非法值後端 400）
 * - month：年月（存 "YYYY-MM"）
 * - date：日期（存 "YYYY-MM-DD"，後端另驗是否為實際存在的日期）
 */
export type SystemConfigFieldType = 'text' | 'switch' | 'select' | 'month' | 'date'

export interface SystemConfigOption {
  value: string
  label: string
}

export interface SystemConfigFieldDef {
  /** 對應 system_configs.config_key，如 `bank.payer_name` */
  key: string
  /** 中文標籤（給不熟系統的操作人員看） */
  label: string
  /** 欄位下方的補充說明／格式提示，選填 */
  hint?: string
  type: SystemConfigFieldType
  /**
   * 是否為「逗號分隔 IP/CIDR 清單」欄位：輸入值若像 JSON 陣列（`[` 開頭）
   * 顯示 inline 警示（後端只認逗號分隔字串，JSON 格式會靜默失效）。
   */
  warnJsonArray?: boolean
  /** type='select' 時的選項（值須與後端 `_ENUM_CONFIG_VALUES` 一致）。 */
  options?: SystemConfigOption[]
}

export interface SystemConfigSectionDef {
  title: string
  hint: string
  fields: SystemConfigFieldDef[]
}

export const SYSTEM_CONFIG_SECTIONS: SystemConfigSectionDef[] = [
  {
    title: '機構基本資訊',
    hint: '機構的正式全名，會用於申報文件、對外通知等場合。',
    fields: [
      { key: 'org_name', label: '機構全名', type: 'text' },
    ],
  },
  {
    title: 'Kiosk / WiFi IP 白名單',
    hint:
      '控制哪些來源 IP 可以使用 Kiosk 打卡機、或視為「校內 WiFi」允許教師登入。' +
      '⚠ 兩項留空的效果相反：Kiosk 留空＝打卡全部擋下（fail-closed），新租戶請務必填寫；' +
      '校內 WiFi 留空＝教師登入不限來源（全部放行）。',
    fields: [
      {
        key: 'kiosk.allowed_ips',
        label: 'Kiosk 打卡機允許 IP',
        hint: '逗號分隔 IP 或 CIDR，例：127.0.0.1/32,192.168.0.0/16。⚠ 未設定時 kiosk 打卡會全部擋下（fail-closed）',
        type: 'text',
        warnJsonArray: true,
      },
      {
        key: 'auth.school_wifi_ips',
        label: '校內 WiFi 允許登入 IP',
        // 後端 api/auth._is_school_wifi：白名單為空＝全部放行（fail-open，刻意與 kiosk 相反），
        // 只限制 teacher 角色登入；預設租戶留空時會沿用環境變數 SCHOOL_WIFI_IPS。
        hint:
          '逗號分隔 IP 或 CIDR，例：127.0.0.1/32,192.168.0.0/16。設定後，教師帳號只能從這些網段登入；' +
          '留空＝不限制教師登入來源（全部放行；預設租戶會改用系統環境變數的網段）。',
        type: 'text',
        warnJsonArray: true,
      },
    ],
  },
  {
    title: '校車座標',
    hint: '校車動線與到站距離計算所使用的校區座標（十進位經緯度字串）。',
    fields: [
      {
        key: 'bus.school_lat',
        label: '校區緯度',
        hint: '十進位數字字串，例：22.6420',
        type: 'text',
      },
      {
        key: 'bus.school_lng',
        label: '校區經度',
        hint: '十進位數字字串，例：120.3243',
        type: 'text',
      },
    ],
  },
  {
    title: '政府代碼',
    hint: '勞保／健保／勞退申報時所需的單位編號，供薪資申報作業使用。',
    fields: [
      { key: 'gov.labor_insurance_unit_code', label: '勞保投保單位編號', type: 'text' },
      { key: 'gov.health_insurance_unit_code', label: '健保投保單位編號', type: 'text' },
      { key: 'gov.pension_employer_code', label: '勞退提繳單位編號', type: 'text' },
    ],
  },
  {
    title: 'POS 現金門檻',
    hint:
      '才藝 POS 收銀與日結簽核的兩個現金門檻。兩者皆為選填，留空即沿用系統預設值，'
      + '不屬於新租戶 onboarding 必填項。',
    fields: [
      {
        key: 'pos.cash_count_required_threshold',
        label: '日結強制盤點門檻',
        hint: '當日現金毛流量達此金額時，日結簽核必須填寫實際盤點金額。留空＝使用系統預設 3000',
        type: 'text',
      },
      {
        key: 'pos.cash_deposit_warning_threshold',
        label: '抽屜現金存銀行提醒門檻',
        hint: '抽屜現金累積達此金額時於收銀頁提示存入銀行。留空＝使用系統預設 30000',
        type: 'text',
      },
    ],
  },
  {
    // 義華第二批裁定（2026-10-23）：五個薪資／請假／加班／年終／節慶口徑設定。皆選填，未設定＝舊行為；
    // 不屬 onboarding 必填，**不可**加進後端 ONBOARDING_REQUIRED_CONFIG_KEYS。
    title: '薪資／請假／加班規則',
    hint:
      '依各園所規章調整的計算口徑，皆為選填；未設定＝沿用系統原本的算法。'
      + '改「節慶目標人數生效月」或「未簽約新人節慶截止日」後，系統會自動把尚未封存的薪資月份標記為需重算，'
      + '請到薪資計算頁重算；已封存的月份不會變動。產假月份開關屬年終結算，改完須重建年終結算。',
    fields: [
      {
        key: 'festival_target.effective_ym',
        label: '節慶目標人數生效月',
        hint:
          '自該月起節慶獎金目標人數套用當年度設定；同年度、早於此月的薪資月份改用前一年度的目標。'
          + '未設定＝當年度目標整年回溯套用。',
        type: 'month',
      },
      {
        key: 'leave_quota_year_basis',
        label: '請假配額年度計算方式',
        hint:
          '事假、病假、家庭照顧假等年度額度與累計上限的加總區間；病假 30 日半薪的累計窗也跟著這個設定。'
          + '未設定＝曆年。',
        type: 'select',
        options: [
          { value: 'calendar', label: '曆年（1/1–12/31）' },
          { value: 'academic', label: '學年（8/1–隔年 7/31）' },
          { value: 'anniversary', label: '到職週年（到職日起算一年）' },
        ],
      },
      {
        key: 'overtime.block_on_partial_leave_day',
        label: '請半日假當天不計加班',
        hint:
          '開啟後，員工當天已有部分時段請假時，該日加班不得申請或核准（建立、核准、批次核准、匯入都會擋下並說明原因）。'
          + '未設定＝關閉。',
        type: 'switch',
      },
      {
        key: 'year_end.exclude_maternity_months',
        label: '產假月份不計入年終到職月數',
        hint:
          '開啟後，某曆月內核准的產假達 15 日（含）以上，該月不計入年終到職月數，年終依比例減少。'
          + '⚠ 此口徑由業主於 2026-10-23 裁定，已知在性別平等工作法 §21（不得因產假給予不利處分）下有風險。'
          + '開啟後須重建年終結算才會生效。未設定＝關閉。',
        type: 'switch',
      },
      {
        key: 'festival.unsigned_cutoff_hire_date',
        label: '未簽約新人節慶截止日',
        hint:
          '到職日在此日（含）之後、且未填「自主成長簽約日」的員工，不具節慶獎金資格；'
          + '到職日早於此日者沿用舊規則。⚠ 設定前請先確認截止日後到職的員工都已補上簽約日，'
          + '否則會被排除在節慶獎金之外。未設定＝不啟用。',
        type: 'date',
      },
    ],
  },
  {
    title: '其他開關',
    hint: '與家長同意書流程、加班抵休制度相關的功能開關。',
    fields: [
      { key: 'consent.enforcement_enabled', label: '強制家長同意書流程', type: 'switch' },
      { key: 'leave.ot_offset_enabled', label: '加班抵休啟用', type: 'switch' },
    ],
  },
]

/**
 * 寫入需「超級管理員」的 key（內控開關＋安全邊界設定）。
 *
 * 與後端 `api/system_config.py::INTERNAL_CONTROL_CONFIG_KEYS`（安全稽核 F22）
 * 手動同步：這些 key 關掉／放寬＝削弱內控或把守衛打開，只有 SETTINGS_WRITE 的
 * 行政寫入會被後端 403。前端只用來把欄位改唯讀並提示，授權仍以後端為準。
 * `gov_subsidy.sod_mode` 目前不在本 tab 顯示，列入是為了日後任何畫面共用同一份清單。
 */
export const SUPER_ADMIN_ONLY_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'gov_subsidy.sod_mode',
  'consent.enforcement_enabled',
  'leave.ot_offset_enabled',
  'kiosk.allowed_ips',
  'auth.school_wifi_ips',
])

export const ALL_SYSTEM_CONFIG_FIELDS: SystemConfigFieldDef[] = SYSTEM_CONFIG_SECTIONS.flatMap(
  (section) => section.fields,
)
