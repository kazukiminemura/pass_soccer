const hosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

export function parseYouTubeUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('https://から始まるYouTubeの動画リンクを入力してください。'); }
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port) {
    throw new Error('YouTubeの動画リンク（youtube.com / youtu.be）を入力してください。');
  }
  let id;
  if (url.hostname === 'youtu.be') id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else id = /^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
  if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('動画ごとのリンクを入力してください。チャンネルや再生リストのリンクは使えません。');
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

export function validateYouTubeRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'duration,start,url' || typeof input.url !== 'string') {
    throw new Error('動画リンクと解析区間を指定してください。');
  }
  const parsed = parseYouTubeUrl(input.url);
  if (!Number.isInteger(input.start) || input.start < 0 || input.start > 21600) throw new Error('開始位置は0〜21600秒の整数で入力してください。');
  if (!Number.isInteger(input.duration) || input.duration < 10 || input.duration > 30) throw new Error('解析する長さは10〜30秒の整数で入力してください。');
  return { ...parsed, start: input.start, duration: input.duration };
}
