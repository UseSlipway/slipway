import test from 'node:test'
import assert from 'node:assert/strict'
import { graduationsFromEvents, poolsForTokens, timeAgo } from '../src/GraduatedFeed.jsx'
import { getEvents } from '../src/api.js'

const A = '0x' + 'a'.repeat(40), B = '0x' + 'b'.repeat(40)
const ev = (token, extra = {}) => ({ type: 'pool.graduated', chain: 'rhc', payload: { args: { token } }, indexedAt: '2026-11-26T20:00:00Z', transactionHash: '0x' + '1'.repeat(64), ...extra })

test('graduations keep the newest event per token and ignore other chains, types and bad addresses', () => {
  const rows = graduationsFromEvents([ev(A), ev(A.toUpperCase().replace('0X', '0x')), ev(B, { chain: 'base' }), ev(B, { type: 'token.launched' }), ev('nope'), ev(B)])
  assert.deepEqual(rows.map(r => r.token), [A, B])
})

test('pool lookup matches each token to its own top pool', () => {
  const json = {
    data: [
      { id: `robinhood_${A}`, type: 'token', attributes: { address: A, name: 'Alpha', symbol: 'ALP', image_url: 'https://x/a.png' }, relationships: { top_pools: { data: [{ id: 'robinhood_0xpool1' }] } } },
      { id: `robinhood_${B}`, type: 'token', attributes: { address: B, name: 'Beta', symbol: 'BET' }, relationships: { top_pools: { data: [] } } },
    ],
    included: [{ id: 'robinhood_0xpool1', type: 'pool', attributes: { address: '0xpool1', name: 'ALP / WETH', fdv_usd: '12000', volume_usd: { h24: '500' } }, relationships: { base_token: { data: { id: `robinhood_${A}` } }, dex: { data: { id: 'uniswap-v4-robinhood' } } } }],
  }
  const map = poolsForTokens(json)
  assert.equal(map.get(A).row.pool, '0xpool1')
  assert.equal(map.get(A).row.symbol, 'ALP')
  assert.equal(map.get(A).row.venue, 'uniswap-v4-robinhood')
  assert.equal(map.get(B).row, undefined)
  assert.equal(map.get(B).meta.symbol, 'BET')
})

test('relative times', () => {
  const now = Date.parse('2026-11-26T20:00:00Z')
  assert.equal(timeAgo('2026-11-26T19:59:30Z', now), 'just now')
  assert.equal(timeAgo('2026-11-26T19:48:00Z', now), '12m ago')
  assert.equal(timeAgo('2026-11-26T15:00:00Z', now), '5h ago')
  assert.equal(timeAgo('2026-11-23T20:00:00Z', now), '3d ago')
})

test('event feed accepts a sort order and rejects unknown ones', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let target
  globalThis.fetch = async (url) => { target = new URL(String(url)); return new Response(JSON.stringify({ events: [], nextCursor: 0 }), { status: 200 }) }
  await getEvents('https://service.example', { chain: 'rhc', types: ['pool.graduated'], order: 'desc', limit: 24 })
  assert.equal(target.searchParams.get('order'), 'desc')
  await assert.rejects(getEvents('https://service.example', { order: 'sideways' }), /event feed filters/)
})
