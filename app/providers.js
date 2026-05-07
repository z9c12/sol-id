'use client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { useMemo } from 'react';

// Primary: our proxy (Alchemy key stays server-side)
// Fallback: only used if APP_URL is missing (e.g. during local dev without .env)
const PRIMARY = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/rpc`
  : null

const FALLBACKS = [
  'https://rpc.ankr.com/solana',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://api.mainnet-beta.solana.com',
]

const endpoint = PRIMARY ?? FALLBACKS[0]

export function Providers({ children }) {
  const network = WalletAdapterNetwork.Mainnet;
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}