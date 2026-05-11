'use client';

import { useState } from 'react';
import { isValidSolanaAddress, calcScore, applyRiskCap, getSybilRisk, walletAge } from '@/lib/wallet-utils';

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

  const lookupWallet = async (input) => {
    const trimmed = input.trim();
    if (!trimmed) throw new Error('Please enter a domain or address');

    if (isValidSolanaAddress(trimmed)) {
      const { Connection, LAMPORTS_PER_SOL, PublicKey } = await import('@solana/web3.js');
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

      return { wallet: trimmed, domain: trimmed.slice(0, 4) + '...' + trimmed.slice(-4), balance, txCount, walletAgeDays, score };
    } else {
      const res = await fetch(`/api/lookup?domain=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error('Domain not found');
      const data = await res.json();
      const score = calcScore({ balance: data.balance, txCount: data.txCount, walletAgeDays: data.walletAgeDays || 0 });
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
    setErrorA(''); setErrorB('');
    setResultA(null); setResultB(null);

    const [resA, resB] = await Promise.allSettled([lookupWallet(walletA), lookupWallet(walletB)]);

    if (resA.status === 'fulfilled') setResultA(resA.value);
    else setErrorA(resA.reason?.message || 'Not found or invalid');

    if (resB.status === 'fulfilled') setResultB(resB.value);
    else setErrorB(resB.reason?.message || 'Not found or invalid');

    setLoading(false);
  };

  const clearAll = () => {
    setWalletA(''); setWalletB('');
    setResultA(null); setResultB(null);
    setErrorA(''); setErrorB('');
  };

  // Winner detection
  const getSybilRisk_ = (r) => r ? getSybilRisk({ balance: r.balance ?? 0, txCount: r.txCount ?? 0 }) : null
  const scoreA = resultA ? applyRiskCap(resultA.score, getSybilRisk_(resultA)?.risk) : -1
  const scoreB = resultB ? applyRiskCap(resultB.score, getSybilRisk_(resultB)?.risk) : -1
  const hasWinner = resultA && resultB && scoreA !== scoreB;
  const aIsWinner = hasWinner && scoreA > scoreB;
  const bIsWinner = hasWinner && scoreB > scoreA;

  const getSybilBadge = (result) => {
    if (!result) return null;
    const sybil = getSybilRisk({
      balance: result.balance ?? 0,
      txCount: result.txCount ?? 0,
      circularCount: 0,
      roundCount: 0,
      washScore: 0
    });
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        background: sybil.color + '22',
        color: sybil.color
      }}>
        {sybil.emoji} {sybil.risk.toUpperCase()}
      </div>
    );
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
        {/* === WALLET A === */}
        <div style={{
          background: cardBg,
          border: `2px solid ${aIsWinner ? '#10b981' : borderColor}`,
          borderRadius: 12,
          padding: 16,
          flex: 1,
          transition: 'border 0.2s'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: labelColor, letterSpacing: 0.5 }}>WALLET A</p>
            {resultA && getSybilBadge(resultA)}
          </div>

          <input
            value={walletA}
            onChange={e => setWalletA(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCompare()}
            placeholder="domain or address"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 14 }}
          />

          {errorA && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>⚠️ {errorA}</p>}

          {resultA && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: textColor, wordBreak: 'break-all' }}>
                {resultA.domain || resultA.wallet}
              </p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#7F77DD', marginTop: 4 }}>
                {scoreA}
              </p>
              <p style={{ fontSize: 12, color: labelColor, marginBottom: 12 }}>Reputation Score</p>

              {/* Extra stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ background: dark ? '#0f0f1a' : '#f8f8fc', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: labelColor }}>BALANCE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{resultA.balance?.toFixed(2) ?? '—'}</div>
                </div>
                <div style={{ background: dark ? '#0f0f1a' : '#f8f8fc', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: labelColor }}>TXS</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{resultA.txCount ?? '—'}</div>
                </div>
                <div style={{ background: dark ? '#0f0f1a' : '#f8f8fc', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: labelColor }}>AGE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{walletAge(resultA.walletAgeDays)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* VS */}
        <div style={{ display: 'flex', alignItems: 'center', paddingTop: 36, color: '#7F77DD', fontWeight: 700, fontSize: 14 }}>
          vs
        </div>

        {/* === WALLET B === */}
        <div style={{
          background: cardBg,
          border: `2px solid ${bIsWinner ? '#10b981' : borderColor}`,
          borderRadius: 12,
          padding: 16,
          flex: 1,
          transition: 'border 0.2s'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: labelColor, letterSpacing: 0.5 }}>WALLET B</p>
            {resultB && getSybilBadge(resultB)}
          </div>

          <input
            value={walletB}
            onChange={e => setWalletB(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCompare()}
            placeholder="domain or address"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 14 }}
          />

          {errorB && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>⚠️ {errorB}</p>}

          {resultB && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: textColor, wordBreak: 'break-all' }}>
                {resultB.domain || resultB.wallet}
              </p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#7F77DD', marginTop: 4 }}>
                {scoreB}
              </p>
              <p style={{ fontSize: 12, color: labelColor, marginBottom: 12 }}>Reputation Score</p>

              {/* Extra stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ background: dark ? '#0f0f1a' : '#f8f8fc', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: labelColor }}>BALANCE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{resultB.balance?.toFixed(2) ?? '—'}</div>
                </div>
                <div style={{ background: dark ? '#0f0f1a' : '#f8f8fc', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: labelColor }}>TXS</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{resultB.txCount ?? '—'}</div>
                </div>
                <div style={{ background: dark ? '#0f0f1a' : '#f8f8fc', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: labelColor }}>AGE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{walletAge(resultB.walletAgeDays)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          onClick={handleCompare}
          disabled={loading || !walletA.trim() || !walletB.trim()}
          style={{
            flex: 1,
            padding: '14px',
            borderRadius: 10,
            background: '#7F77DD',
            color: 'white',
            fontWeight: 700,
            fontSize: 15,
            opacity: (loading || !walletA.trim() || !walletB.trim()) ? 0.6 : 1
          }}
        >
          {loading ? 'Comparing...' : 'Go'}
        </button>

        <button
          onClick={clearAll}
          style={{
            padding: '14px 24px',
            borderRadius: 10,
            background: 'transparent',
            color: dark ? '#888' : '#666',
            fontWeight: 600,
            fontSize: 15,
            border: `1.5px solid ${borderColor}`
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}