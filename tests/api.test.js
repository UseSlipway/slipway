import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chainIds, checkBackend, isTokenAddress, marketRequest, quoteRequest, request, resolveToken } from '../src/api.js'

const address = '0x000000000000000000000000000000000000dead'

test('chain identifiers and public address validation are chain-aware', () => {
  assert.deepEqual(chainIds, { Solana: 'solana', 'Robinhood Chain': 'rhc', Base: 'base', 'BNB Chain': 'bnb' })
  assert.equal(isTokenAddress('So11111111111111111111111111111111111111112', 'Solana'), true)
  assert.equal(isTokenAddress(address, 'Base'), true)
  assert.equal(isTokenAddress('invalid', 'Solana'), false)
  assert.equal(isTokenAddress(address, 'Solana'), false)
  assert.equal(isTokenAddress(address, 'Unknown'), false)
})

test('quote payload includes chain, amount, slippage and an optional quote asset', () => {
  assert.deepEqual(quoteRequest({ chain: 'Base', token: address, side: 'Buy', amount: '0.1', quoteAsset: 'USDC' }, { slippage: 0.5 }), {
    chain: 'base', token: address, side: 'buy', quoteAsset: 'USDC', amount: '0.1', amountType: 'in', slippageBps: 50,
  })
  assert.throws(() => quoteRequest({ chain: 'Base', token: address, side: 'Buy', amount: '-1' }, { slippage: 0.5 }), /greater than zero/)
  assert.throws(() => quoteRequest({ chain: 'Base', token: 'bad', side: 'Buy', amount: '1' }, { slippage: 0.5 }), /valid public token address/)
})

test('API endpoint validation rejects missing, insecure, credentialed and cross-origin URLs', async (t) => {
  await assert.rejects(request('', 'quote', {}), /endpoint/)
  await assert.rejects(request('http://example.com', 'quote', {}), /HTTPS/)
  await assert.rejects(request('https://name:secret@example.com', 'quote', {}), /without credentials/)
  const priorWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://tryslipway.com' } }
  t.after(() => { if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow })
  await assert.rejects(request('https://api.example.com', 'quote', {}), /same-origin/)
  await assert.rejects(request('/another-proxy', 'quote', {}), /Use \/api\/slipway/)
})

test('API request normalizes the v1 prefix, omits credentials and reads service errors', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let target
  globalThis.fetch = async (url, options) => {
    target = String(url)
    assert.equal(options.credentials, 'omit')
    assert.equal(options.method, 'POST')
    return new Response(JSON.stringify({ id: 'quote-1', expectedOut: '100' }), { status: 200 })
  }
  const quote = await request('https://service.example/v1/', 'quote', {})
  assert.equal(target, 'https://service.example/v1/quote')
  assert.equal(quote.id, 'quote-1')
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Venue unavailable' }), { status: 503 })
  await assert.rejects(request('https://service.example', 'quote', {}), /Venue unavailable/)
  globalThis.fetch = async () => new Response('not json', { status: 200 })
  await assert.rejects(request('https://service.example', 'quote', {}), /unreadable response/)
})

test('health checks use the same-origin API and validate the response', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let target
  globalThis.fetch = async (url, options) => {
    target = String(url)
    assert.equal(options.method, 'GET')
    return new Response(JSON.stringify({ status: 'ok', commit: 'abc123' }), { status: 200 })
  }
  const status = await checkBackend('https://service.example')
  assert.equal(target, 'https://service.example/health')
  assert.equal(status.status, 'ok')
})

test('market data requests use the same-origin API path and support cancellation', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let target
  globalThis.fetch = async (url, options) => {
    target = String(url)
    assert.equal(options.credentials, 'omit')
    assert.equal(options.method, 'GET')
    return new Response(JSON.stringify({ data: [] }), { status: 200 })
  }
  const result = await marketRequest('https://service.example', 'networks/base/trending_pools?include=base_token%2Cquote_token')
  assert.deepEqual(result.data, [])
  assert.equal(target, 'https://service.example/v1/market/networks/base/trending_pools?include=base_token%2Cquote_token')
  await assert.rejects(marketRequest('https://service.example', '../admin'), /market data path/)
})

test('token resolution encodes the address and validates response fields', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let target
  globalThis.fetch = async (url, options) => {
    target = String(url)
    assert.equal(options.credentials, 'omit')
    return new Response(JSON.stringify({ venue: 'uniswap-v3', phase: 'POOL_LIVE', chain: 'base' }), { status: 200 })
  }
  const result = await resolveToken('https://service.example/v1', 'Base', address)
  assert.equal(target, `https://service.example/v1/tokens/base/${address}`)
  assert.equal(result.venue, 'uniswap-v3')
  await assert.rejects(resolveToken('https://service.example', 'Solana', 'bad'), /valid public token address/)
  globalThis.fetch = async () => new Response(JSON.stringify({ venue: 'uniswap-v3' }), { status: 200 })
  await assert.rejects(resolveToken('https://service.example', 'Base', address), /incomplete token route/)
})
