@echo off
echo === 조인앤조인 근태관리 MCP 설치 ===

:: 1. 폴더 생성
mkdir "%USERPROFILE%\joinandjoin-mcp" 2>nul
cd /d "%USERPROFILE%\joinandjoin-mcp"

:: 2. package.json
(
echo {
echo   "name": "joinandjoin-attendance-mcp",
echo   "version": "1.0.0",
echo   "type": "module",
echo   "dependencies": {
echo     "@modelcontextprotocol/sdk": "^1.29.0",
echo     "zod": "^3.24.0"
echo   }
echo }
) > package.json

:: 3. npm install
call npm install

:: 4. proxy.mjs 다운로드
curl -sL "https://raw.githubusercontent.com/jinhaesu/mysixthproject/claude/attendance-management-system-qjVSf/mcp-server/proxy.mjs" -o proxy.mjs

:: 5. .mcp.json 생성
(
echo {
echo   "mcpServers": {
echo     "attendance": {
echo       "command": "node",
echo       "args": ["proxy.mjs"],
echo       "env": {
echo         "ATTENDANCE_API_URL": "https://mysixthproject-production.up.railway.app",
echo         "ATTENDANCE_API_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6Imxpb245MDgwQGpvaW5hbmRqb2luLmNvbSIsInR5cGUiOiJhdXRoIiwibWNwIjp0cnVlLCJpYXQiOjE3NzUxOTEyNjIsImV4cCI6MTgwNjcyNzI2Mn0.4KPWDP9SS9NmiDQAIvsSi9_fC91-NR--whUCoa59XIA"
echo       }
echo     }
echo   }
echo }
) > .mcp.json

echo.
echo === 설치 완료 ===
echo.
echo 사용법: 이 폴더에서 Claude Code 실행
echo   cd %USERPROFILE%\joinandjoin-mcp
echo   claude
echo.
echo 예시: '4월 정규직 확정 요약 보여줘'
pause
