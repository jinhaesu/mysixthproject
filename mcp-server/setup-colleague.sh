#!/bin/bash
# 조인앤조인 근태 관리 MCP 설치 스크립트
# 동료 PC에서 실행

echo "=== 조인앤조인 근태관리 MCP 설치 ==="

# 1. 폴더 생성
mkdir -p ~/joinandjoin-mcp
cd ~/joinandjoin-mcp

# 2. package.json
cat > package.json << 'PKGJSON'
{
  "name": "joinandjoin-attendance-mcp",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.24.0"
  }
}
PKGJSON

# 3. npm install
npm install

# 4. MCP 서버 파일 다운로드
curl -sL "https://raw.githubusercontent.com/jinhaesu/mysixthproject/claude/attendance-management-system-qjVSf/mcp-server/proxy.mjs" -o proxy.mjs

# 5. .mcp.json 생성 (현재 폴더용)
cat > .mcp.json << 'MCPJSON'
{
  "mcpServers": {
    "attendance": {
      "command": "node",
      "args": ["proxy.mjs"],
      "env": {
        "ATTENDANCE_API_URL": "https://mysixthproject-production.up.railway.app",
        "ATTENDANCE_API_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6Imxpb245MDgwQGpvaW5hbmRqb2luLmNvbSIsInR5cGUiOiJhdXRoIiwibWNwIjp0cnVlLCJpYXQiOjE3NzUxOTEyNjIsImV4cCI6MTgwNjcyNzI2Mn0.4KPWDP9SS9NmiDQAIvsSi9_fC91-NR--whUCoa59XIA"
      }
    }
  }
}
MCPJSON

echo ""
echo "=== 설치 완료 ==="
echo "사용법: 이 폴더에서 Claude Code 실행"
echo "  cd ~/joinandjoin-mcp"
echo "  claude"
echo ""
echo "예시 질문:"
echo "  '4월 정규직 확정 요약 보여줘'"
echo "  '김단니 4월 출퇴근 상세'"
echo "  '다음 주 배치 분석해줘'"
