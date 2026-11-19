import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/slipway/[...path].js'

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
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SLIPWAY_API_URL
    else process.env.SLIPWAY_API_URL = originalUrl
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
  await handler({ url: '/api/slipway/v1/quote', method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test' }, body: { chain: 'base' } }, res)
  assert.equal(target, 'https://backend.example/v1/quote')
  assert.equal(forwarded.method, 'POST')
  assert.equal(forwarded.headers.get('authorization'), 'Bearer test')
  assert.deepEqual(JSON.parse(forwarded.body), { chain: 'base' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
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
  await handler({ url: '/api/slipway/admin', method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.error, 'Slipway API route not found')
})

test('proxy fails clearly when the backend URL is not configured', async (t) => {
  const original = process.env.SLIPWAY_API_URL
  t.after(() => { if (original === undefined) delete process.env.SLIPWAY_API_URL; else process.env.SLIPWAY_API_URL = original })
  delete process.env.SLIPWAY_API_URL
  const res = mockResponse()
  await handler({ url: '/api/slipway/health', method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 503)
})
