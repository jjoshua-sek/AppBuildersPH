import { installNetCounter, net } from '../netCounter';

test('counts fetch once, plain XHR, and WebSockets', () => {
  function FakeXHR() {}
  FakeXHR.prototype.open = function () {};
  function FakeWS(this: any, url: string) {
    this.url = url;
  }
  const g: any = { XMLHttpRequest: FakeXHR, WebSocket: FakeWS };
  // Like React Native: fetch is built on XMLHttpRequest.
  g.fetch = () => {
    new g.XMLHttpRequest().open('GET', 'x');
    return Promise.resolve();
  };

  installNetCounter(g);
  installNetCounter(g); // second install is a no-op
  net.calls = 0;

  g.fetch('https://example.com');
  expect(net.calls).toBe(1);
  new g.XMLHttpRequest().open('GET', 'y');
  expect(net.calls).toBe(2);
  const ws = new g.WebSocket('ws://z');
  expect(net.calls).toBe(3);
  expect(ws.url).toBe('ws://z');
});
