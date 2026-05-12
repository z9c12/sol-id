import jsPDF from 'jspdf'
import { getSybilRisk, getTokenRisk, shortAddr, walletAge } from './wallet-utils'

export async function exportPDF({ data, proAnalysis, completeAnalysis, quickAnalysis, tokenData, displayScore }) {
  if (!data) { alert('Run an analysis first before exporting PDF.'); return }

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, 210] })
  const pageWidth = 297
  const pageHeight = 210
  let y = 15

  const checkPage = (neededSpace = 20) => {
    if (y + neededSpace > pageHeight - 15) { pdf.addPage(); y = 20 }
  }

  const addSolscanLink = (displayText, x, yPos, fullValue, type = 'address') => {
    if (!fullValue || fullValue.length < 8) return
    const width = pdf.getTextWidth(displayText.replace('...', '').trim()) + 2
    const url = type === 'tx'
      ? `https://solscan.io/tx/${fullValue}`
      : `https://solscan.io/address/${fullValue}`
    pdf.link(x, yPos - 3.5, width, 6.5, { url })
  }

  // Header
  pdf.setFillColor(63, 52, 137)
  pdf.rect(0, 0, pageWidth, 32, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(28); pdf.setFont('helvetica', 'bold')
  pdf.text('sol.id', 22, 22)
  pdf.setFontSize(12); pdf.setFont('helvetica', 'normal')
  pdf.text('SNS Identity • Sybil Guard • Agent Trust', 110, 22)
  pdf.setFontSize(9)
  pdf.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageWidth - 72, 22)
  y = 44

  // Wallet identity
  pdf.setTextColor(0, 0, 0); pdf.setFontSize(22); pdf.setFont('helvetica', 'bold')
  pdf.text(data.domain || shortAddr(data.wallet) || 'Wallet', 22, y)
  pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80)
  pdf.text(data.wallet || '', 22, y + 8)
  addSolscanLink(data.wallet || '', 22, y + 8, data.wallet, 'address')
  pdf.text(`Wallet Age: ${walletAge(data.walletAgeDays) || '—'}`, 22, y + 16)
  y += 28

  // Risk badge
  const bestAnal = proAnalysis || completeAnalysis || quickAnalysis
  const score = displayScore ?? data.score ?? bestAnal?.score ?? 71
  const riskLevel = bestAnal
    ? getSybilRisk({
        balance: data.balance ?? 0, txCount: data.txCount ?? 0,
        circularCount: bestAnal?.circular?.length ?? 0,
        roundCount: bestAnal?.roundAmountCount ?? 0,
        washScore: bestAnal?.washScore ?? 0,
        quickFlipCount: bestAnal?.quickFlipCount ?? 0,
        dustTxCount: bestAnal?.dustTxCount ?? 0,
        junkTokenCount: tokenData?.junkTokenCount ?? 0,
      }).risk
    : score >= 70 ? 'low' : score >= 50 ? 'medium' : 'high'
  const risk = riskLevel.toLowerCase()
  const badgeColor = risk === 'low' ? [16, 185, 129] : risk === 'medium' ? [234, 179, 8] : [239, 68, 68]
  const badgeLabel = risk === 'low' ? 'Trusted Identity' : risk === 'medium' ? 'Moderate Risk' : 'High Risk'
  const badgeSub = risk === 'low'
    ? 'Safe for governance & airdrops • Verified .sol identity'
    : 'Review recommended before governance or airdrop inclusion'
  pdf.setFillColor(...badgeColor)
  pdf.roundedRect(22, y, 253, 22, 4, 4, 'F')
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(13); pdf.setFont('helvetica', 'bold')
  pdf.text(badgeLabel, 36, y + 13)
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal')
  pdf.text(badgeSub, 36, y + 19)
  y += 32

  // Score ring
  const scoreColor = score >= 70 ? '#10b981' : score >= 50 ? '#eab308' : '#ef4444'
  pdf.setDrawColor(scoreColor); pdf.setLineWidth(8)
  pdf.circle(42, y + 22, 22, 'S')
  pdf.setFontSize(36); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(scoreColor)
  pdf.text(score.toString(), 42, y + 29, { align: 'center' })
  pdf.setFontSize(8); pdf.setTextColor(120, 120, 120)
  pdf.text('/ 100', 42, y + 36, { align: 'center' })
  pdf.setFontSize(11); pdf.setTextColor(30, 30, 30); pdf.setFont('helvetica', 'bold')
  pdf.text('Reputation Score', 74, y + 18)
  ;[
    { label: 'WALLET VALUE', value: data.walletValueUsd != null ? `$${data.walletValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${typeof data.balance === 'number' ? data.balance.toFixed(3) : '0.000'} SOL`, x: 74 },
    { label: 'TRANSACTIONS', value: (data.txCount ?? 0).toString(), x: 160 },
    { label: 'WALLET AGE', value: walletAge(data.walletAgeDays) || '—', x: 230 },
  ].forEach(({ label, value, x }) => {
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(130, 130, 130)
    pdf.text(label, x, y + 30)
    pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0)
    pdf.text(value, x, y + 40)
  })
  y += 58

  // Wash score
  checkPage(30)
  const washScore = bestAnal?.washScore ?? 0
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0)
  pdf.text('Wash Trading Score', 22, y)
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(130, 130, 130)
  pdf.text(washScore < 30 ? 'Clean' : washScore < 60 ? 'Moderate' : 'Suspicious', 100, y)
  y += 7
  pdf.setFillColor(220, 220, 220); pdf.roundedRect(22, y, 230, 8, 4, 4, 'F')
  const barW = Math.max((washScore / 100) * 230, washScore > 0 ? 8 : 0)
  const [br, bg, bb] = washScore < 30 ? [16, 185, 129] : washScore < 60 ? [234, 179, 8] : [239, 68, 68]
  pdf.setFillColor(br, bg, bb)
  if (barW > 0) pdf.roundedRect(22, y, barW, 8, 4, 4, 'F')
  pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0)
  pdf.text(`${washScore}/100`, 258, y + 6)
  y += 22

  // Circular transactions
  const circular = bestAnal?.circular || []
  if (circular.length > 0) {
    checkPage(40)
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0)
    pdf.text(`Circular Transactions Detected: ${circular.length}`, 22, y); y += 9
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80)
    circular.slice(0, 6).forEach(item => {
      checkPage(10)
      const short = item.addr || shortAddr(item.fullAddr)
      const line = `• ${short} -> ${item.count || 0} txs | sent: ${Number(item.sent || 0).toFixed(3)} received: ${Number(item.received || 0).toFixed(3)} SOL`
      pdf.text(line, 22, y)
      if (item.fullAddr) addSolscanLink(short, 22 + pdf.getTextWidth(line.split(short)[0] || '• '), y, item.fullAddr, 'address')
      y += 7
    })
    y += 8
  }

  // Round amounts
  const roundAmounts = bestAnal?.roundAmounts || []
  if (roundAmounts.length > 0) {
    checkPage(50)
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(239, 68, 68)
    pdf.text('Suspicious Round Amounts', 22, y); y += 8
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80)
    roundAmounts.slice(0, 8).forEach(item => {
      checkPage(9)
      const short = item.addr || shortAddr(item.counterAddr)
      const line = `• ${Number(item.sol || 0).toFixed(4)} SOL ${item.direction === 'sent' ? 'sent to' : 'received from'} ${short}`
      pdf.text(line, 22, y)
      if (item.txSignature) addSolscanLink(short, 22 + pdf.getTextWidth(line.split(short)[0] || '• '), y, item.txSignature, 'tx')
      y += 7
    })
    y += 6
  }

  // Funding sources
  const funding = bestAnal?.fundingGraph || []
  if (funding.length > 0) {
    checkPage(70)
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0)
    pdf.text('Top Funding Sources', 22, y); y += 8
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(130, 130, 130)
    pdf.text('Source', 22, y); pdf.text('SOL', 120, y); pdf.text('Transactions', 170, y); y += 4
    pdf.setDrawColor(200, 200, 200); pdf.line(22, y, 270, y); y += 6
    pdf.setFontSize(9); pdf.setTextColor(0, 0, 0)
    funding.slice(0, 8).forEach(row => {
      checkPage(18)
      const short = row.addr || shortAddr(row.fullAddr)
      const txList = row.txSignatures || []
      pdf.text(short, 22, y); pdf.text(Number(row.sol || 0).toFixed(3), 120, y); pdf.text(`${txList.length} txs`, 170, y)
      if (row.fullAddr) addSolscanLink(short, 22, y, row.fullAddr, 'address')
      y += 6
      if (txList.length > 0) {
        pdf.setFontSize(7.5); pdf.setTextColor(100, 100, 100)
        txList.slice(0, 3).forEach(txSig => {
          const shortTx = txSig.slice(0, 8) + '...' + txSig.slice(-6)
          pdf.text(`   ↳ ${shortTx}`, 28, y)
          addSolscanLink(shortTx, 28, y, txSig, 'tx'); y += 5
        })
        if (txList.length > 3) { pdf.text(`   + ${txList.length - 3} more txs`, 28, y); y += 5 }
        pdf.setFontSize(9); pdf.setTextColor(0, 0, 0); y += 2
      }
    })
  }

  // Token portfolio scan
  if (tokenData) {
    checkPage(50)
    const tr = getTokenRisk({ tokenCount: tokenData.tokenCount, junkTokenCount: tokenData.junkTokenCount })
    const trColor = tr.risk === 'high' ? [239, 68, 68] : tr.risk === 'medium' ? [245, 158, 11] : [34, 197, 94]
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0)
    pdf.text('Token Portfolio Scan', 22, y); y += 8
    pdf.setFillColor(...trColor); pdf.roundedRect(22, y, 80, 14, 3, 3, 'F')
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(10); pdf.setFont('helvetica', 'bold')
    pdf.text(`${tr.emoji} ${tr.label}`, 28, y + 9); y += 20
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80)
    pdf.text(`Total tokens: ${tokenData.tokenCount}   Junk/dust tokens: ${tokenData.junkTokenCount}`, 22, y); y += 8
    pdf.text(tr.verdict, 22, y); y += 10
    if (tokenData.suspiciousTokens?.length > 0) {
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(239, 68, 68)
      pdf.text('Suspicious Tokens (zero-value / dust):', 22, y); y += 6
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80)
      tokenData.suspiciousTokens.slice(0, 10).forEach(t => {
        checkPage(7)
        const line = `• [${t.symbol}] ${t.name.slice(0, 40)} — $${t.value.toFixed(4)}`
        pdf.text(line, 22, y)
        if (t.mint) pdf.link(22, y - 4, 200, 6, { url: `https://solscan.io/token/${t.mint}` })
        y += 6
      })
      if (tokenData.junkTokenCount > 10) {
        pdf.text(`+ ${tokenData.junkTokenCount - 10} more junk tokens not shown`, 22, y); y += 8
      }
    }
    y += 6
  }

  // Footer
  const totalPages = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(160, 160, 160)
    pdf.text('Full on-chain analysis • Generated by sol.id • SNS Identity Track — Colosseum Hackathon', 22, pageHeight - 8)
    pdf.text(`Powered by Solana & SNS | Page ${i}/${totalPages}`, pageWidth - 100, pageHeight - 8)
  }

  pdf.save(data?.domain && !data.domain.startsWith('..')
    ? `sol-id-report-${data.domain}.pdf`
    : `sol-id-report-${shortAddr(data?.wallet || 'wallet')}.pdf`)
}
