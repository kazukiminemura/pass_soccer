import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseYouTubeUrl, validateYouTubeRequest } from '../src/youtube.js';
import { youtubeMiddleware } from '../server/youtube.js';

const input = { url: 'https://youtu.be/aqz-KE-bpKQ?t=15', start: 15, duration: 10 };
test('YouTube URL variants resolve to a single video without extra parameters', () => {
  for (const url of [input.url, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&list=example', 'https://www.youtube.com/shorts/aqz-KE-bpKQ', 'https://m.youtube.com/embed/aqz-KE-bpKQ']) {
    assert.equal(parseYouTubeUrl(url).url, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  }
});
test('reject arbitrary URLs, credentials, channels and malformed clip requests', () => {
  for (const url of ['https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ', 'http://127.0.0.1/', 'file:///tmp/a', 'https://user:secret@youtube.com/watch?v=aqz-KE-bpKQ', 'https://youtu.be:444/aqz-KE-bpKQ', 'https://youtube.com/@channel', 'https://youtube.com/playlist?list=abc']) assert.throws(() => parseYouTubeUrl(url));
  for (const changed of [{start:-1},{start:Infinity},{start:.5},{duration:9},{duration:31},{duration:'10'},{extra:true}]) assert.throws(() => validateYouTubeRequest({...input,...changed}));
  assert.equal(validateYouTubeRequest(input).start,15);
});

test('local API streams a clip, rejects cross origin and removes temp data on success/failure', async () => {
  let temporary, failed = false, calls = 0;
  const middleware = youtubeMiddleware(async (request, path) => {
    calls++; temporary = dirname(path); await writeFile(path, 'clip-content');
    assert.equal(request.start, 15);
    if (failed) throw new Error('取得できませんでした。');
  });
  const server = createServer((req,res) => void middleware(req,res,()=>{res.writeHead(404);res.end();}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(body, headers={})=>fetch(`${base}/api/youtube`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try {
    assert.equal((await post(input,{Origin:'https://other.test'})).status,403);assert.equal(calls,0);
    assert.equal((await post({...input,url:'http://localhost/'})).status,400);assert.equal(calls,0);
    const response=await post(input,{Origin:base});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'clip-content');
    // Response finish precedes the asynchronous filesystem cleanup.
    for(let i=0;i<50;i++){try{await access(temporary);}catch{break;}await new Promise(r=>setTimeout(r,10));}
    await assert.rejects(access(temporary));
    failed=true;const error=await post(input);assert.equal(error.status,422);assert.equal((await error.json()).message,'取得できませんでした。');
    for(let i=0;i<50;i++){try{await access(temporary);}catch{break;}await new Promise(r=>setTimeout(r,10));}
    await assert.rejects(access(temporary));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
