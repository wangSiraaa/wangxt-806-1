const fs = require('fs');
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>专利许可版税结算系统</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div class="header">专利许可版税结算系统</div>
<div class="container">
<div class="tabs">
<div class="tab active" data-tab="contracts">合同管理</div>
<div class="tab" data-tab="ratetiers">阶梯费率</div>
<div class="tab" data-tab="sales">销售申报</div>
<div class="tab" data-tab="settlements">结算管理</div>
</div>

<div id="message-container"></div>

<div id="tab-contracts" class="tab-content active">
<div class="card">
<h2>新增许可合同</h2>
<div class="form-row">
<div class="form-group"><label>专利名称</label><input type="text" id="ct-patent-name"></div>
<div class="form-group"><label>专利号</label><input type="text" id="ct-patent-no"></div>
</div>
<div class="form-row">
<div class="form-group"><label>专利权人</label><input type="text" id="ct-licensor"></div>
<div class="form-group"><label>被许可方</label><input type="text" id="ct-licensee"></div>
</div>
<div class="form-row">
<div class="form-group"><label>生效日期</label><input type="date" id="ct-effective-date"></div>
<div class="form-group"><label>结束日期</label><input type="date" id="ct-end-date"></div>
</div>
<button class="btn btn-primary" onclick="createContract()">创建合同</button>
</div>
<div class="card">
<h2>合同列表</h2>
<table id="contracts-table">
<thead><tr><th>合同编号</th><th>专利名称</th><th>专利权人</th><th>被许可方</th><th>状态</th><th>操作</th></tr></thead>
<tbody id="contracts-tbody"></tbody>
</table>
</div>
</div>

<div id="tab-ratetiers" class="tab-content">
<div class="card">
<h2>阶梯费率维护</h2>
<div class="form-row">
<div class="form-group"><label>选择合同</label><select id="rt-contract" onchange="loadRateTiers()"></select></div>
</div>
<div class="form-row">
<div class="form-group"><label>档位名称</label><input type="text" id="rt-tier-name" placeholder="如：阶梯1"></div>
<div class="form-group"><label>最低销售额</label><input type="number" id="rt-min-amount" step="0.01" placeholder="0"></div>
<div class="form-group"><label>最高销售额</label><input type="number" id="rt-max-amount" step="0.01" placeholder="留空表示无上限"></div>
<div class="form-group"><label>费率(%)</label><input type="number" id="rt-rate" step="0.01" placeholder="如：3"></div>
</div>
<button class="btn btn-primary" onclick="createRateTier()">添加费率档</button>
</div>
<div class="card">
<h2>费率档列表</h2>
<div id="rt-no-contract" class="empty-hint">请先选择合同查看费率档</div>
<table id="ratetiers-table" style="display:none;">
<thead><tr><th>档位名称</th><th>销售额区间</th><th>费率</th><th>版税示例</th><th>操作</th></tr></thead>
<tbody id="ratetiers-tbody"></tbody>
</table>
</div>
</div>

<div id="tab-sales" class="tab-content">
<div class="card">
<h2>销售申报</h2>
<div class="form-row">
<div class="form-group"><label>选择合同</label><select id="sr-contract"></select></div>
<div class="form-group"><label>被许可方</label><input type="text" id="sr-licensee"></div>
</div>
<div class="form-row">
<div class="form-group"><label>申报期间</label><input type="month" id="sr-period"></div>
<div class="form-group"><label>销售额</label><input type="number" id="sr-amount" step="0.01"></div>
</div>
<button class="btn btn-primary" onclick="createSalesReport()">提交申报</button>
</div>
<div class="card">
<h2>申报记录</h2>
<table><thead><tr><th>申报编号</th><th>合同</th><th>期间</th><th>销售额</th><th>状态</th><th>补差</th><th>操作</th></tr></thead>
<tbody id="sales-tbody"></tbody></table>
</div>
</div>

<div id="tab-settlements" class="tab-content">
<div class="card">
<h2>结算记录</h2>
<table><thead><tr><th>结算单号</th><th>合同</th><th>期间</th><th>销售额</th><th>费率</th><th>版税额</th><th>补差</th><th>差额</th><th>状态</th></tr></thead>
<tbody id="settlements-tbody"></tbody></table>
</div>
</div>

</div>
<script src="js/app.js"></script>
</body>
</html>`;
fs.writeFileSync('public/index.html', html);
console.log('HTML written successfully');
