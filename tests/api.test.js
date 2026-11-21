import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chainIds, checkBackend, getEvents, getTransactionStatus, isTokenAddress, launchChainIds, launchQuoteRequest, marketRequest, createWorkspaceSession, getCloudWorkspace, putCloudWorkspace, quoteRequest, request, resolveToken, submitBuiltTransactions, submitTransaction, uploadTokenImage } from '../src/api.js'

const address = '0x000000000000000000000000000000000000dead'

test('chain identifiers and public address validation are chain-aware', () => {
  assert.deepEqual(chainIds, { 'Robinhood Chain': 'rhc', Base: 'base' })
  assert.equal(isTokenAddress('So11111111111111111111111111111111111111112', 'Solana'), false)
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

test('launch quote request maps UI chain names to numeric EVM chain IDs', async (t) => {
  assert.deepEqual(launchChainIds, { 'Robinhood Chain': 4663, Base: 8453 })
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const bodies = []
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return new Response(JSON.stringify({ id: 'quote-1' }), { status: 200 })
  }
  const values = { chain: 'Base', venue: 'clanker-v4', wallet: address, name: 'Token', symbol: 'TKN', metadataUri: 'https://example.com/token.png' }
  await launchQuoteRequest('https://service.example', values)
  await launchQuoteRequest('https://service.example', { ...values, chain: 'Robinhood Chain', venue: 'pons' })
  assert.deepEqual(bodies.map(({ chain }) => chain), [8453, 4663])
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

test('same-origin frontend API sends nested backend routes through the Vercel proxy query', async (t) => {
  const originalFetch = globalThis.fetch
  const priorWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://tryslipway.com' } }
  t.after(() => {
    globalThis.fetch = originalFetch
    if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow
  })
  let target
  globalThis.fetch = async (url) => {
    target = String(url)
    return new Response(JSON.stringify({ url: 'https://res.cloudinary.com/demo/image/upload/token.png' }), { status: 201 })
  }
  await uploadTokenImage('/api/slipway', 'data:image/png;base64,iVBORw0KGgo=')
  const parsed = new URL(target)
  assert.equal(parsed.pathname, '/api/slipway')
  assert.equal(parsed.searchParams.get('path'), 'v1/media/images')
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

test('transaction submission and tracking validate inputs and stay on the same-origin API', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const seen = []
  globalThis.fetch = async (url, options) => {
    seen.push({ url: String(url), method: options.method, credentials: options.credentials, body: options.body })
    return new Response(JSON.stringify({ status: 'submitted', hash: `0x${'a'.repeat(64)}` }), { status: 202 })
  }
  const hash = `0x${'a'.repeat(64)}`
  await submitTransaction('https://service.example', 'base', '0x0201')
  await getTransactionStatus('https://service.example', 'base', hash)
  assert.deepEqual(seen.map(({ url, method, credentials }) => ({ url, method, credentials })), [
    { url: 'https://service.example/v1/transactions/submit', method: 'POST', credentials: 'omit' },
    { url: `https://service.example/v1/transactions/base/${hash}`, method: 'GET', credentials: 'omit' },
  ])
  await assert.rejects(submitTransaction('https://service.example', 'solana', '0x0201'), /supported chain/)
  await assert.rejects(getTransactionStatus('https://service.example', 'base', 'bad'), /valid transaction hash/)
})

test('built EVM transactions switch chain, request wallet approval and track confirmation', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const calls = []
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/v1\/transactions\/base\/0x[0-9a-f]{64}$/)
    return new Response(JSON.stringify({ status: 'confirmed' }), { status: 200 })
  }
  const provider = { request: async ({ method }) => {
    calls.push(method)
    if (method === 'eth_requestAccounts') return ['0x0000000000000000000000000000000000000001']
    if (method === 'eth_sendTransaction') return `0x${'1'.repeat(64)}`
    return null
  } }
  const results = await submitBuiltTransactions('https://service.example', {
    chain: 'base', chainId: 8453, wallet: '0x0000000000000000000000000000000000000001',
    payloads: [{ kind: 'evm_transaction', purpose: 'execute_trade_with_fee', chainId: 8453, from: '0x0000000000000000000000000000000000000001', to: '0x0000000000000000000000000000000000000002', value: '0x0', data: '0x1234' }]
  }, provider, () => {}, 0)
  assert.equal(results[0].status, 'confirmed')
  assert.deepEqual(calls, ['wallet_switchEthereumChain', 'eth_requestAccounts', 'eth_sendTransaction'])
})

test('event feed requests validate filters and encode pagination on the API path', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let target
  globalThis.fetch = async (url, options) => {
    target = String(url)
    assert.equal(options.credentials, 'omit')
    return new Response(JSON.stringify({ events: [], nextCursor: 12 }), { status: 200 })
  }
  const feed = await getEvents('https://service.example', { after: 12, chain: 'rhc', types: ['token.launched'], limit: 25 })
  assert.equal(target, 'https://service.example/v1/events?after=12&limit=25&chain=rhc&types=token.launched')
  assert.equal(feed.nextCursor, 12)
  await assert.rejects(getEvents('https://service.example', { chain: 'solana' }), /event feed filters/)
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


test('wallet workspace session signs a server challenge and keeps the bearer token on the server API path', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const targets = []
  globalThis.fetch = async (url, options) => {
    targets.push({ url: String(url), options })
    const body = options.body ? JSON.parse(options.body) : null
    if (String(url).endsWith('/workspace/challenge')) return new Response(JSON.stringify({ wallet: address, nonce: 'a'.repeat(64), message: 'Sign Slipway workspace challenge' }), { status: 200 })
    if (String(url).endsWith('/workspace/verify')) return new Response(JSON.stringify({ wallet: address, token: 'b'.repeat(64) }), { status: 200 })
    if (options.method === 'GET') return new Response(JSON.stringify({ wallet: address, exists: true, drafts: [], watches: [] }), { status: 200 })
    return new Response(JSON.stringify({ wallet: address, saved: true }), { status: 200 })
  }
  let signedMessage = ''
  const session = await createWorkspaceSession('https://service.example', address, async ({ message }) => { signedMessage = message; return `0x${'1'.repeat(130)}` })
  assert.equal(signedMessage, 'Sign Slipway workspace challenge')
  assert.equal(session.token, 'b'.repeat(64))
  const cloud = await getCloudWorkspace('https://service.example', session.token)
  assert.equal(cloud.exists, true)
  assert.equal(targets.at(-1).options.headers.Authorization, `Bearer ${session.token}`)
  await putCloudWorkspace('https://service.example', session.token, { drafts: [], watches: [] })
  assert.equal(targets.at(-1).options.method, 'PUT')
  assert.deepEqual(JSON.parse(targets.at(-1).options.body), { drafts: [], watches: [] })
  assert.ok(targets.every(({ url }) => url.startsWith('https://service.example/v1/workspace')))
})
