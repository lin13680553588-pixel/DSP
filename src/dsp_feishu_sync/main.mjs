import {
  REGIONS, REPORT_METRICS, businessKey, feishuPayload, parseDates, selectRows,
} from './core.mjs';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const required = (name) => {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`missing_required_environment_${name}`);
  return value;
};
const integer = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) throw new Error(`invalid_environment_${name}`);
  return value;
};
const redact = (value) => String(value ?? '')
  .replace(/Bearer\s+\S+/gi, 'Bearer <redacted>')
  // Login with Amazon tokens may begin with Atza| (access) or Atzr| (refresh).
  .replace(/Atz[A-Za-z0-9]*\|[A-Za-z0-9._~+/=-]+/g, '<redacted>')
  .replace(/https?:\/\/[^\s"']+/g, '<url>')
  .slice(0, 300);
const log = (event, details = {}) => console.log(JSON.stringify({ event, ...details }));

const config = {
  tokenEndpoint: required('AMAZON_TOKEN_ENDPOINT'),
  clientId: required('AMAZON_ADS_CLIENT_ID'),
  advertiserPattern: process.env.DSP_ADVERTISER_NAME_PATTERN || 'AutoFull',
  timeoutMs: integer('DSP_HTTP_TIMEOUT_MS', 30000),
  pollMs: integer('DSP_REPORT_POLL_MS', 5000),
  pollAttempts: integer('DSP_REPORT_POLL_ATTEMPTS', 36),
  feishuWriteDelayMs: integer('DSP_FEISHU_WRITE_DELAY_MS', 100),
};

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? config.timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* response error below is enough */ }
    if (!response.ok) throw new Error(`http_${response.status}`);
    return data;
  } catch (error) {
    throw new Error(redact(error?.message || error));
  } finally {
    clearTimeout(timer);
  }
}

function apiHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'Amazon-Advertising-API-ClientId': config.clientId,
    Accept: 'application/json',
    ...extra,
  };
}

async function getAccessToken() {
  const delays = [0, 15000, 45000];
  let error = 'token_missing';
  for (let index = 0; index < delays.length; index += 1) {
    if (delays[index]) await sleep(delays[index]);
    try {
      const body = await requestJson(config.tokenEndpoint, { headers: { Accept: 'application/json' } });
      const token = body?.access_token ?? body?.data?.access_token ?? body?.body?.access_token;
      if (typeof token === 'string' && token) {
        log('amazon_token_ready', { attempt: index + 1 });
        return token;
      }
      error = 'token_response_missing_access_token';
    } catch (caught) {
      error = redact(caught?.message || caught);
    }
    if (index < delays.length - 1) log('amazon_token_retry', { attempt: index + 1, error });
  }
  throw new Error(`token_unavailable_after_3_attempts_${error}`);
}

async function getAgencyAccountId(region, token) {
  const profiles = await requestJson(`${region.baseUrl}/v2/profiles`, { headers: apiHeaders(token) });
  const agencies = Array.isArray(profiles)
    ? profiles.filter((profile) => profile?.accountInfo?.type === 'agency')
    : [];
  if (agencies.length !== 1 || !agencies[0]?.accountInfo?.id) throw new Error(`${region.country}_agency_profile_count_${agencies.length}`);
  return agencies[0].accountInfo.id;
}

async function getLineItemReport(region, accountId, token, date) {
  const endpoint = `${region.baseUrl}/accounts/${encodeURIComponent(accountId)}/dsp/reports`;
  const created = await requestJson(endpoint, {
    method: 'POST',
    headers: apiHeaders(token, {
      Accept: 'application/vnd.dspcreatereports.v3+json', 'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      type: 'CAMPAIGN', dimensions: ['ORDER', 'LINE_ITEM'], metrics: REPORT_METRICS,
      startDate: date, endDate: date, timeUnit: 'DAILY', format: 'JSON',
    }),
  });
  if (!created?.reportId) throw new Error(`${region.country}_report_id_missing`);
  let metadata;
  for (let attempt = 0; attempt < config.pollAttempts; attempt += 1) {
    if (attempt) await sleep(config.pollMs);
    metadata = await requestJson(`${endpoint}/${encodeURIComponent(created.reportId)}`, {
      headers: apiHeaders(token, { Accept: 'application/vnd.dspgetreports.v3+json' }),
    });
    if (['SUCCESS', 'FAILURE', 'CANCELLED'].includes(metadata?.status)) break;
  }
  if (metadata?.status !== 'SUCCESS' || !metadata.location) throw new Error(`${region.country}_report_${metadata?.status || 'timeout'}`);
  return requestJson(metadata.location, { timeoutMs: 60000 });
}

async function writeToFeishu(rows) {
  const url = required('FEISHU_WEBHOOK_URL');
  const token = required('FEISHU_WEBHOOK_TOKEN');
  for (const row of rows) {
    const body = await requestJson(url, {
      method: 'POST', timeoutMs: 60000,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(feishuPayload(row)),
    });
    if (body?.code !== undefined && ![0, 800005652].includes(body.code)) {
      throw new Error(`feishu_rejected_code_${body.code}`);
    }
    await sleep(config.feishuWriteDelayMs);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const writeFeishu = argv.includes('--write-feishu');
  const dates = parseDates(argv);
  const token = await getAccessToken();
  const allRows = [];
  for (const date of dates) {
    for (const region of REGIONS) {
      const accountId = await getAgencyAccountId(region, token);
      const raw = await getLineItemReport(region, accountId, token, date);
      const result = selectRows(raw, region, date, config.advertiserPattern);
      allRows.push(...result.rows);
      log('region_complete', {
        date, country: region.country, rows: result.rows.length,
        zero_traffic_rows_skipped: result.zeroTrafficRowsSkipped,
      });
    }
  }
  allRows.sort((left, right) => businessKey(left).localeCompare(businessKey(right)));
  if (!allRows.length) throw new Error('no_matching_nonzero_traffic_rows');
  if (writeFeishu) await writeToFeishu(allRows);
  log('run_complete', { dates, rows: allRows.length, feishu_written: writeFeishu });
}

main().catch((error) => {
  log('run_failed', { error: redact(error?.message || error) });
  process.exitCode = 1;
});
