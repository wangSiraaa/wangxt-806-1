const fs = require('fs');
const path = require('path');

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
  console.log('Created:', filePath);
}

const serverJs = `const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'db', 'patent-royalty.db');

let db;

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else {
        db.serialize(() => {
          db.run('CREATE TABLE IF NOT EXISTS contracts (id INTEGER PRIMARY KEY AUTOINCREMENT, contract_no TEXT UNIQUE NOT NULL, patent_name TEXT NOT NULL, patent_no TEXT NOT NULL, licensor TEXT NOT NULL, licensee TEXT NOT NULL, effective_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT "DRAFT", created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');
          db.run('CREATE TABLE IF NOT EXISTS rate_tiers (id INTEGER PRIMARY KEY AUTOINCREMENT, contract_id INTEGER NOT NULL, tier_name TEXT NOT NULL, min_amount REAL NOT NULL DEFAULT 0, max_amount REAL, rate REAL NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
          db.run('CREATE TABLE IF NOT EXISTS sales_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, report_no TEXT UNIQUE NOT NULL, contract_id INTEGER NOT NULL, licensee TEXT NOT NULL, period TEXT NOT NULL, sales_amount REAL NOT NULL, status TEXT NOT NULL DEFAULT "PENDING", is_supplementary INTEGER DEFAULT 0, original_report_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');
          db.run('CREATE TABLE IF NOT EXISTS settlements (id INTEGER PRIMARY KEY AUTOINCREMENT, settlement_no TEXT UNIQUE NOT NULL, report_id INTEGER NOT NULL, contract_id INTEGER NOT NULL, period TEXT NOT NULL, sales_amount REAL NOT NULL, royalty_amount REAL NOT NULL, applied_rate REAL NOT NULL, tier_applied TEXT, is_supplementary INTEGER DEFAULT 0, previous_settlement_id INTEGER, difference_amount REAL DEFAULT 0, status TEXT NOT NULL DEFAULT "DRAFT", created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    });
  });
}

function generateNo(prefix) {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return prefix + year + month + random;
}

function calculateRoyalty(salesAmount, tiers) {
  if (!tiers || tiers.length === 0) return { royaltyAmount: 0, appliedRate: 0, tierApplied: null };
  let applicableTier = null;
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i];
    if (salesAmount >= tier.min_amount) {
      if (tier.max_amount === null || salesAmount <= tier.max_amount) {
        applicableTier = tier;
        break;
      }
    }
  }
  if (!applicableTier) applicableTier = tiers[0];
  const royaltyAmount = Math.round(salesAmount * (applicableTier.rate / 100) * 100) / 100;
  return { royaltyAmount, appliedRate: applicableTier.rate, tierApplied: applicableTier.tier_name };
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/contracts', (req, res) => {
  db.all('SELECT * FROM contracts ORDER BY created_at DESC', [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.get('/api/contracts/:id', (req, res) => {
  db.get('SELECT * FROM contracts WHERE id = ?', [req.params.id], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else if (!row) res.status(404).json({ error: 'Not found' });
    else res.json(row);
  });
});

app.post('/api/contracts', (req, res) => {
  const { patent_name, patent_no, licensor, licensee, effective_date, end_date } = req.body;
  const contract_no = generateNo('CT');
  db.run('INSERT INTO contracts (contract_no, patent_name, patent_no, licensor, licensee, effective_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, "DRAFT")',
    [contract_no, patent_name, patent_no, licensor, licensee, effective_date, end_date],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.status(201).json({ id: this.lastID, contract_no });
    });
});

app.put('/api/contracts/:id', (req, res) => {
  const { patent_name, patent_no, licensor, licensee, effective_date, end_date } = req.body;
  db.run('UPDATE contracts SET patent_name = ?, patent_no = ?, licensor = ?, licensee = ?, effective_date = ?, end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [patent_name, patent_no, licensor, licensee, effective_date, end_date, req.params.id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else if (this.changes === 0) res.status(404).json({ error: 'Not found' });
      else res.json({ message: 'Updated' });
    });
});

app.post('/api/contracts/:id/activate', (req, res) => {
  db.run('UPDATE contracts SET status = "ACTIVE", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ message: 'Activated' });
    });
});

app.post('/api/contracts/:id/deactivate', (req, res) => {
  db.run('UPDATE contracts SET status = "INACTIVE", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ message: 'Deactivated' });
    });
});

app.delete('/api/contracts/:id', (req, res) => {
  db.run('DELETE FROM contracts WHERE id = ?', [req.params.id], function(err) {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ message: 'Deleted' });
  });
});

app.get('/api/rate-tiers/contract/:contractId', (req, res) => {
  db.all('SELECT * FROM rate_tiers WHERE contract_id = ? ORDER BY min_amount ASC', [req.params.contractId], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post('/api/rate-tiers', (req, res) => {
  const { contract_id, tier_name, min_amount, max_amount, rate } = req.body;
  db.run('INSERT INTO rate_tiers (contract_id, tier_name, min_amount, max_amount, rate) VALUES (?, ?, ?, ?, ?)',
    [contract_id, tier_name, min_amount, max_amount, rate],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.status(201).json({ id: this.lastID });
    });
});

app.put('/api/rate-tiers/:id', (req, res) => {
  const { tier_name, min_amount, max_amount, rate } = req.body;
  db.run('UPDATE rate_tiers SET tier_name = ?, min_amount = ?, max_amount = ?, rate = ? WHERE id = ?',
    [tier_name, min_amount, max_amount, rate, req.params.id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ message: 'Updated' });
    });
});

app.delete('/api/rate-tiers/:id', (req, res) => {
  db.run('DELETE FROM rate_tiers WHERE id = ?', [req.params.id], function(err) {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ message: 'Deleted' });
  });
});

app.get('/api/sales-reports', (req, res) => {
  db.all('SELECT sr.*, c.contract_no, c.patent_name FROM sales_reports sr LEFT JOIN contracts c ON sr.contract_id = c.id ORDER BY sr.created_at DESC', [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post('/api/sales-reports', (req, res) => {
  const { contract_id, licensee, period, sales_amount } = req.body;
  const report_no = generateNo('SR');
  
  db.get('SELECT * FROM contracts WHERE id = ?', [contract_id], (err, contract) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if (contract.status !== 'ACTIVE') return res.status(400).json({ error: '合同未生效，无法提交销售申报' });
    
    db.get('SELECT * FROM sales_reports WHERE contract_id = ? AND period = ? AND is_supplementary = 0', [contract_id, period], (err, existingReport) => {
      if (err) return res.status(500).json({ error: err.message });
      
      let is_supplementary = 0;
      let original_report_id = null;
      let message = '';
      
      if (existingReport) {
        db.get('SELECT * FROM settlements WHERE report_id = ?', [existingReport.id], (err, existingSettlement) => {
          if (existingSettlement) {
            is_supplementary = 1;
            original_report_id = existingReport.id;
            message = '该期间已存在申报并已结算，本次申报为补差申报';
          }
          insertReport();
        });
      } else {
        insertReport();
      }
      
      function insertReport() {
        db.run('INSERT INTO sales_reports (report_no, contract_id, licensee, period, sales_amount, status, is_supplementary, original_report_id) VALUES (?, ?, ?, ?, ?, "PENDING", ?, ?)',
          [report_no, contract_id, licensee, period, sales_amount, is_supplementary, original_report_id],
          function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, report_no, is_supplementary, message });
          });
      }
    });
  });
});

app.get('/api/settlements', (req, res) => {
  db.all('SELECT s.*, c.contract_no, c.patent_name, sr.report_no, sr.licensee FROM settlements s LEFT JOIN contracts c ON s.contract_id = c.id LEFT JOIN sales_reports sr ON s.report_id = sr.id ORDER BY s.created_at DESC', [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post('/api/settlements/generate/:reportId', (req, res) => {
  const reportId = req.params.reportId;
  const settlement_no = generateNo('ST');
  
  db.get('SELECT * FROM sales_reports WHERE id = ?', [reportId], (err, report) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    
    db.all('SELECT * FROM rate_tiers WHERE contract_id = ? ORDER BY min_amount ASC', [report.contract_id], (err, tiers) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const result = calculateRoyalty(report.sales_amount, tiers);
      let is_supplementary = 0;
      let previous_settlement_id = null;
      let difference_amount = 0;
      
      if (report.is_supplementary && report.original_report_id) {
        is_supplementary = 1;
        db.get('SELECT * FROM settlements WHERE report_id = ?', [report.original_report_id], (err, prevSettlement) => {
          if (prevSettlement) {
            previous_settlement_id = prevSettlement.id;
            difference_amount = Math.round((result.royaltyAmount - prevSettlement.royalty_amount) * 100) / 100;
          }
          insertSettlement();
        });
      } else {
        insertSettlement();
      }
      
      function insertSettlement() {
        db.run('INSERT INTO settlements (settlement_no, report_id, contract_id, period, sales_amount, royalty_amount, applied_rate, tier_applied, is_supplementary, previous_settlement_id, difference_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "DRAFT")',
          [settlement_no, report.id, report.contract_id, report.period, report.sales_amount, result.royaltyAmount, result.appliedRate, result.tierApplied, is_supplementary, previous_settlement_id, difference_amount],
          function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run('UPDATE sales_reports SET status = "SETTLED", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [reportId]);
            res.status(201).json({
              id: this.lastID, settlement_no,
              sales_amount: report.sales_amount,
              royalty_amount: result.royaltyAmount,
              applied_rate: result.appliedRate,
              tier_applied: result.tierApplied,
              is_supplementary,
              difference_amount
            });
          });
      }
    });
  });
});

app.put('/api/settlements/:id/status', (req, res) => {
  const { status } = req.body;
  db.run('UPDATE settlements SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ message: 'Updated' });
    });
});

async function start() {
  await initDatabase();
  app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
}

start();
`;

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>专利许可版税结算系统</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>专利许可版税结算系统</h1>
            <nav class="tabs">
                <button class="tab-btn active" data-tab="contracts">合同管理</button>
                <button class="tab-btn" data-tab="rate-tiers">费率档位</button>
                <button class="tab-btn" data-tab="sales-reports">销售申报</button>
                <button class="tab-btn" data-tab="settlements">结算管理</button>
            </nav>
        </header>

        <main>
            <section id="contracts" class="tab-content active">
                <div class="section-header">
                    <h2>专利许可合同管理</h2>
                    <button class="btn btn-primary" onclick="showContractModal()">新增合同</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>合同编号</th>
                                <th>专利名称</th>
                                <th>专利号</th>
                                <th>专利权人</th>
                                <th>被许可方</th>
                                <th>状态</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody id="contracts-tbody"></tbody>
                    </table>
                </div>
            </section>

            <section id="rate-tiers" class="tab-content">
                <div class="section-header">
                    <h2>阶梯费率档位管理</h2>
                    <div>
                        <select id="rate-contract-select" onchange="loadRateTiers()">
                            <option value="">选择合同</option>
                        </select>
                        <button class="btn btn-primary" onclick="showRateTierModal()">新增费率档</button>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>档位名称</th>
                                <th>最低销售额</th>
                                <th>最高销售额</th>
                                <th>费率(%)</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody id="rate-tiers-tbody"></tbody>
                    </table>
                </div>
            </section>

            <section id="sales-reports" class="tab-content">
                <div class="section-header">
                    <h2>销售申报管理</h2>
                    <button class="btn btn-primary" onclick="showSalesReportModal()">新增申报</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>申报编号</th>
                                <th>合同</th>
                                <th>期间</th>
                                <th>申报金额</th>
                                <th>是否补差</th>
                                <th>状态</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody id="sales-reports-tbody"></tbody>
                    </table>
                </div>
            </section>

            <section id="settlements" class="tab-content">
                <div class="section-header">
                    <h2>结算单管理</h2>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>结算编号</th>
                                <th>申报编号</th>
                                <th>期间</th>
                                <th>销售额</th>
                                <th>适用费率</th>
                                <th>版税金额</th>
                                <th>补差金额</th>
                                <th>状态</th>
                            </tr>
                        </thead>
                        <tbody id="settlements-tbody"></tbody>
                    </table>
                </div>
            </section>
        </main>
    </div>

    <div id="contract-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>新增合同</h3>
                <span class="close" onclick="closeModal('contract-modal')">&times;</span>
            </div>
            <div class="modal-body">
                <form id="contract-form">
                    <input type="hidden" id="contract-id">
                    <div class="form-group">
                        <label>专利名称 *</label>
                        <input type="text" id="patent-name" required>
                    </div>
                    <div class="form-group">
                        <label>专利号 *</label>
                        <input type="text" id="patent-no" required>
                    </div>
                    <div class="form-group">
                        <label>专利权人 *</label>
                        <input type="text" id="licensor" required>
                    </div>
                    <div class="form-group">
                        <label>被许可方 *</label>
                        <input type="text" id="licensee" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>生效日期 *</label>
                            <input type="date" id="effective-date" required>
                        </div>
                        <div class="form-group">
                            <label>结束日期 *</label>
                            <input type="date" id="end-date" required>
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('contract-modal')">取消</button>
                <button class="btn btn-primary" onclick="saveContract()">保存</button>
            </div>
        </div>
    </div>

    <div id="rate-tier-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>新增费率档</h3>
                <span class="close" onclick="closeModal('rate-tier-modal')">&times;</span>
            </div>
            <div class="modal-body">
                <form id="rate-tier-form">
                    <input type="hidden" id="rate-tier-id">
                    <div class="form-group">
                        <label>档位名称 *</label>
                        <input type="text" id="tier-name" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>最低销售额 *</label>
                            <input type="number" id="min-amount" step="0.01" min="0" required>
                        </div>
                        <div class="form-group">
                            <label>最高销售额</label>
                            <input type="number" id="max-amount" step="0.01" min="0">
                            <small>留空表示不设上限</small>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>费率(%) *</label>
                        <input type="number" id="rate" step="0.01" min="0" max="100" required>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('rate-tier-modal')">取消</button>
                <button class="btn btn-primary" onclick="saveRateTier()">保存</button>
            </div>
        </div>
    </div>

    <div id="sales-report-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>新增销售申报</h3>
                <span class="close" onclick="closeModal('sales-report-modal')">&times;</span>
            </div>
            <div class="modal-body">
                <form id="sales-report-form">
                    <div class="form-group">
                        <label>选择合同 *</label>
                        <select id="sales-contract-select" required>
                            <option value="">请选择合同</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>被许可方 *</label>
                        <input type="text" id="sales-licensee" required>
                    </div>
                    <div class="form-group">
                        <label>申报期间 *</label>
                        <input type="month" id="sales-period" required>
                    </div>
                    <div class="form-group">
                        <label>申报销售额 *</label>
                        <input type="number" id="sales-amount" step="0.01" min="0" required>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('sales-report-modal')">取消</button>
                <button class="btn btn-primary" onclick="saveSalesReport()">提交申报</button>
            </div>
        </div>
    </div>

    <div id="toast" class="toast"></div>

    <script src="/js/app.js"></script>
</body>
</html>
`;

const styleCss = `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f5f7fa;
    color: #333;
}

.container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
}

header {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    margin-bottom: 20px;
}

header h1 {
    color: #2c3e50;
    margin-bottom: 15px;
    font-size: 24px;
}

.tabs {
    display: flex;
    gap: 10px;
    border-bottom: 2px solid #e0e0e0;
}

.tab-btn {
    padding: 10px 20px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: #666;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: all 0.3s;
}

.tab-btn:hover {
    color: #3498db;
}

.tab-btn.active {
    color: #3498db;
    border-bottom-color: #3498db;
    font-weight: 500;
}

.tab-content {
    display: none;
}

.tab-content.active {
    display: block;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.section-header h2 {
    color: #2c3e50;
    font-size: 20px;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s;
}

.btn-primary {
    background-color: #3498db;
    color: white;
}

.btn-primary:hover {
    background-color: #2980b9;
}

.btn-secondary {
    background-color: #95a5a6;
    color: white;
}

.btn-secondary:hover {
    background-color: #7f8c8d;
}

.btn-success {
    background-color: #27ae60;
    color: white;
}

.btn-success:hover {
    background-color: #219a52;
}

.btn-warning {
    background-color: #f39c12;
    color: white;
}

.btn-warning:hover {
    background-color: #e67e22;
}

.btn-danger {
    background-color: #e74c3c;
    color: white;
}

.btn-danger:hover {
    background-color: #c0392b;
}

.btn-small {
    padding: 4px 8px;
    font-size: 12px;
    margin-right: 5px;
}

.table-container {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    overflow: hidden;
}

table {
    width: 100%;
    border-collapse: collapse;
}

th, td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e0e0e0;
}

th {
    background-color: #f8f9fa;
    font-weight: 600;
    color: #2c3e50;
    font-size: 13px;
}

td {
    font-size: 13px;
}

tbody tr:hover {
    background-color: #f8f9fa;
}

.status-draft {
    color: #f39c12;
    font-weight: 500;
}

.status-active {
    color: #27ae60;
    font-weight: 500;
}

.status-inactive {
    color: #e74c3c;
    font-weight: 500;
}

.status-pending {
    color: #f39c12;
    font-weight: 500;
}

.status-settled {
    color: #27ae60;
    font-weight: 500;
}

.modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.5);
}

.modal.show {
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-content {
    background-color: white;
    border-radius: 8px;
    width: 500px;
    max-width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
    color: #2c3e50;
    font-size: 18px;
}

.close {
    font-size: 28px;
    font-weight: bold;
    color: #aaa;
    cursor: pointer;
    line-height: 1;
}

.close:hover {
    color: #333;
}

.modal-body {
    padding: 20px;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 20px;
    border-top: 1px solid #e0e0e0;
}

.form-group {
    margin-bottom: 15px;
}

.form-row {
    display: flex;
    gap: 15px;
}

.form-row .form-group {
    flex: 1;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    color: #555;
    font-size: 13px;
}

.form-group input,
.form-group select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.form-group input:focus,
.form-group select:focus {
    outline: none;
    border-color: #3498db;
}

.form-group small {
    color: #999;
    font-size: 12px;
}

.toast {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    z-index: 2000;
    transform: translateX(400px);
    transition: transform 0.3s;
}

.toast.show {
    transform: translateX(0);
}

.toast.success {
    background-color: #27ae60;
}

.toast.error {
    background-color: #e74c3c;
}

select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    background-color: white;
    cursor: pointer;
    margin-right: 10px;
}
`;

const appJs = `const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadContracts();
    loadSalesReports();
    loadSettlements();
});

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabId).classList.add('active');
            
            if (tabId === 'rate-tiers') {
                populateRateContractSelect();
            }
        });
    });
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

async function loadContracts() {
    try {
        const response = await fetch(API_BASE + '/contracts');
        const contracts = await response.json();
        const tbody = document.getElementById('contracts-tbody');
        tbody.innerHTML = contracts.map(c => 
            '<tr><td>' + c.contract_no + '</td><td>' + c.patent_name + '</td><td>' + c.patent_no + '</td><td>' + c.licensor + '</td><td>' + c.licensee + '</td><td><span class="status-' + c.status.toLowerCase() + '">' + getStatusText(c.status) + '</span></td><td>' +
            (c.status === 'DRAFT' ? '<button class="btn btn-small btn-success" onclick="activateContract(' + c.id + ')">生效</button>' : '') +
            (c.status === 'ACTIVE' ? '<button class="btn btn-small btn-warning" onclick="deactivateContract(' + c.id + ')">停用</button>' : '') +
            '<button class="btn btn-small btn-danger" onclick="deleteContract(' + c.id + ')">删除</button></td></tr>'
        ).join('');
    } catch (error) {
        showToast('加载合同列表失败', 'error');
    }
}

function getStatusText(status) {
    const map = { 'DRAFT': '草稿', 'ACTIVE': '已生效', 'INACTIVE': '已停用', 'PENDING': '待审核', 'SETTLED': '已结算' };
    return map[status] || status;
}

function showContractModal() {
    document.getElementById('contract-form').reset();
    document.getElementById('contract-id').value = '';
    showModal('contract-modal');
}

async function saveContract() {
    const id = document.getElementById('contract-id').value;
    const data = {
        patent_name: document.getElementById('patent-name').value,
        patent_no: document.getElementById('patent-no').value,
        licensor: document.getElementById('licensor').value,
        licensee: document.getElementById('licensee').value,
        effective_date: document.getElementById('effective-date').value,
        end_date: document.getElementById('end-date').value
    };

    try {
        const url = id ? API_BASE + '/contracts/' + id : API_BASE + '/contracts';
        const method = id ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            showToast(id ? '合同更新成功' : '合同创建成功', 'success');
            closeModal('contract-modal');
            loadContracts();
        } else {
            const result = await response.json();
            showToast(result.error || '操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function activateContract(id) {
    if (!confirm('确认将此合同设为生效状态吗？')) return;
    try {
        const response = await fetch(API_BASE + '/contracts/' + id + '/activate', { method: 'POST' });
        if (response.ok) {
            showToast('合同已生效', 'success');
            loadContracts();
        } else {
            showToast('操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function deactivateContract(id) {
    if (!confirm('确认停用此合同吗？')) return;
    try {
        const response = await fetch(API_BASE + '/contracts/' + id + '/deactivate', { method: 'POST' });
        if (response.ok) {
            showToast('合同已停用', 'success');
            loadContracts();
        } else {
            showToast('操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function deleteContract(id) {
    if (!confirm('确认删除此合同吗？')) return;
    try {
        const response = await fetch(API_BASE + '/contracts/' + id, { method: 'DELETE' });
        if (response.ok) {
            showToast('合同已删除', 'success');
            loadContracts();
        } else {
            showToast('操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function populateRateContractSelect() {
    try {
        const response = await fetch(API_BASE + '/contracts');
        const contracts = await response.json();
        const rateSelect = document.getElementById('rate-contract-select');
        rateSelect.innerHTML = '<option value="">选择合同</option>' + 
            contracts.map(c => '<option value="' + c.id + '">' + c.contract_no + ' - ' + c.patent_name + '</option>').join('');
    } catch (error) {
        console.error('Failed to load contracts:', error);
    }
}

async function loadRateTiers() {
    const contractId = document.getElementById('rate-contract-select').value;
    if (!contractId) {
        document.getElementById('rate-tiers-tbody').innerHTML = '';
        return;
    }
    
    try {
        const response = await fetch(API_BASE + '/rate-tiers/contract/' + contractId);
        const tiers = await response.json();
        const tbody = document.getElementById('rate-tiers-tbody');
        tbody.innerHTML = tiers.map(t => 
            '<tr><td>' + t.tier_name + '</td><td>¥' + t.min_amount.toLocaleString() + '</td><td>' + (t.max_amount ? '¥' + t.max_amount.toLocaleString() : '无上限') + '</td><td>' + t.rate + '%</td><td><button class="btn btn-small btn-danger" onclick="deleteRateTier(' + t.id + ')">删除</button></td></tr>'
        ).join('');
    } catch (error) {
        showToast('加载费率档位失败', 'error');
    }
}

function showRateTierModal() {
    const contractId = document.getElementById('rate-contract-select').value;
    if (!contractId) {
        showToast('请先选择合同', 'error');
        return;
    }
    document.getElementById('rate-tier-form').reset();
    document.getElementById('rate-tier-id').value = '';
    showModal('rate-tier-modal');
}

async function saveRateTier() {
    const contractId = document.getElementById('rate-contract-select').value;
    const data = {
        contract_id: parseInt(contractId),
        tier_name: document.getElementById('tier-name').value,
        min_amount: parseFloat(document.getElementById('min-amount').value),
        max_amount: document.getElementById('max-amount').value ? parseFloat(document.getElementById('max-amount').value) : null,
        rate: parseFloat(document.getElementById('rate').value)
    };

    try {
        const response = await fetch(API_BASE + '/rate-tiers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            showToast('费率档创建成功', 'success');
            closeModal('rate-tier-modal');
            loadRateTiers();
        } else {
            const result = await response.json();
            showToast(result.error || '操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function deleteRateTier(id) {
    if (!confirm('确认删除此费率档吗？')) return;
    try {
        const response = await fetch(API_BASE + '/rate-tiers/' + id, { method: 'DELETE' });
        if (response.ok) {
            showToast('费率档已删除', 'success');
            loadRateTiers();
        } else {
            showToast('操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function loadSalesReports() {
    try {
        const response = await fetch(API_BASE + '/sales-reports');
        const reports = await response.json();
        const tbody = document.getElementById('sales-reports-tbody');
        tbody.innerHTML = reports.map(r => 
            '<tr><td>' + r.report_no + '</td><td>' + (r.contract_no || '-') + '</td><td>' + r.period + '</td><td>¥' + r.sales_amount.toLocaleString() + '</td><td>' + (r.is_supplementary ? '<span class="status-warning">是</span>' : '否') + '</td><td><span class="status-' + r.status.toLowerCase() + '">' + getStatusText(r.status) + '</span></td><td>' +
            (r.status === 'PENDING' ? '<button class="btn btn-small btn-success" onclick="generateSettlement(' + r.id + ')">生成结算单</button>' : '') +
            '</td></tr>'
        ).join('');
    } catch (error) {
        showToast('加载销售申报失败', 'error');
    }
}

async function showSalesReportModal() {
    document.getElementById('sales-report-form').reset();
    try {
        const response = await fetch(API_BASE + '/contracts');
        const contracts = await response.json();
        const activeContracts = contracts.filter(c => c.status === 'ACTIVE');
        const select = document.getElementById('sales-contract-select');
        select.innerHTML = '<option value="">请选择合同</option>' + 
            activeContracts.map(c => '<option value="' + c.id + '">' + c.contract_no + ' - ' + c.patent_name + '</option>').join('');
    } catch (error) {
        console.error(error);
    }
    showModal('sales-report-modal');
}

async function saveSalesReport() {
    const data = {
        contract_id: parseInt(document.getElementById('sales-contract-select').value),
        licensee: document.getElementById('sales-licensee').value,
        period: document.getElementById('sales-period').value,
        sales_amount: parseFloat(document.getElementById('sales-amount').value)
    };

    try {
        const response = await fetch(API_BASE + '/sales-reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            showToast(result.message || '申报提交成功', 'success');
            closeModal('sales-report-modal');
            loadSalesReports();
        } else {
            showToast(result.error || '申报失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function generateSettlement(reportId) {
    if (!confirm('确认为此申报生成结算单吗？')) return;
    try {
        const response = await fetch(API_BASE + '/settlements/generate/' + reportId, { method: 'POST' });
        if (response.ok) {
            showToast('结算单生成成功', 'success');
            loadSalesReports();
            loadSettlements();
        } else {
            const result = await response.json();
            showToast(result.error || '生成失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function loadSettlements() {
    try {
        const response = await fetch(API_BASE + '/settlements');
        const settlements = await response.json();
        const tbody = document.getElementById('settlements-tbody');
        tbody.innerHTML = settlements.map(s => 
            '<tr><td>' + s.settlement_no + '</td><td>' + (s.report_no || '-') + '</td><td>' + s.period + '</td><td>¥' + s.sales_amount.toLocaleString() + '</td><td>' + s.applied_rate + '%</td><td>¥' + s.royalty_amount.toLocaleString() + '</td><td>' + (s.difference_amount ? '¥' + s.difference_amount.toLocaleString() : '-') + '</td><td><span class="status-' + s.status.toLowerCase() + '">' + getStatusText(s.status) + '</span></td></tr>'
        ).join('');
    } catch (error) {
        showToast('加载结算单失败', 'error');
    }
}
`;

const verifySh = `#!/bin/bash

set -e

echo "=========================================="
echo "专利许可版税结算系统 - 跨阶梯费率验证"
echo "=========================================="
echo ""

BASE_URL="http://localhost:3000"
DB_FILE="./db/patent-royalty.db"

echo "[1/8] 检查 Node.js 环境..."
if ! command -v node &> /dev/null; then
    echo "错误: 未安装 Node.js"
    exit 1
fi
echo "OK Node.js 版本: $(node -v)"

echo ""
echo "[2/8] 检查并安装依赖..."
if [ ! -d "node_modules" ]; then
    npm install
fi
echo "OK 依赖已安装"

echo ""
echo "[3/8] 清理旧数据..."
rm -f "$DB_FILE"
echo "OK 旧数据已清理"

echo ""
echo "[4/8] 初始化数据库并启动服务器..."
node server.js &
SERVER_PID=$!
sleep 3

if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "错误: 服务器启动失败"
    exit 1
fi
echo "OK 服务器已启动 (PID: $SERVER_PID)"

echo ""
echo "[5/8] 创建测试合同和阶梯费率..."

CONTRACT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/contracts" \
  -H "Content-Type: application/json" \
  -d '{"patent_name":"测试专利","patent_no":"ZL20240001","licensor":"测试专利权人","licensee":"测试被许可方","effective_date":"2024-01-01","end_date":"2026-12-31"}')

CONTRACT_ID=$(echo "$CONTRACT_RESPONSE" | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "OK 创建合同成功 (ID: $CONTRACT_ID)"

curl -s -X POST "$BASE_URL/api/contracts/$CONTRACT_ID/activate" > /dev/null
echo "OK 合同已生效"

curl -s -X POST "$BASE_URL/api/rate-tiers" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":'$CONTRACT_ID',"tier_name":"第一档","min_amount":0,"max_amount":1000000,"rate":5}' > /dev/null
echo "OK 创建第一档费率: 0-100万, 费率 5%"

curl -s -X POST "$BASE_URL/api/rate-tiers" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":'$CONTRACT_ID',"tier_name":"第二档","min_amount":1000000,"max_amount":5000000,"rate":7}' > /dev/null
echo "OK 创建第二档费率: 100万-500万, 费率 7%"

curl -s -X POST "$BASE_URL/api/rate-tiers" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":'$CONTRACT_ID',"tier_name":"第三档","min_amount":5000000,"max_amount":null,"rate":10}' > /dev/null
echo "OK 创建第三档费率: 500万以上, 费率 10%"

echo ""
echo "[6/8] 测试跨阶梯申报和结算..."
echo ""

echo "测试场景1: 第一档销售额 (50万) - 期望费率 5%, 版税 25,000元"
REPORT1_RESPONSE=$(curl -s -X POST "$BASE_URL/api/sales-reports" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":'$CONTRACT_ID',"licensee":"测试被许可方","period":"2024-01","sales_amount":500000}')
REPORT1_ID=$(echo "$REPORT1_RESPONSE" | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "OK 提交申报1: 销售额 500,000元"

SETTLE1_RESPONSE=$(curl -s -X POST "$BASE_URL/api/settlements/generate/$REPORT1_ID")
SETTLE1_RATE=$(echo "$SETTLE1_RESPONSE" | grep -o '"applied_rate":[0-9.]*' | cut -d: -f2)
SETTLE1_AMOUNT=$(echo "$SETTLE1_RESPONSE" | grep -o '"royalty_amount":[0-9.]*' | cut -d: -f2)
echo "   结算结果: 费率 = ${SETTLE1_RATE}%, 版税 = ${SETTLE1_AMOUNT}元"

EXPECTED_RATE1=5
EXPECTED_AMOUNT1=25000
TEST_FAILED=0

if [ "$SETTLE1_RATE" = "$EXPECTED_RATE1" ] && [ "$SETTLE1_AMOUNT" = "$EXPECTED_AMOUNT1" ]; then
    echo "   PASS 第一档费率验证通过!"
else
    echo "   FAIL 第一档费率验证失败! 期望: 费率=${EXPECTED_RATE1}%, 版税=${EXPECTED_AMOUNT1}元"
    TEST_FAILED=1
fi

echo ""
echo "测试场景2: 跨入第二档销售额 (200万) - 期望费率 7%, 版税 140,000元"
REPORT2_RESPONSE=$(curl -s -X POST "$BASE_URL/api/sales-reports" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":'$CONTRACT_ID',"licensee":"测试被许可方","period":"2024-02","sales_amount":2000000}')
REPORT2_ID=$(echo "$REPORT2_RESPONSE" | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "OK 提交申报2: 销售额 2,000,000元 (跨入第二档)"

SETTLE2_RESPONSE=$(curl -s -X POST "$BASE_URL/api/settlements/generate/$REPORT2_ID")
SETTLE2_RATE=$(echo "$SETTLE2_RESPONSE" | grep -o '"applied_rate":[0-9.]*' | cut -d: -f2)
SETTLE2_AMOUNT=$(echo "$SETTLE2_RESPONSE" | grep -o '"royalty_amount":[0-9.]*' | cut -d: -f2)
echo "   结算结果: 费率 = ${SETTLE2_RATE}%, 版税 = ${SETTLE2_AMOUNT}元"

EXPECTED_RATE2=7
EXPECTED_AMOUNT2=140000

if [ "$SETTLE2_RATE" = "$EXPECTED_RATE2" ] && [ "$SETTLE2_AMOUNT" = "$EXPECTED_AMOUNT2" ]; then
    echo "   PASS 第二档费率验证通过! 销售额跨入新阶梯后自动按新费率结算"
else
    echo "   FAIL 第二档费率验证失败! 期望: 费率=${EXPECTED_RATE2}%, 版税=${EXPECTED_AMOUNT2}元"
    TEST_FAILED=1
fi

echo ""
echo "测试场景3: 跨入第三档销售额 (600万) - 期望费率 10%, 版税 600,000元"
REPORT3_RESPONSE=$(curl -s -X POST "$BASE_URL/api/sales-reports" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":'$CONTRACT_ID',"licensee":"测试被许可方","period":"2024-03","sales_amount":6000000}')
REPORT3_ID=$(echo "$REPORT3_RESPONSE" | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "OK 提交申报3: 销售额 6,000,000元 (跨入第三档)"

SETTLE3_RESPONSE=$(curl -s -X POST "$BASE_URL/api/settlements/generate/$REPORT3_ID")
SETTLE3_RATE=$(echo "$SETTLE3_RESPONSE" | grep -o '"applied_rate":[0-9.]*' | cut -d: -f2)
SETTLE3_AMOUNT=$(echo "$SETTLE3_RESPONSE" | grep -o '"royalty_amount":[0-9.]*' | cut -d: -f2)
echo "   结算结果: 费率 = ${SETTLE3_RATE}%, 版税 = ${SETTLE3_AMOUNT}元"

EXPECTED_RATE3=10
EXPECTED_AMOUNT3=600000

if [ "$SETTLE3_RATE" = "$EXPECTED_RATE3" ] && [ "$SETTLE3_AMOUNT" = "$EXPECTED_AMOUNT3" ]; then
    echo "   PASS 第三档费率验证通过! 销售额跨入新阶梯后自动按新费率结算"
else
    echo "   FAIL 第三档费率验证失败! 期望: 费率=${EXPECTED_RATE3}%, 版税=${EXPECTED_AMOUNT3}元"
    TEST_FAILED=1
fi

echo ""
echo "[7/8] 测试合同未生效时销售申报被拒绝..."
DRAFT_CONTRACT=$(curl -s -X POST "$BASE_URL/api/contracts" \
  -H "Content-Type: application/json" \
  -d '{"patent_name":"草稿合同","patent_no":"ZL20240002","licensor":"测试","licensee":"测试","effective_date":"2024-01-01","end_date":"2026-12-31"}')
DRAFT_ID=$(echo "$DRAFT_CONTRACT" | grep -o '"id":[0-9]*' | cut -d: -f2)
REJECT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/sales-reports" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":'$DRAFT_ID',"licensee":"测试","period":"2024-04","sales_amount":100000}')
if echo "$REJECT_RESPONSE" | grep -q "合同未生效"; then
    echo "PASS 合同未生效时销售申报被拒绝"
else
    echo "FAIL 合同未生效时销售申报未被拒绝"
    TEST_FAILED=1
fi

echo ""
echo "[8/8] 清理资源..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
echo "OK 服务器已停止"

echo ""
echo "=========================================="
if [ "$TEST_FAILED" = "1" ]; then
    echo "验证失败: 部分测试未通过"
    exit 1
else
    echo "验证成功: 跨阶梯申报后结算金额按新费率输出"
    echo ""
    echo "验证摘要:"
    echo "  * 销售额 50万 (第一档): 费率 5%, 版税 25,000元 PASS"
    echo "  * 销售额 200万 (第二档): 费率 7%, 版税 140,000元 PASS"
    echo "  * 销售额 600万 (第三档): 费率 10%, 版税 600,000元 PASS"
    echo "  * 合同未生效时销售申报被拒绝 PASS"
    echo ""
    echo "结论: 系统正确实现了阶梯费率自动换算功能"
    exit 0
fi
`;

const readmeMd = `# 专利许可版税结算系统

## 系统概述

专利许可版税结算全栈 Web 应用，支持：
- 专利权人登记许可合同
- 被许可方申报销售额
- 财务复核阶梯费率并生成结算单

## 核心功能

### 1. 合同管理
- 合同的增删改查
- 合同生效/停用状态管理
- **合同未生效时销售申报被拒绝**

### 2. 阶梯费率管理
- 为每个合同配置多档阶梯费率
- 支持最低/最高销售额区间设置
- **销售额跨入新阶梯后自动换算费率**

### 3. 销售申报
- 被许可方按期间申报销售额
- 自动校验合同生效状态
- 已结算期间再次申报自动进入补差流程

### 4. 结算管理
- 基于销售申报生成结算单
- 自动匹配适用的阶梯费率
- **补差结算自动计算差额**

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite3
- **前端**: 原生 HTML/CSS/JavaScript

## 快速开始

### 1. 安装依赖

\`\`\`bash
npm install
\`\`\`

### 2. 启动服务

\`\`\`bash
npm start
\`\`\`

服务将在 \`http://localhost:3000\` 启动。

## 验证脚本

运行验证脚本测试"跨阶梯申报后结算金额按新费率输出"：

\`\`\`bash
chmod +x verify.sh
./verify.sh
\`\`\`

## API 接口

### 合同管理
- \`GET /api/contracts\` - 获取合同列表
- \`GET /api/contracts/:id\` - 获取合同详情
- \`POST /api/contracts\` - 创建合同
- \`PUT /api/contracts/:id\` - 更新合同
- \`POST /api/contracts/:id/activate\` - 合同生效
- \`POST /api/contracts/:id/deactivate\` - 合同停用
- \`DELETE /api/contracts/:id\` - 删除合同

### 阶梯费率
- \`GET /api/rate-tiers/contract/:contractId\` - 获取合同的费率档
- \`POST /api/rate-tiers\` - 创建费率档
- \`PUT /api/rate-tiers/:id\` - 更新费率档
- \`DELETE /api/rate-tiers/:id\` - 删除费率档

### 销售申报
- \`GET /api/sales-reports\` - 获取申报列表
- \`POST /api/sales-reports\` - 提交销售申报
- \`PUT /api/sales-reports/:id/status\` - 更新申报状态

### 结算单
- \`GET /api/settlements\` - 获取结算单列表
- \`POST /api/settlements/generate/:reportId\` - 生成结算单
- \`PUT /api/settlements/:id/status\` - 更新结算单状态

## 数据库表结构

### contracts（合同表）
- id: 主键
- contract_no: 合同编号
- patent_name: 专利名称
- patent_no: 专利号
- licensor: 专利权人
- licensee: 被许可方
- effective_date: 生效日期
- end_date: 结束日期
- status: 状态（DRAFT/ACTIVE/INACTIVE）

### rate_tiers（费率档表）
- id: 主键
- contract_id: 关联合同ID
- tier_name: 档位名称
- min_amount: 最低销售额
- max_amount: 最高销售额
- rate: 费率(%)

### sales_reports（销售申报表）
- id: 主键
- report_no: 申报编号
- contract_id: 关联合同ID
- licensee: 被许可方
- period: 申报期间
- sales_amount: 申报金额
- status: 状态（PENDING/SETTLED）
- is_supplementary: 是否补差申报
- original_report_id: 原申报ID（补差时使用）

### settlements（结算单表）
- id: 主键
- settlement_no: 结算编号
- report_id: 关联申报ID
- contract_id: 关联合同ID
- period: 结算期间
- sales_amount: 销售额
- royalty_amount: 版税金额
- applied_rate: 适用费率
- tier_applied: 适用档位
- is_supplementary: 是否补差结算
- previous_settlement_id: 原结算单ID
- difference_amount: 补差金额
- status: 状态（DRAFT/ACTIVE）
`;

writeFile(path.join(__dirname, 'server.js'), serverJs);
writeFile(path.join(__dirname, 'public', 'index.html'), indexHtml);
writeFile(path.join(__dirname, 'public', 'css', 'style.css'), styleCss);
writeFile(path.join(__dirname, 'public', 'js', 'app.js'), appJs);
writeFile(path.join(__dirname, 'verify.sh'), verifySh);
writeFile(path.join(__dirname, 'README.md'), readmeMd);

console.log('\n所有文件创建完成!');
console.log('接下来执行:');
console.log('  chmod +x verify.sh');
console.log('  ./verify.sh');
