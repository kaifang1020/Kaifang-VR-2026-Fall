#!/bin/sh
# 用 Node 18 启动课程服务器（本机装的是 Node 26，老版 express 会崩）。
# 启动后浏览器打开 http://localhost:2026
cd "$(dirname "$0")"
pkill -f "server/main.js" 2>/dev/null
exec npx -y node@18.20.8 server/main.js 2026 2026 http
