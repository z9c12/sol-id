// app/page.js
'use client';

import { useSolId } from '@/hooks/useSolId'
import { isValidSolanaAddress, getSybilRisk, shortAddr } from '@/lib/wallet-utils'
import { Tooltip, Spinner, ScoreRing, VerdictBanner, WashBar, ETABadge, ProgressCounter, PayETABadge, FundingTable } from '@/components/ui'
import AnalysisSection from '@/components/AnalysisSection'
import TierInfoPanel from '@/components/TierInfoPanel'
import ComparePanel from '@/components/ComparePanel'
import WalletCol from '@/components/WalletCol'
import dynamic from 'next/dynamic'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
)

export default function Home() {

  const { setVisible } = useWalletModal()

  const {
    dark, setDark,
    domain, setDomain,
    data, loading, error,
    showCompare, setShowCompare,
    analysisSignature,
    quickAnalysis, quickAnalyzing, quickProgress, quickETA,
    completeAnalysis, completeAnalyzing, completeProgress, completeETA, customTxs, setCustomTxs,
    isPro,
    proAnalysis, proAnalyzing, proProgress, proETA,
    history,
    copied, setCopied,
    payLoading, payError, payElapsed, payRestoring, restoreProPayment,
    reportRef,
    chainStatus, chainSig,
    lookup,
    analyzeMyWallet,
    restoreFromHistory,
    unlockPro,
    payForPro,
    shareReport,
    exportPDF,
    runFreeQuick,
    runFreeComplete,
    runProAnalysis,
    bestAnalysis,
    sybil,
    displayScore,
    tokenData, tokenRisk,
    formatETA,
    walletAge,
    TOOLTIPS,
    connected,
    publicKey,
    publishNow
  } = useSolId()

  const estimateETA = (txCount, isPro) => {
    const sleepMs = isPro ? 150 : 3000
    return Math.round((txCount * (sleepMs + 500)) / 1000)
  }

  const bg = dark ? '#09090f' : '#f4f4fb'
  const cardBg = dark ? '#0f0f1a' : '#ffffff'
  const border = dark ? '#1e1e2e' : '#e2e2ef'
  const textColor = dark ? '#e5e5e5' : '#111'
  const subColor = dark ? '#666' : '#888'
  const inputBg = dark ? '#0f0f1a' : '#fff'
  const inputBorder = dark ? '#1e1e2e' : '#d1d5db'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${bg}; transition: background 0.3s; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        button { cursor: pointer; border: none; font-family: 'DM Sans', sans-serif; }
        input { font-family: 'DM Sans', sans-serif; outline: none; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #333; border-radius: 99px; }
        .pdf-mode { background: #ffffff !important; color: #111111 !important; }
        .pdf-mode * { color: #111111 !important; }
        .pdf-mode .dark { background: #ffffff !important; color: #111111 !important; }
        .pdf-mode button, .pdf-mode .pdf-hide { display: none !important; }
        #kirapay-btn-container { display: none; }
      `}</style>

      <div id="kirapay-btn-container" aria-hidden="true" />

      <main style={{ minHeight: '100vh', padding: '3rem 1rem 6rem', fontFamily: "'DM Sans', sans-serif", background: bg, color: textColor, transition: 'background 0.3s, color 0.3s' }}>

        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setDark(d => !d)} style={{ width: 40, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', background: dark ? '#3C3489' : '#d1d5db', position: 'relative', display: 'flex', alignItems: 'center', padding: '0 3px' }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, transform: dark ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.3s' }}>
              {dark ? '🌙' : '☀️'}
            </span>
          </button>
          <WalletMultiButton />
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: dark ? '#fff' : '#111', fontFamily: "'Space Mono', monospace", letterSpacing: -1 }}>
              sol<span style={{ color: '#7F77DD' }}>.id</span>
            </h1>
            <p style={{ color: subColor, marginTop: 6, fontSize: 14 }}>
              Reputation score + sybil detection for any .sol identity, wallet, or autonomous agent
            </p>
          </div>

          <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: dark ? '#0f0f1a' : '#fafafa', border: `1.5px solid ${dark ? '#2a2a3e' : '#d1d5db'}` }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: dark ? '#fff' : '#111', marginBottom: 4 }}>🤖 Agent Identity Layer</p>
            <p style={{ fontSize: 12, color: subColor, marginBottom: 10, lineHeight: 1.6 }}>
              sol.id is a trust oracle for autonomous agents on Solana. Any agent can verify another agent's <strong style={{ color: dark ? '#7F77DD' : '#3C3489' }}>.sol identity</strong> and on-chain reputation before transacting.
            </p>
            <div style={{ background: dark ? '#13131f' : '#f0f0ff', borderRadius: 8, padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, color: dark ? '#7F77DD' : '#3C3489' }}>
              <p>GET /api/agent?domain=&#123;agent.sol&#125;</p>
              <p style={{ marginTop: 4, color: subColor }}>→ trusted, risk, washScore, circularTxs, verifiedAt</p>
            </div>
          </div>

          {connected && publicKey && history.length > 0 && (
            <div style={{ marginBottom: 24, padding: 16, background: cardBg, borderRadius: 14, border: `1px solid ${border}` }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: subColor, letterSpacing: 1, textTransform: 'uppercase' }}>Recent</p>
              {history.map((item, i) => {
                const s = getSybilRisk({ balance: item.balance, txCount: item.txCount })
                return (
                  <div key={i} onClick={() => restoreFromHistory(item)}
                    style={{ padding: '10px 14px', background: dark ? '#13131f' : '#f8f8fc', borderRadius: 10, marginBottom: 6, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#7F77DD44'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = border}
                  >
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: dark ? '#fff' : '#111' }}>{item.domain}{item.domain !== 'My Wallet' && !isValidSolanaAddress(item.domain) ? '.sol' : ''}</span>
                      <span style={{ fontSize: 12, color: subColor, marginLeft: 8, fontFamily: 'monospace' }}>{shortAddr(item.wallet)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11 }}>{s.emoji}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{item.score}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={domain} onChange={e => setDomain(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookup()} placeholder="domain (bonfida) or wallet address" style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${inputBorder}`, background: inputBg, color: textColor, fontSize: 15 }} />
            <button onClick={() => lookup()} style={{ padding: '14px 22px', borderRadius: 12, background: '#7F77DD', color: 'white', fontWeight: 700, fontSize: 15 }}>{loading ? <Spinner size={16} color="#fff" /> : 'Lookup'}</button>
          </div>

          {connected && publicKey && (
            <button onClick={analyzeMyWallet} style={{ width: '100%', marginBottom: 8, padding: '13px', borderRadius: 12, background: dark ? '#13131f' : '#f0f0ff', border: '1.5px solid #3C3489', color: dark ? '#fff' : '#3C3489', fontWeight: 600, fontSize: 14 }}>
              🔗 Analyze My Connected Wallet
            </button>
          )}

          <button onClick={() => setShowCompare(v => !v)} style={{ width: '100%', marginBottom: 8, padding: '12px', borderRadius: 12, background: 'transparent', border: `1.5px solid ${dark ? '#2a2a3e' : '#d1d5db'}`, color: dark ? '#888' : '#666', fontWeight: 600, fontSize: 14 }}>
            {showCompare ? '✕ Close Compare' : 'Compare Domains'}
          </button>

          {showCompare && <ComparePanel dark={dark} placeholder="Enter domain or address" />}

          {isPro && <p style={{ color: '#10B981', textAlign: 'center', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>✅ Pro Unlocked</p>}

          {error && <div style={{ marginTop: 12, padding: 14, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>⚠️ {error}</div>}

          {data && sybil && (
            <div ref={reportRef} style={{ marginTop: 28, background: cardBg, border: `1px solid ${border}`, borderRadius: 20, padding: 24, animation: 'fadeSlideIn 0.4s ease' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <p style={{ fontSize: 22, fontWeight: 800, color: dark ? '#fff' : '#111', fontFamily: "'Space Mono', monospace" }}>
                    {data.domain}{!isValidSolanaAddress(data.domain) && data.domain !== 'My Wallet' ? '.sol' : ''}
                  </p>
                  <a href={`https://solscan.io/account/${data.wallet}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: subColor, fontFamily: 'monospace', marginTop: 2, display: 'block', textDecoration: 'underline', cursor: 'pointer' }}>{data.wallet}</a>
                  <p style={{ fontSize: 12, color: subColor, marginTop: 4 }}>🕐 Age: {walletAge(data.walletAgeDays)}</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={shareReport} style={{ padding: '8px 14px', borderRadius: 8, background: dark ? '#1e1e2e' : '#f0f0ff', color: copied ? '#22c55e' : (dark ? '#aaa' : '#666'), fontSize: 12, fontWeight: 600 }}>{copied ? '✅ Copied!' : '🔗 Share'}</button>
                  {isPro && <button onClick={exportPDF} style={{ padding: '8px 14px', borderRadius: 8, background: dark ? '#1e1e2e' : '#f0f0ff', color: '#7F77DD', fontSize: 12, fontWeight: 600 }}>📄 PDF</button>}
                </div>
              </div>

              <VerdictBanner sybil={sybil} />

              {(() => {
                const agentColor = sybil.risk === 'low' ? '#10B981' : sybil.risk === 'medium' ? '#f59e0b' : '#ef4444'
                const agentBg = sybil.risk === 'low'
                  ? (dark ? '#0d1f17' : '#f0fdf4')
                  : sybil.risk === 'medium'
                    ? (dark ? '#1f1700' : '#fffbeb')
                    : (dark ? '#1f0707' : '#fef2f2')
                const agentBorder = sybil.risk === 'low'
                  ? (dark ? '#166534' : '#bbf7d0')
                  : sybil.risk === 'medium'
                    ? (dark ? '#78350f' : '#fde68a')
                    : (dark ? '#7f1d1d' : '#fecaca')
                const agentTextColor = sybil.risk === 'low'
                  ? (dark ? '#86efac' : '#166534')
                  : sybil.risk === 'medium'
                    ? (dark ? '#fcd34d' : '#92400e')
                    : (dark ? '#fca5a5' : '#991b1b')
                return (
                  <div style={{ marginBottom: 20, padding: '14px 16px', background: agentBg, borderRadius: 12, border: `1px solid ${agentBorder}` }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: agentColor, marginBottom: 4 }}>🤖 Agent Identity Verdict</p>
                    <p style={{ fontSize: 12, color: agentTextColor, lineHeight: 1.6 }}>
                      {sybil.risk === 'low'
                        ? '✅ Safe for autonomous agent interaction. Verdict is published on-chain and verifiable by any agent or protocol.'
                        : sybil.risk === 'medium'
                          ? '⚠️ Moderate risk detected. Agent interactions should proceed with caution.'
                          : '❌ High sybil risk. Not recommended for autonomous agent trust.'
                      }
                    </p>
                    <a
                      href={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/agent?${data?.hasDomain ? `domain=${data?.resolvedDomain}` : `wallet=${data?.wallet}`}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: agentColor, marginTop: 8, fontFamily: 'monospace', wordBreak: 'break-all', display: 'block', textDecoration: 'underline', opacity: 0.8 }}
                    >
                      🔗 /api/agent?{data?.hasDomain ? `domain=${data?.resolvedDomain}` : `wallet=${data?.wallet}`} ↗
                    </a>
                  </div>
                )
              })()}

              <div style={{ marginBottom: 20 }}>
                {chainStatus === 'done' ? (
                  <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.1)', borderRadius: 12, border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span>✅</span>
                    <strong style={{ color: '#22c55e' }}>Published on-chain</strong>
                    <a href={`https://solscan.io/tx/${chainSig}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#7F77DD', textDecoration: 'underline' }}>View on Solscan ↗</a>
                  </div>
                ) : (
                  <button onClick={publishNow} style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#7F77DD', color: 'white', fontWeight: 700, fontSize: 15 }}>
                    Publish Verdict on-chain
                  </button>
                )}
              </div>

              <div style={{ marginBottom: 24 }}>
                <ScoreRing score={displayScore} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                  <p style={{ textAlign: 'center', fontSize: 12, color: subColor }}>Reputation Score</p>
                  <Tooltip text={TOOLTIPS.score} dark={dark} />
                </div>
              </div>

              {/* ── Stat cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div style={{ background: dark ? '#13131f' : '#f8f8fc', borderRadius: 12, padding: '14px 10px', textAlign: 'center', border: `1px solid ${border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
                    <p style={{ fontSize: 9, color: subColor, textTransform: 'uppercase', letterSpacing: 1 }}>SOL Balance</p>
                    <Tooltip text={TOOLTIPS.balance} dark={dark} />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 800, color: dark ? '#fff' : '#111', fontFamily: "'Space Mono', monospace" }}>{data.balance?.toFixed(3)}</p>
                </div>
                <div style={{ background: dark ? '#13131f' : '#f8f8fc', borderRadius: 12, padding: '14px 10px', textAlign: 'center', border: `1px solid #7F77DD44` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
                    <p style={{ fontSize: 9, color: subColor, textTransform: 'uppercase', letterSpacing: 1 }}>Wallet Value</p>
                    <Tooltip text="Total portfolio value in USD including SOL and all tokens" dark={dark} />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#7F77DD', fontFamily: "'Space Mono', monospace" }}>
                    {data.walletValueUsd != null ? `$${data.walletValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
                <div style={{ background: dark ? '#13131f' : '#f8f8fc', borderRadius: 12, padding: '14px 10px', textAlign: 'center', border: `1px solid ${border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
                    <p style={{ fontSize: 9, color: subColor, textTransform: 'uppercase', letterSpacing: 1 }}>Transactions</p>
                    <Tooltip text={TOOLTIPS.txCount} dark={dark} />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 800, color: dark ? '#fff' : '#111', fontFamily: "'Space Mono', monospace" }}>{data.txCount}</p>
                </div>
                <div style={{ background: dark ? '#13131f' : '#f8f8fc', borderRadius: 12, padding: '14px 10px', textAlign: 'center', border: `1px solid ${border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
                    <p style={{ fontSize: 9, color: subColor, textTransform: 'uppercase', letterSpacing: 1 }}>Wallet Age</p>
                    <Tooltip text={TOOLTIPS.walletAge} dark={dark} />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 800, color: dark ? '#fff' : '#111', fontFamily: "'Space Mono', monospace" }}>{walletAge(data.walletAgeDays)}</p>
                </div>
              </div>

              {tokenRisk && (
                <div style={{ marginBottom: 24, padding: 16, borderRadius: 14, background: tokenRisk.bg, border: `1px solid ${tokenRisk.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: tokenRisk.color, margin: 0 }}>
                      {tokenRisk.emoji} Token Portfolio Scan
                    </p>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: tokenRisk.color + '22', color: tokenRisk.color }}>
                      {tokenRisk.label}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <p style={{ fontSize: 18, fontWeight: 800, color: dark ? '#fff' : '#111', margin: 0, fontFamily: "'Space Mono', monospace" }}>{tokenData.tokenCount}</p>
                      <p style={{ fontSize: 10, color: subColor, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>Total Tokens</p>
                    </div>
                    <div style={{ background: tokenData.junkTokenCount > 20 ? 'rgba(239,68,68,0.1)' : tokenData.junkTokenCount > 3 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.07)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <p style={{ fontSize: 18, fontWeight: 800, color: tokenData.junkTokenCount > 20 ? '#ef4444' : tokenData.junkTokenCount > 3 ? '#f59e0b' : '#22c55e', margin: 0, fontFamily: "'Space Mono', monospace" }}>{tokenData.junkTokenCount}</p>
                      <p style={{ fontSize: 10, color: subColor, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>Dust / Junk</p>
                    </div>
                  </div>

                  <p style={{ fontSize: 12, color: dark ? '#aaa' : '#555', lineHeight: 1.5, marginBottom: tokenData.suspiciousTokens?.length > 0 ? 10 : 0 }}>
                    {tokenRisk.verdict}
                  </p>

                  {tokenData.suspiciousTokens?.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, color: subColor, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Suspicious Tokens</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {tokenData.suspiciousTokens.slice(0, 8).map((t, i) => (
                          <div key={i}
                            onClick={() => t.mint && window.open(`https://solscan.io/token/${t.mint}`, '_blank')}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: dark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.04)', borderRadius: 8, cursor: t.mint ? 'pointer' : 'default', border: '1px solid rgba(239,68,68,0.12)' }}
                          >
                            <div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>{t.symbol}</span>
                              <span style={{ fontSize: 11, color: subColor, marginLeft: 6 }}>{t.name.length > 28 ? t.name.slice(0, 28) + '…' : t.name}</span>
                            </div>
                            <span style={{ fontSize: 11, color: subColor, fontFamily: 'monospace' }}>${t.value.toFixed(4)}</span>
                          </div>
                        ))}
                        {tokenData.junkTokenCount > 8 && (
                          <p style={{ fontSize: 11, color: subColor, textAlign: 'center', marginTop: 2 }}>
                            + {tokenData.junkTokenCount - 8} more junk tokens
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <TierInfoPanel type="free" />
                <button onClick={() => analysisSignature && runFreeQuick(analysisSignature)} disabled={quickAnalyzing || !analysisSignature} style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#7F77DD', color: 'white', fontWeight: 700, fontSize: 14, opacity: (quickAnalyzing || !analysisSignature) ? 0.45 : 1 }}>
                  {quickAnalyzing ? <><Spinner size={14} color="#fff" /><span style={{ marginLeft: 8 }}>Analyzing...</span></> : ` Free Quick Analysis — 10 txs · ${formatETA(estimateETA(10, false))}`}
                </button>
                {!connected && (
                  <p onClick={() => setVisible(true)} style={{ fontSize: 12, color: '#7F77DD', textAlign: 'center', marginTop: 8, cursor: 'pointer', textDecoration: 'underline' }}>
                    Connect your wallet to run analysis
                  </p>
                )}
                <ProgressCounter active={quickAnalyzing} current={quickProgress.current} total={quickProgress.total} etaSeconds={quickETA.seconds} startedAt={quickETA.startedAt} />
                {!quickAnalyzing && quickAnalysis && <AnalysisSection analysis={quickAnalysis} pro={false} dark={dark} />}
              </div>

              <div style={{ marginBottom: 24, paddingTop: 20, borderTop: `1px solid ${border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: dark ? '#fff' : '#111', margin: 0 }}>Free Complete Analysis</p>
                  <Tooltip dark={dark} text="Analyzes the latest X transactions. Detects circular transfers, flags round-amount transfers, and computes a sybil risk score." />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {[20, 50, Math.min(data?.txCount || 100, 100)].map((n, idx) => {
                    const label = idx === 2 ? `Max free (${n})` : `${n} txs`
                    return (
                      <button key={idx} onClick={() => analysisSignature && runFreeComplete(n, analysisSignature)} disabled={!analysisSignature || completeAnalyzing} style={{ flex: 1, padding: '11px', borderRadius: 10, background: dark ? '#13131f' : '#f8f8fc', border: `1.5px solid ${border}`, color: dark ? '#aaa' : '#666' }}>
                        {label}<br /><span style={{ fontSize: 10, opacity: 0.6 }}>{formatETA(estimateETA(n, false))}</span>
                      </button>
                    )
                  })}
                </div>
                {!connected && (
                  <p onClick={() => setVisible(true)} style={{ fontSize: 12, color: '#7F77DD', textAlign: 'center', marginTop: 4, marginBottom: 8, cursor: 'pointer', textDecoration: 'underline' }}>
                    Connect your wallet to run analysis
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" value={customTxs} onChange={e => setCustomTxs(e.target.value)} placeholder="Custom txs (max 100 free)" style={{ flex: 1, padding: '11px 14px', borderRadius: 10, background: inputBg, border: `1.5px solid ${inputBorder}`, color: textColor }} />
                  <button onClick={() => { const n = Math.min(parseInt(customTxs) || 0, 100); if (n && analysisSignature) runFreeComplete(n, analysisSignature) }} disabled={!analysisSignature} style={{ padding: '11px 20px', borderRadius: 10, background: '#7F77DD', color: 'white', fontWeight: 700 }}>Run</button>
                </div>
                <ProgressCounter active={completeAnalyzing} current={completeProgress.current} total={completeProgress.total} etaSeconds={completeETA.seconds} startedAt={completeETA.startedAt} />
                {!completeAnalyzing && completeAnalysis && <AnalysisSection analysis={completeAnalysis} pro={false} dark={dark} />}
              </div>

              <div style={{ paddingTop: 20, borderTop: `1px solid ${border}` }}>
                <TierInfoPanel type="pro" />
                {!isPro ? (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={payForPro}
                        disabled={payLoading || payRestoring || !connected}
                        style={{ flex: 2, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #3C3489, #6C5CE7)', color: 'white', fontWeight: 700, fontSize: 15, opacity: (payLoading || payRestoring || !connected) ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', cursor: (payLoading || payRestoring || !connected) ? 'not-allowed' : 'pointer' }}
                      >
                        {(payLoading || payRestoring) ? <><Spinner size={16} color="#fff" /> {payRestoring ? 'Verifying payment…' : 'Awaiting payment…'}{payElapsed > 0 ? ` (${payElapsed < 60 ? `${payElapsed}s` : `${Math.floor(payElapsed / 60)}m ${payElapsed % 60}s`})` : ''}</> : <>Unlock Pro — $5</>}
                      </button>
                      <button
                        onClick={unlockPro}
                        style={{ flex: 1, padding: '14px 12px', borderRadius: 12, border: '2px dashed #10B981', background: 'rgba(16,185,129,0.06)', color: '#10B981', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                      >
                        Demo Unlock
                      </button>
                    </div>
                    <p style={{ fontSize: 11, color: subColor, textAlign: 'center', marginTop: 6 }}>
                      Pay with any supported token via KIRAPAY · Powered by{' '}
                      <a href="https://kira-pay.com" target="_blank" rel="noreferrer" style={{ color: '#7F77DD', textDecoration: 'none' }}>KIRAPAY</a>
                    </p>
                    {!connected && !payError && (
                      <p onClick={() => setVisible(true)} style={{ fontSize: 12, color: '#7F77DD', textAlign: 'center', marginTop: 8, cursor: 'pointer', textDecoration: 'underline' }}>
                        Connect your wallet to unlock Pro
                      </p>
                    )}
                    {payError && (
                      <div style={{ marginTop: 12, padding: 14, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 14 }}>
                        ⚠️ {payError}
                        {connected && (
                          <button onClick={restoreProPayment} style={{ marginTop: 8, display: 'block', width: '100%', padding: '8px', borderRadius: 8, background: 'rgba(127,119,221,0.15)', color: '#7F77DD', border: '1px solid rgba(127,119,221,0.3)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            Verify Payment
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <button onClick={() => analysisSignature && runProAnalysis(analysisSignature)} disabled={proAnalyzing || !analysisSignature} style={{ width: '100%', padding: '15px', borderRadius: 12, background: 'linear-gradient(135deg, #3C3489, #7F77DD)', color: 'white', fontWeight: 700 }}>
                      {proAnalyzing ? <><Spinner size={15} color="#7F77DD" /><span style={{ marginLeft: 8 }}>Running Deep Analysis...</span></> : `Run Full Deep Analysis — ${data?.txCount || 50} txs · ${formatETA(estimateETA(data?.txCount || 50, true))}`}
                    </button>
                    <ProgressCounter active={proAnalyzing} current={proProgress.current} total={proProgress.total} etaSeconds={proETA.seconds} startedAt={proETA.startedAt} />
                    {!proAnalyzing && proAnalysis && <AnalysisSection analysis={proAnalysis} pro={true} dark={dark} />}
                  </>
                )}
              </div>

            </div>
          )}

        </div>
      </main>
    </>
  )
}