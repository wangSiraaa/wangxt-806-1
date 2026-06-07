#!/bin/bash
set -e

BASE_URL="http://localhost:3000"
DB_FILE="royalty.db"

echo "========================================"
echo "专利许可版税结算系统 - 跨阶梯验证脚本"
echo "========================================"
echo ""

echo "[1/8] 清理旧数据..."
rm -f "$DB_FILE"

echo "[2/8] 初始化数据库..."
node scripts/init-db.js > /dev/null 2>&1

echo "[3/8] 启动服务器..."
node server.js > /tmp/verify_server.log 2>&1 &
SERVER_PID=$!
sleep 3

echo "[4/8] 创建测试合同..."
CONTRACT_RESP=$(curl -s -X POST "$BASE_URL/api/contracts" \
  -H "Content-Type: application/json" \
  -d '{"patent_name":"人工智能算法专利","patent_no":"ZL20231000001","licensor":"专利权人A","licensee":"被许可方B","effective_date":"2024-01-01","end_date":"2026-12-31"}')
CONTRACT_ID=$(echo "$CONTRACT_RESP" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).id))")
echo "  合同ID: $CONTRACT_ID"

echo "[5/8] 设置三档阶梯费率..."
curl -s -X POST "$BASE_URL/api/rate-tiers" \
  -H "Content-Type: application/json" \
  -d "{\"contract_id\": $CONTRACT_ID, \"tier_name\": \"阶梯1\", \"min_amount\": 0, \"max_amount\": 10000, \"rate\": 3}" > /dev/null
curl -s -X POST "$BASE_URL/api/rate-tiers" \
  -H "Content-Type: application/json" \
  -d "{\"contract_id\": $CONTRACT_ID, \"tier_name\": \"阶梯2\", \"min_amount\": 10000, \"max_amount\": 50000, \"rate\": 5}" > /dev/null
curl -s -X POST "$BASE_URL/api/rate-tiers" \
  -H "Content-Type: application/json" \
  -d "{\"contract_id\": $CONTRACT_ID, \"tier_name\": \"阶梯3\", \"min_amount\": 50000, \"max_amount\": null, \"rate\": 8}" > /dev/null
echo "  费率档: 0-10000:3%, 10000-50000:5%, 50000+:8%"

echo "[6/8] 激活合同..."
curl -s -X POST "$BASE_URL/api/contracts/$CONTRACT_ID/activate" > /dev/null

echo "[7/8] 测试场景: 销售额跨入新阶梯后自动换算费率"
echo ""
echo "  测试1: 销售额 5,000 (阶梯1, 费率3%)"
RESP1=$(curl -s -X POST "$BASE_URL/api/sales-reports" \
  -H "Content-Type: application/json" \
  -d "{\"contract_id\": $CONTRACT_ID, \"licensee\": \"被许可方B\", \"period\": \"2024-01\", \"sales_amount\": 5000}")
REPORT_ID1=$(echo "$RESP1" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).id))")
SETTLE1=$(curl -s -X POST "$BASE_URL/api/settlements/generate/$REPORT_ID1")
SETTLE1_RATE=$(echo "$SETTLE1" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).applied_rate))")
SETTLE1_AMOUNT=$(echo "$SETTLE1" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).royalty_amount))")
echo "    适用费率: ${SETTLE1_RATE}% (预期: 3%)"
echo "    版税额: ${SETTLE1_AMOUNT} (预期: 150)"
if [ "$SETTLE1_RATE" = "3" ] && [ "$SETTLE1_AMOUNT" = "150" ]; then
  echo "    ✓ 测试1通过"
else
  echo "    ✗ 测试1失败"
  kill $SERVER_PID
  exit 1
fi

echo ""
echo "  测试2: 销售额 30,000 (阶梯2, 费率5%)"
RESP2=$(curl -s -X POST "$BASE_URL/api/sales-reports" \
  -H "Content-Type: application/json" \
  -d "{\"contract_id\": $CONTRACT_ID, \"licensee\": \"被许可方B\", \"period\": \"2024-02\", \"sales_amount\": 30000}")
REPORT_ID2=$(echo "$RESP2" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).id))")
SETTLE2=$(curl -s -X POST "$BASE_URL/api/settlements/generate/$REPORT_ID2")
SETTLE2_RATE=$(echo "$SETTLE2" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).applied_rate))")
SETTLE2_AMOUNT=$(echo "$SETTLE2" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).royalty_amount))")
echo "    适用费率: ${SETTLE2_RATE}% (预期: 5%)"
echo "    版税额: ${SETTLE2_AMOUNT} (预期: 1500)"
if [ "$SETTLE2_RATE" = "5" ] && [ "$SETTLE2_AMOUNT" = "1500" ]; then
  echo "    ✓ 测试2通过"
else
  echo "    ✗ 测试2失败"
  kill $SERVER_PID
  exit 1
fi

echo ""
echo "  测试3: 销售额 100,000 (阶梯3, 费率8%)"
RESP3=$(curl -s -X POST "$BASE_URL/api/sales-reports" \
  -H "Content-Type: application/json" \
  -d "{\"contract_id\": $CONTRACT_ID, \"licensee\": \"被许可方B\", \"period\": \"2024-03\", \"sales_amount\": 100000}")
REPORT_ID3=$(echo "$RESP3" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).id))")
SETTLE3=$(curl -s -X POST "$BASE_URL/api/settlements/generate/$REPORT_ID3")
SETTLE3_RATE=$(echo "$SETTLE3" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).applied_rate))")
SETTLE3_AMOUNT=$(echo "$SETTLE3" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).royalty_amount))")
echo "    适用费率: ${SETTLE3_RATE}% (预期: 8%)"
echo "    版税额: ${SETTLE3_AMOUNT} (预期: 8000)"
if [ "$SETTLE3_RATE" = "8" ] && [ "$SETTLE3_AMOUNT" = "8000" ]; then
  echo "    ✓ 测试3通过"
else
  echo "    ✗ 测试3失败"
  kill $SERVER_PID
  exit 1
fi

echo ""
echo "[8/8] 测试场景: 合同未生效时销售申报被拒绝"
echo ""
echo "  创建草稿状态合同..."
CONTRACT_DRAFT=$(curl -s -X POST "$BASE_URL/api/contracts" \
  -H "Content-Type: application/json" \
  -d '{"patent_name":"测试专利","patent_no":"TEST001","licensor":"测试人","licensee":"测试方","effective_date":"2024-01-01","end_date":"2024-12-31"}')
DRAFT_ID=$(echo "$CONTRACT_DRAFT" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).id))")
echo "  尝试对草稿合同提交销售申报..."
DRAFT_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/sales-reports" \
  -H "Content-Type: application/json" \
  -d "{\"contract_id\": $DRAFT_ID, \"licensee\": \"测试方\", \"period\": \"2024-04\", \"sales_amount\": 10000}")
echo "    HTTP状态码: $DRAFT_HTTP_CODE (预期: 400)"
if [ "$DRAFT_HTTP_CODE" = "400" ]; then
  echo "    ✓ 测试4通过 - 未生效合同申报被正确拒绝"
else
  echo "    ✗ 测试4失败"
  kill $SERVER_PID
  exit 1
fi

echo ""
echo "========================================"
echo "所有验证测试通过！"
echo "跨阶梯费率自动换算功能正常工作"
echo "========================================"

kill $SERVER_PID
exit 0
