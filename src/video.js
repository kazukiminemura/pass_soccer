import { LIMITS } from './analysis.js';
export function waitEvent(target, event, timeout=10000, signal) {
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);target.removeEventListener(event,ok);target.removeEventListener('error',bad);signal?.removeEventListener('abort',abort);};
    const ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(new Error('動画を読み込めません。MP4（H.264）など、ブラウザで再生できる形式で撮影してください。'));};
    const abort=()=>{cleanup();reject(new Error('解析を中止しました。'));};
    const timer=setTimeout(()=>{cleanup();reject(new Error('動画の読み込みがタイムアウトしました。再選択してください。'));},timeout);
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    target.addEventListener(event,ok,{once:true});target.addEventListener('error',bad,{once:true});
  });
}
export async function seek(video,time,signal,timeout=10000) {
  if(Math.abs(video.currentTime-time)<.001 && video.readyState>=2) return;
  const ready=waitEvent(video,'seeked',timeout,signal);video.currentTime=time;await ready;
}
export function imageQuality(context,width,height) {
  const pixels=context.getImageData(0,0,width,height).data;let light=0,edges=0,count=0;
  for(let y=1;y<height;y+=4) for(let x=1;x<width;x+=4) {
    const i=(y*width+x)*4,prev=i-4;
    const luminance=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
    light+=luminance;edges+=Math.abs(luminance-(.2126*pixels[prev]+.7152*pixels[prev+1]+.0722*pixels[prev+2]));count++;
  }
  return {light:light/count,sharpness:edges/count};
}
export async function analyzeVideo(video,onProgress,signal) {
  const started=performance.now();
  // MediaPipe loads WASM glue with importScripts, which requires a classic worker.
  const worker=new Worker('/pose.worker.js');
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.round(480*video.videoHeight/video.videoWidth);
  const context=canvas.getContext('2d',{willReadFrequently:true});
  let rejectPending;
  const cancel=()=>{worker.terminate();rejectPending?.(new Error('解析を中止しました。'));};
  signal.addEventListener('abort',cancel,{once:true});
  const request=(message,transfer=[])=>new Promise((resolve,reject)=>{
    rejectPending=error=>{clearTimeout(timer);reject(error);};
    const remaining=LIMITS.timeout-(performance.now()-started);
    const timer=setTimeout(()=>{rejectPending=null;worker.terminate();reject(new Error('解析が60秒を超えました。動画を10秒に短くするか、PCで再試行してください。'));},Math.max(1,remaining));
    worker.onmessage=({data})=>{clearTimeout(timer);rejectPending=null;data.type==='error'?reject(new Error(`姿勢・ボール検出モデルの読み込み・解析に失敗しました。再試行してください。詳細：${data.message}`)):resolve(data);};
    worker.onerror=()=>{clearTimeout(timer);rejectPending=null;reject(new Error('姿勢解析を開始できませんでした。ページを再読み込みしてください。'));};
    if(signal.aborted){clearTimeout(timer);reject(new Error('解析を中止しました。'));return;}
    worker.postMessage(message,transfer);
  });
  try {
    onProgress(0,'姿勢・ボール検出モデルを準備しています');await request({type:'init'});
    const frames=[],count=Math.ceil(video.duration*LIMITS.fps);
    for(let i=0;i<count;i++) {
      if(signal.aborted) throw new Error('解析を中止しました。');
      if(performance.now()-started>LIMITS.timeout) throw new Error('解析が60秒を超えました。短い動画で再試行してください。');
      const time=Math.min(i/LIMITS.fps,video.duration-.02);await seek(video,time,signal,Math.min(10000,LIMITS.timeout-(performance.now()-started)));
      context.drawImage(video,0,0,canvas.width,canvas.height);
      const quality=imageQuality(context,canvas.width,canvas.height),bitmap=await createImageBitmap(canvas);
      const result=await request({type:'frame',bitmap,timestamp:time*1000},[bitmap]);
      frames.push({time,pose:result.pose,people:result.people,balls:result.balls,...quality});onProgress((i+1)/count,`関節とボールを確認中 ${i+1} / ${count}`);
    }
    return {frames,elapsed:(performance.now()-started)/1000};
  } finally {worker.terminate();signal.removeEventListener('abort',cancel);}
}
