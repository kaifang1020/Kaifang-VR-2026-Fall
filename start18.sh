#!/bin/sh
# 用 Node 18 启动课程服务器（本机装的是 Node 26，老版 express 会崩）。
# 服务器意外退出后，等 2 秒自动重启。按 Ctrl+C 停止。
# 启动后浏览器打开 http://localhost:2026 ，头显打开下面打印的 http://<IP>:2026
# 整个脚本放在 { } 里：sh 启动时一次读完，运行中修改这个文件也不会读乱。
{
cd "$(dirname "$0")"

PORT=2026
NODE_VERSION=18.20.8

# 关掉之前留下的课程服务器：先停掉别的 start18.sh 自动重启循环（不然它会马上
# 把服务器拉起来），再关服务器本身（包括用 start-local.js 启动的）
for pid in $(pgrep -f "start18.sh"); do
   [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null
done
pkill -f "server/main.js" 2>/dev/null
pkill -f "start-local.js" 2>/dev/null
sleep 1

# 端口还被别的程序占着，就不启动，免得无限重启
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
   echo "端口 $PORT 被下面这个程序占用，先把它关掉再运行："
   lsof -nP -iTCP:$PORT -sTCP:LISTEN
   exit 1
fi

# 找到 Node 18 本体的路径，之后直接运行它。不每次经过 npx：npx 会再开一个
# 子进程，npx 自己退出时那个子进程会留下来继续占着端口，导致重启失败。
NODE=$(npx -y node@$NODE_VERSION -p process.execPath 2>/dev/null)
if [ ! -x "$NODE" ]; then
   echo "找不到 Node $NODE_VERSION（npx 下载失败？检查网络后重试）"
   exit 1
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo "电脑:  http://localhost:$PORT"
[ -n "$IP" ] && echo "头显:  http://$IP:$PORT   (头显 chrome://flags 里填的地址要和这个一致)"
echo "按 Ctrl+C 停止。"
echo

stopping=0
trap 'stopping=1' INT TERM

fast=0                                   # 连续几次启动后很快就退出
while [ $stopping -eq 0 ]; do
   started=$(date +%s)
   echo "[$(date '+%H:%M:%S')] 启动服务器"
   "$NODE" server/main.js $PORT $PORT http
   code=$?
   [ $stopping -eq 1 ] && break

   if [ $(( $(date +%s) - started )) -lt 10 ]; then fast=$((fast + 1)); else fast=0; fi
   if [ $fast -ge 5 ]; then
      echo "[$(date '+%H:%M:%S')] 服务器连续 5 次启动后 10 秒内就退出了，停止重启。请看上面的报错。"
      exit 1
   fi
   echo "[$(date '+%H:%M:%S')] 服务器退出了（退出码 $code），2 秒后重启……"
   sleep 2
done
echo
echo "[$(date '+%H:%M:%S')] 已停止。"
exit 0
}
