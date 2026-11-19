export const chainIds = {
  Solana: 'solana',
  'Robinhood Chain': 'rhc',
  Base: 'base',
  'BNB Chain': 'bnb',
}

const defaultEndpoint = '/api/slipway'

function apiRoot(endpoint) {
  const value = endpoint?.trim() || defaultEndpoint
  let base
  try {
    base = new URL(value, typeof window === 'undefined' ? undefined : window.location.origin)
  } catch {
    throw new Error('Enter a valid Slipway API endpoint.')
  }
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) {
    throw new Error('Use an HTTPS endpoint.')
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error('Enter the service URL without credentials, query parameters or fragments.')
  }
  if (typeof window !== 'undefined' && base.origin !== window.location.origin) {
    throw new Error('Use the same-origin /api/slipway endpoint so requests stay on Slipway’s server stack.')
  }
  if (base.pathname.endsWith('/v1')) base.pathname = base.pathname.slice(0, -3)
  if (typeof window !== 'undefined' && base.pathname.replace(/\/$/, '') !== '/api/slipway') {
    throw new Error('Use /api/slipway as the frontend API endpoint.')
  }
  return base.href.replace(/\/$/, '')
}

async function readJson(response) {
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('The service returned an unreadable response.')
  }
  if (!response.ok) {
    throw new Error(typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : `The service returned ${response.status}.`)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The service returned an incomplete response.')
  }
  return data
}

export function isTokenAddress(address, chain) {
  if (typeof address !== 'string' || !Object.hasOwn(chainIds, chain)) return false
  return (chain === 'Solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ : /^0x[a-fA-F0-9]{40}$/).test(address)
}

export function quoteRequest(values, settings) {
  if (!isTokenAddress(values.token, values.chain)) throw new Error('Enter a valid public token address for this chain.')
  if (!Number.isFinite(+values.amount) || +values.amount <= 0) throw new Error('Enter an amount greater than zero.')
  return {
    chain: chainIds[values.chain],
    token: values.token,
    side: values.side.toLowerCase(),
    amount: values.amount,
    amountType: 'in',
    slippageBps: Math.round(settings.slippage * 100),
  }
}

export async function request(endpoint, path, body) {
  const root = apiRoot(endpoint)
  const response = await fetch(`${root}/v1/${path}`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'The service took too long to respond. Try again.' : 'Could not reach your Slipway service.')
  })
  return readJson(response)
}

export async function checkBackend(endpoint) {
  const root = apiRoot(endpoint)
  const response = await fetch(`${root}/health`, {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'The backend check timed out.' : 'Could not reach the Slipway backend.')
  })
  return readJson(response)
}

export async function resolveToken(endpoint, chain, address) {
  if (!Object.hasOwn(chainIds, chain) || !isTokenAddress(address, chain)) {
    throw new Error('Enter a valid public token address for the selected chain.')
  }
  const root = apiRoot(endpoint)
  const response = await fetch(`${root}/v1/tokens/${chainIds[chain]}/${encodeURIComponent(address)}`, {
    method: 'GET',
    credentials: 'omit',
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'The service took too long to respond. Try again.' : 'Could not reach your Slipway service.')
  })
  const data = await readJson(response)
  if (typeof data.venue !== 'string' || typeof data.phase !== 'string') {
    throw new Error('The service returned an incomplete token route.')
  }
  return data
}
