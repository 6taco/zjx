# 电子证书跨机构可信验证平台

本项目是一个面向电子证书业务场景的跨机构可信验证平台，综合采用 **React、Express、MySQL、Solidity 与 IPFS** 等技术，实现证书信息管理、链上可信登记、文件真实性校验和跨机构受控验证。系统的设计目标是在保留传统业务系统可管理性的同时，引入区块链不可篡改特性，以提升电子证书的可信度与可验证性。

## 项目概述

- 本系统采用“前端应用 + 业务后端 + 数据库存储 + 区块链索引 + IPFS 文件存储”的混合架构
- 前端负责用户交互、证书录入、草稿审批入口、验证页面和 MetaMask 钱包交互
- 后端负责认证鉴权、证书业务流转、数据库访问、OCR 调用、IPFS 上传和验证日志记录
- 智能合约负责保存 `certHash -> ipfsHash + issuer + timestamp` 的可信索引
- 系统既支持普通用户先提交草稿，也支持管理员直接发布证书
- 系统支持跨机构授权验证，在未授权场景下返回加密结果，以降低敏感信息直接暴露的风险

## 研究目标与系统价值

- 构建一套适用于电子证书场景的可信发布与验证方案
- 解决传统电子证书易复制、难核验、跨机构验证效率低的问题
- 通过链上登记增强关键索引数据的防篡改能力
- 通过 IPFS 减轻链上存储压力，提高系统整体可扩展性
- 通过 OCR 辅助录入降低人工填写成本，提升业务处理效率
- 通过角色分层与授权码机制增强系统的安全性与管理性

## 核心功能

- 用户注册、登录与 JWT 身份认证
- 邮箱验证码注册
- 普通用户提交证书草稿
- 机构管理员查看并审批本机构草稿
- 管理员和总管理员直接发布证书
- 证书文件上传与 IPFS 存储
- MetaMask 发起链上登记
- 按 `id / cert_id / cert_hash` 进行链上验证
- 对证书文件进行真实性校验
- 管理员对证书进行修改与删除
- 总管理员生成跨机构验证授权码
- OCR 识别与表单自动填充

## 技术栈

### 前端

- React 18
- Vite 5
- ethers 6
- lucide-react

### 后端

- Node.js
- Express 4
- MySQL
- mysql2
- jsonwebtoken
- bcrypt
- multer
- nodemailer

### 区块链与外部服务

- Solidity 0.8.20
- Hardhat
- Sepolia 测试网
- Pinata / IPFS
- 百度 OCR
- SMTP 邮箱服务

## 仓库结构

```text
毕设
├─ backend
│  ├─ controllers/          # 路由处理器
│  ├─ middleware/            # JWT鉴权、全局错误处理
│  ├─ routes/                # Express 路由定义
│  ├─ utils/                 # 共享工具 (roles, schemaCache, contractAbi)
│  ├─ config/                # 数据库连接与表初始化
│  └─ server.js              # 入口
├─ contracts
│  ├─ contracts/             # Solidity 源码
│  ├─ test/                  # Hardhat 单元测试 (33 cases)
│  ├─ scripts/               # 部署脚本
│  └─ abi/                   # 编译后 ABI
├─ frontend
│  ├─ src/
│  │  ├─ components/         # Sidebar, LoginPage, AdminDialogs, DraftListView, AuthCodePanel
│  │  ├─ utils/              # ocrParser, contractConfig, wallet, helpers
│  │  ├─ App.jsx             # 主应用组件
│  │  ├─ VerifyCertificate.jsx
│  │  └─ FileVerify.jsx
│  └─ index.css
├─ docs/
├─ README.md
└─ 项目文档.md
```

### 目录职责

- `frontend`：前端单页应用，负责交互展示、发证、审批、验证与钱包连接
- `frontend/src/components`：拆分后的独立 UI 组件（登录页、侧边栏、弹窗等）
- `frontend/src/utils`：前端共享工具（OCR 解析、合约配置、钱包交互、格式化函数）
- `backend`：后端业务服务，负责认证、证书流转、数据库访问、IPFS、OCR 与日志
- `backend/utils`：后端共享工具（角色检查、Schema 缓存、合约 ABI）
- `backend/middleware`：JWT 中间件与全局错误处理
- `contracts`：智能合约及 Hardhat 编译部署工程
- `contracts/test`：智能合约单元测试（33 个用例）
- `docs`：按专题拆分的架构、接口、数据库文档

## 文档导航

- [架构说明](docs/架构说明.md)
- [接口说明](docs/接口说明.md)
- [数据库设计](docs/数据库设计.md)
- [智能合约说明](docs/智能合约说明.md)
- [项目文档](项目文档.md)

## 运行前准备

- 已安装 Node.js
- 已安装并运行 MySQL
- 已准备后端 `.env` 所需配置
- 已准备 Pinata、百度 OCR、SMTP 等外部服务参数
- 已安装 MetaMask
- 已准备 Sepolia 测试 ETH 与钱包账户

## 启动方式

### 启动后端

```bash
cd backend
npm install
npm run dev
```

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 编译合约

```bash
cd contracts
npm install
npm run compile
```

### 运行合约测试

```bash
cd contracts
npm test
```

### 部署合约

```bash
cd contracts
npm run deploy:sepolia
```

## 环境变量提示

项目运行涉及以下几类关键配置：

- 数据库：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`
- 鉴权：`JWT_SECRET`、`JWT_EXPIRES_IN`
- 邮件：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`
- IPFS：`PINATA_JWT` 或 `PINATA_API_KEY`、`PINATA_SECRET_API_KEY`
- 链上：`CERT_REGISTRY_ADDRESS`、`SEPOLIA_RPC_URL`、`VITE_CERT_REGISTRY_ADDRESS`
- OCR：`BAIDU_OCR_API_KEY`、`BAIDU_OCR_SECRET_KEY`
- 授权验证：`VERIFY_AUTH_KEY`、`VERIFY_ENCRYPTION_SECRET`

不要把真实密钥、密码或 API Key 提交到公开仓库。

## 数据库初始化说明

- 后端启动时会自动创建 `verify_logs`、`verify_auth_codes`、`email_verify_codes`、`certificate_drafts`
- 后端只会为已存在的 `certificates` 表补充扩展字段
- `users` 和 `certificates` 主表仍需要预先初始化

## 业务流程概述

### 普通用户发证流程

1. 普通用户登录后上传证书文件并填写信息
2. 后端校验机构信息后写入 `certificate_drafts`
3. 所属机构管理员查看并审批草稿
4. 审批通过后后端生成正式证书记录
5. 前端调用 MetaMask 完成链上登记
6. 前端把交易哈希回写后端

### 管理员直接发证流程

1. 管理员上传证书文件并填写信息
2. 后端计算哈希、上传文件到 IPFS、写入 `certificates`
3. 前端调用 MetaMask 将证书哈希和 IPFS 哈希写入合约
4. 前端将交易哈希回写后端

### 证书验证流程

1. 用户输入证书 `id / cert_id / cert_hash`，或上传文件
2. 后端定位真实证书哈希并调用链上查询
3. 有授权码时返回明文，无授权时返回加密结果
4. 前端展示结果并记录验证日志

## 项目亮点

- 采用链下业务处理与链上可信索引相结合的混合架构
- 采用“文件上 IPFS、索引上链”的存储方案，在成本与可信性之间取得平衡
- 引入草稿审批机制，使证书发布流程更接近真实机构场景
- 引入跨机构授权验证机制，提升验证过程的受控性与安全性
- 引入 OCR 智能识别能力，提升证书录入效率
- 形成从发布、审批、登记、验证到审计的完整业务闭环

## 已完成的优化

- **安全加固**：敏感配置迁移到 .env、强制用户角色注册、CORS 白名单、请求体大小限制、验证日志限流
- **后端架构优化**：共享角色检查工具、SHOW COLUMNS 缓存、统一 ABI 来源、全局错误处理中间件、文件验证全表扫描修复
- **前端架构重构**：App.jsx 从 2808 行缩减至 1793 行，提取 9 个独立模块（组件 + 工具）
- **智能合约增强**：添加 owner 访问控制、issuer 白名单、证书撤销、批量存储、indexed 事件、verifyCertificateEx
- **合约单元测试**：33 个测试用例，覆盖部署、权限、存储、批量、验证、撤销全流程

## 后续优化方向

- 为后端引入 service / repository 分层
- 建立正式 migration 体系，而不是继续依赖运行时补字段
- 增加后端 API 集成测试
- 前端引入 React Router 与状态管理
