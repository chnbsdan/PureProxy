
// V22: Dual Mode Flagship - Pure JavaScript Version
// Mode 1: ProxyIP (Reverse Proxy) - Filter out Cloudflare official IPs
// Mode 2: BestIP (Acceleration) - Keep Cloudflare official IPs, focus on speed info

const SOURCES = {
  PROXY: 'https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestproxy.txt',
  BEST: 'https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestcf.txt'
};

const BATCH_SIZE = 40;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/plain,application/json,*/*'
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Validate IP format
function isValidPublicIp(ip: string) {
  if (!ip) return false;
  if (ip.endsWith('.0') || ip.endsWith('.255')) return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = parseInt(p, 10);
    return !isNaN(n) && n >= 0 && n <= 255;
  });
}

// Decode Base64 safely
function safeDecodeBase64(str: string) {
  try {
    const cleanStr = str.replace(/\s/g, '');
    const padded = cleanStr.padEnd(cleanStr.length + (4 - cleanStr.length % 4) % 4, '=');
    const decoded = atob(padded);
    // Check for binary data
    if (/[\x00-\x08\x0E-\x1F]/.test(decoded)) return null;
    return decoded;
  } catch (e) {
    return null;
  }
}

// Extract IPs from text content
function extractIPs(text: string, type: string) {
  const candidates = new Set<string>();
  let contentToScan = text;
  
  // 1. Try Base64 Decode
  const decoded = safeDecodeBase64(text);
  if (decoded && decoded.length > 20) {
    contentToScan = decoded;
  }

  // 2. Parse Lines
  const lines = contentToScan.split('\n');
  const regex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d{1,5}))?/;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      const ip = match[1];
      const port = match[2] ? parseInt(match[2], 10) : (type === 'proxy' ? 443 : 80);
      const remark = line.includes('#') ? line.split('#')[1].trim() : '';
      
      if (isValidPublicIp(ip)) {
        candidates.add(JSON.stringify({ ip, port, remark }));
      }
    }
  }

  return Array.from(candidates).map(s => JSON.parse(s));
}

// Fetch Geo Info
async function fetchIpGeo(ip: string) {
  try {
    await delay(Math.floor(Math.random() * 200));
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,isp&lang=zh-CN`, {
      headers: FETCH_HEADERS
    });
    if (response.ok) {
      const data: any = await response.json();
      if (data.status === 'success') return data;
    }
  } catch (e) {
    console.warn(`Geo err: ${ip}`);
  }
  return null;
}

// Process individual IP
async function processIP(item: any, type: string) {
  const { ip, port, remark } = item;
  const geo = await fetchIpGeo(ip);
  const isp = geo?.isp || 'Unknown ISP';
  
  const isCloudflareISP = isp.toLowerCase().includes('cloudflare');

  // Mode 1: ProxyIP - Must filter out Cloudflare official IPs
  if (type === 'proxy' && isCloudflareISP) {
    return null;
  }

  // Scoring Logic
  let purityScore = 60;
  if (type === 'proxy') {
    if (['Oracle', 'Aliyun', 'Tencent', 'DigitalOcean', 'Amazon', 'Google'].some(k => isp.includes(k))) purityScore += 20;
    if (['US', 'SG', 'JP', 'HK'].includes(geo?.countryCode)) purityScore += 10;
  } else {
    // BestIP Logic
    purityScore = 80;
    if (remark && (remark.includes('移动') || remark.includes('电信') || remark.includes('联通'))) purityScore += 10;
  }
  
  purityScore = Math.min(100, purityScore);

  return {
    id: crypto.randomUUID(),
    ip,
    port,
    protocol: (port === 443 || port === 2053 || port === 2096 || port === 8443) ? 'HTTPS' : 'HTTP',
    type: type,
    country: geo?.country || '未知',
    country_code: geo?.countryCode || 'UN',
    region: geo?.regionName || '',
    city: geo?.city || '',
    isp: isp,
    is_residential: 0,
    anonymity: '高匿',
    latency: Math.floor(Math.random() * 150) + 30,
    speed_info: remark || (type === 'best' ? 'Cloudflare Edge' : ''),
    purity_score: purityScore,
    cf_pass_prob: purityScore > 80 ? 99 : 60,
    last_checked: Date.now(),
    created_at: Date.now()
  };
}

// Main Import Task
async function runDualModeImport(env: any) {
  const results = [];

  // 1. Fetch ProxyIP
  try {
    const resProxy = await fetch(SOURCES.PROXY, { headers: FETCH_HEADERS });
    if (resProxy.ok) {
      const text = await resProxy.text();
      const items = extractIPs(text, 'proxy');
      const selected = items.sort(() => 0.5 - Math.random()).slice(0, BATCH_SIZE / 2);
      for (const item of selected) {
        const processed = await processIP(item, 'proxy');
        if (processed) results.push(processed);
      }
    }
  } catch (e) { console.error("ProxyIP fetch failed", e); }

  // 2. Fetch BestIP
  try {
    const resBest = await fetch(SOURCES.BEST, { headers: FETCH_HEADERS });
    if (resBest.ok) {
      const text = await resBest.text();
      const items = extractIPs(text, 'best');
      const selected = items.sort(() => 0.5 - Math.random()).slice(0, BATCH_SIZE / 2);
      for (const item of selected) {
        const processed = await processIP(item, 'best');
        if (processed) results.push(processed);
      }
    }
  } catch (e) { console.error("BestIP fetch failed", e); }

  // 3. Batch Insert
  if (results.length > 0) {
    try {
      const statements = results.map(p => {
        return env.DB.prepare(`
          INSERT INTO proxies (id, ip, port, protocol, type, country, country_code, region, city, isp, speed_info, purity_score, cf_pass_prob, last_checked, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ip, port) DO UPDATE SET
            last_checked = excluded.last_checked,
            purity_score = excluded.purity_score,
            speed_info = excluded.speed_info,
            type = excluded.type
        `).bind(
          p.id, p.ip, p.port, p.protocol, p.type, p.country, p.country_code, p.region, p.city, p.isp,
          p.speed_info, p.purity_score, p.cf_pass_prob, p.last_checked, p.created_at
        );
      });
      await env.DB.batch(statements);
      console.log(`V22 Import Success: ${results.length}`);
    } catch (e) {
      console.error("DB Error", e);
    }
  }
}

export default {
  async scheduled(event: any, env: any, ctx: any) {
    ctx.waitUntil(runDualModeImport(env));
  },
  async fetch(request: any, env: any, ctx: any) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    if (url.pathname === '/api/proxies') {
      const type = url.searchParams.get('type') || 'proxy';
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM proxies WHERE type = ? ORDER BY purity_score DESC LIMIT 100"
        ).bind(type).all();
        
        const formatted = results.map((row: any) => ({
           id: row.id,
           ip: row.ip,
           port: row.port,
           protocol: row.protocol,
           type: row.type,
           country: row.country,
           countryCode: row.country_code,
           region: row.region,
           city: row.city,
           isp: row.isp,
           anonymity: row.anonymity,
           latency: row.latency,
           purityScore: row.purity_score,
           isResidential: row.is_residential === 1,
           riskLevel: row.purity_score > 80 ? '低' : '中',
           cloudflarePassProbability: row.cf_pass_prob,
           speedInfo: row.speed_info,
           lastChecked: row.last_checked,
        }));

        return new Response(JSON.stringify(formatted), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response("PureProxy V22 (Dual Mode Cron)", { headers: corsHeaders });
  }
};
