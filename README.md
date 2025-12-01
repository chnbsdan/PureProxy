# PureProxy 纯净度扫描 (Cloudflare ProxyIP 版)

这是一个基于 **Cloudflare 生态系统** 构建的 **ProxyIP** 专用搜索引擎。
它可以自动扫描、验证并分类那些能够反向代理 Cloudflare 服务的优质 IP（优选反代 IP）。

---

## 📖 什么是 ProxyIP？

在 Cloudflare Workers 环境中，**ProxyIP** 特指那些能够成功代理连接到 Cloudflare 服务的第三方 IP 地址。

### 🔧 技术原理
Cloudflare Workers 存在限制，无法直接连接到 Cloudflare 自有的 IP 段。为了绕过此限制，我们需要寻找第三方服务器作为“跳板”：

`Cloudflare Workers` (发起请求) -> **`ProxyIP 服务器`** (第三方代理) -> `Cloudflare 服务` (目标)

✅ **有效 ProxyIP 特征**：
1.  **网络连通性**: 开放了 443 或 80 端口。
2.  **反向代理能力**: 当我们向其发送 `Host: speed.cloudflare.com` 请求时，它能正确转发并返回包含 `Server: cloudflare` 的响应头。

---

## 🚀 数据源 (Updated)

本项目已更新为使用更稳定、聚合类的 ProxyIP 数据源，以解决单个文件 404 的问题：

*   **ymyuuu/IPDB (Best Proxy)**: GitHub 上最热门的代理聚合源之一，包含大量 Base64 订阅链接，Worker 已支持自动解码。
*   **391040525/ProxyIP (Active)**: 专用的 ProxyIP 活跃列表。

Worker 会定期（每 30 分钟）抓取这些源，自动识别 Base64 或文本格式，提取 IP 并执行深度协议验证（发送伪造的 CF 请求）。

---

## 🛠️ 部署指南 (纯图形化界面版)

### 第一步：创建 D1 数据库

1.  在 Cloudflare Dashboard 点击 **Workers & Pages** -> **D1 SQL Database** -> **Create**。
2.  数据库名称填写: `pureproxy-db`。
3.  创建后进入 **Console (控制台)** 标签页，**复制并执行以下 SQL 代码** (请先删除旧表)：

    ```sql
    DROP TABLE IF EXISTS proxies;
    CREATE TABLE proxies (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL,
      protocol TEXT,
      country TEXT,
      country_code TEXT,
      region TEXT,
      city TEXT,
      isp TEXT,
      is_residential INTEGER DEFAULT 0,
      anonymity TEXT,
      latency INTEGER,
      purity_score INTEGER,
      cf_pass_prob INTEGER,
      last_checked INTEGER,
      created_at INTEGER,
      UNIQUE(ip, port)
    );
    CREATE INDEX idx_proxies_purity ON proxies(purity_score DESC);
    CREATE INDEX idx_proxies_country ON proxies(country_code);
    CREATE INDEX idx_proxies_residential ON proxies(is_residential);
    ```

### 第二步：部署后端 Worker

1.  创建名为 `pureproxy-backend` 的 Worker。
2.  点击 **Edit code**，将 `worker/index.ts` 的内容复制粘贴进去 (无需修改)。
3.  **重要**: 在 **Settings** -> **Bindings** 中，添加 D1 Database 绑定，变量名为 `DB`，选择 `pureproxy-db`。
4.  在 **Settings** -> **Triggers** 中，添加 Cron Trigger: `*/30 * * * *`。
5.  点击 **Deploy**。

### 第三步：部署前端 Pages

1.  将代码推送到 GitHub。
2.  在 Cloudflare 创建 Pages 项目，连接 GitHub。
3.  **Build Settings**: Framework preset 选 **Vite**，Output directory 填 **dist**。
4.  **Environment variables**: 添加 `REACT_APP_API_URL`，值为你的 Worker URL。

---

### 🎉 验证与排错

1.  部署完成后，去 Worker 的 **Triggers** 页面点击 **Cron Triggers** 旁边的 **Test** 按钮。
2.  查看 **Logs** (Real-time logs)。
    *   **正常日志**: 
        ```
        正在获取源: ymyuuu/IPDB...
        源响应状态: 200
        获取内容长度: 15403 字符
        检测到 Base64 编码，尝试解码...
        解析出 500 个候选 IP
        正在验证: 1.2.3.4:443...
        ✅ 有效 ProxyIP!
        ```
    *   **异常排查**: 如果看到 `源响应状态: 404` 或 `内容长度: 0`，说明该源暂时不可用，Worker 会自动尝试下一个源。
3.  访问前端网页，等待片刻，直到数据显示。