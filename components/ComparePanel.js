'use client';

import { useState } from 'react';
import { isValidSolanaAddress, calcScore } from '@/lib/wallet-utils';

export default function ComparePanel({ dark }) {
  const [walletA, setWalletA] = useState('');
  const [walletB, setWalletB] = useState('');
  const [resultA, setResultA] = useState(null);
  const [resultB, setResultB] = useState(null);
  const [errorA, setErrorA] = useState('');
  const [errorB, setErrorB] = useState('');
  const [loading, setLoading] = useState(false);

  const cardBg = dark ? '#1a1a2e' : '#ffffff';
  const inputBg = dark ? '#0f0f1a' : '#f8f8fc';
  const borderColor = dark ? '#2a2a3e' : '#d1d5db';
  const textColor = dark ? '#e5e5e5' : '#111';
  const labelColor = dark ? '#888' : '#666';

  // Handles BOTH .sol domains and raw wallet addresses correctly
  const lookupWallet = async (input) => {
    const trimmed = input.trim();
    if (!trimmed) throw new Error('Please enter a domain or address');

    if (isValidSolanaAddress(trimmed)) {
      // === RAW WALLET ADDRESS (same logic as main page) ===
      const { Connection, LAMPORTS_PER_SOL, PublicKey } = await import('@solana/web3.js');
      
      // Use your proxy first, then fallbacks
      const rpcUrl = process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/rpc`
        : 'https://rpc.ankr.com/solana';
      
      const connection = new Connection(rpcUrl);
      const pubkey = new PublicKey(trimmed);

      const balanceLamports = await connection.getBalance(pubkey);
      const balance = balanceLamports / LAMPORTS_PER_SOL;

      const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 100 });
      const txCount = sigs.length;

      const oldestSig = sigs[sigs.length - 1];
      const walletAgeDays = oldestSig?.blockTime 
        ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400) 
        : 0;

      const score = calcScore({ balance, txCount, walletAgeDays });

      return {
        wallet: trimmed,
        domain: trimmed.slice(0, 4) + '...' + trimmed.slice(-4),
        balance,
        txCount,
        walletAgeDays,
        score
      };
    } else {
      // === .sol DOMAIN ===
      const res = await fetch(`/api/lookup?domain=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error('Domain not found');

      const data = await res.json();
      const score = calcScore({
        balance: data.balance,
        txCount: data.txCount,
        walletAgeDays: data.walletAgeDays || 0
      });

      return { ...data, score };
    }
  };

  const handleCompare = async () => {
    if (!walletA.trim() || !walletB.trim()) {
      setErrorA(!walletA.trim() ? 'Please enter wallet A' : '');
      setErrorB(!walletB.trim() ? 'Please enter wallet B' : '');
      return;
    }

    setLoading(true);
    setErrorA('');
    setErrorB('');
    setResultA(null);
    setResultB(null);

    const [resA, resB] = await Promise.allSettled([
      lookupWallet(walletA),
      lookupWallet(walletB)
    ]);

    if (resA.status === 'fulfilled') {
      setResultA(resA.value);
    } else {
      setErrorA(resA.reason?.message || 'Not found or invalid');
    }

    if (resB.status === 'fulfilled') {
      setResultB(resB.value);
    } else {
      setErrorB(resB.reason?.message || 'Not found or invalid');
    }

    setLoading(false);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>⚖️</span>
        <p style={{ fontSize: 15, fontWeight: 700, color: dark ? '#fff' : '#111', margin: 0 }}>
          Compare Wallets
        </p>
        <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>side-by-side</span>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* WALLET A */}
        <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 16, flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: labelColor, letterSpacing: 0.5, marginBottom: 8 }}>
            WALLET A
          </p>
          <input
            value={walletA}
            onChange={e => setWalletA(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCompare()}
            placeholder="domain or address"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 14
            }}
          />
          {errorA && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>⚠️ {errorA}</p>}
          {resultA && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: textColor, wordBreak: 'break-all' }}>
                {resultA.domain || resultA.wallet}
              </p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#7F77DD', marginTop: 6 }}>
                {resultA.score}
              </p>
              <p style={{ fontSize: 12, color: labelColor }}>Reputation Score</p>
            </div>
          )}
        </div>

        {/* VS */}
        <div style={{ display: 'flex', alignItems: 'center', paddingTop: 36, color: '#7F77DD', fontWeight: 700, fontSize: 14 }}>
          vs
        </div>

        {/* WALLET B */}
        <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 16, flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: labelColor, letterSpacing: 0.5, marginBottom: 8 }}>
            WALLET B
          </p>
          <input
            value={walletB}
            onChange={e => setWalletB(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCompare()}
            placeholder="domain or address"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 14
            }}
          />
          {errorB && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>⚠️ {errorB}</p>}
          {resultB && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: textColor, wordBreak: 'break-all' }}>
                {resultB.domain || resultB.wallet}
              </p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#7F77DD', marginTop: 6 }}>
                {resultB.score}
              </p>
              <p style={{ fontSize: 12, color: labelColor }}>Reputation Score</p>
            </div>
          )}
        </div>
      </div>

      {/* SINGLE GO BUTTON */}
      <button
        onClick={handleCompare}
        disabled={loading || !walletA.trim() || !walletB.trim()}
        style={{
          width: '100%', marginTop: 16, padding: '14px', borderRadius: 10,
          background: '#7F77DD', color: 'white', fontWeight: 700, fontSize: 15,
          opacity: (loading || !walletA.trim() || !walletB.trim()) ? 0.6 : 1
        }}
      >
        {loading ? 'Comparing...' : 'Go'}
      </button>
    </div>
  );
}