import assert from 'node:assert/strict';
import {
  publicCatalogAddonDto,
  publicCatalogServiceDto,
  publicQuoteDto,
} from '../src/lib/publicCatalog.ts';

const service = publicCatalogServiceDto({
  id: 7,
  name: 'Home Cleaning',
  default_partner_cost: 40,
  markup_pct_override: 25,
  pricing_strategy: 'hourly',
  pricing_params: { rate: 40 },
  category: 'Cleaning',
  subcategory_home_sizes: [{ id: 'studio', price: 80 }],
}, 50);

assert.deepEqual(service, {
  id: 7,
  name: 'Home Cleaning',
  category: 'Cleaning',
  subcategory_home_sizes: [{ id: 'studio', price: 80 }],
  customer_price: 50,
});
assert.equal('default_partner_cost' in service, false);
assert.equal('markup_pct_override' in service, false);
assert.equal('pricing_params' in service, false);

const addon = publicCatalogAddonDto({
  id: 3,
  name: 'Oven cleaning',
  customer_price: 25,
  partner_cost: 10,
  markup_pct_override: 150,
});
assert.deepEqual(addon, { id: 3, name: 'Oven cleaning', customer_price: 25 });

const quote = publicQuoteDto({
  serviceId: 7,
  customerPrice: 75,
  duration: 2,
  partySize: 1,
  startTime: '09:00',
  addons: [{ id: 3, name: 'Oven cleaning', customerPrice: 25 }],
});
assert.deepEqual(quote, {
  service_id: 7,
  customer_price: 75,
  duration_hours: 2,
  party_size: 1,
  start_time: '09:00',
  addons: [{ id: 3, name: 'Oven cleaning', customer_price: 25 }],
});
assert.equal('cost' in quote, false);
assert.equal('markup_pct' in quote, false);
assert.equal('sell' in quote, false);

console.log('Public catalogue DTO checks passed.');
