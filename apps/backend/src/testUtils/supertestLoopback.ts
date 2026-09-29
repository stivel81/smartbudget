/**
 * Jest setup (see jest.config.js `setupFiles`): make supertest's ephemeral
 * test servers listen on 127.0.0.1 — the address supertest dials — instead
 * of the dual-stack wildcard `::`.
 *
 * Why: stock `request(app)` does `app.listen(0)` (no host), which Node binds
 * to `[::]:<port>`, then connects to `127.0.0.1:<port>`. On macOS the kernel
 * will hand that IPv6 socket a port another process already holds for IPv4
 * (e.g. Spotify on `*:50061`, a VS Code helper on `127.0.0.1:51098`), and the
 * IPv4 connection to 127.0.0.1 is then delivered to *that* process, not to the
 * test server. The test sees a 404, "socket hang up" or "Parse Error:
 * Expected HTTP/"; and since the request never reached the app, its queued
 * supabase mocks are left over and the next tests in the file can fail too.
 * Which test hits a taken port depends on where the kernel's port cursor is,
 * hence "a different test fails about 1 run in N".
 *
 * A 127.0.0.1 listener lives in the IPv4 table, so the kernel never assigns
 * it a port another 127.0.0.1 listener holds, and an exact-address listener
 * always wins over a wildcard one for connections to 127.0.0.1.
 *
 * Binding to a host is asynchronous in Node, while supertest computes the URL
 * synchronously in the Test constructor — so the listen starts there and the
 * real URL is filled in by end() once the server is listening (superagent
 * only reads `this.url` when the request is sent).
 *
 * A server a test starts itself must already be listening on 127.0.0.1 when
 * handed to request(); anything else throws, rather than flaking later.
 */
import tls from 'tls';
import type { AddressInfo, Server } from 'net';

const LOOPBACK = '127.0.0.1';
const PATCHED = Symbol.for('smartbudget.testUtils.supertestLoopback');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Test } = require('supertest') as { Test: { prototype: any } };

type PendingListen = { listening: Promise<void>; server: Server; path: string };

const proto = Test.prototype;

if (!proto[PATCHED]) {
  const originalEnd: (fn?: (err: unknown, res?: unknown) => void) => unknown = proto.end;

  proto.serverAddress = function serverAddress(this: any, app: Server, path: string): string {
    const protocol = app instanceof tls.Server ? 'https' : 'http';
    const addr = app.address();

    if (addr) {
      if (typeof addr === 'string' || addr.address !== LOOPBACK) {
        throw new Error(
          `supertest dials ${LOOPBACK}, but this server listens on ${JSON.stringify(addr)} — ` +
            `bind test servers with .listen(0, '${LOOPBACK}') and wait for 'listening' before request(server)`
        );
      }
      return `${protocol}://${LOOPBACK}:${addr.port}${path}`;
    }

    this._server = app.listen(0, LOOPBACK);
    const listening = new Promise<void>((resolve, reject) => {
      const onError = (err: unknown) => reject(err);
      app.once('error', onError);
      app.once('listening', () => {
        app.removeListener('error', onError);
        resolve();
      });
    });
    listening.catch(() => {}); // surfaced by end(); don't report as unhandled
    this._loopbackPending = { listening, server: app, path } satisfies PendingListen;
    // Placeholder until end() knows the port; never dialled as-is.
    return `${protocol}://${LOOPBACK}${path}`;
  };

  proto.end = function end(this: any, fn?: (err: unknown, res?: unknown) => void) {
    const pending: PendingListen | undefined = this._loopbackPending;
    if (!pending) return originalEnd.call(this, fn);
    this._loopbackPending = undefined;

    pending.listening.then(
      () => {
        const { port } = pending.server.address() as AddressInfo;
        const protocol = pending.server instanceof tls.Server ? 'https' : 'http';
        this.url = `${protocol}://${LOOPBACK}:${port}${pending.path}`;
        originalEnd.call(this, fn);
      },
      (err) => {
        if (fn) fn(err);
      }
    );
    return this;
  };

  proto[PATCHED] = true;
}
