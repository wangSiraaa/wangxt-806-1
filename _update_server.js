const fs = require('fs');

const content = `const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { initDatabase, getDatabase } = require("./db/database");

const app = express();
const PORT = process.env.PORT || 3000;

let db;

function generateNo(prefix) {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return prefix + year + month + random;
}

function findApplicableTier(salesAmount, tiers) {
  if (!tiers || tiers.length === 0) return null;
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
  return applicableTier;
}

function calculateRoyalty(salesAmount, tiers) {
  if (!tiers || tiers.length === 0) return { royaltyAmount: 0, appliedRate: 0, tierApplied: null };
  const applicableTier = findApplicableTier(salesAmount, tiers);
  const royaltyAmount = Math.round(salesAmount * (applicableTier.rate / 100) * 100) / 100;
  return { royaltyAmount, appliedRate: applicableTier.rate, tierApplied: applicableTier.tier_name };
}

function checkTierBoundary(salesAmount, tiers) {
  const boundaryThreshold = 0.01;
  let hitBoundary = false;
  let boundaryTier = null;
  let nextTier = null;
  let promptMessage = null;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (tier.max_amount !== null) {
      const diff = Math.abs(salesAmount - tier.max_amount);
      if (diff <= tier.max_amount * boundaryThreshold) {
        hitBoundary = true;
        boundaryTier = tier;
        nextTier = tiers[i + 1] || null;
        promptMessage = `销售额 ${salesAmount} 接近阶梯边界 ${tier.max_amount}，请注意：如销售额达到 ${tier.max_amount} 以上，费率将从 ${tier.rate}% 调整为 ${nextTier ? nextTier.rate + '%' : '下一档位费率'}，需重新计算版税`;
        break;
      }
    }
    const diffMin = Math.abs(salesAmount - tier.min_amount);
    if (tier.min_amount > 0 && diffMin <= tier.min_amount * boundaryThreshold) {
      hitBoundary = true;
      boundaryTier = tier;
      nextTier = tier;
      const prevTier = tiers[i - 1] || null;
      promptMessage = `销售额 ${salesAmount} 接近阶梯起点 ${tier.min_amount}，请注意：当前档位 ${tier.tier_name} 费率为 ${tier.rate}%，如低于 ${tier.min_amount} 将适用 ${prevTier ? prevTier.tier_name + '(' + prevTier.rate + '%)' : '上一档位费率'}`;
      break;
    }
  }
  return { hitBoundary, boundaryTier, nextTier, promptMessage };
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.get("/api/contracts", (req, res) => {
  db.all("SELECT * FROM contracts ORDER BY created_at DESC", [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.get("/api/contracts/:id", (req, res) => {
  db.get("SELECT * FROM contracts WHERE id = ?", [req.params.id], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else if (!row) res.status(404).json({ error: "Not found" });
    else res.json(row);
  });
});

app.post("/api/contracts", (req, res) => {
  const { patent_name, patent_no, licensor, licensee, effective_date, end_date } = req.body;
  const contract_no = generateNo("CT");
  db.run("INSERT INTO contracts (contract_no, patent_name, patent_no, licensor, licensee, effective_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, \"DRAFT\")",
    [contract_no, patent_name, patent_no, licensor, licensee, effective_date, end_date],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.status(201).json({ id: this.lastID, contract_no });
    });
});

app.put("/api/contracts/:id", (req, res) => {
  const { patent_name, patent_no, licensor, licensee, effective_date, end_date } = req.body;
  db.run("UPDATE contracts SET patent_name = ?, patent_no = ?, licensor = ?, licensee = ?, effective_date = ?, end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [patent_name, patent_no, licensor, licensee, effective_date, end_date, req.params.id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else if (this.changes === 0) res.status(404).json({ error: "Not found" });
      else res.json({ message: "Updated" });
    });
});

app.post("/api/contracts/:id/activate", (req, res) => {
  db.run("UPDATE contracts SET status = \"ACTIVE\", updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ message: "Activated" });
    });
});

app.post("/api/contracts/:id/deactivate", (req, res) => {
  db.run("UPDATE contracts SET status = \"INACTIVE\", updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ message: "Deactivated" });
    });
});

app.delete("/api/contracts/:id", (req, res) => {
  db.run("DELETE FROM contracts WHERE id = ?", [req.params.id], function(err) {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ message: "Deleted" });
  });
});

app.get("/api/rate-tiers/contract/:contractId", (req, res) => {
  db.all("SELECT * FROM rate_tiers WHERE contract_id = ? ORDER BY min_amount ASC", [req.params.contractId], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post("/api/rate-tiers", (req, res) => {
  const { contract_id, tier_name, min_amount, max_amount, rate } = req.body;
  db.run("INSERT INTO rate_tiers (contract_id, tier_name, min_amount, max_amount, rate) VALUES (?, ?, ?, ?, ?)",
    [contract_id, tier_name, min_amount, max_amount, rate],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.status(201).json({ id: this.lastID });
    });
});

app.delete("/api/rate-tiers/:id", (req, res) => {
  db.run("DELETE FROM rate_tiers WHERE id = ?", [req.params.id], function(err) {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ message: "Deleted" });
  });
});

app.get("/api/sales-reports", (req, res) => {
  db.all("SELECT sr.*, c.contract_no, c.patent_name FROM sales_reports sr LEFT JOIN contracts c ON sr.contract_id = c.id ORDER BY sr.created_at DESC", [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post("/api/sales-reports", (req, res) => {
  const { contract_id, licensee, period, sales_amount, remarks, audit_conclusion } = req.body;
  const report_no = generateNo("SR");
  db.get("SELECT * FROM contracts WHERE id = ?", [contract_id], (err, contract) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    if (contract.status !== "ACTIVE") return res.status(400).json({ error: "合同未生效，无法提交销售申报" });
    db.get("SELECT * FROM sales_reports WHERE contract_id = ? AND period = ? AND is_supplementary = 0", [contract_id, period], (err, existingReport) => {
      if (err) return res.status(500).json({ error: err.message });
      let is_supplementary = 0;
      let original_report_id = null;
      let message = "";
      if (existingReport) {
        db.get("SELECT * FROM settlements WHERE report_id = ?", [existingReport.id], (err, existingSettlement) => {
          if (existingSettlement) {
            is_supplementary = 1;
            original_report_id = existingReport.id;
            message = "该期间已存在申报并已结算，本次申报为补差申报";
          }
          insertReport();
        });
      } else {
        insertReport();
      }
      function insertReport() {
        db.run("INSERT INTO sales_reports (report_no, contract_id, licensee, period, sales_amount, status, is_supplementary, original_report_id, remarks, audit_conclusion) VALUES (?, ?, ?, ?, ?, \"PENDING\", ?, ?, ?, ?)",
          [report_no, contract_id, licensee, period, sales_amount, is_supplementary, original_report_id, remarks || null, audit_conclusion || null],
          function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, report_no, is_supplementary, message });
          });
      }
    });
  });
});

app.put("/api/sales-reports/:id/audit", (req, res) => {
  const { audit_conclusion } = req.body;
  db.run("UPDATE sales_reports SET audit_conclusion = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [audit_conclusion, req.params.id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else if (this.changes === 0) res.status(404).json({ error: "Not found" });
      else res.json({ message: "Audit conclusion updated" });
    });
});

app.get("/api/settlements", (req, res) => {
  db.all("SELECT s.*, c.contract_no, c.patent_name, sr.report_no, sr.licensee, sr.remarks as report_remarks, sr.audit_conclusion FROM settlements s LEFT JOIN contracts c ON s.contract_id = c.id LEFT JOIN sales_reports sr ON s.report_id = sr.id ORDER BY s.created_at DESC", [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.get("/api/settlements/:id/audit-logs", (req, res) => {
  db.all("SELECT * FROM settlement_audit_logs WHERE settlement_id = ? ORDER BY created_at DESC", [req.params.id], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post("/api/settlements/generate/:reportId", (req, res) => {
  const reportId = req.params.reportId;
  const settlement_no = generateNo("ST");
  db.get("SELECT * FROM sales_reports WHERE id = ?", [reportId], (err, report) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!report) return res.status(404).json({ error: "Report not found" });
    db.all("SELECT * FROM rate_tiers WHERE contract_id = ? ORDER BY min_amount ASC", [report.contract_id], (err, tiers) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const boundaryCheck = checkTierBoundary(report.sales_amount, tiers);
      const result = calculateRoyalty(report.sales_amount, tiers);
      
      let previousTier = null;
      let previousRate = null;
      let previousRoyalty = null;
      
      if (boundaryCheck.hitBoundary && boundaryCheck.boundaryTier) {
        previousTier = boundaryCheck.boundaryTier;
        previousRate = boundaryCheck.boundaryTier.rate;
        previousRoyalty = Math.round(report.sales_amount * (previousRate / 100) * 100) / 100;
      }
      
      let is_supplementary = 0;
      let previous_settlement_id = null;
      let difference_amount = 0;
      
      if (report.is_supplementary && report.original_report_id) {
        is_supplementary = 1;
        db.get("SELECT * FROM settlements WHERE report_id = ?", [report.original_report_id], (err, prevSettlement) => {
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
        db.run("INSERT INTO settlements (settlement_no, report_id, contract_id, period, sales_amount, royalty_amount, applied_rate, tier_applied, is_supplementary, previous_settlement_id, difference_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \"DRAFT\")",
          [settlement_no, report.id, report.contract_id, report.period, report.sales_amount, result.royaltyAmount, result.appliedRate, result.tierApplied, is_supplementary, previous_settlement_id, difference_amount],
          function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const settlementId = this.lastID;
            
            const auditDetails = JSON.stringify({
              tiers: tiers,
              salesAmount: report.sales_amount,
              boundaryCheck: boundaryCheck,
              calculation: result,
              timestamp: new Date().toISOString()
            });
            
            db.run("INSERT INTO settlement_audit_logs (settlement_id, report_id, contract_id, sales_amount, tier_boundary_hit, previous_tier, applied_tier, previous_rate, applied_rate, previous_royalty, calculated_royalty, recalculation_triggered, prompt_message, audit_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [settlementId, report.id, report.contract_id, report.sales_amount,
               boundaryCheck.hitBoundary ? 1 : 0,
               previousTier ? previousTier.tier_name : null,
               result.tierApplied,
               previousRate,
               result.appliedRate,
               previousRoyalty,
               result.royaltyAmount,
               boundaryCheck.hitBoundary ? 1 : 0,
               boundaryCheck.promptMessage,
               auditDetails],
              function(auditErr) {
                if (auditErr) console.error('Failed to insert audit log:', auditErr);
              });
            
            db.run("UPDATE sales_reports SET status = \"SETTLED\", updated_at = CURRENT_TIMESTAMP WHERE id = ?", [reportId]);
            res.status(201).json({
              id: settlementId, settlement_no,
              sales_amount: report.sales_amount,
              royalty_amount: result.royaltyAmount,
              applied_rate: result.appliedRate,
              tier_applied: result.tierApplied,
              is_supplementary,
              difference_amount,
              tier_boundary_hit: boundaryCheck.hitBoundary,
              prompt_message: boundaryCheck.promptMessage
            });
          });
      }
    });
  });
});

app.get("/api/reports/export", (req, res) => {
  const { type = 'settlements', format = 'csv' } = req.query;
  
  if (type === 'settlements') {
    const query = \`
      SELECT 
        s.settlement_no as 结算单号,
        c.contract_no as 合同编号,
        c.patent_name as 专利名称,
        c.licensor as 专利权人,
        c.licensee as 被许可方,
        sr.report_no as 申报编号,
        s.period as 期间,
        s.sales_amount as 销售额,
        s.applied_rate as 适用费率,
        s.tier_applied as 适用档位,
        s.royalty_amount as 版税额,
        CASE WHEN s.is_supplementary = 1 THEN '是' ELSE '否' END as 是否补差,
        s.difference_amount as 差额,
        s.status as 状态,
        sr.remarks as 申报说明,
        sr.audit_conclusion as 审核结论,
        s.created_at as 创建时间
      FROM settlements s 
      LEFT JOIN contracts c ON s.contract_id = c.id 
      LEFT JOIN sales_reports sr ON s.report_id = sr.id 
      ORDER BY s.created_at DESC
    \`;
    
    db.all(query, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (format === 'csv') {
        if (rows.length === 0) {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="settlements_report.csv"');
          return res.send('');
        }
        
        const headers = Object.keys(rows[0]).join(',');
        const csvRows = rows.map(row => 
          Object.values(row).map(v => {
            if (v === null || v === undefined) return '';
            const str = String(v);
            if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
              return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
          }).join(',')
        );
        const csvContent = '\\uFEFF' + headers + '\\n' + csvRows.join('\\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="settlements_report.csv"');
        res.send(csvContent);
      } else {
        res.json(rows);
      }
    });
  } else if (type === 'sales') {
    const query = \`
      SELECT 
        sr.report_no as 申报编号,
        c.contract_no as 合同编号,
        c.patent_name as 专利名称,
        sr.licensee as 被许可方,
        sr.period as 期间,
        sr.sales_amount as 销售额,
        CASE WHEN sr.is_supplementary = 1 THEN '是' ELSE '否' END as 是否补差,
        sr.status as 状态,
        sr.remarks as 申报说明,
        sr.audit_conclusion as 审核结论,
        sr.created_at as 创建时间
      FROM sales_reports sr 
      LEFT JOIN contracts c ON sr.contract_id = c.id 
      ORDER BY sr.created_at DESC
    \`;
    
    db.all(query, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (format === 'csv') {
        if (rows.length === 0) {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="sales_reports.csv"');
          return res.send('');
        }
        
        const headers = Object.keys(rows[0]).join(',');
        const csvRows = rows.map(row => 
          Object.values(row).map(v => {
            if (v === null || v === undefined) return '';
            const str = String(v);
            if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
              return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
          }).join(',')
        );
        const csvContent = '\\uFEFF' + headers + '\\n' + csvRows.join('\\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="sales_reports.csv"');
        res.send(csvContent);
      } else {
        res.json(rows);
      }
    });
  } else {
    res.status(400).json({ error: 'Invalid report type' });
  }
});

async function start() {
  db = await initDatabase();
  app.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
}

start();
`;

fs.writeFileSync('/Users/mingyuan/workspace/sihuo/wangxtw3/806/server.js', content);
console.log('server.js updated successfully');
