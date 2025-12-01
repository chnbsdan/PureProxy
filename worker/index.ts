
import { connect } from 'cloudflare:sockets';

// 数据源配置 (使用 jsDelivr CDN 加速，确保稳定性)
const PROXY_SOURCES = [
  {
    name: 'Monosans/All (海量源)',
    // 包含 HTTP/SOCKS4/SOCKS5 所有类型的代理，量极大
    url: 'https://cdn.jsdelivr.net/gh/monosans/proxy-list@main/proxies/all.txt' 
  },
  {
    name: 'vfarid/CF-Scanner (纯IP)',
    // 专门针对 Cloudflare 的扫描列表
    url: 'https://cdn.jsdelivr.net/gh/vfarid/cf-ip-scanner@master/ipv4.txt'
  },
  {
    name: 'TheSpeedX/SOCKS (备用)',
    url: 'https://cdn.jsdelivr.net/gh/TheSpeedX/SOCKS-List@master/http.txt'
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
 * 终极暴力提取 IP
 * 移除所有边界检查，只要像 IP 就抓出来
 */
function extractIPs(text) {
  if (!text) return [];
  const candidates = new Set();
  
  // 最宽松的 IPv4 正则：数字.数字.数字.数字 (可选端口)
  // 不使用 \b 边界，防止被特殊符号干扰
  const regex = /(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/g;
  
  // 1. 尝试 Base64 解码 (针对某些订阅源)
  try {
    // 移除空白字符
    const cleanText = text.replace(/\s/g, '');
    // 简单的 Base64 特征判断 (长度是4倍数，且只包含 base64 字符)
    if (cleanText.length > 20 && /^[a-zA-Z0-9+/]+={0,2}$/.test(cleanText)) {
      const decoded = atob(cleanText);
      const decodedMatches = decoded.match(regex);
      if (decodedMatches) {
        decodedMatches.forEach(ip => candidates.add(ip));
      }
    }
  } catch (e) {
    // 解码失败忽略
  }

  // 2. 原文匹配 (这是主力)
  const matches = text.match(regex);
  if (matches) {
    matches.forEach(ip => candidates.add(ip));
  }
  
  return Array.from(candidates);
}

/**
 * 判断是否为合法公网 IPv4
 */
function isValidPublicIp(ip) {
  if (!ip) return false;
  // 简单的格式校验
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;

  const [a, b] = parts;

  // 排除内网和保留地址
  if (a === 10) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 127) return false;
  if (a === 0) return false;
  if (a >= 224) return false; // Multicast+
  if (a === 215) return false; // DoD (常见误报)
  
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
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,isp,org,as&lang=zh-CN`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
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
    }(), 2000); // 连接超时 2s

    // 发送 HTTP 请求探测
    // 必须包含 Host: speed.cloudflare.com 才能触发反代逻辑
    const request = new TextEncoder().encode(
      `GET / HTTP/1.1\r\nHost: speed.cloudflare.com\r\nConnection: close\r\nUser-Agent: PureProxy/ScanBot\r\n\r\n`
    );
    await writer.write(request);

    reader = socket.readable.getReader();
    let responseText = '';
    const decoder = new TextDecoder();
    
    // 读取响应，最多读 3s
    await withTimeout(async function() {
      const { value, done } = await reader.read();
      if (value) {
        responseText = decoder.decode(value, { stream: false });
      }
    }(), 3000); 

    // 关键判据: Server: cloudflare
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
  
  // 1. 获取所有源数据
  const fetchPromises = PROXY_SOURCES.map(async (source) => {
    try {
      // 强制刷新缓存
      const urlWithCacheBust = `${source.url}?t=${Date.now()}`;
      console.log(`[Source] 正在获取: ${source.name}`);
      
      const response = await fetch(urlWithCacheBust, {
          headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
      });

      if (response.ok) {
        const text = await response.text();
        // 关键调试信息: 打印前 50 个字符，看看下载了什么
        const preview = text.substring(0, 50).replace(/\n/g, '\\n');
        console.log(`[Source] ${source.name} (Status: ${response.status}, Size: ${text.length})`);
        console.log(`[Preview] ${preview}...`);
        
        const ips = extractIPs(text); 
        console.log(`   └─ 暴力解析出 ${ips.length} 个 IP`);
        return ips;
      } else {
        console.warn(`[Source] ${source.name} 失败: ${response.status}`);
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
    console.error("❌ 严重错误: 所有源均未解析出 IP。请检查日志中的 Preview 信息。");
    return;
  }
  
  // 随机抽取 50 个进行验证
  // Monosans 源有几万个 IP，必须随机抽样，否则永远只验证前几个
  const batch = candidates.sort(() => Math.random() - 0.5).slice(0, 50);
  console.log(`本次扫描队列: ${batch.length} 个 IP (从 ${candidates.length} 个候选库中抽取)`);

  let validCount = 0;

  for (const line of batch) {
    if (validCount >= 5) break; // 每次存 5 个，防止超时

    const parts = line.split(':');
    let ip = parts[0];
    let port = 443; // 默认端口

    if (parts.length === 2) {
        // 过滤非数字端口
        const p = parseInt(parts[1], 10);
        if (!isNaN(p)) port = p;
    }

    if (!isValidPublicIp(ip)) continue;

    console.log(`正在验证: ${ip}:${port}...`);
    const latency = await validateProxyIP(ip, port);

    if (latency !== null) {
      console.log(`✅ [Valid] ${ip}:${port} (${latency}ms)`);
      
      // 验证通过后，查地理位置
      await delay(800); 
      const geo = await fetchIpGeo(ip);
      
      const country = geo ? geo.country : '未知';
      const countryCode = geo ? geo.countryCode : 'UN';
      const city = geo ? geo.city : '';
      const region = geo ? geo.regionName : '';
      const isp = geo ? geo.isp : 'Unknown ISP';
      const isResidential = isResidentialISP(isp);

      // 动态打分
      let purityScore = 60;
      if (latency < 300) purityScore += 10;
      if (isResidential) purityScore += 25; // 家宽大幅加分
      if (countryCode === 'US') purityScore += 15; // 美国加分
      
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
  
  console.log(`任务结束，入库 ${validCount} 个`);
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
      const { results } = await env.DB.prepare(
        "SELECT * FROM proxies ORDER BY purity_score DESC LIMIT 100"
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
