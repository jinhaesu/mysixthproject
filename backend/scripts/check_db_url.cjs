const url = process.env.DATABASE_URL;
try {
  const p = new URL(url);
  console.log('Host:', p.hostname);
  console.log('Port:', p.port);
  console.log('User:', p.username);
  console.log('Database:', p.pathname.slice(1));
  // Supabase host patterns:
  //   db.xxx.supabase.co (direct, port 5432)
  //   aws-N-region.pooler.supabase.com (pooler, 5432 = session, 6543 = transaction)
  if (p.hostname.includes('pooler.supabase')) {
    console.log('→ Supabase pooler in use');
    if (p.port === '5432') console.log('  Mode: SESSION (per-connection backend, can exhaust)');
    else if (p.port === '6543') console.log('  Mode: TRANSACTION (multiplexed, recommended for API)');
  } else if (p.hostname.startsWith('db.')) {
    console.log('→ Supabase direct connection (no pooler)');
  }
} catch (e) {
  console.log('Parse error:', e.message);
}
