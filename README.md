# 7r@vel Pl@nner

本项目是一个基于 Next.js、Supabase 和大语言模型 (LLM) 的 Web 应用程序，旨在作为 LLM 辅助软件工程课程的作业。它通过 AI 了解用户需求（结合已保存偏好），自动生成详细的旅行路线，并提供实时的费用管理功能。

## 核心功能

* **智能行程规划**: 用户可以通过文字或语音输入旅行需求（目的地、预算、偏好等），AI 将结合用户已保存的**偏好设置**自动生成个性化的旅行路线（交通、住宿、景点）。
* **用户偏好设置**: 提供个人资料页面 (`/profile`) 允许用户设置旅行风格、餐饮、交通等偏好，偏好将存储并在规划时被 AI 考虑。
* **用户与认证**: 基于 Supabase Auth 实现用户注册、登录和会话管理。
* **数据持久化**: 所有用户生成的行程和偏好都安全地存储在 Supabase Postgres 数据库中（行程在 `plans` 表，偏好在 `user_preferences` 表）。
* **行程详情与地图**: 为每个行程提供动态详情页 (`/plan/[id]`)，并集成高德地图 (Amap) 来标记所有活动地点。
* **地图路线显示**: 在地图上提供按天查看活动点之间**建议驾车路线**的功能，并自动调整视野。为**境外区域**提供路线规划支持有限的提示。
* **导航**: 在行程列表旁提供“导航”按钮，可拉起高德地图 App 或网页版进行导航。
* **多模式记账**: 支持**语音（科大讯飞）**和文字输入（例如“晚餐 3000 日元”），通过 LLM 提取实体（事项、金额、货币）并存入数据库 (`expenses` 表)。
* **多货币汇总**: 自动按货币类型（如 CNY, JPY）汇总开销总额。
* **数据删除**: 支持删除单个开销记录和整个行程计划（包括关联开销）。
* **云端同步**: 实现了 Realtime 订阅 (`PlanSubscriber.tsx`)，用于在数据库数据（行程或开销）变更时自动刷新详情页。

## 技术栈

* **前端**: Next.js (App Router), React, Tailwind CSS, shadcn/ui
* **后端即服务 (BaaS)**: Supabase (Auth, Postgres Database, Realtime)
* **LLM API**: 阿里云灵积 (DashScope) - qwen-plus & qwen-turbo
* **语音识别 (STT)**: **科大讯飞 Lfasr HTTP API** (通过后端 `/api/stt` 路由处理)
* **音频处理**: **ffmpeg** (在后端 API 中用于格式转换)
* **地图服务**: 高德地图 (Amap) JS API (含 Driving 插件)
* **部署**: Docker
* **辅助库**: `axios`, `crypto-js` (前端), Node.js `crypto` (后端)运行项目指南

### 1. 必需的环境变量

在运行项目之前，您必须获取以下所有 API Key，并将它们存储在一个 `.env.docker` 文件中。

#### API Key 列表

1.  **Supabase (2个 - 前端需要)**:
    * `NEXT_PUBLIC_SUPABASE_URL`: 您的 Supabase 项目 URL (在 `Settings` -> `API` 中找到)
    * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 您的 Supabase 项目 `anon` (public) Key (在 `Settings` -> `API` 中找到)
2.  **DashScope (1个 - 后端需要)**:
    * `DASHSCOPE_API_KEY`: 您的阿里云灵积 API Key (sk-...)
3.  **高德地图 (2个 - 前端需要)**:
    * `NEXT_PUBLIC_AMAP_KEY`: 您的高德 Web 端 (JS API) Key
    * `NEXT_PUBLIC_AMAP_SECURITY_CODE`: 您的高德 Web 端 (JS API) 安全密钥
4.  **科大讯飞 (2个 - 后端需要)**:
    * `IFLYTEK_APPID`: 您在讯飞开放平台创建的应用 APPID
    * `IFLYTEK_API_SECRET`: 您应用的 APISecret (用于 Lfasr signa 签名)

#### `.env.docker` 文件模板

请在项目**根目录**创建一个名为 `.env.docker` 的文件（**注意：** 请将此文件添加到 `.gitignore` 中！）。

```sh
# 文件: .env.docker
# (注意: 等号后面直接写值，不要加双引号 "...")

# Supabase (需要 NEXT_PUBLIC_ 前缀)
NEXT_PUBLIC_SUPABASE_URL=xxx_您的SupabaseURL
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx_您的SupabaseAnonKey

# DashScope (LLM - 不需要前缀)
DASHSCOPE_API_KEY=xxx_您的DashScopeKey

# 高德地图 (Amap - 需要 NEXT_PUBLIC_ 前缀)
NEXT_PUBLIC_AMAP_KEY=xxx_您的高德Key
NEXT_PUBLIC_AMAP_SECURITY_CODE=xxx_您的高德安全密钥

# 科大讯飞 (iFlytek - 不需要前缀，仅后端使用)
IFLYTEK_APPID=xxx_您的讯飞APPID
IFLYTEK_API_SECRET=xxx_您的讯飞APISecret
```

### 2. (推荐) 使用 Docker 运行（生产模式）

这是交付和测试的推荐方式。

**步骤 1：构建 Docker 镜像**

此命令会在构建时（build-time）将**前端需要**的 `NEXT_PUBLIC_` 变量安全地“烘焙”到客户端 JavaScript 中。

```bash
# 确保 .env.docker 文件在当前目录
# 只传递 NEXT_PUBLIC_ 前缀的变量作为构建参数
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.docker | cut -d '=' -f2 | tr -d '"') \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.docker | cut -d '=' -f2 | tr -d '"') \
  --build-arg NEXT_PUBLIC_AMAP_KEY=$(grep NEXT_PUBLIC_AMAP_KEY .env.docker | cut -d '=' -f2 | tr -d '"') \
  --build-arg NEXT_PUBLIC_AMAP_SECURITY_CODE=$(grep NEXT_PUBLIC_AMAP_SECURITY_CODE .env.docker | cut -d '=' -f2 | tr -d '"') \
  -t ai-travel-planner .
```

##### 步骤 2：运行 Docker 容器

此命令会在运行时（run-time）将**所有**环境变量（包括前端和后端的）安全地注入到服务器。

```bash
# --env-file 会读取 .env.docker 并将所有变量注入容器
docker run -d \
  -p 3000:3000 \
  --env-file ./.env.docker \
  ai-travel-planner
```

##### 步骤 3：访问应用

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

3. **安装 `ffmpeg`**:

   - 语音识别功能依赖 `ffmpeg` 进行音频转换。请确保您的本地开发环境已安装 `ffmpeg`。
   - (macOS) `brew install ffmpeg`
   - (Ubuntu/Debian) `sudo apt update && sudo apt install ffmpeg`
   - (Windows) 从官网下载或使用包管理器 (如 Chocolatey) 安装。

4. **创建 `.env.local` 文件**:

   - 复制 `.env.docker` 模板的内容，将其粘贴到一个新文件 `.env.local` 中，并填入您的 Key。
   - (Next.js 会在 `npm run dev` 时自动加载此文件)

5. **运行开发服务器**:

   ```bash
   npm run dev
   ```

6. **访问应用**: 打开浏览器并访问 `http://localhost:3000`。
