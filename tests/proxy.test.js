import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/slipway.js'

const testApiKey = 'test-server-api-key'
const originalModuleApiKey = process.env.API_KEY
process.env.API_KEY = testApiKey
test.after(() => { if (originalModuleApiKey === undefined) delete process.env.API_KEY; else process.env.API_KEY = originalModuleApiKey })
function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this },
    json(value) { this.body = value; return this },
    send(value) { this.body = value; return this },
  }
}

test('same-origin proxy forwards only allowed paths to the server-configured backend', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  const originalKey = process.env.API_KEY
  process.env.API_KEY = testApiKey
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
    if (originalKey === undefined) delete process.env.API_KEY; else process.env.API_KEY = originalKey
  })
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  let target
  let forwarded
  globalThis.fetch = async (url, options) => {
    target = String(url)
    forwarded = options
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'cache-control': 'no-store' } })
  }
  const res = mockResponse()
  await handler({ url: '/api/slipway?path=v1%2Fquote', method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test', 'x-real-ip': '198.51.100.11', 'x-slipway-client-ip': 'spoofed' }, body: { chain: 'base' } }, res)
  assert.equal(target, 'https://backend.example/v1/quote')
  assert.equal(forwarded.method, 'POST')
  assert.equal(forwarded.headers.get('authorization'), 'Bearer test')
  assert.equal(forwarded.headers.get('x-api-key'), testApiKey)
  assert.equal(forwarded.headers.get('x-slipway-client-ip'), '198.51.100.11')
  assert.deepEqual(JSON.parse(forwarded.body), { chain: 'base' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('proxy allows the bounded market data routes', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  let target
  globalThis.fetch = async (url) => {
    target = String(url)
    return new Response(JSON.stringify({ data: [] }), { status: 200 })
  }
  const res = mockResponse()
  await handler({ url: '/api/slipway?path=v1%2Fmarket%2Fnetworks%2Fbase%2Fpools%2F0x1234567890123456789012345678901234567890%2Fohlcv%2Fhour&aggregate=1', method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(target, 'https://backend.example/v1/market/networks/base/pools/0x1234567890123456789012345678901234567890/ohlcv/hour?aggregate=1')
  const trades = mockResponse()
  await handler({ url: `/api/slipway?path=${encodeURIComponent(`v1/market/networks/base/pools/${'0x' + '1'.repeat(40)}/trades`)}&token=${'0x' + '2'.repeat(40)}&include_anomalous=false`, method: 'GET', headers: {} }, trades)
  assert.equal(trades.statusCode, 200)
  assert.ok(target.endsWith(`/trades?token=${'0x' + '2'.repeat(40)}&include_anomalous=false`))
  const v4 = mockResponse()
  await handler({ url: '/api/slipway?path=v1%2Fmarket%2Fnetworks%2Frobinhood%2Fpools%2F0xe7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7', method: 'GET', headers: {} }, v4)
  assert.equal(v4.statusCode, 200)
  assert.equal(target, 'https://backend.example/v1/market/networks/robinhood/pools/0xe7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7')
})

test('proxy allows multi-token market lookups and rejects malformed ones', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  let target
  globalThis.fetch = async (url) => {
    target = String(url)
    return new Response(JSON.stringify({ data: [] }), { status: 200 })
  }
  const a = '0x' + 'a'.repeat(40), b = '0x' + 'b'.repeat(40)
  const res = mockResponse()
  await handler({ url: `/api/slipway?path=${encodeURIComponent(`v1/market/networks/robinhood/tokens/multi/${a},${b}`)}&include=top_pools`, method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(target, `https://backend.example/v1/market/networks/robinhood/tokens/multi/${a},${b}?include=top_pools`)
  target = undefined
  const bad = mockResponse()
  await handler({ url: `/api/slipway?path=${encodeURIComponent('v1/market/networks/robinhood/tokens/multi/not-an-address')}`, method: 'GET', headers: {} }, bad)
  assert.notEqual(bad.statusCode, 200)
  assert.equal(target, undefined)
})

test('proxy allows creator lookups', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  let target
  globalThis.fetch = async (url) => { target = String(url); return new Response(JSON.stringify({ found: false }), { status: 200 }) }
  const token = '0x' + 'a'.repeat(40)
  const res = mockResponse()
  await handler({ url: `/api/slipway?path=v1%2Fevents%2Fcreator&chain=rhc&token=${token}`, method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(target, `https://backend.example/v1/events/creator?chain=rhc&token=${token}`)
})

test('proxy allows the trending endpoint', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  let target
  globalThis.fetch = async (url) => { target = String(url); return new Response(JSON.stringify({ tokens: [] }), { status: 200 }) }
  const res = mockResponse()
  await handler({ url: '/api/slipway?path=v1%2Ftrending&window=1h&chain=rhc', method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(target, 'https://backend.example/v1/trending?window=1h&chain=rhc')
})

test('proxy allows cached Pons graduation progress', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  let target
  globalThis.fetch = async (url) => { target = String(url); return new Response(JSON.stringify({ items: [] }), { status: 200 }) }
  const token = '0x' + 'a'.repeat(40)
  const res = mockResponse()
  await handler({ url: `/api/slipway?path=v1%2Fpons%2Fprogress&tokens=${token}`, method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(target, `https://backend.example/v1/pons/progress?tokens=${token}`)
})

test('proxy allows pool trades', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  let target
  globalThis.fetch = async (url) => { target = String(url); return new Response(JSON.stringify({ data: [] }), { status: 200 }) }
  const pool = '0xe7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7'
  const res = mockResponse()
  await handler({ url: `/api/slipway?path=${encodeURIComponent(`v1/market/networks/robinhood/pools/${pool}/trades`)}&trade_volume_in_usd_greater_than=100`, method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(target, `https://backend.example/v1/market/networks/robinhood/pools/${pool}/trades?trade_volume_in_usd_greater_than=100`)
})

test('proxy allows transaction submission and hash status routes', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  const targets = []
  globalThis.fetch = async (url) => {
    targets.push(String(url))
    return new Response(JSON.stringify({ status: 'pending' }), { status: 202 })
  }
  const submit = mockResponse()
  await handler({ url: '/api/slipway?path=v1%2Ftransactions%2Fsubmit', method: 'POST', headers: { 'content-type': 'application/json' }, body: { chain: 'base', signedTransaction: '0x02' } }, submit)
  const status = mockResponse()
  const hash = `0x${'a'.repeat(64)}`
  await handler({ url: `/api/slipway?path=v1%2Ftransactions%2Fbase%2F${hash}`, method: 'GET', headers: {} }, status)
  assert.deepEqual(targets, [`https://backend.example/v1/transactions/submit`, `https://backend.example/v1/transactions/base/${hash}`])
  assert.equal(submit.statusCode, 202)
  assert.equal(status.statusCode, 202)
})

test('proxy allows event polling', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  let target
  globalThis.fetch = async (url) => {
    target = String(url)
    return new Response(JSON.stringify({ events: [] }), { status: 200 })
  }
  const res = mockResponse()
  await handler({ url: '/api/slipway?path=v1%2Fevents&after=10&chain=base', method: 'GET', headers: {} }, res)
  assert.equal(target, 'https://backend.example/v1/events?after=10&chain=base')
  assert.equal(res.statusCode, 200)
})

test('proxy rejects unknown routes and methods before making an upstream request', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  globalThis.fetch = async () => { throw new Error('unexpected upstream request') }
  const res = mockResponse()
  await handler({ url: '/api/slipway?path=admin', method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.error, 'Slipway API route not found')
})

test('proxy fails clearly when the backend URL is not configured', async (t) => {
  const original = process.env.SLIPWAY_API_URL
  t.after(() => { if (original === undefined) delete process.env.SLIPWAY_API_URL; else process.env.SLIPWAY_API_URL = original })
  delete process.env.SLIPWAY_API_URL
  const res = mockResponse()
  await handler({ url: '/api/slipway?path=health', method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 503)
})


test('proxy keeps health public and requires its server-side API key for workspace routes', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  const originalKey = process.env.API_KEY
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  process.env.API_KEY = testApiKey
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL; else process.env.SLIPWAY_API_URL = originalUrl
    if (originalKey === undefined) delete process.env.API_KEY; else process.env.API_KEY = originalKey
  })
  const targets = []
  globalThis.fetch = async (url, options) => { targets.push({ url: String(url), options }); return new Response(JSON.stringify({ ok: true }), { status: 200 }) }
  const health = mockResponse()
  await handler({ url: '/api/slipway?path=health', method: 'GET', headers: {} }, health)
  const challenge = mockResponse()
  await handler({ url: '/api/slipway?path=v1%2Fworkspace%2Fchallenge', method: 'POST', headers: { 'content-type': 'application/json' }, body: { wallet: '0xabc' } }, challenge)
  const workspace = mockResponse()
  await handler({ url: '/api/slipway?path=v1%2Fworkspace', method: 'GET', headers: { authorization: 'Bearer session-token' } }, workspace)
  assert.equal(health.statusCode, 200)
  assert.equal(targets[0].options.headers.has('x-api-key'), false)
  assert.equal(targets[1].options.headers.get('x-api-key'), testApiKey)
  assert.equal(targets[2].options.headers.get('authorization'), 'Bearer session-token')
  assert.equal(targets[2].options.headers.get('x-api-key'), testApiKey)
})


test('proxy forwards the Cloudinary image upload route through the single Vercel function path', async (t) => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SLIPWAY_API_URL
  process.env.SLIPWAY_API_URL = 'https://backend.example'
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
  })
  let target
  globalThis.fetch = async (url) => { target = String(url); return new Response(JSON.stringify({ url: 'https://res.cloudinary.com/test/image/upload/a.png' }), { status: 201 }) }
  const res = mockResponse()
  await handler({ url: '/api/slipway?path=v1%2Fmedia%2Fimages', method: 'POST', headers: { 'content-type': 'application/json' }, body: { image: 'data:image/png;base64,AA==' } }, res)
  assert.equal(target, 'https://backend.example/v1/media/images')
  assert.equal(res.statusCode, 201)
})
