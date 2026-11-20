import test from 'node:test'
import assert from 'node:assert/strict'
import { formatSgd } from './bookings.js'

test('formats booking totals as Singapore dollars', () => {
  assert.equal(formatSgd(1234.5), 'S$1,234.50')
  assert.equal(formatSgd('invalid'), 'S$0.00')
})
