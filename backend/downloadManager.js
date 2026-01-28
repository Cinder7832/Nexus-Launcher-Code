// backend/downloadManager.js
const fs = require("fs");
const path = require("path");
const got = require("got");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

class DownloadManager {
  constructor({ onUpdate }) {
    this.onUpdate = onUpdate;
    this.downloads = new Map(); // id -> download
    this.nextId = 1;
  }

  list() {
    return Array.from(this.downloads.values()).map(d => this._public(d));
  }

  get(id) {
    return this.downloads.get(String(id));
  }

  _public(d) {
    if (!d) return null;
    const { stream, file, controller, _lastEmitAt, _lastBytesAt, _lastBytesValue, ...rest } = d;
    return { ...rest };
  }

  _emit(id) {
    const d = this.get(id);
    if (!d) return;
    this.onUpdate?.(this._public(d));
  }

  start({ gameId, name, url, destPath }) {
    ensureDir(path.dirname(destPath));

    const id = String(this.nextId++);
    const d = {
      id,
      gameId: String(gameId),
      name,
      url,
      destPath,

      status: "downloading", // downloading | paused | canceled | completed | error
      percent: 0,
      transferred: 0,
      total: 0,
      speed: 0,
      eta: 0,
      error: null,

      stream: null,
      file: null,
      controller: null,

      _lastEmitAt: 0,
      _lastBytesAt: Date.now(),
      _lastBytesValue: 0
    };

    this.downloads.set(id, d);
    this._begin(id, 0);
    this._emit(id);
    return id;
  }

  pause(id) {
    const d = this.get(id);
    if (!d || d.status !== "downloading") return;

    d.status = "paused";
    d.speed = 0;
    d.eta = 0;

    try { d.controller?.abort(); } catch {}
    try { d.stream?.destroy(); } catch {}
    try { d.file?.close(); } catch {}

    d.controller = null;
    d.stream = null;
    d.file = null;

    this._emit(id);
  }

  async resume(id) {
    const d = this.get(id);
    if (!d || d.status !== "paused") return;

    let existing = 0;
    try {
      if (fs.existsSync(d.destPath)) existing = fs.statSync(d.destPath).size;
    } catch {}

    d.status = "downloading";
    d.error = null;
    d.speed = 0;
    d.eta = 0;

    this._begin(id, existing);
    this._emit(id);
  }

  cancel(id) {
    const d = this.get(id);
    if (!d) return;

    d.status = "canceled";
    d.speed = 0;
    d.eta = 0;

    try { d.controller?.abort(); } catch {}
    try { d.stream?.destroy(); } catch {}
    try { d.file?.close(); } catch {}

    d.controller = null;
    d.stream = null;
    d.file = null;

    // remove partial zip
    try {
      if (fs.existsSync(d.destPath)) fs.unlinkSync(d.destPath);
    } catch {}

    this._emit(id);
  }

  _begin(id, startByte) {
    const d = this.get(id);
    if (!d) return;

    ensureDir(path.dirname(d.destPath));

    const append = startByte > 0;
    const file = fs.createWriteStream(d.destPath, { flags: append ? "a" : "w" });
    d.file = file;

    const controller = new AbortController();
    d.controller = controller;

    // reset rolling speed baseline
    d._lastBytesAt = Date.now();
    d._lastBytesValue = startByte;
    d._lastEmitAt = 0;

    const headers = startByte > 0 ? { range: `bytes=${startByte}-` } : {};
    const stream = got.stream(d.url, { headers, signal: controller.signal });
    d.stream = stream;

    // total size detection
    stream.on("response", (res) => {
      // If server doesn't support ranges, restart from 0
      if (startByte > 0 && res.statusCode !== 206) {
        try { controller.abort(); } catch {}
        try { stream.destroy(); } catch {}
        try { file.close(); } catch {}
        try { fs.unlinkSync(d.destPath); } catch {}

        d.transferred = 0;
        d.total = 0;
        d.percent = 0;
        d.speed = 0;
        d.eta = 0;

        this._begin(id, 0);
        return;
      }

      const contentRange = res.headers["content-range"];
      if (contentRange) {
        // bytes 0-123/999999
        const m = String(contentRange).match(/\/(\d+)\s*$/);
        if (m) d.total = Number(m[1]) || d.total;
      }

      const cl = res.headers["content-length"];
      if (!d.total && cl) {
        const len = Number(cl);
        if (!Number.isNaN(len) && len > 0) d.total = startByte + len;
      }

      this._emit(id);
    });

    // PROGRESS: count bytes ourselves (works even if got's downloadProgress is flaky)
    stream.on("data", (chunk) => {
      if (d.status !== "downloading") return;

      d.transferred += chunk.length;

      if (d.total > 0) {
        d.percent = Math.max(0, Math.min(100, Math.floor((d.transferred / d.total) * 100)));
      } else {
        d.percent = 0; // unknown -> UI uses indeterminate bar
      }

      const now = Date.now();
      const dt = Math.max(0.001, (now - d._lastBytesAt) / 1000);
      const db = Math.max(0, d.transferred - d._lastBytesValue);
      const speed = db / dt;

      d.speed = speed;
      d.eta = (d.total > 0 && speed > 0) ? Math.max(0, (d.total - d.transferred) / speed) : 0;

      // update baseline every tick
      d._lastBytesAt = now;
      d._lastBytesValue = d.transferred;

      // throttle emits (smooth UI without spamming)
      if (now - d._lastEmitAt > 120) {
        d._lastEmitAt = now;
        this._emit(id);
      }
    });

    stream.on("end", () => {
      // if paused/canceled/error, ignore
      if (d.status !== "downloading") return;
      // stream ended naturally, the file should finish
    });

    stream.on("error", (err) => {
      // abort() will also cause an error — ignore if paused/canceled
      if (d.status === "paused" || d.status === "canceled") return;

      d.status = "error";
      d.error = err?.message || String(err);
      d.speed = 0;
      d.eta = 0;

      try { file.close(); } catch {}
      d.controller = null;
      d.stream = null;
      d.file = null;

      this._emit(id);
    });

    file.on("finish", () => {
      // finish means all bytes written to disk
      if (d.status !== "downloading") return;

      d.status = "completed";
      d.percent = 100;
      d.speed = 0;
      d.eta = 0;

      d.controller = null;
      d.stream = null;
      d.file = null;

      this._emit(id);
    });

    file.on("error", (err) => {
      if (d.status === "paused" || d.status === "canceled") return;

      d.status = "error";
      d.error = err?.message || String(err);
      d.speed = 0;
      d.eta = 0;

      try { controller.abort(); } catch {}
      try { stream.destroy(); } catch {}

      d.controller = null;
      d.stream = null;
      d.file = null;

      this._emit(id);
    });

    stream.pipe(file);
  }
}

module.exports = { DownloadManager };
