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

// SSR disabled — depends on window/localStorage
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
    payLoading, payStartedAt, payError,
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
      `}</style>

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
            {/* updated tagline — covers both social and agent identity tracks */}
            <p style={{ color: subColor, marginTop: 6, fontSize: 14 }}>
              Reputation score + sybil detection for any .sol identity, wallet, or autonomous agent
            </p>
          </div>

          {/* Agent Identity Layer — always visible, explains the API to judges/agents */}
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

          {/* history panel */}
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
            <button onClick={lookup} style={{ padding: '14px 22px', borderRadius: 12, background: '#7F77DD', color: 'white', fontWeight: 700, fontSize: 15 }}>{loading ? <Spinner size={16} color="#fff" /> : 'Lookup'}</button>
          </div>

          {connected && publicKey && (
            <button onClick={analyzeMyWallet} style={{ width: '100%', marginBottom: 8, padding: '13px', borderRadius: 12, background: dark ? '#13131f' : '#f0f0ff', border: '1.5px solid #3C3489', color: dark ? '#fff' : '#3C3489', fontWeight: 600, fontSize: 14 }}>
              🔗 Analyze My Connected Wallet
            </button>
          )}

          <button onClick={() => setShowCompare(v => !v)} style={{ width: '100%', marginBottom: 8, padding: '12px', borderRadius: 12, background: 'transparent', border: `1.5px solid ${dark ? '#2a2a3e' : '#d1d5db'}`, color: dark ? '#888' : '#666', fontWeight: 600, fontSize: 14 }}>
            {showCompare ? '✕ Close Compare' : '⚖️ Compare Wallets'}
          </button>

          {showCompare && <ComparePanel dark={dark} />}

          {isPro && <p style={{ color: '#10B981', textAlign: 'center', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>✅ Pro Unlocked</p>}

          {error && <div style={{ marginTop: 12, padding: 14, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>⚠️ {error}</div>}

          {data && sybil && (
            <div ref={reportRef} style={{ marginTop: 28, background: cardBg, border: `1px solid ${border}`, borderRadius: 20, padding: 24, animation: 'fadeSlideIn 0.4s ease' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <p style={{ fontSize: 22, fontWeight: 800, color: dark ? '#fff' : '#111', fontFamily: "'Space Mono', monospace" }}>
                    {data.domain}{!isValidSolanaAddress(data.domain) && data.domain !== 'My Wallet' ? '.sol' : ''}
                  </p>
                  <p style={{ fontSize: 12, color: subColor, fontFamily: 'monospace', marginTop: 2 }}>{data.wallet}</p>
                  <p style={{ fontSize: 12, color: subColor, marginTop: 4 }}>🕐 Age: {walletAge(data.walletAgeDays)}</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={shareReport} style={{ padding: '8px 14px', borderRadius: 8, background: dark ? '#1e1e2e' : '#f0f0ff', color: copied ? '#22c55e' : (dark ? '#aaa' : '#666'), fontSize: 12, fontWeight: 600 }}>{copied ? '✅ Copied!' : '🔗 Share'}</button>
                  {isPro && <button onClick={exportPDF} style={{ padding: '8px 14px', borderRadius: 8, background: dark ? '#1e1e2e' : '#f0f0ff', color: '#7F77DD', fontSize: 12, fontWeight: 600 }}>📄 PDF</button>}
                </div>
              </div>

              <VerdictBanner sybil={sybil} />

              {/* Agent Identity verdict — shown after VerdictBanner */}
              <div style={{ marginBottom: 20, padding: '14px 16px', background: dark ? '#0d1f17' : '#f0fdf4', borderRadius: 12, border: `1px solid ${dark ? '#166534' : '#bbf7d0'}` }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#10B981', marginBottom: 4 }}>🤖 Agent Identity Verdict</p>
                <p style={{ fontSize: 12, color: dark ? '#86efac' : '#166534', lineHeight: 1.6 }}>
                  {sybil.risk === 'low'
                    ? '✅ Safe for autonomous agent interaction. Verdict is published on-chain and verifiable by any agent or protocol.'
                    : sybil.risk === 'medium'
                      ? '⚠️ Moderate risk detected. Agent interactions should proceed with caution.'
                      : '❌ High sybil risk. Not recommended for autonomous agent trust.'
                  }
                </p>
                {/* machine-readable API link for judges / other agents to inspect */}
                <p style={{ fontSize: 11, color: subColor, marginTop: 8, fontFamily: 'monospace', wordBreak: 'break-all' }}>
  🔗 /api/agent?{isValidSolanaAddress(data?.domain) || data?.domain === 'My Wallet' 
    ? `wallet=${data?.wallet}` 
    : `domain=${data?.domain}`}
</p>
              </div>

              {/* on-chain publish */}
              <div style={{ marginBottom: 20 }}>
                {chainStatus === 'done' ? (
                  <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.1)', borderRadius: 12, border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span>✅</span>
                    <strong style={{ color: '#22c55e' }}>Published on-chain</strong>
                    <a href={`https://solscan.io/tx/${chainSig}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#7F77DD', textDecoration: 'underline' }}>View on Solscan ↗</a>
                  </div>
                ) : (
                  <button onClick={publishNow} style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#7F77DD', color: 'white', fontWeight: 700, fontSize: 15 }}>
                    📤 Publish Verdict on-chain
                  </button>
                )}
              </div>

              <div style={{ marginBottom: 24 }}>
                <ScoreRing score={data.score} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                  <p style={{ textAlign: 'center', fontSize: 12, color: subColor }}>Reputation Score</p>
                  <Tooltip text={TOOLTIPS.score} dark={dark} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
                {[
                  { label: 'SOL Balance', val: data.balance?.toFixed(3), tip: TOOLTIPS.balance },
                  { label: 'Transactions', val: data.txCount, tip: TOOLTIPS.txCount },
                  { label: 'Wallet Age', val: walletAge(data.walletAgeDays), tip: TOOLTIPS.walletAge },
                ].map(s => (
                  <div key={s.label} style={{ background: dark ? '#13131f' : '#f8f8fc', borderRadius: 12, padding: '14px 10px', textAlign: 'center', border: `1px solid ${border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
                      <p style={{ fontSize: 9, color: subColor, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</p>
                      <Tooltip text={s.tip} dark={dark} />
                    </div>
                    <p style={{ fontSize: 16, fontWeight: 800, color: dark ? '#fff' : '#111', fontFamily: "'Space Mono', monospace" }}>{s.val}</p>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 24 }}>
                <TierInfoPanel type="free" />
                <button onClick={() => analysisSignature && runFreeQuick(analysisSignature)} disabled={quickAnalyzing || !analysisSignature} style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#7F77DD', color: 'white', fontWeight: 700, fontSize: 14, opacity: (quickAnalyzing || !analysisSignature) ? 0.45 : 1 }}>
                  {quickAnalyzing ? <><Spinner size={14} color="#fff" /><span style={{ marginLeft: 8 }}>Analyzing...</span></> : `🔍 Free Quick Analysis — 10 txs · ${formatETA(estimateETA(10, false))}`}
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
                        disabled={payLoading || !connected}
                        style={{
                          flex: 2,
                          padding: '14px 16px',
                          borderRadius: 12,
                          background: '#3C3489',
                          color: 'white',
                          fontWeight: 700,
                          opacity: payLoading ? 0.7 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8
                        }}
                      >
                        {payLoading ? (
                          <>
                            <Spinner size={16} color="#fff" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <img src="/usdc.png" alt="USDC" width="26" height="26" style={{ marginRight: '8px' }} />
                            Pay $5 USDC
                          </>
                        )}
                      </button>
                      <button onClick={unlockPro} style={{ flex: 1, padding: '14px 12px', borderRadius: 12, border: '2px dashed #10B981', background: 'rgba(16,185,129,0.06)', color: '#10B981' }}>🎪 Demo unlock Pro free</button>
                    </div>

                    {!connected && !payError && (
                      <p onClick={() => setVisible(true)} style={{ fontSize: 12, color: '#7F77DD', textAlign: 'center', marginTop: 8, cursor: 'pointer', textDecoration: 'underline' }}>
                        Connect your wallet to pay and unlock Pro
                      </p>
                    )}

                    {payError && (
                      <div style={{ marginTop: 12, padding: 14, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 14 }}>
                        ⚠️ {payError}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <button onClick={() => analysisSignature && runProAnalysis(analysisSignature)} disabled={proAnalyzing || !analysisSignature} style={{ width: '100%', padding: '15px', borderRadius: 12, background: 'linear-gradient(135deg, #3C3489, #7F77DD)', color: 'white', fontWeight: 700 }}>
                      {proAnalyzing ? <><Spinner size={15} color="#7F77DD" /><span style={{ marginLeft: 8 }}>Running Deep Analysis...</span></> : `🔬 Run Full Deep Analysis — ${data?.txCount || 50} txs`}
                    </button>
                    <ProgressCounter active={proAnalyzing} current={proProgress.current} total={proProgress.total} etaSeconds={proETA.seconds} startedAt={proETA.startedAt} />
                    {!proAnalyzing && proAnalysis && <AnalysisSection analysis={proAnalysis} pro={true} dark={dark} />}
                  </>
                )}
              </div>
s
            </div>
          )}

        </div>
      </main>
    </>
  )
}