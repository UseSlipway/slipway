import test from 'node:test'
import assert from 'node:assert/strict'
import { safeLink } from '../src/CreatorProfile.jsx'
import { saveCreatorProfile, getCreatorProfile } from '../src/api.js'

test('only https links on the expected hosts are rendered', () => {
  assert.equal(safeLink('https://x.com/slipwaytech', 'x'), 'https://x.com/slipwaytech')
  assert.equal(safeLink('https://twitter.com/slipwaytech', 'x'), 'https://twitter.com/slipwaytech')
  assert.equal(safeLink('https://evil.example/x.com', 'x'), null)
  assert.equal(safeLink('http://t.me/slipway', 'telegram'), null)
  assert.equal(safeLink('javascript:alert(1)', 'website'), null)
  assert.equal(safeLink('https://tryslipway.com', 'website'), 'https://tryslipway.com/')
})

test('saving a profile needs a session and sends it as a bearer token', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let sent
  globalThis.fetch = async (url, init) => { sent = { url: new URL(String(url)), init }; return new Response(JSON.stringify({ profile: { verified: true } }), { status: 200 }) }
  const token = '0x' + 'a'.repeat(40), session = 'b'.repeat(64)
  await assert.rejects(saveCreatorProfile('https://service.example', '', { chain: 'rhc', token }), /sign in with the creator wallet/)
  await saveCreatorProfile('https://service.example', session, { chain: 'rhc', token, description: 'hi' })
  assert.equal(sent.url.pathname, '/v1/creators/profile')
  assert.equal(sent.init.method, 'PUT')
  assert.equal(sent.init.headers.Authorization, `Bearer ${session}`)
  await getCreatorProfile('https://service.example', 'rhc', token)
  assert.equal(sent.url.searchParams.get('token'), token)
  assert.equal(sent.init.headers.Authorization, undefined)
})
