import test from 'node:test'
import assert from 'node:assert/strict'
import { getCreatorEarnings, buildCreatorClaim } from '../src/api.js'

const wallet = '0x' + 'a'.repeat(40)

test('earnings request validates the wallet', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let target
  globalThis.fetch = async (url) => { target = new URL(String(url)); return new Response(JSON.stringify({ balances: [] }), { status: 200 }) }
  await getCreatorEarnings('https://service.example', wallet)
  assert.equal(target.pathname, '/v1/creators/earnings')
  assert.equal(target.searchParams.get('wallet'), wallet)
  await assert.rejects(getCreatorEarnings('https://service.example', 'nope'), /Connect a wallet/)
})

test('claim builds must target the requested chain and wallet', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const good = { buildId: 'b1', chain: 'rhc', chainId: 4663, wallet, payloads: [{ kind: 'evm_transaction', purpose: 'claim_creator_fees', chainId: 4663, from: wallet, to: '0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e', value: '0x0', data: '0x4e71d92d' }] }
  let body
  globalThis.fetch = async (url, init) => { body = JSON.parse(init.body); return new Response(JSON.stringify(good), { status: 200 }) }
  const build = await buildCreatorClaim('https://service.example', { chain: 'rhc', wallet, asset: 'native' })
  assert.equal(build.buildId, 'b1')
  assert.deepEqual(body, { chain: 'rhc', wallet, asset: 'native' })
  globalThis.fetch = async () => new Response(JSON.stringify({ ...good, wallet: '0x' + 'b'.repeat(40) }), { status: 200 })
  await assert.rejects(buildCreatorClaim('https://service.example', { chain: 'rhc', wallet, asset: 'native' }), /matching claim/)
  await assert.rejects(buildCreatorClaim('https://service.example', { chain: 'solana', wallet, asset: 'native' }), /Choose a balance/)
})
