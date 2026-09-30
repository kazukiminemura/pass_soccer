import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { validateYouTubeRequest } from '../src/youtube.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

function stop(child) {
  if (process.platform === 'win32') {
    return new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => { child.kill(); resolve(); });
      killer.on('close', resolve);
    });
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill(); }
  return Promise.resolve();
}

export function runClip(request, path, signal, timeout = 120000) {
  if (!existsSync(python)) return Promise.reject(new Error('YouTube取得の準備が必要です。READMEのセットアップ手順を実行してください。'));
  return new Promise((resolve, reject) => {
    const child = spawn(python, [join(root, 'server/youtube_clip.py'), request.url, String(request.start), String(request.duration), path, process.execPath], {
      windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '', cancelling = false;
    const cancel = async () => { cancelling = true; await stop(child); };
    const timer = setTimeout(cancel, timeout);
    signal.addEventListener('abort', cancel, { once: true });
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); };
    child.stdout.on('data', data => { output = (output + data.toString()).slice(-8192); });
    // Do not expose signed media URLs or extractor internals to the browser.
    child.stderr.on('data', () => {});
    child.on('error', () => { cleanup(); reject(new Error('YouTube取得処理を起動できません。Pythonのセットアップを確認してください。')); });
    child.on('close', code => {
      cleanup();
      if (cancelling || signal.aborted) { reject(new Error('動画の取得を中止しました。120秒を超えた場合は動画ファイルを選択してください。')); return; }
      if (code === 0) { resolve(); return; }
      try { reject(new Error(JSON.parse(output.trim()).message)); }
      catch { reject(new Error('YouTubeから取得できませんでした。動画ファイルを選択してください。')); }
    });
    if (signal.aborted) void cancel();
  });
}

export function youtubeMiddleware(prepare = runClip) {
  let active = false;
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/youtube') return next();
    const sendError = (status, message) => { if (!res.destroyed && !res.headersSent) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ message })); } };
    if (req.method !== 'POST') return sendError(405, 'POSTリクエストが必要です。');
    // JSON + same-origin check prevents third-party pages from triggering local downloads.
    if (!req.headers['content-type']?.startsWith('application/json')) return sendError(415, 'JSONで動画リンクを指定してください。');
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return sendError(403, 'このアプリから操作してください。'); }
      catch { return sendError(403, 'このアプリから操作してください。'); }
    }
    if (active) return sendError(429, '別の動画を取得中です。完了してから再試行してください。');
    active = true;
    req.setTimeout(10000, () => req.destroy());
    let directory;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.on('close', cancel);
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) { sendError(413, '入力が長すぎます。動画リンクのみを指定してください。'); return; } }
      let request;
      try { request = validateYouTubeRequest(JSON.parse(body)); } catch (error) { sendError(400, error instanceof SyntaxError ? '入力内容を確認してください。' : error.message); return; }
      req.setTimeout(0);
      directory = await mkdtemp(join(tmpdir(), 'pass-soccer-youtube-'));
      const path = join(directory, 'clip.mp4');
      await prepare(request, path, controller.signal);
      if (controller.signal.aborted) return;
      const info = await stat(path);
      if (!info.size || info.size >= 100 * 1024 * 1024) throw new Error('動画が100MBを超えたか、取得できませんでした。');
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      await pipeline(createReadStream(path), res);
    } catch (error) { sendError(422, error.message); }
    finally {
      res.removeListener('close', cancel);
      try {
        if (directory && dirname(resolve(directory)) === resolve(tmpdir()) && basename(directory).startsWith('pass-soccer-youtube-')) {
          await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        }
      } finally { active = false; }
    }
  };
}

export function youtubePlugin() {
  const install = server => { server.middlewares.use(youtubeMiddleware()); };
  return { name: 'local-youtube-import', configureServer: install, configurePreviewServer: install };
}
