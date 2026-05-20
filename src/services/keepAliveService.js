import http from 'node:http';

export class KeepAliveService {
  constructor({ config, telegram }) {
    this.config = config;
    this.telegram = telegram;
    this.interval = null;
    this.server = null;
    this.startedAt = new Date();
    this.lastPingAt = null;
    this.lastPingOk = false;
  }

  start() {
    if (this.config.enableHealthServer && this.config.healthPort > 0) {
      this.startHealthServer();
    }

    if (this.config.keepAliveIntervalMinutes > 0) {
      setTimeout(() => {
        this.ping('startup').catch((error) => console.warn('[keepalive]', error.message));
      }, 2500);

      this.interval = setInterval(() => {
        this.ping('scheduled').catch((error) => console.warn('[keepalive]', error.message));
      }, this.config.keepAliveIntervalMinutes * 60 * 1000);
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  startHealthServer() {
    this.server = http.createServer((request, response) => {
      if (request.url === '/health' || request.url === '/') {
        const body = JSON.stringify({
          ok: true,
          bot: this.config.botName,
          startedAt: this.startedAt.toISOString(),
          lastPingAt: this.lastPingAt?.toISOString() ?? null,
          lastPingOk: this.lastPingOk
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(body);
        return;
      }

      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
    });

    this.server.listen(this.config.healthPort, this.config.healthHost, () => {
      console.log(`[health] listening on ${this.config.healthHost}:${this.config.healthPort}`);
    });
  }

  async ping(reason) {
    const bot = await this.telegram.getMe();
    if (this.config.keepAliveUrl) {
      const response = await fetch(this.config.keepAliveUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        throw new Error(`Keepalive URL returned ${response.status}`);
      }
    }

    this.lastPingAt = new Date();
    this.lastPingOk = true;
    console.log(`[keepalive] ${reason} ok as @${bot.username ?? bot.id}`);
  }
}
