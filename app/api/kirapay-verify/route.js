// app/api/kirapay-verify/route.js
// Server-side KIRAPAY payment verification.
// Called by the client while polling after the checkout modal opens.
// Keeps the KIRAPAY API key server-side only.
//
// Usage: GET /api/kirapay-verify?amount=5&after=1715000000000
//   amount  — expected payment amount in USD (we check >= amount - 0.1 for fees)
//   after   — Unix ms timestamp of when the modal opened (ignore older txs)

export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const amount = parseFloat(searchParams.get('amount') || '5')
    const after = parseInt(searchParams.get('after') || '0')
  
    const apiKey = process.env.KIRAPAY_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'KIRAPAY API key not configured' }, { status: 500 })
    }
  
    try {
      const url = new URL('https://api.kira-pay.com/api/wallet/transactions')
      url.searchParams.set('page', '1')
      url.searchParams.set('limit', '10')
      url.searchParams.set('status', 'Success')
      // Filter by minimum amount — subtract small buffer for fee rounding
      url.searchParams.set('amount_min', String(Math.max(0, amount - 0.5)))
  
      const res = await fetch(url.toString(), {
        headers: { 'x-api-key': apiKey },
        cache: 'no-store',
      })
  
      if (!res.ok) {
        return Response.json({ error: 'KIRAPAY API error', status: res.status }, { status: 502 })
      }
  
      const json = await res.json()
      const transactions = json?.data?.transactions || []
  
      // Find a successful transaction created after the modal opened
      const afterSec = after / 1000
      const match = transactions.find(tx => {
        if (tx.status !== 'Success') return false
        const txTime = new Date(tx.updatedAt || tx.createdAt).getTime() / 1000
        return txTime >= afterSec - 130 // 30s grace for clock drift
      })
  
      if (match) {
        return Response.json({
          verified: true,
          txId: match._id,
          hash: match.hash,
          amount: match.settlementAmount,
        })
      }
  
      return Response.json({ verified: false })
    } catch (e) {
      console.error('kirapay-verify error:', e)
      return Response.json({ error: 'Verification failed' }, { status: 500 })
    }
  }