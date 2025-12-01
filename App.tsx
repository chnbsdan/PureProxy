import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  RefreshCw, 
  Filter, 
  Globe, 
  Shield, 
  Wifi, 
  Info,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Home,
  Building2,
  MapPin,
  Network
} from 'lucide-react';
import { fetchProxies } from './services/proxyService';
import { ProxyIP, FilterState, ProxyProtocol, AnonymityLevel } from './types';
import PurityBadge from './components/PurityBadge';
import DetailModal from './components/DetailModal';

// 排序配置类型
type SortKey = 'country' | 'latency' | 'purityScore';
interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

function App() {
  const [proxies, setProxies] = useState<ProxyIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProxy, setSelectedProxy] = useState<ProxyIP | null>(null);
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'purityScore', direction: 'desc' });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    protocol: undefined,
    country: undefined,
    minPurity: 0,
    isResidential: undefined // undefined = all, true = residential, false = datacenter
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

  // 动态提取现有数据中的所有国家列表
  const uniqueCountries = useMemo(() => {
    const countryMap = new Map<string, string>();
    proxies.forEach(p => {
      if (p.countryCode && p.country) {
        if (!countryMap.has(p.countryCode)) {
          countryMap.set(p.countryCode, p.country);
        }
      }
    });
    // 按名称排序
    return Array.from(countryMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [proxies]);

  // Handle Sort Request
  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Get Sort Icon
  const getSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={14} className="ml-1 opacity-40" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp size={14} className="ml-1 text-emerald-400" /> 
      : <ArrowDown size={14} className="ml-1 text-emerald-400" />;
  };

  const filteredAndSortedProxies = useMemo(() => {
    // 1. Filter
    let result = proxies.filter(p => {
      const matchesSearch = 
        p.ip.includes(searchTerm) || 
        p.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.isp.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesProtocol = filters.protocol ? p.protocol === filters.protocol : true;
      const matchesPurity = filters.minPurity ? p.purityScore >= filters.minPurity : true;
      
      // Country Filter
      const matchesCountry = filters.country ? p.countryCode === filters.country : true;

      // Type Filter (Residential vs Datacenter)
      const matchesType = filters.isResidential !== undefined 
        ? p.isResidential === filters.isResidential 
        : true;
      
      return matchesSearch && matchesProtocol && matchesPurity && matchesCountry && matchesType;
    });

    // 2. Sort
    result.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle undefined
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return result;
  }, [proxies, searchTerm, filters, sortConfig]);

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
              <h1 className="text-3xl font-bold text-white mb-2">Cloudflare ProxyIP 数据库</h1>
              <p className="text-gray-400 max-w-2xl">
                基于 391040525/ProxyIP 等权威数据源。
                筛选可反向代理 Cloudflare 服务的优质 IP，支持家宽/数据中心识别。
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
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 flex flex-col xl:flex-row gap-4">
            {/* Search Input */}
            <div className="relative flex-1 w-full min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input 
                type="text" 
                placeholder="搜索 IP, ISP, 或国家/地区..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent block pl-10 p-2.5 transition-all"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
              
              {/* Country Dropdown */}
              <div className="relative w-full sm:w-auto">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                <select 
                  className="w-full sm:w-40 bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block pl-9 p-2.5 appearance-none"
                  value={filters.country || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, country: e.target.value || undefined }))}
                >
                  <option value="">所有地区</option>
                  {uniqueCountries.map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>

              {/* ISP Type Dropdown */}
              <div className="relative w-full sm:w-auto">
                <Network className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                <select 
                  className="w-full sm:w-48 bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block pl-9 p-2.5 appearance-none"
                  value={filters.isResidential === undefined ? 'all' : String(filters.isResidential)}
                  onChange={(e) => {
                    const val = e.target.value;
                    let isRes: boolean | undefined = undefined;
                    if (val === 'true') isRes = true;
                    if (val === 'false') isRes = false;
                    setFilters(prev => ({ ...prev, isResidential: isRes }));
                  }}
                >
                  <option value="all">所有网络类型</option>
                  <option value="true">🏡 家庭宽带 (Residential)</option>
                  <option value="false">🏢 数据中心/企业 (DC)</option>
                </select>
              </div>

              {/* Purity Score Dropdown */}
              <div className="relative w-full sm:w-auto">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                <select 
                  className="w-full sm:w-40 bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block pl-9 p-2.5 appearance-none"
                  onChange={(e) => setFilters(prev => ({ ...prev, minPurity: Number(e.target.value) }))}
                >
                  <option value="0">不限分数</option>
                  <option value="50">50+ 良好</option>
                  <option value="80">80+ 纯净</option>
                </select>
              </div>

              {/* Refresh Button */}
              <button 
                onClick={loadData}
                disabled={loading}
                className="w-full sm:w-auto p-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center"
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
                  <th scope="col" className="px-6 py-4 font-medium">IP 地址 / ISP</th>
                  <th 
                    scope="col" 
                    className="px-6 py-4 font-medium cursor-pointer hover:text-white hover:bg-gray-800 transition-colors"
                    onClick={() => requestSort('country')}
                  >
                    <div className="flex items-center">
                      地理位置 {getSortIcon('country')}
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium">类型</th>
                  <th 
                    scope="col" 
                    className="px-6 py-4 font-medium text-right cursor-pointer hover:text-white hover:bg-gray-800 transition-colors"
                    onClick={() => requestSort('latency')}
                  >
                    <div className="flex items-center justify-end">
                      延迟 {getSortIcon('latency')}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-4 font-medium text-center cursor-pointer hover:text-white hover:bg-gray-800 transition-colors"
                    onClick={() => requestSort('purityScore')}
                  >
                    <div className="flex items-center justify-center">
                      纯净度 {getSortIcon('purityScore')}
                    </div>
                  </th>
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
                      <td className="px-6 py-4"><div className="h-4 bg-gray-700 rounded w-12 ml-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-6 bg-gray-700 rounded w-16 mx-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-8 bg-gray-700 rounded w-8 mx-auto"></div></td>
                    </tr>
                  ))
                ) : filteredAndSortedProxies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      <Filter className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      未找到符合条件的 ProxyIP。请等待 Worker 后台任务运行。
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedProxies.map((proxy) => (
                    <tr 
                      key={proxy.id} 
                      className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors group cursor-pointer"
                      onClick={() => setSelectedProxy(proxy)}
                    >
                      <td className="px-6 py-4">
                        <div className="font-mono text-gray-200">
                          {proxy.ip}
                          <span className="text-gray-500 ml-1">:{proxy.port}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                           {proxy.isp || 'Unknown ISP'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg" role="img" aria-label={proxy.country}>
                            <Globe size={16} className="text-blue-400" />
                          </span>
                          <div>
                            <div className="text-gray-300">{proxy.countryCode}</div>
                            {proxy.city && <div className="text-xs text-gray-500">{proxy.city}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 items-start">
                          {proxy.isResidential ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <Home size={10} /> 家宽
                            </span>
                          ) : (
                             <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-600/20 text-gray-400 border border-gray-600/30">
                              <Building2 size={10} /> 数据中心
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500 font-mono">HTTPS 反代</span>
                        </div>
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
              显示 {filteredAndSortedProxies.length} 个结果
            </span>
            <div className="text-xs text-gray-600 font-mono">
              数据源: 391040525/ProxyIP
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