import './style.css';
import {dashboard} from './dashboard.js';
import {validateFile,validateDuration,evaluate} from './analysis.js';
import {waitEvent,seek,analyzeVideo} from './video.js';
import {validateYouTubeRequest} from './youtube.js';

document.querySelector('#app').innerHTML=dashboard;
const $=id=>document.getElementById(id),video=$('video');
let url,frames=[],result,controller,busy=false,generation=0,sourceInfo=null;
const status=text=>$('status').textContent=text;
const isYouTube=()=>$('source-youtube').getAttribute('aria-pressed')==='true';
$('youtube-url').oninput=()=>lock(false);
function erase(){generation++;controller?.abort();controller=null;video.pause();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);url=null;frames=[];result=null;sourceInfo=null;$('file').value='';$('video-empty').hidden=false;$('result-empty').hidden=false;$('filename').textContent='動画を選択する';$('preview').hidden=true;$('results').hidden=true;$('results').replaceChildren();$('progress').hidden=true;$('analyze').disabled=true;busy=false;lock(false);draw();}
function lock(value){busy=value;video.controls=!value;for(const id of ['file','foot','direction','goal','source-file','source-youtube'])$(id).disabled=value;for(const id of ['youtube-url','youtube-start','youtube-duration'])$(id).disabled=value||!isYouTube();$('analyze').disabled=value||!url&&(!isYouTube()||!$('youtube-url').value.trim());$('cancel').hidden=!value;}
$('delete').onclick=()=>{erase();$('youtube-url').value='';$('youtube-start').value='0';$('youtube-duration').value='10';lock(false);status('動画と分析結果を削除しました。');};
$('cancel').onclick=$('delete').onclick;
for(const type of ['file','youtube'])$(`source-${type}`).onclick=()=>{
  erase();$('youtube-input').hidden=type!=='youtube';document.querySelector('.upload').hidden=type!=='file';
  for(const name of ['file','youtube'])$(`source-${name}`).setAttribute('aria-pressed',String(name===type));
  lock(false);
  status(type==='youtube'?'リンクを貼り、パス1回を含む区間を指定してください。':'動画ファイルを選択してください。');
};
async function loadBlob(blob,label,token){
  url=URL.createObjectURL(blob);const ready=waitEvent(video,'loadeddata');video.src=url;await ready;
  if(token!==generation)return false;validateDuration(video.duration);$('filename').textContent=label;$('preview').hidden=false;$('video-empty').hidden=true;$('analyze').disabled=false;return true;
}
async function importYouTube(){
  if(busy)return;let request;
  try{request=validateYouTubeRequest({url:$('youtube-url').value,start:Number($('youtube-start').value),duration:Number($('youtube-duration').value)});}catch(error){status(error.message);return;}
  erase();const token=generation;controller=new AbortController();lock(true);status('YouTubeの指定区間を取得しています（最大120秒）。取得後、そのまま解析を開始します。');
  const timer=setTimeout(()=>controller?.abort(),125000);
  try{
    const response=await fetch('/api/youtube',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:request.url,start:request.start,duration:request.duration}),signal:controller.signal});
    if(!response.ok){let message='YouTubeから取得できません。動画ファイルを選択してください。';try{message=(await response.json()).message||message;}catch{}throw new Error(message);}
    const blob=await response.blob();if(token!==generation)return;
    if(blob.size>100*1024*1024)throw new Error('動画が100MBを超えています。区間を短くしてください。');
    if(await loadBlob(blob,`YouTube ${request.id}`,token)){sourceInfo=request;status('動画を取得しました。解析を開始します。');}
  }catch(error){if(token===generation){erase();status(error.name==='AbortError'?'取得を中止しました。時間をおいて再試行するか、動画ファイルを選択してください。':error.message);}}
  finally{clearTimeout(timer);if(token===generation){controller=null;lock(false);}}
  return token===generation&&Boolean(sourceInfo);
};
$('file').onchange=async()=>{
  const file=$('file').files[0];erase();const token=generation;
  try{validateFile(file);if(await loadBlob(file,file.name,token))status(`${video.duration.toFixed(1)}秒の動画を読み込みました。撮影条件を確認し、解析してください。`);}
  catch(error){if(token!==generation)return;erase();status(error.message);}
};
$('form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;if(isYouTube()&&!await importYouTube())return;if(!url||busy)return;const token=generation;
  video.pause();frames=[];result=null;$('results').hidden=true;draw();lock(true);controller=new AbortController();$('progress').hidden=false;
  try{const analyzed=await analyzeVideo(video,(value,text)=>{if(token!==generation)return;$('progress').value=value;status(text);},controller.signal);if(token!==generation)return;frames=analyzed.frames;result=evaluate(frames,{foot:$('foot').value,direction:$('direction').value,goal:$('goal').value,aspect:video.videoWidth/video.videoHeight},analyzed.elapsed);renderResult();await seek(video,result.phases[0]?.time??0);status(result.issues.length?'撮影条件を見直してください。動画は再選択して解析できます。':'解析が完了しました。候補の場面を動画で確認してください。');}
  catch(error){if(token===generation)status(error.message);}
  finally{if(token===generation){controller=null;lock(false);$('progress').hidden=true;}}
};
function element(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
function jumpButton(label,time){const button=element('button',`${label} · ${time.toFixed(2)}秒`,'secondary');button.type='button';button.onclick=async()=>{video.pause();try{await seek(video,time);draw();$('preview').scrollIntoView({behavior:'smooth',block:'nearest'});}catch(error){status(error.message);}};return button;}
function renderResult(){const root=$('results');root.replaceChildren();root.hidden=false;$('result-empty').hidden=true;root.append(element('div','OBSERVATION NOTE','eyebrow'),element('h2',result.issues.length?'再撮影のポイント':'次の一本で試すこと'));root.append(element('p',`処理 ${result.elapsed.toFixed(1)}秒 / ${result.frameCount}フレーム / 外部有料API費用 0円`,'muted'));
  const ball=result.ball;root.append(element('p',ball.detectedFrames?`ボール候補を ${ball.detectedFrames} / ${ball.totalFrames} フレームで検出${ball.multipleFrames?'（複数候補の場面あり）':''}`:'ボール未検出：ボールが大きく映る動画で再試行してください。',ball.detectedFrames?'ball-summary':'warning'));if(ball.bestTime!==null)root.append(jumpButton('ボールの検出場面',ball.bestTime));
  if(sourceInfo){const note=element('p',`表示時刻は切り出した動画内の時刻です。元動画の${sourceInfo.start}秒から開始しています。 `,'muted');const link=element('a','YouTubeの元動画を見る');link.href=`${sourceInfo.url}&t=${sourceInfo.start}s`;link.target='_blank';link.rel='noopener noreferrer';note.append(link);root.append(note);}
  if(result.issues.length){for(const issue of result.issues)root.append(element('p',issue,'warning'));}
  else {root.append(element('p','場面は蹴り足の動きから抽出した候補です。軸足の接地やボールとの接触を確定したものではありません。','muted'));const phases=element('div',null,'phases');for(const phase of result.phases)phases.append(jumpButton(phase.label,phase.time));root.append(phases);const cards=element('div',null,'cards');result.advice.forEach((advice,index)=>{const card=element('article',null,'advice');card.append(element('div',`0${index+1}`,'number'),element('h3',advice.title));for(const [label,text] of [['観察結果',advice.observation],['次に試す動作',advice.change],['練習方法',advice.drill]])card.append(element('h4',label),element('p',text));card.append(jumpButton('根拠の場面を見る',advice.time),element('p',`確かさ：${advice.certainty}`,'muted'));cards.append(card);});root.append(cards);}
  const limits=element('details',null,'limits');limits.append(element('summary','確かさ・分析の限界'));for(const limitation of result.limits)limits.append(element('p',limitation));root.append(limits);
}
const connections=[[11,12],[11,23],[12,24],[23,24],[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[27,29],[29,31],[24,26],[26,28],[28,30],[30,32]];
function draw(){const canvas=$('overlay');canvas.width=video.videoWidth||640;canvas.height=video.videoHeight||360;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!$('show-pose').checked||!frames.length)return;const frame=frames.reduce((a,b)=>Math.abs(a.time-video.currentTime)<Math.abs(b.time-video.currentTime)?a:b);if(Math.abs(frame.time-video.currentTime)>.18)return;drawBalls(ctx,frame,canvas);if(!frame.pose)return;const pose=frame.pose;ctx.strokeStyle='#c9ff72';ctx.fillStyle='#c9ff72';ctx.lineWidth=Math.max(2,canvas.width/300);const good=p=>p?.visibility>=.65;for(const[a,b]of connections){if(!good(pose[a])||!good(pose[b]))continue;ctx.beginPath();ctx.moveTo(pose[a].x*canvas.width,pose[a].y*canvas.height);ctx.lineTo(pose[b].x*canvas.width,pose[b].y*canvas.height);ctx.stroke();}for(const p of pose){if(!good(p))continue;ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,canvas.width/180,0,Math.PI*2);ctx.fill();}}

function drawBalls(ctx,frame,canvas){
  ctx.strokeStyle='#ffcb58';ctx.lineWidth=Math.max(2,canvas.width/250);ctx.font=`bold ${Math.max(14,canvas.width/45)}px sans-serif`;
  for(const ball of frame.balls??[]){
    const x=ball.x*canvas.width,y=ball.y*canvas.height,w=ball.width*canvas.width,h=ball.height*canvas.height;
    ctx.strokeRect(x,y,w,h);const label=`ボール候補 ${Math.round(ball.score*100)}%`,labelWidth=ctx.measureText(label).width+12,line=Math.max(20,canvas.width/35);
    const labelX=Math.max(0,Math.min(x,canvas.width-labelWidth)),labelY=y>line?y-line:y+h;
    ctx.fillStyle='#ffcb58';ctx.fillRect(labelX,Math.min(labelY,canvas.height-line),labelWidth,line);ctx.fillStyle='#172b20';ctx.fillText(label,labelX+6,Math.min(labelY,canvas.height-line)+line*.75);
  }
}
video.addEventListener('seeked',draw);video.addEventListener('timeupdate',draw);$('show-pose').onchange=draw;
function animate(){if(!video.paused)draw();requestAnimationFrame(animate);}requestAnimationFrame(animate);
window.addEventListener('pagehide',erase);
