const http = require('http');

const TARGET_HOST = 'localhost';
const TARGET_PORT = 3030;
const PROXY_PORT = 8080;  // Use different port to avoid conflict
const PROXY_HOST = '0.0.0.0';

const server = http.createServer((clientReq, clientRes) => {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: clientReq.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err);
    clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
    clientRes.end('Proxy error');
  });

  clientReq.pipe(proxyReq);
});

// Handle WebSocket upgrades (for HMR)
server.on('upgrade', (req, socket, head) => {
  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });

  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options);

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    proxySocket.pipe(socket).pipe(proxySocket);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy upgrade error:', err);
    socket.end();
  });

  proxyReq.end();
});

server.listen(PROXY_PORT, PROXY_HOST, () => {
  console.log(`\n========================================`);
  console.log(`Proxy server running on all interfaces`);
  console.log(`========================================`);
  console.log(`Access URLs:`);
  console.log(`  http://localhost:${PROXY_PORT}/`);
  console.log(`  http://0.0.0.0:${PROXY_PORT}/`);
  console.log(`  http://192.168.136.125:${PROXY_PORT}/`);
  console.log(`\nSlides:`);
  console.log(`  Slide 4: http://192.168.136.125:${PROXY_PORT}/4`);
  console.log(`  Slide 5: http://192.168.136.125:${PROXY_PORT}/5`);
  console.log(`========================================\n`);
});

process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
