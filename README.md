# 专利许可版税结算系统

一个全栈 Web 应用，实现专利许可版税的完整结算流程。

## 功能特性

- **合同管理**: 专利权人登记许可合同，支持生效/失效状态管理
- **阶梯费率**: 支持多档阶梯费率配置
- **销售申报**: 被许可方申报销售额，系统自动校验合同状态
- **结算管理**: 财务复核阶梯费率并生成结算单
- **补差流程**: 已结算期间再次申报自动进入补差流程

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite3
- **前端**: 原生 HTML/CSS/JavaScript

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

```bash
npm run init-db
```

### 3. 启动服务

```bash
npm start
```

服务运行在 http://localhost:3000

## 核心业务场景

### 场景1: 合同未生效时销售申报被拒绝
- 合同状态为 DRAFT（草稿）时，无法提交销售申报
- 只有 ACTIVE（生效）状态的合同才能进行销售申报

### 场景2: 销售额跨入新阶梯后自动换算费率
- 支持多档阶梯费率配置
- 系统自动根据销售额匹配对应阶梯的费率
- 示例：0-10000:3%, 10000-50000:5%, 50000+:8%

### 场景3: 已结算期间再次申报进入补差流程
- 已结算的申报期间再次提交时，系统自动标记为补差申报
- 生成结算单时自动计算差额（新版税额 - 原结算税额）

## API 接口

### 合同管理
- `GET /api/contracts` - 获取合同列表
- `GET /api/contracts/:id` - 获取合同详情
- `POST /api/contracts` - 创建合同
- `POST /api/contracts/:id/activate` - 合同生效
- `POST /api/contracts/:id/deactivate` - 合同失效
- `DELETE /api/contracts/:id` - 删除合同

### 阶梯费率
- `GET /api/rate-tiers/contract/:contractId` - 获取合同费率档
- `POST /api/rate-tiers` - 新增费率档
- `DELETE /api/rate-tiers/:id` - 删除费率档

### 销售申报
- `GET /api/sales-reports` - 获取申报列表
- `POST /api/sales-reports` - 提交销售申报

### 结算管理
- `GET /api/settlements` - 获取结算列表
- `POST /api/settlements/generate/:reportId` - 生成结算单

## 验证脚本

运行自动化验证脚本，测试跨阶梯费率结算功能：

```bash
./verify.sh
```

验证内容包括：
1. 销售额 5,000 → 阶梯1（3%）→ 版税 150
2. 销售额 30,000 → 阶梯2（5%）→ 版税 1,500
3. 销售额 100,000 → 阶梯3（8%）→ 版税 8,000
4. 未生效合同申报被拒绝（HTTP 400）

## 数据库表结构

### contracts（合同表）
- id, contract_no, patent_name, patent_no, licensor, licensee
- effective_date, end_date, status (DRAFT/ACTIVE/INACTIVE)

### rate_tiers（费率档表）
- id, contract_id, tier_name, min_amount, max_amount, rate

### sales_reports（销售申报表）
- id, report_no, contract_id, licensee, period, sales_amount
- status (PENDING/SETTLED), is_supplementary, original_report_id

### settlements（结算单表）
- id, settlement_no, report_id, contract_id, period, sales_amount
- royalty_amount, applied_rate, tier_applied
- is_supplementary, previous_settlement_id, difference_amount, status

## 项目结构

```
.
├── db/
│   ├── database.js      # 数据库连接模块
│   └── schema.sql       # 表结构定义
├── public/
│   ├── css/
│   │   └── style.css    # 前端样式
│   ├── js/
│   │   └── app.js       # 前端逻辑
│   └── index.html       # 前端页面
├── scripts/
│   └── init-db.js       # 数据库初始化脚本
├── server.js            # 后端服务器
├── verify.sh            # 验证脚本
└── package.json         # 项目配置
```
