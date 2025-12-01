import { connect } from 'cloudflare:sockets';

// TypeScript interfaces for Cloudflare Workers environment
interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

interface ScheduledEvent {
  cron: string;
  type: string;
  scheduledTime: number;
}

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: any;
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec<T = unknown>(query: string): Promise<D1Result<T>>;
}

// 定义环境接口
interface Env {
  DB: D1Database;
  API_KEY?: string; // 可选：用于保护 Cron 触发或管理接口
}

// 模拟数据源（与前端 constants 保持一致，但这里是后端使用）
const PROXY_SOURCES = [
  'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
  'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt',
];

// 简单的国家模拟（由于 Worker 难以直接集成庞大的 GeoIP 库，这里做随机模拟，生产环境建议对接 IP-API）
const MOCK_COUNTRIES = [
  { code: 'US', name: '美国' }, { code: 'DE', name: '德国' }, { code: 'CN', name: '中国' },
  { code: 'JP', name: '日本' }, { code: 'SG', name: '新加坡' }, { code: 'GB', name: '英国' }
];

const MOCK_ISPS = ['DigitalOcean', 'AWS', 'Google Cloud', 'Hetzner', 'Comcast', 'China Telecom'];

/**
 * 验证单个代理 IP 的连通性 (TCP Handshake)
 */
async function checkProxyConnection(ip: string, port: number): Promise<number | null> {
  const start = Date.now();
  try {
    // 使用 Cloudflare Sockets API 进行 TCP 连接尝试
    const socket = connect({ hostname: ip, port: port });
    const writer = socket.writable.getWriter();
    await writer.ready; // 等待连接建立
    
    // 连接成功，计算耗时
    const latency = Date.now() - start;
    
    // 关闭连接
    await writer.close();
    socket.close();
    
    return latency;
  } catch (error) {
    // 连接失败
    return null;
  }
}

/**
 * 处理 Cron 定时任务：抓取、验证、入库
 */
async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  console.log("开始执行定时抓取任务...");
  
  let validCount = 0;
  
  for (const source of PROXY_SOURCES) {
    try {
      const response = await fetch(source);
      if (!response.ok) continue;
      
      const text = await response.text();
      const lines = text.split('\n');
      
      // 随机选取一部分进行验证（避免一次性验证太多导致超时，Workers 免费版 CPU 时间有限）
      // 生产环境建议使用 Queue 队列进行异步处理
      const sampleLines = lines.filter(l => l.includes(':')).sort(() => Math.random() - 0.5).slice(0, 30);

      const protocol = source.includes('socks5') ? 'SOCKS5' : 'HTTP';

      for (const line of sampleLines) {
        const [ip, portStr] = line.trim().split(':');
        const port = parseInt(portStr);
        if (!ip || isNaN(port)) continue;

        // 1. TCP 连通性检测
        const latency = await checkProxyConnection(ip, port);

        if (latency !== null) {
          // 2. 模拟/生成元数据 (如果真实环境，这里调用 IP 库 API)
          const countryData = MOCK_COUNTRIES[Math.floor(Math.random() * MOCK_COUNTRIES.length)];
          const isp = MOCK_ISPS[Math.floor(Math.random() * MOCK_ISPS.length)];
          const purityScore = Math.floor(Math.random() * (100 - 40) + 40);
          const cfProb = purityScore > 80 ? Math.floor(Math.random() * 20 + 70) : Math.floor(Math.random() * 50);
          
          // 3. 存入 D1 数据库
          const id = crypto.randomUUID();
          await env.DB.prepare(`
            INSERT INTO proxies (id, ip, port, protocol, country, country_code, isp, anonymity, latency, purity_score, cf_pass_prob, last_checked, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ip, port) DO UPDATE SET
              latency = excluded.latency,
              last_checked = excluded.last_checked,
              purity_score = excluded.purity_score
          `).bind(
            id, ip, port, protocol, 
            countryData.name, countryData.code, isp, 
            '高匿', latency, purityScore, cfProb, 
            Date.now(), Date.now()
          ).run();
          
          validCount++;
        }
      }
    } catch (e) {
      console.error(`处理源 ${source} 失败`, e);
    }
  }
  
  console.log(`任务完成，新增/更新了 ${validCount} 个有效代理。`);
}

/**
 * 处理 HTTP API 请求
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  
  // 设置 CORS 头
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
      // 从 D1 读取最近更新的代理
      const { results } = await env.DB.prepare(
        "SELECT * FROM proxies ORDER BY last_checked DESC LIMIT 100"
      ).all();
      
      // 转换数据格式以匹配前端
      const formatted = results.map((row: any) => ({
        id: row.id,
        ip: row.ip,
        port: row.port,
        protocol: row.protocol,
        country: row.country,
        countryCode: row.country_code,
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
      return new Response(JSON.stringify({ error: 'Database error', details: String(e) }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  }
};