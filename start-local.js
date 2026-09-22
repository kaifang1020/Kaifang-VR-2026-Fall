// 本地启动入口：固定 cwd 后再加载 server/main.js。
// main.js 里用了 express.static("./")，所以 cwd 必须是项目根目录，
// 否则静态文件 404。用这个包装就不依赖调用方在哪个目录启动。
// 端口 / WS 端口 / 协议 依次是 main.js 读的 process.argv[2..4]。
process.chdir(__dirname);
process.argv = [process.argv[0], __dirname + '/server/main.js', '2026', '2026', 'http'];
require('./server/main.js');
