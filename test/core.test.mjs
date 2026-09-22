import assert from 'node:assert/strict';
import test from 'node:test';
import { REGIONS, businessKey, feishuPayload, parseDates, selectRows } from '../src/dsp_feishu_sync/core.mjs';

test('manual date range is inclusive', () => {
  assert.deepEqual(parseDates(['--start-date', '2026-09-18', '--end-date', '2026-09-20']), [
    '2026-09-18', '2026-09-19', '2026-09-20',
  ]);
});

test('default dates are the three complete Shanghai dates', () => {
  assert.deepEqual(parseDates([], new Date('2026-09-21T03:00:00Z')), [
    '2026-09-20', '2026-09-19', '2026-09-18',
  ]);
});

test('keeps line-item rows, converts German currency, and skips zero traffic', () => {
  const source = [
    { date: '2026-09-20', advertiserName: 'AutoFull DE', orderName: 'Order A', lineItemName: 'Line A', impressions: 20, clickThroughs: 2, totalCost: 10, dpv14d: 3, atc14d: 1, purchases14d: 1, newToBrandPurchases14d: 1, unitsSold14d: 2, sales14d: 40 },
    { date: '2026-09-20', advertiserName: 'AutoFull DE', orderName: 'Order B', lineItemName: 'Line B', impressions: 0, clickThroughs: 0, totalCost: 0, dpv14d: 0, atc14d: 0, purchases14d: 0, newToBrandPurchases14d: 0, unitsSold14d: 0, sales14d: 0 },
  ];
  const result = selectRows(source, REGIONS[1], '2026-09-20', 'AutoFull');
  assert.equal(result.rows.length, 1);
  assert.equal(result.zeroTrafficRowsSkipped, 1);
  assert.equal(result.rows[0].spendUsd, 11.5);
  assert.equal(result.rows[0].salesUsd, 46);
  assert.equal(businessKey(result.rows[0]), '2026-09-20\u0000德国\u0000Order A\u0000Line A');
  assert.equal(feishuPayload(result.rows[0]).ad_group_name, 'Line A');
});

test('rejects duplicate business keys', () => {
  const row = { date: '2026-09-20', advertiserName: 'AutoFull', orderName: 'Order A', lineItemName: 'Line A', impressions: 1, clickThroughs: 0, totalCost: 1, dpv14d: 0, atc14d: 0, purchases14d: 0, newToBrandPurchases14d: 0, unitsSold14d: 0, sales14d: 0 };
  assert.throws(() => selectRows([row, row], REGIONS[0], '2026-09-20', 'AutoFull'), /duplicate_business_key/);
});
