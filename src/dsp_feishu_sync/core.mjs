export const REGIONS = [
  { country: '美国', currency: 'USD', usdRate: 1, baseUrl: 'https://advertising-api.amazon.com' },
  { country: '德国', currency: 'EUR', usdRate: 1.15, baseUrl: 'https://advertising-api-eu.amazon.com' },
];

export const REPORT_METRICS = [
  'impressions', 'clickThroughs', 'totalCost', 'dpv14d', 'atc14d',
  'purchases14d', 'newToBrandPurchases14d', 'unitsSold14d', 'sales14d',
];

export const TABLE_FIELDS = [
  '日期', '国家', 'Campaign name', 'Ad group name', '曝光量', 'DPV', '点击量',
  '花费 USD', '销量', '销售额 USD', '订单量', '新客订单', '加购',
];

export function number(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('invalid_numeric_metric');
  return parsed;
}

export function safeText(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

export function reportDate(value) {
  const text = String(value ?? '');
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  throw new Error('report_row_date_missing_or_invalid');
}

export function businessKey(row) {
  return [row.date, row.country, row.campaign, row.adGroup].join('\u0000');
}

export function parseDates(argv, now = new Date()) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index < 0 ? '' : String(argv[index + 1] ?? '');
  };
  const date = valueAfter('--date');
  const start = valueAfter('--start-date');
  const end = valueAfter('--end-date');
  if (date && (start || end)) throw new Error('choose_date_or_date_range');
  const first = date || start;
  const last = date || end || start;
  const valid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (first && !valid(first)) throw new Error('invalid_start_date');
  if (last && !valid(last)) throw new Error('invalid_end_date');
  if (first && last < first) throw new Error('end_date_before_start_date');
  if (first) {
    const out = [];
    for (let day = new Date(`${first}T00:00:00Z`); day <= new Date(`${last}T00:00:00Z`); day = new Date(day.getTime() + 86400000)) {
      out.push(day.toISOString().slice(0, 10));
    }
    return out;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type) => Number(parts.find((entry) => entry.type === type).value);
  const today = Date.UTC(part('year'), part('month') - 1, part('day'));
  return [1, 2, 3].map((offset) => new Date(today - offset * 86400000).toISOString().slice(0, 10));
}

export function selectRows(rawRows, region, date, advertiserPattern) {
  if (!Array.isArray(rawRows)) throw new Error(`${region.country}_report_payload_not_array`);
  let matcher;
  try { matcher = new RegExp(advertiserPattern, 'i'); } catch { throw new Error('invalid_DSP_ADVERTISER_NAME_PATTERN'); }
  const names = [...new Set(rawRows.map((row) => safeText(row?.advertiserName)).filter((name) => matcher.test(name)))];
  if (names.length !== 1) throw new Error(`${region.country}_advertiser_match_count_${names.length}`);
  const selected = [];
  const seen = new Set();
  let zeroTrafficRowsSkipped = 0;
  for (const source of rawRows.filter((row) => safeText(row?.advertiserName) === names[0])) {
    if (reportDate(source.date ?? source.reportDate) !== date) throw new Error(`${region.country}_report_date_mismatch`);
    const campaign = safeText(source.orderName);
    const adGroup = safeText(source.lineItemName);
    if (!campaign || !adGroup) throw new Error(`${region.country}_order_or_line_item_missing`);
    const impressions = number(source.impressions);
    const localSpend = number(source.totalCost);
    if (impressions === 0 && localSpend === 0) {
      zeroTrafficRowsSkipped += 1;
      continue;
    }
    const row = {
      date, country: region.country, campaign, adGroup, impressions,
      dpv: number(source.dpv14d), clicks: number(source.clickThroughs),
      spendUsd: Number((localSpend * region.usdRate).toFixed(2)),
      unitsSold: number(source.unitsSold14d),
      salesUsd: Number((number(source.sales14d) * region.usdRate).toFixed(2)),
      purchases: number(source.purchases14d),
      newToBrand_purchases: number(source.newToBrandPurchases14d),
      atc: number(source.atc14d),
    };
    if (row.clicks > row.impressions) throw new Error(`${region.country}_clicks_gt_impressions`);
    const key = businessKey(row);
    if (seen.has(key)) throw new Error(`${region.country}_duplicate_business_key`);
    seen.add(key);
    selected.push(row);
  }
  return { rows: selected, zeroTrafficRowsSkipped };
}

export function feishuPayload(row) {
  return {
    report_date: row.date,
    country: row.country,
    campaign_name: row.campaign,
    ad_group_name: row.adGroup,
    impressions: row.impressions,
    dpv: row.dpv,
    clicks: row.clicks,
    spend_usd: row.spendUsd,
    units_sold: row.unitsSold,
    sales_usd: row.salesUsd,
    purchases: row.purchases,
    new_to_brand_purchases: row.newToBrand_purchases,
    atc: row.atc,
    business_key: businessKey(row),
  };
}
