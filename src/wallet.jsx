import React from 'react';
import { ConnectButton, RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineChain, http } from 'viem';
import { base } from 'viem/chains';
import { WagmiProvider } from 'wagmi';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Robinhood Chain Explorer', url: 'https://robinhoodchain.blockscout.com' } },
});
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
export const wagmiConfig = getDefaultConfig({ appName: 'Slipway', projectId, chains: [base, robinhoodChain], transports: { [base.id]: http(), [robinhoodChain.id]: http() }, ssr: true });
const queryClient = new QueryClient();
export function WalletProviders({ children }) {
  return <WagmiProvider config={wagmiConfig}><QueryClientProvider client={queryClient}><RainbowKitProvider modalSize="compact" theme={lightTheme({ accentColor: '#e94d25', accentColorForeground: '#fff', borderRadius: 'medium', fontStack: 'system' })}>{children}</RainbowKitProvider></QueryClientProvider></WagmiProvider>;
}
export function WalletConnectButton({ variant = 'lp-side-btn' }) { return <ConnectButton.Custom>{({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => { const ready = mounted; const connected = ready && account && chain; return <button className={variant} type="button" disabled={!ready} onClick={!connected ? openConnectModal : chain.unsupported ? openChainModal : openAccountModal}>{connected ? chain.unsupported ? 'Wrong network' : account.displayName : 'Connect wallet'}</button>; }}</ConnectButton.Custom>; }
