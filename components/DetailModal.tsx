
import React, { useState, useEffect } from 'react';
import { ProxyIP, AIAnalysisResult, AIModelConfig } from '../types';
import { analyzeProxyRisk } from '../services/aiService';
import { AVAILABLE_AI_MODELS } from '../constants';
import { X, ShieldCheck, Server, Globe, Activity, Bot, Cpu, AlertTriangle, Cloud, CheckCircle, XCircle } from 'lucide-react';

interface DetailModalProps {
  proxy: ProxyIP | null;
  onClose: () => void;
}

const DetailModal: React.FC<DetailModalProps> = ({ proxy, onClose }) => {
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  // Default to Gemini Flash or the first available model
  const [selectedModelId, setSelectedModelId] = useState(AVAILABLE_AI_MODELS[0].id);

  const selectedModelConfig = AVAILABLE_AI_MODELS.find(m => m.id === selectedModelId) || AVAILABLE_AI_MODELS[0];

  useEffect(() => {
    if (proxy) {
      setAnalysis(null);
    }
  }, [proxy]);

  const handleRunAnalysis = async () => {
    if (!proxy) return;
    setLoading(true);
    try {
      const result = await analyzeProxyRisk(proxy, selectedModelConfig);
      setAnalysis(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!proxy) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-700 flex justify-between items-start bg-gray-900/50">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-mono text-emerald-400">{proxy.ip}</span>
              <span className="text-gray-500 text-lg">:</span>
              <span className="font-mono text-emerald-400">{proxy.port}</span>
            </h2>
            <p className="text-gray-400 text-sm mt-1 flex items-center gap-2">
              <Globe size={14} /> {proxy.country} ({proxy.countryCode})
              <span className="text-gray-600">•</span>
              <Server size={14} /> {proxy.isp}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white transition-colors bg-gray-700/50 p-2 rounded-lg hover:bg-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Cloudflare Pass Check */}
          <div className={`p-4 rounded-xl border flex items-center gap-4 ${
            proxy.cloudflarePassProbability > 70 
              ? 'bg-orange-500/10 border-orange-500/30' 
              : 'bg-gray-800/50 border-gray-700'
          }`}>
            <div className={`p-3 rounded-full ${
              proxy.cloudflarePassProbability > 70 ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400'
            }`}>
              <Cloud size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold flex items-center gap-2">
                Cloudflare 验证 (Turnstile) 
                {proxy.cloudflarePassProbability > 70 ? (
                  <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full border border-orange-500/20">推荐</span>
                ) : (
                  <span className="text-xs bg-gray-600/30 text-gray-400 px-2 py-0.5 rounded-full">风险较高</span>
                )}
              </h3>
              <div className="w-full bg-gray-700/50 h-2 rounded-full mt-2 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${
                    proxy.cloudflarePassProbability > 70 ? 'bg-gradient-to-r from-orange-400 to-orange-600' : 'bg-gray-600'
                  }`}
                  style={{ width: `${proxy.cloudflarePassProbability}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                预计通过概率: <span className="font-mono">{proxy.cloudflarePassProbability}%</span>
              </p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
              <div className="text-gray-400 text-xs uppercase mb-1">协议类型</div>
              <div className="text-white font-medium">{proxy.protocol}</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
              <div className="text-gray-400 text-xs uppercase mb-1">匿名度</div>
              <div className="text-white font-medium">{proxy.anonymity}</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
              <div className="text-gray-400 text-xs uppercase mb-1">延迟</div>
              <div className="text-emerald-400 font-mono font-medium">{proxy.latency}ms</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
              <div className="text-gray-400 text-xs uppercase mb-1">纯净度评分</div>
              <div className={`font-bold ${proxy.purityScore > 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {proxy.purityScore}/100
              </div>
            </div>
          </div>

          {/* AI Analysis Section */}
          <div className="border border-gray-700 rounded-xl overflow-hidden">
            <div className="bg-gray-900/80 p-4 border-b border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <Bot size={20} />
                <h3 className="font-semibold">AI 智能分析</h3>
              </div>
              
              {!analysis && !loading && (
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                  <div className="relative group w-full sm:w-auto">
                    <Cpu size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <select
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      className="w-full sm:w-56 bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block pl-8 pr-2 py-1.5 appearance-none cursor-pointer hover:bg-gray-750 transition-colors"
                    >
                      <optgroup label="Google">
                        {AVAILABLE_AI_MODELS.filter(m => m.provider === 'google').map(model => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="OpenAI & 兼容">
                        {AVAILABLE_AI_MODELS.filter(m => m.provider === 'openai' || m.provider === 'deepseek').map(model => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Anthropic">
                        {AVAILABLE_AI_MODELS.filter(m => m.provider === 'anthropic').map(model => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  <button 
                    onClick={handleRunAnalysis}
                    className="w-full sm:w-auto whitespace-nowrap px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20"
                  >
                    <Activity size={14} /> 运行评估
                  </button>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-800 min-h-[120px] relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800/90 z-10 flex-col gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                  <span className="text-indigo-400 text-sm animate-pulse">正在分析中...</span>
                </div>
              )}
              
              {analysis ? (
                <div className="space-y-4 animate-in fade-in duration-500">
                  <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                    <h4 className="text-gray-400 text-xs uppercase font-semibold mb-1 flex items-center gap-1">
                      <ShieldCheck size={12} /> 风险评估摘要
                    </h4>
                    <p className="text-gray-200 text-sm leading-relaxed">{analysis.summary}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-gray-400 text-xs uppercase font-semibold mb-2">详细分析</h4>
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{analysis.riskAssessment}</p>
                  </div>
                  
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3">
                     <h4 className="text-indigo-400 text-xs uppercase font-semibold mb-1 flex items-center gap-1">
                       <Activity size={12} /> 使用建议
                     </h4>
                     <p className="text-gray-300 text-sm">{analysis.usageRecommendation}</p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2 py-4">
                  <Bot size={32} className="opacity-20" />
                  <span className="text-sm">点击上方运行按钮获取 AI 详细评估</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DetailModal;
