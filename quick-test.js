const http = require('http');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const str = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(str)
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          reject(new Error('JSON parse error: ' + body));
        }
      });
    });
    req.on('error', reject);
    req.write(str);
    req.end();
  });
}

async function run() {
  console.log('========================================');
  console.log('专利许可版税结算 - 快速验证');
  console.log('========================================\n');

  console.log('1. 创建合同...');
  const c = await post('/api/contracts', {
    patent_name: 'AI算法专利',
    patent_no: 'ZL2024001',
    licensor: '专利权人A',
    licensee: '被许可方B',
    effective_date: '2024-01-01',
    end_date: '2026-12-31'
  });
  const cid = c.data.id;
  console.log('   合同ID:', cid);

  console.log('\n2. 添加阶梯费率...');
  await post('/api/rate-tiers', { contract_id: cid, tier_name: '阶梯1', min_amount: 0, max_amount: 10000, rate: 3 });
  await post('/api/rate-tiers', { contract_id: cid, tier_name: '阶梯2', min_amount: 10000, max_amount: 50000, rate: 5 });
  await post('/api/rate-tiers', { contract_id: cid, tier_name: '阶梯3', min_amount: 50000, max_amount: null, rate: 8 });
  console.log('   0-10000:3%, 10000-50000:5%, 50000+:8%');

  console.log('\n3. 激活合同...');
  await post('/api/contracts/' + cid + '/activate', {});
  console.log('   合同已激活');

  console.log('\n4. 测试跨阶梯费率...');
  const tests = [
    { amt: 5000, expRate: 3, expAmt: 150 },
    { amt: 30000, expRate: 5, expAmt: 1500 },
    { amt: 100000, expRate: 8, expAmt: 8000 }
  ];

  let pass = true;
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log('\n   测试' + (i+1) + ': 销售额 ' + t.amt);
    const r = await post('/api/sales-reports', {
      contract_id: cid,
      licensee: '被许可方B',
      period: '2024-0' + (i+1),
      sales_amount: t.amt
    });
    const s = await post('/api/settlements/generate/' + r.data.id, {});
    const rateOk = s.data.applied_rate === t.expRate;
    const amtOk = s.data.royalty_amount === t.expAmt;
    console.log('     费率: ' + s.data.applied_rate + '% (预期' + t.expRate + '%) ' + (rateOk ? '✓' : '✗'));
    console.log('     版税: ' + s.data.royalty_amount + ' (预期' + t.expAmt + ') ' + (amtOk ? '✓' : '✗'));
    if (!rateOk || !amtOk) pass = false;
  }

  console.log('\n5. 测试未生效合同拒绝申报...');
  const d = await post('/api/contracts', {
    patent_name: '草稿专利',
    patent_no: 'DRAFT01',
    licensor: '测试',
    licensee: '测试',
    effective_date: '2024-01-01',
    end_date: '2024-12-31'
  });
  const dr = await post('/api/sales-reports', {
    contract_id: d.data.id,
    licensee: '测试',
    period: '2024-04',
    sales_amount: 10000
  });
  const draftOk = dr.status === 400;
  console.log('   HTTP状态: ' + dr.status + ' (预期400) ' + (draftOk ? '✓' : '✗'));
  if (!draftOk) pass = false;

  console.log('\n========================================');
  if (pass) {
    console.log('✓ 所有测试通过！');
    console.log('跨阶梯费率自动换算功能正常工作');
  } else {
    console.log('✗ 部分测试失败');
  }
  console.log('========================================');
  process.exit(pass ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
