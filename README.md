# PureProxy 纯净度扫描 (全栈版)

这是一个基于 **Cloudflare 生态系统** 构建的现代化代理 IP 搜索引擎。
它演示了如何使用 Cloudflare 的全套无服务器组件构建应用：
*   **Frontend (前端)**: React + Tailwind CSS (托管在 Cloudflare Pages)
*   **Backend (后端)**: Cloudflare Workers (处理 API 和定时任务)
*   **Database (数据库)**: Cloudflare D1 (SQLite，存储经过验证的 IP)
*   **AI**: Google Gemini / OpenAI (智能分析)

---

## 🚀 代理源 (New)

本项目现已集成高质量的开源代理源：
*   **Monosans/proxy-list**: 业界知名的每日更新列表，包含大量活跃的 SOCKS5 和 HTTP 代理。
*   **Zloi-User/hideip.me**: 另一个高质量的聚合源。

Worker 会定期（每 30 分钟）从这些源抓取数据，进行 TCP 连通性测试和真实 IP 地理位置查询，只有通过验证的 IP 才会存入 D1 数据库。

---

## 🛠️ 部署指南 (纯图形化界面版)

本指南旨在让你**无需使用终端命令行 (CLI)**，仅通过浏览器即可在 Cloudflare Dashboard 上完成所有部署。

### 准备工作

1.  注册并登录 [Cloudflare Dashboard (Cloudflare 控制台)](https://dash.cloudflare.com/)。
2.  下载本项目代码到本地，用记事本或代码编辑器打开备用。

---

### 第一步：创建 D1 数据库

1.  在左侧主菜单点击 **Workers & Pages (Workers 和 Pages)**。
2.  在左侧子菜单中找到并点击 **D1 SQL Database (D1 SQL 数据库)**。
3.  点击页面上的 **Create (创建)** 按钮。
4.  在 **Database name (数据库名称)** 输入框中填写: `pureproxy-db`。
5.  点击 **Create (创建)** 按钮。
6.  **初始化表结构 (重要)**:
    *   创建成功后，页面会自动跳转到 `pureproxy-db` 的详情页。
    *   点击顶部的 **Console (控制台)** 标签页。
    *   **复制以下 SQL 代码**，粘贴到网页的 SQL 输入区域中：

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
    CREATE INDEX idx_proxies_protocol ON proxies(protocol);
    ```

    *   点击右侧的 **Execute (执行)** 按钮。
    *   *下方显示绿色 "Success" 提示即表示数据库表已建立。*

---

### 第二步：创建并部署后端 Worker

#### 1. 创建 Worker
1.  回到 **Workers & Pages (Workers 和 Pages)** -> **Overview (概览)**。
2.  点击 **Create application (创建应用)**。
3.  点击 **Create Worker (创建 Worker)** 按钮。
4.  在 **Name (名称)** 输入框中填写: `pureproxy-backend`。
5.  点击底部的 **Deploy (部署)** 按钮 (这将部署一个默认的 Hello World 代码)。

#### 2. 上传后端代码
1.  部署完成后，点击页面顶部的 **Edit code (编辑代码)** 按钮。
2.  在左侧文件列表区域，确保只有一个 `worker.js` (或 `index.js`)。
3.  打开你本地项目中的 `worker/index.ts` 文件，**全选并复制**所有内容。
    *   *注意：代码已经适配为纯 JavaScript，可以直接粘贴使用。*
4.  回到在线编辑器，**清空** 原有代码，**粘贴** 你复制的内容。
5.  点击右上角的 **Deploy (部署)** 按钮。

#### 3. 绑定数据库 (Bindings)
1.  点击编辑器左上角的 `pureproxy-backend` 返回 Worker 详情页。
2.  点击 **Settings (设置)** 标签页。
3.  在二级菜单点击 **Bindings (绑定)**。
4.  点击 **Add (添加)** 按钮，选择 **D1 Database (D1 数据库)**。
5.  配置绑定信息：
    *   **Variable name (变量名称)**: 输入 `DB` (必须大写，代码中用了 `env.DB`)。
    *   **D1 database (D1 数据库)**: 选择 `pureproxy-db`。
6.  点击 **Deploy (部署)** 保存设置。

#### 4. 设置定时任务 (Cron Triggers)
1.  仍在 **Settings (设置)** 页面。
2.  在二级菜单点击 **Triggers (触发器)**。
3.  找到 **Cron Triggers** 部分，点击 **Add Cron Trigger**。
4.  在 **Cron schedule** 中输入: `*/30 * * * *` (每 30 分钟)。
5.  点击 **Add Trigger**。

#### 5. 获取后端 URL
1.  在 Worker 详情页顶部，复制 **Preview URL** (例如 `https://pureproxy-backend.你的用户名.workers.dev`)。这是你的 API 地址。

---

### 第三步：部署前端 (Cloudflare Pages)

#### 1. 准备代码仓库
1.  将本项目代码上传到 GitHub。

#### 2. 创建 Pages 项目
1.  回到 Cloudflare Dashboard 的 **Workers & Pages**。
2.  点击 **Create application** -> **Pages** -> **Connect to Git**。
3.  选择你的仓库，点击 **Begin setup**。

#### 3. 构建配置 (Build Settings)
*   **Project name**: `pureproxy-web`
*   **Framework preset**: 选择 **Vite**。
*   **Output directory**: 填写 **dist**。

#### 4. 配置环境变量
1.  点击 **Environment variables** -> **Add variable**。
2.  **Variable name**: `REACT_APP_API_URL`
3.  **Value**: 粘贴第二步复制的 Worker URL (如 `https://pureproxy-backend.xxxx.workers.dev`)。

#### 5. 完成部署
1.  点击 **Save and Deploy**。

---

### 🎉 验证与使用

1.  **手动触发爬虫**:
    *   数据库刚开始是空的。
    *   去 Worker (`pureproxy-backend`) 的 **Triggers (触发器)** 标签页。
    *   在 **Cron Triggers** 区域，点击 **Test (测试)** 按钮。
2.  **查看日志**:
    *   去 **Logs (日志)** 标签页，点击 **Begin live logs**，你应该能看到 Worker 正在抓取、验证 IP 并获取 Geo 信息。
3.  **访问前端**:
    *   打开你的 Pages 网站，刷新页面，即可看到真实的代理 IP 数据。
