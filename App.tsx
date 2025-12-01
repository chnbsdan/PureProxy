import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  RefreshCw, 
  Filter, 
  Globe, 
  Shield, 
  Wifi, 
  Info 
} from 'lucide-react';
import { fetchProxies } from './services/proxyService';
import { ProxyIP, FilterState, ProxyProtocol, AnonymityLevel } from './types';
import PurityBadge from './components/PurityBadge';
import DetailModal from './components/DetailModal';

function App() {
  const [proxies, setProxies] = useState<ProxyIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProxy, setSelectedProxy] = useState<ProxyIP | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    protocol: undefined,
    country: undefined,
    minPurity: 0
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchProxies();
      setProxies(data);
    } catch (error) {
      console.error("无法获取代理列表", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProxies = useMemo(() => {
    return proxies.filter(p => {
      const matchesSearch = 
        p.ip.includes(searchTerm) || 
        p.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.isp.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesProtocol = filters.protocol ? p.protocol === filters.protocol : true;
      const matchesPurity = filters.minPurity ? p.purityScore >= filters.minPurity : true;
      
      return matchesSearch && matchesProtocol && matchesPurity;
    });
  }, [proxies, searchTerm, filters]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-gray-200 font-sans selection:bg-emerald-500/30">
      
      {/* Top Navigation */}
      <nav className="border-b border-gray-800 bg-[#0f172a]/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-900/20">
              <Shield className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">PureProxy<span className="text-emerald-500">.scan</span></span>
          </div>
          <div className="flex items-center gap-4">
             <a href="https://github.com" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                GitHub 仓库
             </a>
             <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-full text-sm font-medium transition-all shadow-lg shadow-emerald-900/40">
                API 接入
             </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header & Search */}
        <div className="mb-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">全球代理 IP 数据库</h1>
              <p className="text-gray-400 max-w-2xl">
                实时代理扫描与 AI 驱动的纯净度验证。
                完美兼容 Cloudflare Workers 部署。
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                数据库在线
              </span>
              <span>•</span>
              <span>{proxies.length} IPs 已索引</span>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input 
                type="text" 
                placeholder="搜索 IP, ISP, 或国家/地区..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent block pl-10 p-2.5 transition-all"
              />
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <select 
                className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
                onChange={(e) => setFilters(prev => ({ ...prev, protocol: e.target.value as ProxyProtocol || undefined }))}
              >
                <option value="">所有协议</option>
                <option value={ProxyProtocol.HTTP}>HTTP</option>
                <option value={ProxyProtocol.HTTPS}>HTTPS</option>
                <option value={ProxyProtocol.SOCKS4}>SOCKS4</option>
                <option value={ProxyProtocol.SOCKS5}>SOCKS5</option>
              </select>

              <select 
                className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
                onChange={(e) => setFilters(prev => ({ ...prev, minPurity: Number(e.target.value) }))}
              >
                <option value="0">不限分数</option>
                <option value="50">50+ 良好</option>
                <option value="80">80+ 纯净</option>
              </select>

              <button 
                onClick={loadData}
                disabled={loading}
                className="p-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-500 uppercase bg-gray-900/50 border-b border-gray-700">
                <tr>
                  <th scope="col" className="px-6 py-4 font-medium">IP 地址</th>
                  <th scope="col" className="px-6 py-4 font-medium">地理位置</th>
                  <th scope="col" className="px-6 py-4 font-medium">协议</th>
                  <th scope="col" className="px-6 py-4 font-medium hidden sm:table-cell">匿名度</th>
                  <th scope="col" className="px-6 py-4 font-medium text-right">延迟</th>
                  <th scope="col" className="px-6 py-4 font-medium text-center">纯净度</th>
                  <th scope="col" className="px-6 py-4 font-medium text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Skeleton Loading
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-700/50 animate-pulse">
                      <td className="px-6 py-4"><div className="h-4 bg-gray-700 rounded w-32"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-700 rounded w-24"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-700 rounded w-16"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-700 rounded w-20"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-700 rounded w-12 ml-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-6 bg-gray-700 rounded w-16 mx-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-8 bg-gray-700 rounded w-8 mx-auto"></div></td>
                    </tr>
                  ))
                ) : filteredProxies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <Filter className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      未找到符合条件的代理 IP。
                    </td>
                  </tr>
                ) : (
                  filteredProxies.map((proxy) => (
                    <tr 
                      key={proxy.id} 
                      className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors group cursor-pointer"
                      onClick={() => setSelectedProxy(proxy)}
                    >
                      <td className="px-6 py-4 font-mono text-gray-200">
                        {proxy.ip}
                        <span className="text-gray-500 ml-1">:{proxy.port}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg" role="img" aria-label={proxy.country}>
                            {/* Simple mapping for flags would go here, using Globe as fallback */}
                            <Globe size={16} className="text-blue-400" />
                          </span>
                          <span>{proxy.countryCode}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold
                          ${proxy.protocol.includes('SOCKS') ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}
                        `}>
                          {proxy.protocol}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <span className="text-gray-400">{proxy.anonymity}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-gray-300">
                        <div className="flex items-center justify-end gap-2">
                          <Wifi size={14} className={proxy.latency < 200 ? 'text-emerald-500' : 'text-amber-500'} />
                          {proxy.latency}ms
                        </div>
                      </td>
                      <td className="px-6 py-4 flex justify-center">
                        <PurityBadge score={proxy.purityScore} level={proxy.riskLevel} />
                      </td>
                      <td className="px-6 py-4 text-center">
                         <button className="text-gray-500 hover:text-white p-1 rounded hover:bg-gray-700 transition-colors">
                           <Info size={18} />
                         </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Footer of table */}
          <div className="bg-gray-900/50 px-6 py-3 border-t border-gray-700 flex justify-between items-center">
            <span className="text-xs text-gray-500">
              显示 {filteredProxies.length} 个结果
            </span>
            <div className="text-xs text-gray-600 font-mono">
              Powered by Cloudflare Workers & Gemini
            </div>
          </div>
        </div>
      </main>

      {/* Detail Modal */}
      {selectedProxy && (
        <DetailModal 
          proxy={selectedProxy} 
          onClose={() => setSelectedProxy(null)} 
        />
      )}
    </div>
  );
}

export default App;