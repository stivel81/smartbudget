// Guards the jest setup in src/testUtils/supertestLoopback.ts: supertest
// dials 127.0.0.1, so the servers it starts must listen on 127.0.0.1 too. A
// wildcard `::` bind can share a port with another process's IPv4 listener
// on macOS, and the request then lands on that process (intermittent 404 /
// "socket hang up" / "Parse Error: Expected HTTP/").
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import request from 'supertest';

function whereApp() {
  const app = express();
  app.get('/where', (req, res) => {
    const local = req.socket.address() as AddressInfo;
    res.json({ address: local.address, family: local.family });
  });
  return app;
}

describe('test server binding (supertestLoopback setup)', () => {
  it('request(app) serves from a 127.0.0.1 listener', async () => {
    const res = await request(whereApp()).get('/where');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ address: '127.0.0.1', family: 'IPv4' });
  });

  it('works for chained calls, query strings, and the callback style', (done) => {
    request(whereApp())
      .get('/where')
      .query({ q: '1' })
      .set('X-Test', 'y')
      .expect(200, { address: '127.0.0.1', family: 'IPv4' }, done);
  });

  it('accepts a server the test already bound to 127.0.0.1', async () => {
    const server = http.createServer(whereApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const res = await request(server).get('/where');
      expect(res.body.address).toBe('127.0.0.1');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('rejects a server bound to the wildcard address instead of flaking later', async () => {
    const server = http.createServer(whereApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      expect(() => request(server).get('/where')).toThrow(/bind test servers with \.listen\(0, '127\.0\.0\.1'\)/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
