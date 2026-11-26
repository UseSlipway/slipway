import test from 'node:test'
import assert from 'node:assert/strict'
import { activityLine } from '../src/SlipwayTrending.jsx'
import { getTrending } from '../src/api.js'

test('activity line names prepared trades first and skips zero counts', () => {
  assert.equal(activityLine({ quotes: 12, builds: 3, watchers: 4 }), '3 trades prepared · 12 quotes · 4 watching')
  assert.equal(activityLine({ quotes: 1, builds: 0, watchers: 0 }), '1 quote')
  assert.equal(activityLine({ quotes: 5, builds: 1, watchers: 1 }), '1 trade prepared · 5 quotes · 1 watching')
})

test('trending requests use bounded filters', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let target
  globalThis.fetch = async (url) => { target = new URL(String(url)); return new Response(JSON.stringify({ window: '1h', tokens: [] }), { status: 200 }) }
  await getTrending('https://service.example', { window: '24h', chain: 'rhc', limit: 12 })
  assert.equal(target.pathname, '/v1/trending')
  assert.equal(target.searchParams.get('window'), '24h')
  assert.equal(target.searchParams.get('chain'), 'rhc')
  await assert.rejects(getTrending('https://service.example', { window: '7d' }), /trending filters/)
  await assert.rejects(getTrending('https://service.example', { chain: 'solana' }), /trending filters/)
})
