let currentTab = 'contracts';

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    currentTab = tab.dataset.tab;
    if (currentTab === 'contracts') loadContracts();
    if (currentTab === 'sales') { loadContractsForSelect(); loadSalesReports(); }
    if (currentTab === 'settlements') loadSettlements();
  });
});

function showMessage(type, text) {
  const container = document.getElementById('message-container');
  container.innerHTML = '<div class="message message-' + type + '">' + text + '</div>';
  setTimeout(() => container.innerHTML = '', 5000);
}

async function api(url, method, data) {
  const options = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (data) options.body = JSON.stringify(data);
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '请求失败');
  return json;
}

async function loadContracts() {
  const contracts = await api('/api/contracts');
  const tbody = document.getElementById('contracts-tbody');
  tbody.innerHTML = contracts.map(c => '<tr><td>' + c.contract_no + '</td><td>' + c.patent_name + '</td><td>' + c.licensor + '</td><td>' + c.licensee + '</td><td><span class="status status-' + c.status + '">' + c.status + '</span></td><td>' + (c.status === 'DRAFT' ? '<button class="btn btn-success btn-sm" onclick="activateContract(' + c.id + ')">生效</button> ' : '') + (c.status === 'ACTIVE' ? '<button class="btn btn-default btn-sm" onclick="deactivateContract(' + c.id + ')">失效</button> ' : '') + '<button class="btn btn-danger btn-sm" onclick="deleteContract(' + c.id + ')">删除</button></td></tr>').join('');
}

async function createContract() {
  try {
    const data = {
      patent_name: document.getElementById('ct-patent-name').value,
      patent_no: document.getElementById('ct-patent-no').value,
      licensor: document.getElementById('ct-licensor').value,
      licensee: document.getElementById('ct-licensee').value,
      effective_date: document.getElementById('ct-effective-date').value,
      end_date: document.getElementById('ct-end-date').value
    };
    await api('/api/contracts', 'POST', data);
    showMessage('success', '合同创建成功');
    loadContracts();
  } catch (e) { showMessage('error', e.message); }
}

async function activateContract(id) {
  await api('/api/contracts/' + id + '/activate', 'POST');
  showMessage('success', '合同已生效');
  loadContracts();
}

async function deactivateContract(id) {
  await api('/api/contracts/' + id + '/deactivate', 'POST');
  showMessage('success', '合同已失效');
  loadContracts();
}

async function deleteContract(id) {
  if (!confirm('确认删除？')) return;
  await api('/api/contracts/' + id, 'DELETE');
  showMessage('success', '已删除');
  loadContracts();
}

async function loadContractsForSelect() {
  const contracts = await api('/api/contracts');
  const select = document.getElementById('sr-contract');
  select.innerHTML = '<option value="">请选择合同</option>' + contracts.filter(c => c.status === 'ACTIVE').map(c => '<option value="' + c.id + '">' + c.contract_no + ' - ' + c.patent_name + '</option>').join('');
}

async function loadSalesReports() {
  const reports = await api('/api/sales-reports');
  const tbody = document.getElementById('sales-tbody');
  tbody.innerHTML = reports.map(r => '<tr><td>' + r.report_no + '</td><td>' + (r.contract_no || '') + '</td><td>' + r.period + '</td><td>' + r.sales_amount + '</td><td><span class="status status-' + r.status + '">' + r.status + '</span></td><td>' + (r.is_supplementary ? '<span class="badge-supp">补差</span>' : '') + '</td><td>' + (r.status === 'PENDING' ? '<button class="btn btn-primary btn-sm" onclick="generateSettlement(' + r.id + ')">生成结算</button>' : '') + '</td></tr>').join('');
}

async function createSalesReport() {
  try {
    const data = {
      contract_id: parseInt(document.getElementById('sr-contract').value),
      licensee: document.getElementById('sr-licensee').value,
      period: document.getElementById('sr-period').value,
      sales_amount: parseFloat(document.getElementById('sr-amount').value)
    };
    const result = await api('/api/sales-reports', 'POST', data);
    showMessage(result.is_supplementary ? 'info' : 'success', result.message || '申报提交成功');
    loadSalesReports();
  } catch (e) { showMessage('error', e.message); }
}

async function generateSettlement(reportId) {
  try {
    const result = await api('/api/settlements/generate/' + reportId, 'POST');
    showMessage('success', '结算单生成成功，费率: ' + result.applied_rate + '%, 版税额: ' + result.royalty_amount);
    loadSalesReports();
    loadSettlements();
  } catch (e) { showMessage('error', e.message); }
}

async function loadSettlements() {
  const settlements = await api('/api/settlements');
  const tbody = document.getElementById('settlements-tbody');
  tbody.innerHTML = settlements.map(s => '<tr><td>' + s.settlement_no + '</td><td>' + (s.contract_no || '') + '</td><td>' + s.period + '</td><td>' + s.sales_amount + '</td><td>' + s.applied_rate + '%</td><td>' + s.royalty_amount + '</td><td>' + (s.is_supplementary ? '<span class="badge-supp">补差</span>' : '') + '</td><td>' + (s.difference_amount || 0) + '</td><td><span class="status status-' + s.status + '">' + s.status + '</span></td></tr>').join('');
}

loadContracts();
