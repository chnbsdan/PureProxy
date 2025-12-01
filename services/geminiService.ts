
import { GoogleGenAI, Type } from "@google/genai";
import { ProxyIP, AIAnalysisResult, AnalysisSchema } from "../types";

export const analyzeProxyRisk = async (proxy: ProxyIP, modelId: string = 'gemini-2.5-flash'): Promise<AIAnalysisResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key 缺失。请配置您的环境变量。");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    请分析以下代理 IP 元数据，并提供适合网络安全仪表板的专业风险评估。
    
    IP: ${proxy.ip}
    端口: ${proxy.port}
    ISP: ${proxy.isp}
    国家: ${proxy.country}
    协议: ${proxy.protocol}
    匿名度: ${proxy.anonymity}
    纯净度评分 (0-100, 越高越好): ${proxy.purityScore}
    
    请根据 ISP 类型（例如是住宅 IP 还是数据中心 IP）、协议类型和匿名级别来解释为何给出此评分。
    请务必使用简体中文（Simplified Chinese）回答所有内容。
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: AnalysisSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("AI 未返回任何内容");
    
    return JSON.parse(text) as AIAnalysisResult;

  } catch (error) {
    console.error("Gemini 分析失败", error);
    // Fallback if API fails or key is missing
    return {
      summary: "AI 分析暂时不可用。",
      riskAssessment: "无法连接到 Gemini AI API 或 API Key 未配置。",
      usageRecommendation: "请谨慎使用。"
    };
  }
};
