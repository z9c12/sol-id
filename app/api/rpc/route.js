export async function POST(req) {
    const body = await req.json();
    
    const response = await fetch(process.env.ALCHEMY_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  
    const data = await response.json();
    return Response.json(data);
  }