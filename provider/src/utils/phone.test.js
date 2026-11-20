import test from 'node:test'
import assert from 'node:assert/strict'
import { safeTelHref } from './phone.js'

test('normalizes valid phone numbers for tel links', () => {
  assert.equal(safeTelHref('+65 8123 4567'), 'tel:+6581234567')
  assert.equal(safeTelHref('(8123) 4567'), 'tel:81234567')
})

test('rejects invalid or unsafe phone values', () => {
  assert.equal(safeTelHref('call me at 81234567'), null)
  assert.equal(safeTelHref('javascript:alert(1)'), null)
  assert.equal(safeTelHref('+123'), null)
  assert.equal(safeTelHref(''), null)
})
