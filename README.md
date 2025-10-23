# AI Travel Planner

## 核心功能

* **智能行程规划**: 用户可以通过文字或语音输入旅行需求（目的地、预算、偏好等），AI 将自动生成个性化的旅行路线（交通、住宿、景点）。
* **用户与认证**: 基于 Supabase Auth 实现用户注册、登录和会话管理。
* **数据持久化**: 所有用户生成的行程都安全地存储在 Supabase Postgres 数据库中。
* **行程详情与地图**: 为每个行程提供动态详情页，并集成高德地图 (Amap) 来标记所有活动地点。
* **外部导航**: 在行程列表旁提供“导航”按钮，可拉起高德地图 App 或网页版进行导航。
* **多模式记账**: 支持语音和文字输入（例如“晚餐 3000 日元”），通过 LLM 提取实体并存入数据库。
* **多货币汇总**: 自动按货币类型（如 CNY, JPY）汇总开销总额。
* **云端同步**: 实现了 Realtime 订阅，用于在数据变更时自动刷新页面。

## 技术栈

* **前端**: Next.js (App Router), React
* **UI**: Tailwind CSS, shadcn/ui
* **后端即服务 (BaaS)**: Supabase (Auth, Postgres Database, Realtime)
* **LLM API**: 阿里云灵积 (DashScope) - qwen-plus & qwen-turbo
* **语音识别**: 浏览器内置 Web Speech API
* **地图服务**: 高德地图 (Amap) JS API
* **部署**: Docker

---

## 运行项目指南

### 1. 必需的环境变量

在运行项目之前，您必须获取以下所有 API Key，并将它们存储在一个 `.env.docker` 文件中。

#### API Key 列表

1.  **Supabase (2个)**:
    * `NEXT_PUBLIC_SUPABASE_URL`: 您的 Supabase 项目 URL (在 `Settings` -> `API` 中找到)
    * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 您的 Supabase 项目 `anon` (public) Key (在 `Settings` -> `API` 中找到)
2.  **DashScope (1个)**:
    * `DASHSCOPE_API_KEY`: 您的阿里云百炼平台 API Key (sk-...)
3.  **高德地图 (2个)**:
    * `NEXT_PUBLIC_AMAP_KEY`: 您的高德 Web 端 (JS API) Key
    * `NEXT_PUBLIC_AMAP_SECURITY_CODE`: 您的高德 Web 端 (JS API) 安全密钥

#### `.env.docker` 文件模板

请在项目**根目录**创建一个名为 `.env.docker` 的文件（**注意：** 请将此文件添加到 `.gitignore` 中！）。

```env
# 文件: .env.docker
# (注意: 等号后面直接写值，不要加双引号 "...")

# Supabase
NEXT_PUBLIC_SUPABASE_URL=xxx_您的SupabaseURL
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx_您的SupabaseAnonKey

# DashScope (LLM)
DASHSCOPE_API_KEY=xxx_您的DashScopeKey

# 高德地图 (Amap)
NEXT_PUBLIC_AMAP_KEY=xxx_您的高德Key
NEXT_PUBLIC_AMAP_SECURITY_CODE=xxx_您的高德安全密钥
```

### 2. (推荐) 使用 Docker 运行（生产模式）

这是交付和测试的推荐方式。

**步骤 1：构建 Docker 镜像**

此命令会在构建时（build-time）将 `NEXT_PUBLIC_` 变量安全地“烘焙”到客户端 JavaScript 中。

```shell
# 确保 .env.docker 文件在当前目录
# 此命令会自动从 .env.docker 读取值并作为构建参数传入
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.docker | cut -d '=' -f2 | tr -d '"') \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.docker | cut -d '=' -f2 | tr -d '"') \
  --build-arg NEXT_PUBLIC_AMAP_KEY=$(grep NEXT_PUBLIC_AMAP_KEY .env.docker | cut -d '=' -f2 | tr -d '"') \
  --build-arg NEXT_PUBLIC_AMAP_SECURITY_CODE=$(grep NEXT_PUBLIC_AMAP_SECURITY_CODE .env.docker | cut -d '=' -f2 | tr -d '"') \
  -t ai-travel-planner .
```

**步骤 2：运行 Docker 容器**

此命令会在运行时（run-time）将**所有**环境变量安全地注入到服务器。

```shell
# --env-file 会读取 .env.docker 并将所有变量注入容器
docker run -d \
  -p 3000:3000 \
  --env-file ./.env.docker \
  ai-travel-planner
```

**步骤 3：访问应用**

打开浏览器并访问 `http://localhost:3000`。

### 3. (备选) 本地开发模式

1. **克隆仓库**:

   ```bash
   git clone [https://github.com/YOUR_USERNAME/ai-travel-planner.git](https://github.com/YOUR_USERNAME/ai-travel-planner.git)
   cd ai-travel-planner
   ```

2. **安装依赖**:

   ```bash
   npm install
   ```

3. **创建 `.env.local` 文件**:

   - 复制 `.env.docker` 模板的内容，将其粘贴到一个新文件 `.env.local` 中。
   - (Next.js 会在 `npm run dev` 时自动加载此文件)

4. **运行开发服务器**:

   ```bash
   npm run dev
   ```

5. **访问应用**: 打开浏览器并访问 `http://localhost:3000`。
