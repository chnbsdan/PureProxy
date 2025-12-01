import { connect } from 'cloudflare:sockets';

// Cloudflare ProxyIP 专用数据源
// 包含 ymyuuu/IPDB (高质量聚合) 和 391040525/ProxyIP (专用反代)
const PROXY_SOURCES = [
  {
    name: 'ymyuuu/IPDB (Best Proxy)',
    url: 'https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestproxy.txt',
    type: 'mixed'
  },
  {
    name: '391040525/ProxyIP (Active)',
    url: 'https://raw.githubusercontent.com/391040525/ProxyIP/main/active.txt', // 聚合的活跃列表
    type: 'text'
  },
  {
    name: 'Eternity / Proxy List',
    url: 'https://raw.githubusercontent.com/eternity-spring/proxy-list/main/http.txt',
    type: 'text'
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
 * 尝试 Base64 解码
 * 很多代理源内容是 Base64 编码的
 */
function tryDecode(content) {
  try {
    // 简单的判断：如果包含大量非空白字符且没有换行，可能是 base64
    if (!content.includes('\n') && content.length > 50) {
      return atob(content);
    }
    // 或者尝试强制解码，如果失败则返回原文
    return atob(content);
  } catch (e) {
    return content;
  }
}

/**
 * 判断是否为公网 IP (过滤内网和保留 IP)
 */
function isValidPublicIp(ip) {
  if (!ip) return false;
  // 基本 IPv4 正则
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
  if (part0 >= 224) return false; // Multicast & Reserved
  if (part0 === 215) return false; // DoD
  
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
    'residental', 'dynamic'
  ];

  const datacenterKeywords = [
    'cloud', 'data', 'center', 'hosting', 'server', 'vps', 'dedicated',
    'amazon', 'aws', 'google', 'microsoft', 'azure', 'alibaba', 'tencent',
    'digitalocean', 'linode', 'vultr', 'ovh', 'hetzner', 'choopa', 'm247',
    'oracle', 'fly.io', 'cloudflare'
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
 * 原理: 连接 IP:443，发送 Host 为 speed.cloudflare.com 的请求，检查是否返回 Server: cloudflare
 */
async function validateProxyIP(ip, port = 443) {
  const start = Date.now();
  let socket = null;
  let writer = null;
  let reader = null;

  try {
    // 1. 建立 TCP 连接 (2秒超时)
    await withTimeout(async function() {
      socket = connect({ hostname: ip, port: port });
      writer = socket.writable.getWriter();
      return writer.ready;
    }(), 2000);

    // 2. 构造 HTTP 请求
    const request = new TextEncoder().encode(
      `GET / HTTP/1.1\r\nHost: speed.cloudflare.com\r\nConnection: close\r\nUser-Agent: PureProxy/1.0\r\n\r\n`
    );
    await writer.write(request);

    // 3. 读取响应 (等待最多 2.5秒)
    reader = socket.readable.getReader();
    let responseText = '';
    const decoder = new TextDecoder();
    
    await withTimeout(async function() {
      // 只读取前几 k 数据，足以包含 Header
      const { value, done } = await reader.read();
      if (value) {
        responseText = decoder.decode(value, { stream: false });
      }
    }(), 2500);

    // 4. 关键验证: 检查响应头
    const isCloudflare = responseText.toLowerCase().includes('server: cloudflare');
    
    if (isCloudflare) {
      return Date.now() - start; // 返回延迟
    }
    
    return null; // 不是 ProxyIP

  } catch (error) {
    return null; 
  } finally {
    if (reader) try { reader.releaseLock(); } catch(e) {}
    if (writer) try { writer.releaseLock(); } catch(e) {}
    if (socket) try { socket.close(); } catch(e) {}
  }
}

/**
 * 处理 Cron 定时任务
 */
async function handleScheduled(event, env, ctx) {
  console.log("开始扫描 Cloudflare ProxyIP...");
  let validCount = 0;
  
  const shuffledSources = PROXY_SOURCES.sort(() => Math.random() - 0.5);

  for (const source of shuffledSources) {
    if (validCount >= 3) break; // 每次运行只抓取少量精华，避免超时

    try {
      console.log(`正在获取源: ${source.name} (${source.url})`);
      const response = await fetch(source.url);
      
      console.log(`源响应状态: ${response.status}`);
      if (!response.ok) {
        console.warn(`源获取失败: ${response.statusText}`);
        continue;
      }

      let text = await response.text();
      const rawLength = text.length;
      console.log(`获取内容长度: ${rawLength} 字符`);

      if (rawLength < 10) {
        console.warn("源内容为空或过短，跳过");
        continue;
      }

      // 尝试 Base64 解码 (适配 v2ray/clash 订阅链接)
      if (!text.includes(' ') && !text.includes('\n')) {
          console.log("检测到 Base64 编码，尝试解码...");
          text = tryDecode(text);
      }
      
      // 提取潜在的 IP:Port
      const lines = text.split(/[\r\n]+/)
        .map(l => l.trim())
        .filter(l => l && l.length > 7 && !l.startsWith('#'))
        // 简单清洗：尝试提取 IP:Port 结构
        .map(l => {
             // 移除协议前缀 (vmess:// etc)
             let clean = l.replace(/^[a-z]+:\/\//, ''); 
             // 提取 IP 部分
             const match = clean.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[:\s](\d+)/);
             if (match) return `${match[1]}:${match[2]}`;
             
             // 如果只有 IP 没有端口，尝试找单纯的 IP
             const ipMatch = clean.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
             if (ipMatch) return `${ipMatch[1]}:443`; // 默认为 443
             
             return null;
        })
        .filter(l => l !== null)
        .filter(l => isValidPublicIp(l.split(':')[0]));

      console.log(`解析出 ${lines.length} 个候选 IP`);
      
      if (lines.length === 0) continue;

      // 随机抽取 10 个进行深度验证
      const candidates = lines.sort(() => Math.random() - 0.5).slice(0, 10);

      for (const line of candidates) {
        const parts = line.split(':');
        const ip = parts[0];
        const port = parseInt(parts[1]);

        console.log(`正在验证: ${ip}:${port}...`);
        
        // 1. 深度协议验证 (Cloudflare 握手)
        const latency = await validateProxyIP(ip, port);

        if (latency !== null) {
          console.log(`✅ 有效 ProxyIP! 延迟: ${latency}ms`);
          
          // 2. 获取 Geo 信息
          await delay(1200); // 避免 Geo API 速率限制
          const geo = await fetchIpGeo(ip);
          
          const country = geo ? geo.country : '未知';
          const countryCode = geo ? geo.countryCode : 'UN';
          const city = geo ? geo.city : '';
          const region = geo ? geo.regionName : '';
          const isp = geo ? geo.isp : 'Unknown ISP';
          const isResidential = isResidentialISP(isp);

          // 3. 评分
          let purityScore = Math.max(10, 100 - Math.floor(latency / 20));
          if (!isResidential) purityScore -= 15;
          
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
              '透明', 
              latency, purityScore, 99,
              Date.now(), Date.now(), isResidential ? 1 : 0
            ).run();
            
            validCount++;
          } catch (dbErr) {
            console.error("写入数据库错误", dbErr);
          }
        } else {
            // console.log("无效");
        }
      }
    } catch (e) {
      console.error(`源处理异常: ${source.name}`, e);
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
        "SELECT * FROM proxies ORDER BY purity_score DESC, last_checked DESC LIMIT 100"
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