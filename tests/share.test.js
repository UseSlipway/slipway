import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenLink, parseTokenParam, shareText } from '../src/ShareCard.jsx'

const token = '0xef8aad91c4292d469bd51f70835c8a6cb9c3f590'

test('token links round-trip through the dashboard query parameter', () => {
  const link = tokenLink('Robinhood Chain', token, 'https://tryslipway.com')
  assert.equal(link, `https://tryslipway.com/dashboard?token=rhc:${token}`)
  assert.deepEqual(parseTokenParam(new URL(link).searchParams.get('token')), { chain: 'rhc', token })
  assert.equal(tokenLink('Base', token, 'https://x.test'), `https://x.test/dashboard?token=base:${token}`)
})

test('malformed shared tokens are ignored', () => {
  assert.equal(parseTokenParam('solana:abc'), null)
  assert.equal(parseTokenParam(`rhc:${token}<script>`), null)
  assert.equal(parseTokenParam(null), null)
})

test('share text names the token and chain', () => {
  assert.match(shareText({ symbol: 'SLIP', name: 'Slipway', chain: 'Robinhood Chain', launched: true }), /^\$SLIP just launched on Slipway \(Robinhood Chain\)/)
  assert.match(shareText({ symbol: 'GMEC', chain: 'Robinhood Chain' }), /^\$GMEC on Robinhood Chain/)
})
