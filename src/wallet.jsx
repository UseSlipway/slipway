import React from 'react';
import { ConnectButton, RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineChain, http } from 'viem';
import { base } from 'viem/chains';
import { createConfig, injected, WagmiProvider } from 'wagmi';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Robinhood Chain Explorer', url: 'https://robinhoodchain.blockscout.com' } },
});
export const spcxChain = defineChain({
  id: 46630022, name: 'SPCX Chain', nativeCurrency: { name: 'SPCX', symbol: 'SPCX', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.spcxchain.network'] } },
  blockExplorers: { default: { name: 'SPCX Explorer', url: 'https://explorer.spcxchain.network' } },
});
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();
const walletConfig = { appName: 'Slipway', chains: [base, robinhoodChain, spcxChain], transports: { [base.id]: http(), [robinhoodChain.id]: http(), [spcxChain.id]: http('https://rpc.spcxchain.network') }, ssr: true };
export const wagmiConfig = projectId
  ? getDefaultConfig({ ...walletConfig, projectId })
  : createConfig({ ...walletConfig, connectors: [injected()] });
const queryClient = new QueryClient();
export function WalletProviders({ children }) {
  return <WagmiProvider config={wagmiConfig}><QueryClientProvider client={queryClient}><RainbowKitProvider modalSize="compact" theme={lightTheme({ accentColor: '#e94d25', accentColorForeground: '#fff', borderRadius: 'medium', fontStack: 'system' })}>{children}</RainbowKitProvider></QueryClientProvider></WagmiProvider>;
}
export function WalletConnectButton({ variant = 'lp-side-btn' }) {
  return <ConnectButton.Custom>{({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
    const ready = mounted && authenticationStatus !== 'loading';
    const connected = ready && Boolean(account) && Boolean(chain) && (!authenticationStatus || authenticationStatus === 'authenticated');
    const wrongChain = connected && Boolean(chain.unsupported);
    const label = !ready ? 'Connect wallet' : wrongChain ? 'Switch network' : connected ? account.displayName : 'Connect wallet';
    const onClick = wrongChain ? openChainModal : connected ? openAccountModal : openConnectModal;
    const accessibleLabel = wrongChain ? 'Switch network' : connected ? `Wallet ${account.displayName}; open wallet menu` : 'Connect wallet';
    return <button className={`${variant} lp-wallet-button`} type="button" disabled={!ready} onClick={onClick} aria-label={accessibleLabel} title={accessibleLabel}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V6a2.5 2.5 0 0 1 2.5-2.5H18M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm16 4h-4a2 2 0 0 0 0 4h4M16 13h.01"/></svg>
      <span>{label}</span>
    </button>;
  }}</ConnectButton.Custom>;
}
