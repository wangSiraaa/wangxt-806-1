const http = require('http');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const str = JSON.stringify(data);
    const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': str.length } }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(str);
    req.end();
  });
}

async function test() {
  console.log('=== 1. 创建合同 ===');
  const c = await post('/api/contracts', { patent_name: 'AI专利', patent_no: 'ZL001', licensor: '专利权人A', licensee: '被许可方B', effective_date: '2024-01-01', end_date: '2026-12-31' });
  console.log('合同ID:', c.data.id);
  
  console.log('\n=== 2. 添加阶梯费率 ===');
  await post('/api/rate-tiers', { contract_id: c.data.id, tier_name: '阶梯1', min_amount: 0, max_amount: 10000, rate: 3 });
  await post('/api/rate-tiers', { contract_id: c.data.id, tier_name: '阶梯2', min_amount: 10000, max_amount: 50000, rate: 5 });
  await post('/api/rate-tiers', { contract_id: c.data.id, tier_name: '阶梯3', min_amount: 50000, max_amount: null, rate: 8 });
  console.log('三档费率添加完成');
  
  console.log('\n=== 3. 激活合同 ===');
  await post('/api/contracts/' + c.data.id + '/activate', {});
  console.log('合同已激活');
  
  console.log('\n=== 4. 测试跨阶梯费率 ===');
  const amounts = [5000, 30000, 100000];
  const expected = [{ rate: 3, amount: 150 }, { rate: 5, amount: 1500 }, { rate: 8, amount: 8000 }];
  
  let allPass = true;
  for (let i = 0; i < amounts.length; i++) {
    console.log('\n测试' + (i+1) + ': 销售额 ' + amounts[i]);
    const r = await post('/api/sales-reports', { contract_id: c.data.id, licensee: '被许可方B', period: '2024-0' + (i+1), sales_amount: amounts[i] });
    const s = await post('/api/settlements/generate/' + r.data.id, {});
    console.log('  适用费率: ' + s.data.applied_rate + '% (预期: ' + expected[i].rate + '%)');
    console.log('  版税额: ' + s.data.royalty_amount + ' (预期: ' + expected[i].amount + ')');
    const pass = s.data.applied_rate === expected[i].rate && s.data.royalty_amount === expected[i].amount;
    console.log('  ' + (pass ? '✓ 通过' : '✗ 失败'));
    if (!pass) allPass = false;
  }
  
  console.log('\n=== 5. 测试未生效合同申报 ===');
  const d = await post('/api/contracts', { patent_name: '草稿合同', patent_no: 'DRAFT01', licensor: '测试', licensee: '测试', effective_date: '2024-01-01', end_date: '2024-12-31' });
  const draftTest = await post('/api/sales-reports', { contract_id: d.data.id, licensee: '测试', period: '2024-04', sales_amount: 10000 });
  console.log('草稿合同申报 HTTP 状态码:', draftTest.status, '(预期: 400)');
  const draftPass = draftTest.status === 400;
  console.log('  ' + (draftPass ? '✓ 通过' : '✗ 失败'));
  if (!draftPass) allPass = false;
  
  console.log('\n========================================');
  console.log(allPass ? '所有测试通过！' : '部分测试失败！');
  console.log('========================================');
  process.exit(allPass ? 0 : 1);
}
test().catch(e => { console.error(e); process.exit(1); });
