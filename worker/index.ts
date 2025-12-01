import { connect } from 'cloudflare:sockets';

// 核心数据源 (业界公认的高质量 Cloudflare ProxyIP 源)
// 这些就是 proxyip.chatkg.qzz.io 背后的数据来源
const PROXY_SOURCES = [
  {
    name: '391040525/ProxyIP (Active - 推荐)',
    url: 'https://raw.githubusercontent.com/391040525/ProxyIP/main/active.txt' 
  },
  {
    name: 'ymyuuu/IPDB (Best Proxy)',
    url: 'https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestproxy.txt'
  },
  {
    name: 'vfarid/cf-ip-scanner',
    url: 'https://raw.githubusercontent.com/vfarid/cf-ip-scanner/master/ipv4.txt'
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
 * 暴力提取 IP:Port
 * 无论内容是 Base64、JSON 还是普通文本，只要有 IP:Port 格式就能提出来
 */
function extractIPs(text) {
  if (!text) return [];
  
  // 1. 尝试 Base64 解码 (防止完全乱码)
  try {
    // 简单的启发式检查：如果不含空格且长度较长，可能是 Base64
    if (!text.includes(' ') && text.length > 20) {
      const decoded = atob(text.trim());
      // 如果解码后包含数字和点，说明解码正确，使用解码后的内容
      if (decoded.includes('.')) {
        text = decoded;
      }
    }
  } catch (e) {
    // 解码失败忽略，继续用原文匹配
  }

  // 2. 正则暴力匹配 (匹配 1.1.1.1:80 格式)
  // \b 确保边界，避免匹配到类似版本号的字符串
  const regex = /\b(?:\d{1,3}\.){3}\d{1,3}:\d+\b/g;
  const matches = text.match(regex);
  
  return matches || [];
}

/**
 * 判断是否为公网 IP (过滤内网和保留 IP)
 */
function isValidPublicIp(ip) {
  if (!ip) return false;
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Regex);
  if (!match) return false;

  const part0 = parseInt(match[1], 10);
  const part1 = parseInt(match[2], 10);

  if (part0 === 10) return false;
  if (part0 === 172 && part1 >= 16 && part1 <= 31) return false;
  if (part0 === 192 && part1 === 168) return false;
  if (part0 === 127) return false;
  if (part0 === 0) return false;
  if (part0 >= 224) return false;
  if (part0 === 215) return false; // DoD (美国国防部保留IP，通常不是公共代理)
  
  return true;
}

/**
 * 判断是否为家宽 ISP (Residential)
 */
function isResidentialISP(ispName) {
  if (!ispName) return false;
  const lower = ispName.toLowerCase();
  
  const residentialKeywords = [
    'cable', 'dsl', 'fios', 'broadband', 'telecom', 'mobile', 'wireless', 
    'verizon', 'comcast', 'at&t', 'vodafone', 'orange', 't-mobile', 'sprint',
    'charter', 'spectrum', 'rogers', 'bell', 'shaw', 'telus', 'kddi', 'ntt',
    'softbank', 'kt corp', 'sk broadband', 'chunghwa', 'hinet', 'vietel', 
    'residental', 'dynamic', 'residential', 'home', 'consumer', 'ipoe'
  ];

  const datacenterKeywords = [
    'cloud', 'data', 'center', 'hosting', 'server', 'vps', 'dedicated',
    'amazon', 'aws', 'google', 'microsoft', 'azure', 'alibaba', 'tencent',
    'digitalocean', 'linode', 'vultr', 'ovh', 'hetzner', 'choopa', 'm247',
    'oracle', 'fly.io', 'cloudflare', 'akamai', 'cdn77', 'host', 'colocation'
  ];

  if (datacenterKeywords.some(k => lower.includes(k))) return false;
  if (residentialKeywords.some(k => lower.includes(k))) return true;

  return false;
}

/**
 * 获取 IP 的真实地理位置信息
 */
async function fetchIpGeo(ip) {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,isp,org,as&lang=zh-CN`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status !== 'success') return null;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * 核心验证: 验证是否为有效的 Cloudflare ProxyIP
 */
async function validateProxyIP(ip, port = 443) {
  const start = Date.now();
  let socket = null;
  let writer = null;
  let reader = null;

  try {
    await withTimeout(async function() {
      socket = connect({ hostname: ip, port: port });
      writer = socket.writable.getWriter();
      return writer.ready;
    }(), 1500); // 连接超时

    // 发送 Cloudflare 探测包
    // Host: speed.cloudflare.com 是关键，如果对方是 Cloudflare 反代，会正确转发
    const request = new TextEncoder().encode(
      `GET / HTTP/1.1\r\nHost: speed.cloudflare.com\r\nConnection: close\r\nUser-Agent: PureProxy/1.0\r\n\r\n`
    );
    await writer.write(request);

    reader = socket.readable.getReader();
    let responseText = '';
    const decoder = new TextDecoder();
    
    // 读取响应 (给足 2.5s 读取时间，因为部分家宽网络较慢)
    await withTimeout(async function() {
      const { value, done } = await reader.read();
      if (value) {
        responseText = decoder.decode(value, { stream: false });
      }
    }(), 2500); 

    // 检查是否包含 Cloudflare 特征头
    const isCloudflare = responseText.toLowerCase().includes('server: cloudflare');
    
    if (isCloudflare) {
      return Date.now() - start;
    }
    
    return null;

  } catch (error) {
    return null; 
  } finally {
    if (reader) try { reader.releaseLock(); } catch(e) {}
    if (writer) try { writer.releaseLock(); } catch(e) {}
    if (socket) try { socket.close(); } catch(e) {}
  }
}

async function handleScheduled(event, env, ctx) {
  console.log("开始扫描 Cloudflare ProxyIP...");
  let candidates = [];
  
  // 1. 从公共源获取 (并发获取以节省时间)
  const fetchPromises = PROXY_SOURCES.map(async (source) => {
    try {
      console.log(`[Source] 正在获取: ${source.name}`);
      const response = await fetch(source.url);
      if (response.ok) {
        const text = await response.text();
        // 打印前100个字符用于调试，确认是否下载到了内容
        console.log(`[Source] ${source.name} 内容预览: ${text.substring(0, 50)}...`);
        
        const ips = extractIPs(text); // 使用暴力解析
        console.log(`   └─ 暴力解析出 ${ips.length} 个 IP`);
        return ips;
      } else {
        console.warn(`[Source] ${source.name} 返回状态码: ${response.status}`);
      }
    } catch (e) {
      console.error(`[Source] 错误 ${source.name}:`, e);
    }
    return [];
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(ips => candidates.push(...ips));

  // 去重
  candidates = [...new Set(candidates)];
  
  if (candidates.length === 0) {
    console.log("❌ 未获取到任何 IP，请检查网络或源状态");
    return;
  }
  
  // 随机抽取 50 个进行验证 (免费版 Worker 资源有限，不能一次验几千个)
  // 随机化很重要，否则每次都只验证列表头部的那几个
  const batch = candidates.sort(() => Math.random() - 0.5).slice(0, 50);
  console.log(`本次扫描队列: ${batch.length} 个 IP (从 ${candidates.length} 个中随机抽取)`);

  let validCount = 0;

  for (const line of batch) {
    // 免费版限制: 每次任务尽量控制在 30s 内，验证 5-8 个有效 IP 就够了
    // 如果验证太多会导致 Worker 超时被强制杀掉
    if (validCount >= 8) break; 

    const [ip, portStr] = line.split(':');
    const port = parseInt(portStr);

    if (!isValidPublicIp(ip)) continue;

    const latency = await validateProxyIP(ip, port);

    if (latency !== null) {
      console.log(`✅ [Valid] ${ip}:${port} (${latency}ms)`);
      
      // 验证成功后，查询 Geo 信息 (增加延迟防止 ip-api 封禁)
      await delay(1000); 
      const geo = await fetchIpGeo(ip);
      
      const country = geo ? geo.country : '未知';
      const countryCode = geo ? geo.countryCode : 'UN';
      const city = geo ? geo.city : '';
      const region = geo ? geo.regionName : '';
      const isp = geo ? geo.isp : 'Unknown ISP';
      const isResidential = isResidentialISP(isp);

      // --- 打分策略 ---
      let purityScore = 60;
      if (latency < 300) purityScore += 15;
      if (isResidential) purityScore += 20; // 家宽大加分
      if (countryCode === 'US') purityScore += 15; // 美国 IP 加分
      
      purityScore = Math.min(100, Math.max(10, purityScore));

      const id = crypto.randomUUID();

      try {
        await env.DB.prepare(`
          INSERT INTO proxies (
            id, ip, port, protocol, 
            country, country_code, region, city, isp, 
            anonymity, latency, purity_score, cf_pass_prob, 
            last_checked, created_at, is_residential
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ip, port) DO UPDATE SET
            latency = excluded.latency,
            last_checked = excluded.last_checked,
            purity_score = excluded.purity_score,
            is_residential = excluded.is_residential
        `).bind(
          id, ip, port, 'HTTPS',
          country, countryCode, region, city, isp,
          '透明', latency, purityScore, 99,
          Date.now(), Date.now(), isResidential ? 1 : 0
        ).run();
        
        validCount++;
      } catch (dbErr) {
        console.error("入库失败", dbErr);
      }
    }
  }
  
  console.log(`任务结束，成功入库 ${validCount} 个优质 ProxyIP`);
}

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
      // 查询: 优先显示家宽和纯净度高的
      const { results } = await env.DB.prepare(
        "SELECT * FROM proxies ORDER BY purity_score DESC, is_residential DESC LIMIT 100"
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
        isResidential: row.is_residential === 1,
        anonymity: row.anonymity,
        latency: row.latency,
        purityScore: row.purity_score,
        cloudflarePassProbability: row.cf_pass_prob,
        riskLevel: row.purity_score > 80 ? '低' : '中',
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