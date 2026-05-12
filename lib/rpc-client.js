const RPC_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/rpc`

const FALLBACKS = [
  'https://rpc.ankr.com/solana',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://api.mainnet-beta.solana.com',
]

export async function createConnection() {
  const { Connection } = await import('@solana/web3.js')
  for (const url of [RPC_URL, ...FALLBACKS]) {
    try {
      const conn = new Connection(url)
      await conn.getLatestBlockhash()
      return conn
    } catch {
      console.warn(`RPC failed, trying next: ${url}`)
    }
  }
  throw new Error('All RPC endpoints failed')
}
