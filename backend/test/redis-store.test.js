// The Vercel setup keeps data in Redis (Upstash REST). This fakes that REST API
// and checks that data survives between two separate app instances.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.AI_PROVIDER = 'none';
const { createApp } = await import('../src/app.js');
const { createStore } = await import('../src/store.js');

const kv = new Map();
let redisServer;
let redis;
before(async () => {
  redisServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      assert.equal(req.headers.authorization, 'Bearer test-token');
      const [cmd, key, value] = JSON.parse(body);
      const result = cmd === 'GET' ? kv.get(key) ?? null : (kv.set(key, value), 'OK');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ result }));
    });
  }).listen(0);
  await new Promise((r) => redisServer.once('listening', r));
  redis = { url: `http://localhost:${redisServer.address().port}`, token: 'test-token' };
});
after(() => redisServer.close());

async function serve(app) {
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  return { s, base: `http://localhost:${s.address().port}/api` };
}

test('data survives across two serverless instances via Redis', async () => {
  const one = await serve(createApp(createStore(null, { redis })));
  const demo = await (await fetch(`${one.base}/auth/demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"as":"student-finished"}' })).json();
  one.s.close();

  // A brand-new instance (like a Vercel cold start) must still know this user.
  const two = await serve(createApp(createStore(null, { redis })));
  const me = await fetch(`${two.base}/auth/me`, { headers: { Authorization: `Bearer ${demo.token}` } });
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.student.progress.missionsDone, 3);
  const health = await (await fetch(`${two.base}/health`)).json();
  assert.equal(health.storage, 'redis');
  two.s.close();
});
