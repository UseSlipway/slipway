import React from 'react';
import Launchpad from './Launchpad';
import { WalletProviders } from './wallet';

export default function WalletLaunchpad() {
  return <WalletProviders><Launchpad /></WalletProviders>;
}
