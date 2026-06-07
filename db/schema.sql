-- 专利许可合同表
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_no TEXT UNIQUE NOT NULL,
  patent_name TEXT NOT NULL,
  patent_no TEXT NOT NULL,
  licensor TEXT NOT NULL,
  licensee TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 阶梯费率档表
CREATE TABLE IF NOT EXISTS rate_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  tier_name TEXT NOT NULL,
  min_amount REAL NOT NULL DEFAULT 0,
  max_amount REAL,
  rate REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
);

-- 销售申报表
CREATE TABLE IF NOT EXISTS sales_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_no TEXT UNIQUE NOT NULL,
  contract_id INTEGER NOT NULL,
  licensee TEXT NOT NULL,
  period TEXT NOT NULL,
  sales_amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  is_supplementary INTEGER DEFAULT 0,
  original_report_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (original_report_id) REFERENCES sales_reports(id)
);

-- 结算单表
CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_no TEXT UNIQUE NOT NULL,
  report_id INTEGER NOT NULL,
  contract_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  sales_amount REAL NOT NULL,
  royalty_amount REAL NOT NULL,
  applied_rate REAL NOT NULL,
  tier_applied TEXT,
  is_supplementary INTEGER DEFAULT 0,
  previous_settlement_id INTEGER,
  difference_amount REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES sales_reports(id),
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (previous_settlement_id) REFERENCES settlements(id)
);
