import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { priceOrder } = require('../dist/lib/pricing');

function pricingDb(serviceOverrides = {}) {
  const service = {
    id: 1,
    name: 'Test service',
    duration: '1 hour',
    default_partner_cost: null,
    markup_pct_override: 0,
    status: 'live',
    ...serviceOverrides,
  };
  return {
    async query(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('FROM catalog_services')) return [[service], []];
      if (normalized.includes('FROM service_pricing_rules')) {
        return [[{ service_id: 1, strategy: 'flat', params: { amount: 100 } }], []];
      }
      throw new Error(`Unexpected pricing query: ${normalized}`);
    },
  };
}

async function quote({ recurrence, service, item = {}, schedule = 'recurring', scheduledAt = null }) {
  return priceOrder({
    items: [{ catalogId: 1, ...item }],
    schedule,
    recurrence,
    scheduledAt,
  }, pricingDb(service));
}

test('house-cleaning plan claims match final recurring quote for every day-count tier', async () => {
  const cleaning = { name: 'One-Time Cleaning 2 hr', category_name: 'Cleaning', booking_behavior: 'house_cleaning' };
  const cases = [
    ['weekly', [1], 85],
    ['weekly', [1, 2], 80],
    ['biweekly', [1, 2, 3], 90],
    ['weekdays', [1, 2, 3, 4, 5], 75],
    ['weekdays', [1, 2], 80],
    ['daily', [0, 1, 2, 3, 4, 5, 6], 70],
    ['daily', [1, 2, 3, 4, 5], 75],
    ['daily', [1], 85],
  ];

  for (const [plan, days, expected] of cases) {
    const result = await quote({
      service: cleaning,
      recurrence: { type: 'preset', value: plan === 'biweekly' ? 'biweekly' : 'weekly', plan, days },
    });
    assert.equal(result.total, expected, `${plan} with ${days.length} selected days`);
  }
});

test('wellness session card discounts match final quote for each cadence', async () => {
  const wellness = { category_name: 'Wellness @ Home', booking_behavior: 'wellness_session' };
  const cases = [
    ['fourweekly', 95],
    ['biweekly', 90],
    ['weekly', 85],
  ];
  for (const [value, expected] of cases) {
    const result = await quote({
      service: wellness,
      recurrence: { type: 'preset', value },
    });
    assert.equal(result.total, expected, `${value} wellness cadence`);
  }

  const oneTime = await quote({
    service: wellness,
    schedule: 'scheduled',
    recurrence: null,
  });
  assert.equal(oneTime.total, 100);
});

test('generic recurring presets and custom frequencies retain the advertised 15% rate', async () => {
  for (const recurrence of [
    { type: 'preset', value: 'weekly' },
    { type: 'preset', value: 'biweekly' },
    { type: 'preset', value: 'daily' },
    { type: 'custom', times: 3, unit: 'week' },
  ]) {
    const result = await quote({ service: { category_name: 'Beauty Services' }, recurrence });
    assert.equal(result.total, 85, `${recurrence.value || 'custom'} recurring quote`);
  }
});

test('office cleaning contract plan cards match per-visit server quotes', async () => {
  const office = {
    category_name: 'Office Cleaning',
    booking_behavior: 'office_cleaning',
    office_pricing: {
      sizes: [{ id: '1-2k', threeWeek: 450, daily: 550 }],
    },
  };
  const cases = [
    ['threeWeek', [1, 2, 3], 35],
    ['threeWeek', [1, 2], 52],
    ['daily', [1, 2, 3, 4, 5], 25],
    ['daily', [1, 2, 3, 4, 5], 51, 2],
    ['daily', [1, 2], 63],
  ];

  for (const [plan, days, expected, cleaners = 1] of cases) {
    const result = await quote({
      service: office,
      item: { officeSize: '1-2k', qty: cleaners },
      recurrence: { type: 'preset', value: 'weekly', plan, days },
    });
    assert.equal(result.total, expected, `${plan} with ${days.length} selected days`);
  }
});
