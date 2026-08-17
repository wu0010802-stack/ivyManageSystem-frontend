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
 */

export type SystemConfigFieldType = 'text' | 'switch'

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
      '控制哪些來源 IP 可以使用 Kiosk 打卡機、或視為「校內 WiFi」允許登入。' +
      '⚠ 這兩項若未設定，對應功能會直接全部擋下（fail-closed），新租戶請務必填寫。',
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
        hint: '逗號分隔 IP 或 CIDR，例：127.0.0.1/32,192.168.0.0/16。⚠ 未設定時 kiosk 打卡會全部擋下（fail-closed）',
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
    title: '其他開關',
    hint: '與家長同意書流程、加班抵休制度相關的功能開關。',
    fields: [
      { key: 'consent.enforcement_enabled', label: '強制家長同意書流程', type: 'switch' },
      { key: 'leave.ot_offset_enabled', label: '加班抵休啟用', type: 'switch' },
    ],
  },
]

export const ALL_SYSTEM_CONFIG_FIELDS: SystemConfigFieldDef[] = SYSTEM_CONFIG_SECTIONS.flatMap(
  (section) => section.fields,
)
