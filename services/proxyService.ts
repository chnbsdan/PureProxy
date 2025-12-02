
import { ProxyIP, ProxyProtocol, AnonymityLevel, RiskLevel, ProxyType } from '../types';
import { MOCK_COUNTRIES, MOCK_ISPS } from '../constants';

// Helper to generate random integer
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

// 后端 API 地址 - 请确保在 Cloudflare Pages 设置中配置 REACT_APP_API_URL
// 格式如: https://pureproxy-backend.your-subdomain.workers.dev
const API_BASE_URL = process.env.REACT_APP_API_URL; 

/**
 * 获取代理列表 (从数据库)
 * @param type 'proxy' | 'best'
 */
export const fetchProxies = async (type: ProxyType = ProxyType.PROXY): Promise<ProxyIP[]> => {
  console.log(`[ProxyService] Fetching ${type} proxies... API_URL: ${API_BASE_URL || 'Not Set'}`);

  if (API_BASE_URL) {
    try {
      const url = `${API_BASE_URL}/api/proxies?type=${type}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[ProxyService] Success, received ${data.length} records`);
      
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          ...item,
          lastChecked: new Date(item.lastChecked)
        }));
      }
    } catch (error) {
      console.error("[ProxyService] API Fetch Error:", error);
      // 不要静默失败，抛出错误让 UI 处理
    }
  } else {
    console.warn("[ProxyService] REACT_APP_API_URL environment variable is missing.");
  }
  
  return []; 
};

/**
 * 手动分析 IP 列表 (V22 已弃用手动大量输入，但保留函数签名以防报错)
 */
export const analyzeCustomIPs = async (ips: string[]): Promise<ProxyIP[]> => {
    return [];
};
