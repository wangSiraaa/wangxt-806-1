const express = require("express");
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
  const { contract_id, licensee, period, sales_amount } = req.body;
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
        db.run("INSERT INTO sales_reports (report_no, contract_id, licensee, period, sales_amount, status, is_supplementary, original_report_id) VALUES (?, ?, ?, ?, ?, \"PENDING\", ?, ?)",
          [report_no, contract_id, licensee, period, sales_amount, is_supplementary, original_report_id],
          function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, report_no, is_supplementary, message });
          });
      }
    });
  });
});

app.get("/api/settlements", (req, res) => {
  db.all("SELECT s.*, c.contract_no, c.patent_name, sr.report_no, sr.licensee FROM settlements s LEFT JOIN contracts c ON s.contract_id = c.id LEFT JOIN sales_reports sr ON s.report_id = sr.id ORDER BY s.created_at DESC", [], (err, rows) => {
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
      const result = calculateRoyalty(report.sales_amount, tiers);
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
            db.run("UPDATE sales_reports SET status = \"SETTLED\", updated_at = CURRENT_TIMESTAMP WHERE id = ?", [reportId]);
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

async function start() {
  db = await initDatabase();
  app.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
}

start();
