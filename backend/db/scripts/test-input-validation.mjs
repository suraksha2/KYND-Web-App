import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

process.env.NODE_ENV = 'production';
process.env.ALLOWED_ORIGINS = 'https://shop.example.com';

const require = createRequire(import.meta.url);
const { normalizePhoneToE164 } = require('../dist/lib/phone');
const { validateImageUpload } = require('../dist/lib/imageUpload');
const {
  isSupportedBookingPayment,
  newBookingReference,
  normalizeBookingContact,
  parseIsoDateTime,
} = require('../dist/lib/bookingInput');
const { isAllowedBookingStatusTransition } = require('../dist/lib/bookingStatus');
const { validatePaymentReturnUrl } = require('../dist/lib/paymentReturnUrl');

test('normalizes only valid Singapore or explicit E.164 phone numbers', () => {
  assert.equal(normalizePhoneToE164('8123 4567'), '+6581234567');
  assert.equal(normalizePhoneToE164('65 9123 4567'), '+6591234567');
  assert.equal(normalizePhoneToE164('+1 (415) 555-2671'), '+14155552671');
  assert.equal(normalizePhoneToE164('9910483315'), null);
  assert.equal(normalizePhoneToE164('+6561234567'), null);
});

test('requires file signatures to match both MIME type and extension', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual(validateImageUpload(png, 'image/png', 'photo.png'), {
    mime: 'image/png',
    extension: '.png',
  });
  assert.equal(validateImageUpload(png, 'image/jpeg', 'photo.jpg'), null);
  assert.equal(validateImageUpload(png, 'image/png', 'photo.jpg'), null);
});

test('parses zoned future-date inputs strictly and generates secure references', () => {
  assert.ok(parseIsoDateTime('2027-02-28T14:30:00+08:00'));
  assert.equal(parseIsoDateTime('2027-02-30T14:30:00+08:00'), null);
  assert.equal(parseIsoDateTime('2027-02-28T14:30:00'), null);
  assert.equal(parseIsoDateTime(1800000000000), null);
  assert.match(newBookingReference(), /^KYND-[A-F0-9]{32}$/);
});

test('normalizes and validates booking contact details before charging or creating a booking', () => {
  const contact = {
    name: ' Customer ',
    phone: '8123 4567',
    address: ' 1 Main Street ',
    city: ' Singapore ',
    area: ' Central ',
    pincode: '123456',
  };
  assert.deepEqual(normalizeBookingContact(contact), {
    name: 'Customer',
    phone: '+6581234567',
    address: '1 Main Street',
    city: 'Singapore',
    area: 'Central',
    pincode: '123456',
  });
  assert.equal(normalizeBookingContact({ ...contact, phone: '9910483315' }), null);
});

test('booking creation only supports payment methods the server can honor', () => {
  assert.equal(isSupportedBookingPayment('card'), true);
  assert.equal(isSupportedBookingPayment('cod'), true);
  assert.equal(isSupportedBookingPayment('wallet'), false);
  assert.equal(isSupportedBookingPayment('paynow'), false);
  assert.equal(isSupportedBookingPayment('upi'), false);
});

test('allows only forward booking status transitions', () => {
  assert.equal(isAllowedBookingStatusTransition('upcoming', 'cancelled'), true);
  assert.equal(isAllowedBookingStatusTransition('upcoming', 'completed'), true);
  assert.equal(isAllowedBookingStatusTransition('completed', 'upcoming'), false);
  assert.equal(isAllowedBookingStatusTransition('cancelled', 'completed'), false);
});

test('restricts payment returns to the configured HTTPS confirmation route', () => {
  assert.equal(
    validatePaymentReturnUrl('https://shop.example.com/booking/confirmed'),
    'https://shop.example.com/booking/confirmed'
  );
  assert.equal(validatePaymentReturnUrl('https://attacker.example/booking/confirmed'), null);
  assert.equal(validatePaymentReturnUrl('http://shop.example.com/booking/confirmed'), null);
  assert.equal(validatePaymentReturnUrl('https://shop.example.com/elsewhere'), null);
  assert.equal(
    validatePaymentReturnUrl('https://shop.example.com/booking/confirmed?next=https://attacker.example'),
    null
  );
});
