import { AIModelConfig } from "./types";

// Sources for raw proxy lists (CORS enabled or plain text)
export const PROXY_SOURCES = [
  'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
  'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt',
  // In a real Cloudflare Worker environment, we would proxy these requests through the worker 
  // to avoid CORS, or use a D1 database. For this frontend demo, we simulate fetching.
];

export const MOCK_COUNTRIES = [
  { code: 'US', name: '美国' },
  { code: 'DE', name: '德国' },
  { code: 'CN', name: '中国' },
  { code: 'BR', name: '巴西' },
  { code: 'IN', name: '印度' },
  { code: 'RU', name: '俄罗斯' },
  { code: 'FR', name: '法国' },
  { code: 'GB', name: '英国' },
  { code: 'JP', name: '日本' },
  { code: 'SG', name: '新加坡' },
];

export const MOCK_ISPS = [
  'DigitalOcean, LLC',
  'Amazon.com',
  'Google LLC',
  'Comcast Cable',
  'China Telecom',
  'Hetzner Online GmbH',
  'OVH SAS',
  'Alibaba Cloud'
];

export const AVAILABLE_AI_MODELS: AIModelConfig[] = [
  // Google Gemini
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Google)', provider: 'google' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro (Google)', provider: 'google' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite (Google)', provider: 'google' },
  
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o (OpenAI)', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (OpenAI)', provider: 'openai' },
  
  // DeepSeek (非常适合中文环境)
  { id: 'deepseek-chat', name: 'DeepSeek V3 (DeepSeek)', provider: 'deepseek' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1 (DeepSeek)', provider: 'deepseek' },

  // Anthropic
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Anthropic)', provider: 'anthropic' }
];
