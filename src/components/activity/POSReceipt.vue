<template>
  <div id="pos-receipt-print" v-if="receipt">
    <div class="r-header">
      <div class="r-title">{{ org.name }}</div>
      <div class="r-sub">
        {{ isRefund ? '退費收據' : org.subtitle }}
        <span v-if="receipt.is_reprint" class="r-reprint">（補印）</span>
      </div>
    </div>

    <div class="r-meta">
      <div>編號：{{ receipt.receipt_no }}</div>
      <div>時間：{{ receipt.created_at }}</div>
      <div>方式：{{ receipt.payment_method }}</div>
      <div v-if="receipt.operator">經手：{{ receipt.operator }}</div>
    </div>

    <div class="r-line" />

    <div
      v-for="item in receipt.items || []"
      :key="item.registration_id"
      class="r-item"
    >
      <div class="r-student">
        {{ item.student_name }}
        <span class="r-student-class">{{ item.class_name }}</span>
      </div>
      <table class="r-lines">
        <tbody>
          <tr v-for="(c, i) in item.courses || []" :key="`c-${i}`">
            <td class="r-name">{{ c.name }}</td>
            <td class="r-amt">{{ fmt(c.price) }}</td>
          </tr>
          <tr v-for="(s, i) in item.supplies || []" :key="`s-${i}`">
            <td class="r-name">{{ s.name }}</td>
            <td class="r-amt">{{ fmt(s.price) }}</td>
          </tr>
          <tr class="r-applied">
            <td class="r-name">{{ isRefund ? '本次退費' : '本次收取' }}</td>
            <td class="r-amt">{{ fmt(item.amount_applied) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="r-line" />

    <div class="r-row r-total">
      <span>{{ isRefund ? '退款合計' : '應收合計' }}</span>
      <span>{{ fmt(receipt.total) }}</span>
    </div>
    <div class="r-row r-chinese">
      <span></span>
      <span>{{ toChineseAmount(receipt.total) }}</span>
    </div>
    <div v-if="receipt.tendered != null" class="r-row">
      <span>實收</span><span>{{ fmt(receipt.tendered) }}</span>
    </div>
    <div v-if="receipt.change != null" class="r-row">
      <span>找零</span><span>{{ fmt(receipt.change) }}</span>
    </div>
    <div v-if="receipt.notes" class="r-notes">備註：{{ receipt.notes }}</div>

    <div class="r-footer">
      <div>{{ isRefund ? '—— 已辦理退費 ——' : '—— 謝謝惠顧 ——' }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { POS_ORG_INFO, toChineseAmount } from '@/constants/pos'

const props = defineProps({
  receipt: { type: Object, default: null },
})

const org = POS_ORG_INFO
const isRefund = computed(() => props.receipt?.type === 'refund')
const fmt = (n) => {
  if (n == null) return ''
  return `$${Number(n).toLocaleString('zh-Hant')}`
}
</script>

<style>
/* ⚠️ 非 scoped：列印區塊需在全域可見，供 @media print 覆蓋其他元素 */
#pos-receipt-print {
  display: none;
}

@media print {
  @page {
    size: 80mm auto;
    margin: 0;
  }

  body * {
    visibility: hidden;
  }

  #pos-receipt-print,
  #pos-receipt-print * {
    visibility: visible;
  }

  #pos-receipt-print {
    display: block !important;
    position: absolute;
    left: 0;
    top: 0;
    width: 72mm;
    padding: 4mm;
    font-family: 'PingFang TC', 'Noto Sans TC', 'Heiti TC', monospace;
    font-size: 11pt;
    color: #000;
    line-height: 1.4;
    background: #fff;
  }

  #pos-receipt-print .r-header {
    text-align: center;
    margin-bottom: 3mm;
  }
  #pos-receipt-print .r-title {
    font-size: 14pt;
    font-weight: 700;
  }
  #pos-receipt-print .r-sub {
    font-size: 10pt;
    margin-top: 1mm;
  }

  #pos-receipt-print .r-meta {
    font-size: 10pt;
    line-height: 1.5;
  }
  #pos-receipt-print .r-meta > div {
    display: block;
  }

  #pos-receipt-print .r-line {
    border-top: 1px dashed #000;
    margin: 2mm 0;
  }

  #pos-receipt-print .r-item {
    margin-bottom: 2mm;
  }

  #pos-receipt-print .r-student {
    font-weight: 700;
    font-size: 11pt;
    margin-bottom: 1mm;
  }

  #pos-receipt-print .r-student-class {
    font-weight: 400;
    font-size: 10pt;
    margin-left: 2mm;
  }

  #pos-receipt-print .r-lines {
    width: 100%;
    border-collapse: collapse;
  }

  #pos-receipt-print .r-lines td {
    padding: 0.5mm 0;
    vertical-align: top;
    font-size: 11pt;
  }

  #pos-receipt-print .r-name {
    word-break: break-all;
  }

  #pos-receipt-print .r-amt {
    text-align: right;
    white-space: nowrap;
    min-width: 18mm;
  }

  #pos-receipt-print .r-applied td {
    border-top: 1px dotted #000;
    padding-top: 1mm;
    font-weight: 600;
  }

  #pos-receipt-print .r-row {
    display: flex;
    justify-content: space-between;
    font-size: 11pt;
    padding: 0.5mm 0;
  }

  #pos-receipt-print .r-total {
    font-weight: 700;
    font-size: 12pt;
  }

  #pos-receipt-print .r-chinese {
    font-size: 10pt;
    color: #000;
    margin-top: -0.5mm;
    padding-bottom: 1mm;
  }

  #pos-receipt-print .r-reprint {
    font-size: 9pt;
    margin-left: 2mm;
    color: #555;
  }

  #pos-receipt-print .r-notes {
    margin-top: 2mm;
    font-size: 10pt;
    word-break: break-all;
  }

  #pos-receipt-print .r-footer {
    margin-top: 4mm;
    text-align: center;
    font-size: 10pt;
  }
}
</style>
