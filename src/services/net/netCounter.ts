/**
 * Counts every network attempt the JS side makes (fetch, XMLHttpRequest,
 * WebSocket). The Proof panel shows `net.calls`; in the demo it must read 0.
 * Install once, at the very top of index.js.
 */
export const net = { calls: 0 };

export function installNetCounter(g: any = globalThis) {
  if (g.__netCounterInstalled) return;
  g.__netCounterInstalled = true;

  // React Native's fetch opens an XMLHttpRequest synchronously; count it once.
  let inFetch = false;
  if (typeof g.fetch === 'function') {
    const orig = g.fetch;
    g.fetch = (...args: unknown[]) => {
      net.calls++;
      inFetch = true;
      try {
        return orig(...args);
      } finally {
        inFetch = false;
      }
    };
  }
  const xhr = g.XMLHttpRequest?.prototype;
  if (xhr?.open) {
    const open = xhr.open;
    xhr.open = function (this: unknown, ...args: unknown[]) {
      if (!inFetch) net.calls++;
      return open.apply(this, args);
    };
  }
  if (typeof g.WebSocket === 'function') {
    const WS = g.WebSocket;
    g.WebSocket = function (...args: unknown[]) {
      net.calls++;
      return new WS(...args);
    } as unknown;
    g.WebSocket.prototype = WS.prototype;
  }
}
