import { ProxyIP, ProxyProtocol, AnonymityLevel, RiskLevel } from '../types';
import { MOCK_COUNTRIES, MOCK_ISPS } from '../constants';

// Helper to generate random integer
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);
const randomItem = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const generateId = () => Math.random().toString(36).substr(2, 9);

// 后端 API 地址
// 在本地开发时，如果你运行了 wrangler dev，通常是 http://localhost:8787
// 在生产环境，你需要将此地址替换为你部署的 Worker 域名
// 例如: https://pure-proxy-backend.yourname.workers.dev
// 为了演示，这里尝试读取环境变量，如果不存在则留空，代码会处理
const API_BASE_URL = process.env.REACT_APP_API_URL || ''; 

/**
 * 获取代理列表
 * 策略：
 * 1. 尝试从 Cloudflare Worker 后端 API 获取 (已验证的真实数据)
 * 2. 如果 API 未配置或失败，回退到本地模拟生成 (演示模式)
 */
export const fetchProxies = async (): Promise<ProxyIP[]> => {
  // 如果配置了 API URL，优先请求后端
  if (API_BASE_URL || window.location.hostname.includes('workers.dev')) {
    try {
      // 假设当前页面和 API 在同一域下，或者 API_BASE_URL 已设置
      const url = API_BASE_URL ? `${API_BASE_URL}/api/proxies` : '/api/proxies';
      console.log(`正在请求后端数据: ${url}`);
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          console.log(`成功从后端获取 ${data.length} 个代理`);
          return data.map((item: any) => ({
            ...item,
            lastChecked: new Date(item.lastChecked) // Convert timestamp to Date
          }));
        }
      }
    } catch (error) {
      console.warn("请求后端 API 失败，切换到模拟模式:", error);
    }
  } else {
    console.log("未配置 API_URL，使用纯前端模拟模式。");
  }

  // Fallback: 生成模拟数据 (仅用于演示 UI)
  return generateMockProxies(20);
};

// 生成模拟数据（当后端不可用时）
const generateMockProxies = (count: number): ProxyIP[] => {
  const proxies: ProxyIP[] = [];
  for (let i = 0; i < count; i++) {
    const countryData = randomItem(MOCK_COUNTRIES);
    const protocol = randomItem([ProxyProtocol.HTTP, ProxyProtocol.HTTPS, ProxyProtocol.SOCKS5]);
    const purityScore = randomInt(40, 95);
    
    proxies.push({
      id: generateId(),
      ip: `${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}`,
      port: randomInt(80, 65535),
      protocol,
      country: countryData.name,
      countryCode: countryData.code,
      anonymity: AnonymityLevel.ELITE,
      latency: randomInt(20, 800),
      uptime: 90,
      purityScore: purityScore,
      cloudflarePassProbability: Math.min(99, Math.floor(purityScore * 0.9)),
      riskLevel: purityScore > 80 ? RiskLevel.LOW : RiskLevel.MEDIUM,
      isp: randomItem(MOCK_ISPS),
      lastChecked: new Date()
    });
  }
  return proxies;
};

export const checkProxyLiveStatus = async (ip: string, port: number): Promise<boolean> => {
  // 在前端直接 ping IP 是不可行的 (CORS/TCP限制)
  // 如果有后端，这里应该调用 `/api/check?ip=x&port=y`
  await new Promise(resolve => setTimeout(resolve, 1500));
  return Math.random() > 0.5; 
};