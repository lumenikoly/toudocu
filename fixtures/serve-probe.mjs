#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';
import { createHash } from 'node:crypto';

const [, , command, encodedArgs] = process.argv;
const args = JSON.parse(encodedArgs);
const port = await new Promise((resolve, reject) => {
  const probe = http.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      reject(new Error('failed to allocate a probe port'));
      return;
    }
    probe.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});
const portIndex = args.indexOf('--port');
if (portIndex >= 0) args[portIndex + 1] = String(port);
const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk;
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

function request(path, method = 'GET') {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () =>
        resolve({
          path,
          method,
          status: res.statusCode,
          content: body.includes('<html') ? 'html' : body.trim().startsWith('{') ? 'json' : 'text',
          bodySha256: createHash('sha256').update(body).digest('hex'),
        }),
      );
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request('/');
    if (response?.status === 200) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

const ready = await waitForServer();
const responses = ready
  ? (
      await Promise.all([
        request('/'),
        request('/health.html'),
        request('/_toudocu/api/version'),
        request('/', 'POST'),
      ])
    ).filter(Boolean)
  : [];
if (child.exitCode === null) child.kill('SIGTERM');
await new Promise((resolve) => {
  if (child.exitCode !== null) resolve();
  else child.once('close', resolve);
  setTimeout(resolve, 2_000);
});
const rootPost = responses.find((response) => response.path === '/' && response.method === 'POST');
const statusesOK =
  responses.length === 4 &&
  responses
    .filter((response) => response.method === 'GET')
    .every((response) => response.status === 200) &&
  rootPost?.status === 404;
process.stdout.write(
  `${JSON.stringify({ ready, requests: responses, readOnly: rootPost?.status === 404, shutdown: true, serverStdout: stdout.replaceAll(`:${port}`, ':<PORT>'), serverStderr: stderr })}\n`,
);
process.exitCode = ready && statusesOK ? 0 : 1;
