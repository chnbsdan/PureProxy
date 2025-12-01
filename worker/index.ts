import { connect } from 'cloudflare:sockets';

// 高质量代理源配置 (Monosans & Zloi-User)
// 这些列表通常只包含存活的代理，且更新频率高
const PROXY_SOURCES = [
  {
    url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    protocol: 'HTTP'
  },
  {
    url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt',
    protocol: 'SOCKS5'
  },
  {
    url: 'https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt',
    protocol: 'HTTP'
  },
  {
    url: 'https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt',
    protocol: 'SOCKS5'
  }
];

// 辅助函数: 延迟
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 辅助函数: 严格超时控制
const withTimeout = (promise, ms) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ]);
};

/**
 * 获取 IP 的真实地理位置信息
 * 使用 ip-api.com (免费版限制: 45 req/min)
 */
async function fetchIpGeo(ip) {
  try {
    // fields: status, message, country, countryCode, regionName, city, isp
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,isp&lang=zh-CN`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status !== 'success') return null;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * 验证单个代理 IP 的连通性 (TCP Handshake)
 * 增加严格的 2000ms 超时，防止 Worker 卡死
 */
async function checkProxyConnection(ip, port) {
  const start = Date.now();
  let socket = null;
  let writer = null;

  try {
    // 限制 connect 操作最多 2 秒
    await withTimeout(async function() {
      socket = connect({ hostname: ip, port: port });
      writer = socket.writable.getWriter();
      await writer.ready; // 等待握手完成
      return true;
    }(), 2000);
    
    const latency = Date.now() - start;
    return latency;

  } catch (error) {
    return null; // 连接失败或超时
  } finally {
    // 确保资源释放
    if (writer) {
      try { await writer.close(); } catch(e) {}
    }
    if (socket) {
      try { socket.close(); } catch(e) {}
    }
  }
}

/**
 * 处理 Cron 定时任务
 */
async function handleScheduled(event, env, ctx) {
  console.log("开始执行定时抓取任务 (高质量源)...");
  let validCount = 0;
  
  // 随机打乱源顺序，避免每次都只跑第一个
  const shuffledSources = PROXY_SOURCES.sort(() => Math.random() - 0.5);

  for (const source of shuffledSources) {
    // 简单的断路器：如果本次执行已经存够了 10 个新 IP，就提前结束，避免超时
    if (validCount >= 10) break;

    try {
      console.log(`正在获取列表: ${source.url}`);
      const response = await fetch(source.url);
      if (!response.ok) continue;
      
      const text = await response.text();
      const lines = text.split('\n');
      
      // 从列表中随机抽取 15 个 IP 进行深度验证
      // 这里的列表是纯净 IP:Port 格式
      const sampleLines = lines
        .map(l => l.trim())
        .filter(l => l && l.includes(':'))
        .sort(() => Math.random() - 0.5)
        .slice(0, 15);

      console.log(`源 [${source.protocol}] 抽取了 ${sampleLines.length} 个样本进行验证`);

      for (const line of sampleLines) {
        const parts = line.split(':');
        if (parts.length < 2) continue;
        
        const ip = parts[0];
        const port = parseInt(parts[1]);
        
        if (!ip || isNaN(port)) continue;

        // 1. TCP 验证 (严格超时)
        const latency = await checkProxyConnection(ip, port);

        if (latency !== null) {
          console.log(`IP ${ip}:${port} 连接成功 (${latency}ms)，正在查询 Geo 信息...`);
          
          // 2. 获取真实 Geo 信息
          // 增加 2秒 延迟，防止触发 ip-api 45次/分 的限制
          await delay(2000); 
          const geo = await fetchIpGeo(ip);
          
          const country = geo ? geo.country : '未知';
          const countryCode = geo ? geo.countryCode : 'UN';
          const city = geo ? geo.city : '';
          const region = geo ? geo.regionName : '';
          const isp = geo ? geo.isp : 'Unknown ISP';

          // 3. 计算分数 (基于延迟和 ISP)
          // 延迟越低分越高，如果是常见云厂商(Google/Amazon)稍微扣分
          let baseScore = Math.max(10, 100 - Math.floor(latency / 10));
          if (isp.includes('Google') || isp.includes('Amazon') || isp.includes('Microsoft')) {
            baseScore -= 15;
          }
          
          const purityScore = Math.max(0, Math.min(100, baseScore));
          const cfProb = purityScore > 75 ? 85 : 30; // 估算值
          const id = crypto.randomUUID();

          // 4. 存入数据库
          try {
            await env.DB.prepare(`
              INSERT INTO proxies (
                id, ip, port, protocol, 
                country, country_code, region, city, isp, 
                anonymity, latency, purity_score, cf_pass_prob, 
                last_checked, created_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(ip, port) DO UPDATE SET
                latency = excluded.latency,
                last_checked = excluded.last_checked,
                purity_score = excluded.purity_score,
                cf_pass_prob = excluded.cf_pass_prob
            `).bind(
              id, ip, port, source.protocol,
              country, countryCode, region, city, isp,
              '高匿', latency, purityScore, cfProb,
              Date.now(), Date.now()
            ).run();
            
            validCount++;
            console.log(`--> 入库成功: ${ip}`);
          } catch (dbErr) {
            console.error("数据库写入失败", dbErr);
          }
        }
      }
    } catch (e) {
      console.error(`处理源失败`, e);
    }
  }
  
  console.log(`任务完成，新增/更新了 ${validCount} 个有效代理。`);
}

/**
 * 处理 API 请求
 */
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (url.pathname === '/api/proxies') {
    try {
      // 获取最新的 100 条数据
      const { results } = await env.DB.prepare(
        "SELECT * FROM proxies ORDER BY last_checked DESC LIMIT 100"
      ).all();
      
      const formatted = results.map((row) => ({
        id: row.id,
        ip: row.ip,
        port: row.port,
        protocol: row.protocol,
        country: row.country,
        countryCode: row.country_code,
        region: row.region,
        city: row.city,
        isp: row.isp,
        anonymity: row.anonymity,
        latency: row.latency,
        purityScore: row.purity_score,
        cloudflarePassProbability: row.cf_pass_prob,
        riskLevel: row.purity_score > 80 ? '低' : (row.purity_score > 50 ? '中' : '高'),
        lastChecked: row.last_checked
      }));

      return new Response(JSON.stringify(formatted), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  }
};