/**
 * Mock OAuth Server for E2E Testing
 *
 * Mimics GitHub OAuth endpoints so we can test the full flow locally
 * without hitting real GitHub APIs.
 */

import http from 'http';
import { URL } from 'url';

const PORT = 9999;
const MOCK_USER_ID = '666810';
const MOCK_LOGIN = 'test-user';
const MOCK_ACCESS_TOKEN = 'mock_token_' + Math.random().toString(36).substring(7);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);

  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`${req.method} ${url.pathname}`);

  // GitHub OAuth authorize endpoint
  if (url.pathname === '/login/oauth/authorize') {
    const clientId = url.searchParams.get('client_id');
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');

    console.log('  → OAuth authorize request');
    console.log('    client_id:', clientId);
    console.log('    redirect_uri:', redirectUri);

    // Simulate GitHub redirect with authorization code
    const code = 'mock_code_' + Math.random().toString(36).substring(7);
    const redirectUrl = `${redirectUri}?code=${code}&state=${state}`;

    res.writeHead(302, { Location: redirectUrl });
    res.end();
    return;
  }

  // GitHub OAuth token exchange endpoint
  if (url.pathname === '/login/oauth/access_token') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);

      console.log('  → OAuth token exchange');
      console.log('    code:', data.code);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: MOCK_ACCESS_TOKEN,
        token_type: 'bearer',
        scope: 'read:user',
      }));
    });
    return;
  }

  // GitHub user API endpoint
  if (url.pathname === '/user') {
    const authHeader = req.headers['authorization'];

    console.log('  → GitHub user API');
    console.log('    auth:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Requires authentication' }));
      return;
    }

    const token = authHeader.substring(7);

    if (token !== MOCK_ACCESS_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Bad credentials' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: parseInt(MOCK_USER_ID),
      login: MOCK_LOGIN,
      name: 'Test User',
      email: 'test@example.com',
    }));
    return;
  }

  // 404 for unknown endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n🔐 Mock OAuth Server running on http://localhost:${PORT}\n`);
  console.log('Endpoints:');
  console.log('  GET  /login/oauth/authorize - OAuth authorization');
  console.log('  POST /login/oauth/access_token - Token exchange');
  console.log('  GET  /user - User info API');
  console.log('');
  console.log('Mock credentials:');
  console.log(`  User ID: ${MOCK_USER_ID}`);
  console.log(`  Login: ${MOCK_LOGIN}`);
  console.log(`  Access Token: ${MOCK_ACCESS_TOKEN}`);
  console.log('');
  console.log('To use with wrangler dev:');
  console.log('  1. Update src/oauth-handler.ts to use http://localhost:9999');
  console.log('  2. Or set GITHUB_API_BASE env var');
  console.log('  3. Set GITHUB_ALLOWED_USER_ID=' + MOCK_USER_ID);
  console.log('');
  console.log('Press Ctrl+C to stop\n');
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n\nShutting down mock OAuth server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});
