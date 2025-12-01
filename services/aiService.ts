import { GoogleGenAI } from "@google/genai";
import { ProxyIP, AIAnalysisResult, AnalysisSchema, AIModelConfig } from "../types";

/**
 * 通用 AI 接口服务
 * 支持: Google Gemini, OpenAI, DeepSeek, Anthropic
 */

// 构造通用的 Prompt
const generatePrompt = (proxy: ProxyIP, isJsonMode: boolean) => {
  const basePrompt = `
    请分析以下代理 IP 元数据，并提供适合网络安全仪表板的专业风险评估。
    
    IP: ${proxy.ip}
    端口: ${proxy.port}
    ISP: ${proxy.isp}
    国家: ${proxy.country}
    协议: ${proxy.protocol}
    匿名度: ${proxy.anonymity}
    纯净度评分: ${proxy.purityScore}/100
    Cloudflare 人机验证(Turnstile)预计通过率: ${proxy.cloudflarePassProbability}%
    
    请重点分析：
    1. ISP 的信誉（是否为已知的数据中心/黑名单 ISP）。
    2. 该 IP 通过 Cloudflare 验证的可能性分析。
    3. 根据协议类型和匿名级别解释风险。
    
    请务必使用简体中文（Simplified Chinese）回答。
  `;

  if (isJsonMode) {
    return `${basePrompt}
    
    请严格仅返回一个合法的 JSON 对象，不要包含 Markdown 格式（如 \`\`\`json），格式如下：
    {
      "summary": "简要摘要（包含对过盾能力的简评）。",
      "riskAssessment": "详细评估（重点解释为何该 IP 能否通过 Cloudflare 验证）。",
      "usageRecommendation": "推荐场景（例如：适合浏览 CF 保护网站、仅适合简单爬虫等）。"
    }`;
  }

  return basePrompt;
};

// Google Gemini 处理器
const handleGoogleRequest = async (proxy: ProxyIP, modelId: string, apiKey: string): Promise<AIAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = generatePrompt(proxy, false); // Gemini SDK supports strict schema natively

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: AnalysisSchema,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini 未返回内容");
  return JSON.parse(text) as AIAnalysisResult;
};

// OpenAI / DeepSeek 通用处理器 (OpenAI 兼容接口)
const handleOpenAICompatibleRequest = async (
  proxy: ProxyIP, 
  modelId: string, 
  apiKey: string, 
  baseUrl: string
): Promise<AIAnalysisResult> => {
  const prompt = generatePrompt(proxy, true);
  
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: "你是一个网络安全专家。请只返回 JSON 格式。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" } // 尝试启用 JSON 模式
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 请求失败: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("API 未返回消息内容");

  return JSON.parse(content) as AIAnalysisResult;
};

// Anthropic Claude 处理器
const handleAnthropicRequest = async (proxy: ProxyIP, modelId: string, apiKey: string): Promise<AIAnalysisResult> => {
  const prompt = generatePrompt(proxy, true);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'dangerously-allow-browser': 'true' // 注意：仅用于演示，生产环境应通过后端代理
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic 请求失败: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Claude 未返回文本");

  // Claude 有时会包含一些前缀，尝试提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;
  
  return JSON.parse(jsonStr) as AIAnalysisResult;
};

// 主分析入口
export const analyzeProxyRisk = async (proxy: ProxyIP, modelConfig: AIModelConfig): Promise<AIAnalysisResult> => {
  const env = process.env;
  
  // 获取对应的 API Key
  let apiKey = '';
  switch (modelConfig.provider) {
    case 'google':
      apiKey = env.GEMINI_API_KEY || env.API_KEY || '';
      break;
    case 'openai':
      apiKey = env.OPENAI_API_KEY || '';
      break;
    case 'deepseek':
      apiKey = env.DEEPSEEK_API_KEY || '';
      break;
    case 'anthropic':
      apiKey = env.ANTHROPIC_API_KEY || '';
      break;
  }

  if (!apiKey) {
    throw new Error(`未配置 ${modelConfig.provider.toUpperCase()} 的 API Key。请在环境变量中添加 ${modelConfig.provider.toUpperCase()}_API_KEY。`);
  }

  try {
    switch (modelConfig.provider) {
      case 'google':
        return await handleGoogleRequest(proxy, modelConfig.id, apiKey);
      
      case 'openai':
        return await handleOpenAICompatibleRequest(proxy, modelConfig.id, apiKey, 'https://api.openai.com/v1');
      
      case 'deepseek':
        return await handleOpenAICompatibleRequest(proxy, modelConfig.id, apiKey, 'https://api.deepseek.com');
      
      case 'anthropic':
        return await handleAnthropicRequest(proxy, modelConfig.id, apiKey);
        
      default:
        throw new Error("未知的 AI 供应商");
    }
  } catch (error: any) {
    console.error("AI 分析错误:", error);
    return {
      summary: "AI 分析失败",
      riskAssessment: `错误信息: ${error.message || '未知错误'} (可能是 CORS 限制或 Key 无效)`,
      usageRecommendation: "无法生成建议"
    };
  }
};