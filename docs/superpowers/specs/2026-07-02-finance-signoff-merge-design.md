# 收支簽收整合設計（廠商付款簽收 × 雜項收款簽收 合併為單一頁面）

- 日期：2026-07-02
- 範圍：**純前端**（ivy-frontend）。後端 API、資料表、權限碼、報表聚合零改動，不需跑 OpenAPI codegen。
- 目標：把側欄「園務行政」下的「廠商付款簽收」與「雜項收款簽收」兩個入口合併為單一頁面「收支簽收」，頁內以 tab 切換；同時收斂兩頁近乎複製貼上的重複碼（正規化後兩 view 約 1100 行僅差 94 行、兩個簽名 dialog diff 為 0）。

## 背景（盤點結論）

兩模組為鏡像孿生（後端結構相似度 92%）：

| 面向 | 廠商付款（支出側） | 雜項收款（收入側） |
|------|------------------|------------------|
| api 模組 | `src/api/vendorPayment.ts` | `src/api/miscReceipt.ts` |
| 頁面 | `VendorPaymentView.vue`（1076 行） | `MiscReceiptView.vue`（1118 行，CSS class 沿用 `vp-` 前綴） |
| 簽名 dialog | `VendorPaymentSignDialog.vue` | `MiscReceiptSignDialog.vue`（正規化後 diff=0） |
| 對象欄 | `vendor_name`（廠商名稱） | `payer_name`（繳款方） |
| 日期欄 | `payment_date`（付款日期） | `receipt_date`（收款日期） |
| 單據欄 | `invoice_number`（發票號碼） | `receipt_number`（收據號碼） |
| 類別欄 | 無 | `category` 必填（場租/捐款/補助/二手義賣/退費回收/其他） |
| 權限 | `VENDOR_PAYMENT_READ/WRITE` | `MISC_RECEIPT_READ/WRITE` |

既有不對稱（本次一併修正的前端部分）：
- `AuditLogView` ENTITY_ROUTES 只映射 `vendor_payment` 深連結，`misc_receipt` 缺映射（雜項頁其實支援 `?highlight`）。
- `MonthlyPnLPanel` 的「去登錄」連結只指廠商付款頁。
- 測試不對稱：廠商付款有 11 案例 view spec，雜項收款只有 3 案例 api helper spec。

不在本次範圍：後端月損益表（monthly-pnl）未納入雜項收款屬報表口徑問題，如要納入另開任務。

## 1. 資訊架構（路由、側欄、權限）

- 新路由 `/finance-signoffs`（name: `finance-signoffs`，meta.title「收支簽收」），query：
  - `?tab=vendor|misc`：控制頁內分頁；無效值或缺省時 fallback 至第一個有權限的 tab。
  - `?highlight=<id>`：沿用既有深連結行為（自動開啟該筆編輯/明細）。
- 側欄 `AdminSidebar`「園務行政」分組：兩個 menu item 合併為一項「收支簽收」（icon 沿用 Money），顯示條件 = `VENDOR_PAYMENT_READ` 或 `MISC_RECEIPT_READ` 任一；`hasVisibleAdminItems` 同步調整。
- 舊路由不刪、改 redirect（保住書籤與稽核深連結），query 原樣帶過：
  - `/vendor-payments` → `/finance-signoffs?tab=vendor`
  - `/misc-receipts` → `/finance-signoffs?tab=misc`
- `ROUTE_PERMISSION_RULES`（`src/constants/permissions.ts`，default-deny）：新增 `/finance-signoffs` → `VENDOR_PAYMENT_READ` 或 `MISC_RECEIPT_READ` 任一即可。若現行規則結構只支援單一權限碼，擴充為支援 anyOf（`canAccessRoute` / `src/utils/auth.ts` 同步）。舊 `/vendor-payments`、`/misc-receipts` 兩條規則移除——vue-router 的 redirect 發生在導航解析階段，全域 beforeEach 收到的 `to` 已是新路由，舊規則不會再被匹配。
- 權限行為：
  - 兩個 READ 都有 → 顯示兩個 tab。
  - 只有一邊 READ → 只渲染該面板，不顯示另一個 tab（單 tab 時可隱藏 tab bar）。
  - 都沒有 → 路由守衛擋下（default-deny 既有機制）。
  - WRITE 依 tab 各自控制 mutation UI（新增/編輯/刪除/簽收/附件），沿現行 `canWrite` 行為。

## 2. 元件架構（config 驅動）

```
src/views/FinanceSignoffView.vue        ← tab 容器（薄）：讀權限決定可見 tab、雙向同步 ?tab query
src/components/signoff/
  ├ SignoffPanel.vue                    ← 完整面板：KPI 卡×3、篩選列、狀態分段、列表、分頁、表單 dialog
  └ SignoffSignDialog.vue               ← 簽名板 dialog（兩個舊 dialog diff=0 直接合一：照片上傳 tab + canvas 手寫 tab）
src/config/signoffModules.ts            ← 兩份模組設定（vendor / misc）
```

### config 形狀（TypeScript interface）

```ts
interface SignoffModuleConfig {
  key: 'vendor' | 'misc'
  tabLabel: string                       // '廠商付款' / '雜項收款'
  api: {                                 // 綁定 vendorPayment.ts / miscReceipt.ts 的函式
    list; summary; get; create; update; remove; sign;
    uploadAttachment; deleteAttachment; attachmentDownloadUrl; signatureUrl
  }
  fields: {                              // 鏡像欄位映射（後端欄位名 + 顯示標籤 + placeholder）
    partyName: { key: 'vendor_name' | 'payer_name'; label: string }
    date:      { key: 'payment_date' | 'receipt_date'; label: string }
    docNumber: { key: 'invoice_number' | 'receipt_number'; label: string }
  }
  category?: {                           // 僅 misc 有；面板內 v-if 控制篩選 select、表格欄、表單必填
    options: ReadonlyArray<{ value: string; label: string }>
    label: string
  }
  permissions: { read: PermissionName; write: PermissionName }
  texts: Record<string, string>          // 兩模組相異的所有文案（簽收 dialog 標題「廠商簽收/繳款方簽收」、
                                         // 新增按鈕、表單分區標題、空狀態、刪除確認語等）。
                                         // key 清單於實作時以兩舊頁正規化 diff 的 94 行窮舉為準，
                                         // 規則：共用元件內不得殘留任何 vendor/misc 特定硬編字樣。
}
```

- 實作基底：以較成熟且有測試鎖行為的 `VendorPaymentView` 改造為 `SignoffPanel`，vendor 特定字樣全部換成 config 引用；雜項的「類別」以 `v-if="config.category"` 插入篩選、表格欄、表單（必填）與 payload。
- `PAYMENT_METHOD_OPTIONS` / `paymentMethodLabel` / Summary 介面目前在兩個 api 檔重複定義 → 抽至共用常數檔（如 `src/constants/paymentMethods.ts`），兩 api 模組改為 re-export（呼叫端 import 路徑不強制改）。
- api 模組本身保留不合併（後端兩組端點不動）；型別維持現況（`unknown` 參數屬既有 TODO，非本次範圍，但新寫的 config/元件碼遵守 TS-only 與 no-any 規範）。

## 3. 行為細節

- 切 tab = `SignoffPanel` 以 `:key="config.key"` 重掛載；兩 tab 的篩選、分頁、KPI 狀態互相獨立（與現在兩頁分開的行為一致）。
- KPI 與列表拉條分離的既有行為不變：summary 吃日期/名稱/方式/(類別) 篩選但刻意不吃 status；切狀態分段只刷列表不刷 KPI（既有測試鎖此行為，遷移後保留）。
- 簽收流程不變：pending 列出現「簽收」→ `SignoffSignDialog`（照片上傳為主 tab、canvas 手寫為次 tab、compressImageToDataUrl 壓縮）→ POST /sign → emit signed → 面板 refresh。已簽收列僅可看明細與簽名圖，無退簽 UI。
- 日期防呆沿用：`disabledFutureDate` 擋未來日，90 天回補由後端權威把關。
- 深連結：
  - `?highlight=<id>` 邏輯移入 `SignoffPanel`（props 傳入），行為同現行。
  - `AuditLogView` ENTITY_ROUTES：`vendor_payment` → `/finance-signoffs?tab=vendor&highlight=<id>`；**新增** `misc_receipt` → `/finance-signoffs?tab=misc&highlight=<id>`（補既有缺口）。
  - `MonthlyPnLPanel` 的「去登錄」router-link 改指 `/finance-signoffs?tab=vendor`。
- 行動版：維持現有 `@media (max-width: 640px)` 微調，樣式隨改造搬進 `SignoffPanel`（CSS class 前綴統一改為 `so-` 或類似，順手修掉雜項頁沿用 `vp-` 的語意混淆）。
- 錯誤處理：沿用 axios wrapper 的 displayMessage 攔截行為，無新增錯誤面。

## 4. 測試與遷移

- 測試遷移：`VendorPaymentView.spec.js` 的 11 個案例遷移為 `SignoffPanel` 測試並以 config 參數化——vendor / misc 兩份 config 都跑核心案例（載入列表/KPI、status 只刷列表、無 WRITE 隱藏按鈕、刪除確認、建立表單重置、未來日、收付方式 label；misc 另補「類別」欄/必填/篩選案例）。雜項側從此獲得原本缺失的 view 級覆蓋。
- 新增測試：
  - `SignoffSignDialog` 元件測試（tab 切換、canvas/照片模式、submit payload 形狀）。
  - `FinanceSignoffView` tab 權限顯示測試（雙權限雙 tab／單權限單面板／query tab 同步）。
  - 舊路由 redirect 測試（含 query 透傳；注意 vue-router 4 `router.resolve()` 不追蹤 redirect，需以實際 navigation 斷言）。
  - `AdminSidebar` 測試更新（合併後單一入口、任一 READ 顯示）；`AuditLogView` 深連結映射測試；`MonthlyPnLPanel` 連結文案測試更新。
- 刪除（遷移完成後）：`VendorPaymentView.vue`、`MiscReceiptView.vue`、`VendorPaymentSignDialog.vue`、`MiscReceiptSignDialog.vue`、`VendorPaymentView.spec.js`（案例遷移後）——淨減約 1400+ 行重複碼。
- 完成 gate：前端**全部測試樹**（`src/**/__tests__` 與 `tests/unit` 等）+ typecheck + lint 全綠；`start.sh` 起兩端實點一次（兩 tab 各建一筆 → 簽收 → 驗證守衛與深連結）。
