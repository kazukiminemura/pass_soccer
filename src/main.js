import './style.css';
import {dashboard} from './dashboard.js';
import {validateFile,validateDuration,evaluate} from './analysis.js';
import {waitEvent,seek,analyzeVideo} from './video.js';
import {validateYouTubeRequest} from './youtube.js';
import {contactWindow,proximity} from './contact.js';

document.querySelector('#app').innerHTML=dashboard;
const $=id=>document.getElementById(id),video=$('video');
let url,frames=[],result,controller,busy=false,generation=0,sourceInfo=null;
let replay=null;
function stopReplay(){replay=null;video.playbackRate=1;document.getElementById('contact-play')?.setAttribute('aria-pressed','false');const button=document.getElementById('contact-play');if(button)button.textContent='0.25倍で繰り返す';}
const status=text=>$('status').textContent=text;
const isYouTube=()=>$('source-youtube').getAttribute('aria-pressed')==='true';
$('youtube-url').oninput=()=>lock(false);
function erase(){stopReplay();generation++;controller?.abort();controller=null;video.pause();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);url=null;frames=[];result=null;sourceInfo=null;$('file').value='';$('video-empty').hidden=false;$('result-empty').hidden=false;$('filename').textContent='動画を選択する';$('preview').hidden=true;$('results').hidden=true;$('results').replaceChildren();$('progress').hidden=true;$('analyze').disabled=true;busy=false;lock(false);draw();}
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
  stopReplay();video.pause();frames=[];result=null;$('results').hidden=true;draw();lock(true);controller=new AbortController();$('progress').hidden=false;
  try{const analyzed=await analyzeVideo(video,(value,text)=>{if(token!==generation)return;$('progress').value=value;status(text);},controller.signal);if(token!==generation)return;frames=analyzed.frames;result=evaluate(frames,{foot:$('foot').value,direction:$('direction').value,goal:$('goal').value,aspect:video.videoWidth/video.videoHeight},analyzed.elapsed);renderResult();const contact=contactWindow(frames,result.phases,$('foot').value,video.videoWidth/video.videoHeight,video.duration);await seek(video,contact?.time??result.phases[0]?.time??0);draw();status(result.issues.length?'撮影条件を見直してください。動画は再選択して解析できます。':'解析が完了しました。候補の場面を動画で確認してください。');}
  catch(error){if(token===generation)status(error.message);}
  finally{if(token===generation){controller=null;lock(false);$('progress').hidden=true;}}
};
function element(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
function jumpButton(label,time){const button=element('button',`${label} · ${time.toFixed(2)}秒`,'secondary');button.type='button';button.onclick=async()=>{stopReplay();video.pause();try{await seek(video,time);draw();$('preview').scrollIntoView({behavior:'smooth',block:'nearest'});}catch(error){status(error.message);}};return button;}
function pointList(points){const list=element('ul',null,'result-points');for(const [label,text] of points){const item=element('li');item.append(element('strong',`${label}：`),document.createTextNode(text));list.append(item);}return list;}
function renderResult(){const root=$('results');root.replaceChildren();root.hidden=false;$('result-empty').hidden=true;root.append(element('h2','分析結果のポイント'));
  renderContact(root);
  const ball=result.ball;
  const points=[['ボール',ball.detectedFrames?`候補を ${ball.detectedFrames} / ${ball.totalFrames} フレームで検出しました。`:'検出できませんでした。ボールが大きく映る動画で再試行してください。'],['蹴り方',result.kick.time===null?'判別できませんでした。':result.kick.label]];
  if(result.issues.length){points.push(['判別できない理由',result.issues.join(' ')],['改善点','今回の映像では、フォームの改善点を判断できません。'],['次にすること','選手1人の全身・足元・ボールが映る、明るく鮮明な横方向の固定映像で、パス1回を含む区間を選んで再解析してください。']);}
  else if(result.kick.time===null){points.push(['判別できない理由',result.kick.reason]);}
  points.push(['接触面','インサイド・インステップなどの種類は、この解析では判別できません。']);root.append(pointList(points));
  const evidence=element('details',null,'limits');evidence.append(element('summary','根拠の場面・検出の詳細'),element('p',`処理 ${result.elapsed.toFixed(1)}秒 / ${result.frameCount}フレーム / 外部有料API費用 0円`,'muted'),element('p',result.kick.reason,'muted'));if(ball.multipleFrames)evidence.append(element('p','ボール候補が複数ある場面が含まれています。','muted'));if(ball.bestTime!==null)evidence.append(jumpButton('ボールの検出場面',ball.bestTime));if(result.kick.time!==null)evidence.append(jumpButton('蹴り方の根拠を見る',result.kick.time));root.append(evidence);
  if(sourceInfo){const note=element('p',`表示時刻は切り出した動画内の時刻です。元動画の${sourceInfo.start}秒から開始しています。 `,'muted');const link=element('a','YouTubeの元動画を見る');link.href=`${sourceInfo.url}&t=${sourceInfo.start}s`;link.target='_blank';link.rel='noopener noreferrer';note.append(link);root.append(note);}
  if(!result.issues.length){root.append(element('h3','次の練習で試すこと'));const phases=element('div',null,'phases');for(const phase of result.phases)phases.append(jumpButton(phase.label,phase.time));evidence.append(element('p','場面は動作の候補です。軸足の接地やボールとの接触は確定していません。','muted'),phases);const cards=element('div',null,'cards');result.advice.forEach((advice,index)=>{const card=element('article',null,'advice');card.append(element('div',`0${index+1}`,'number'),element('h3',advice.title),pointList([['見えた動き',advice.observation],['試すこと',advice.change],['練習',advice.drill]]),jumpButton('根拠の場面を見る',advice.time));const certainty=element('details',null,'limits');certainty.append(element('summary','この助言の確かさ'),element('p',advice.certainty));card.append(certainty);cards.append(card);});root.append(cards);}
  const limits=element('details',null,'limits');limits.append(element('summary','確かさ・分析の限界'));for(const limitation of result.limits)limits.append(element('p',limitation));root.append(limits);
}
function renderContact(root){
  const window=contactWindow(frames,result.phases,$('foot').value,video.videoWidth/video.videoHeight,video.duration);
  const section=element('section',null,'contact-view');section.append(element('h3','推定接触位置 · 足とボール'));root.append(section);
  if(!window){section.append(element('p','近接する足先とボールを同時に確認できません。検出できない位置に接触点は表示しません。','muted'));return;}
  const canvas=element('canvas');canvas.id='contact-canvas';canvas.width=640;canvas.height=260;canvas.setAttribute('aria-label','足先とボール候補の拡大映像');section.append(canvas);
  const controls=element('div',null,'phases'),play=element('button','0.25倍で繰り返す','secondary');play.id='contact-play';play.type='button';play.setAttribute('aria-pressed','false');
  play.onclick=async()=>{if(replay){stopReplay();video.pause();return;}const token=generation;replay=window;play.textContent='停止する';play.setAttribute('aria-pressed','true');video.playbackRate=.25;try{await seek(video,window.start);if(token!==generation||replay!==window)return;await video.play();}catch(error){if(token===generation){stopReplay();status(error.message);}}};
  controls.append(play,jumpButton('推定接触の場面',window.time));section.append(controls,element('p','青：足の推定接触位置 / 黄：ボールの推定接触位置。足の推定線とボールの推定輪郭の近さから算出しています。実際の接触点とはずれる可能性があります（検出は毎秒6回）。','muted'));
}
function drawContact(frame){
  const canvas=$('contact-canvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#15231b';ctx.fillRect(0,0,canvas.width,canvas.height);
  const candidate=Math.abs(frame.time-video.currentTime)<=.09?proximity(frame,$('foot').value,video.videoWidth/video.videoHeight):null;
  if(!candidate){ctx.fillStyle='white';ctx.font='18px sans-serif';ctx.fillText('この時刻では足先・ボールを同時に確認できません',18,130);return;}
  const {heel,toe,ball,footPoint,ballPoint}=candidate,w=video.videoWidth,h=video.videoHeight;
  const xs=[heel.x,toe.x,ball.x,ball.x+ball.width],ys=[heel.y,toe.y,ball.y,ball.y+ball.height];
  const centerX=(Math.min(...xs)+Math.max(...xs))/2*w,centerY=(Math.min(...ys)+Math.max(...ys))/2*h;
  const cropWidth=Math.min(w,Math.max((Math.max(...xs)-Math.min(...xs))*w+60,((Math.max(...ys)-Math.min(...ys))*h+60)*canvas.width/canvas.height));
  const cropHeight=cropWidth*canvas.height/canvas.width;
  const x=Math.max(0,Math.min(w-cropWidth,centerX-cropWidth/2)),y=Math.max(0,Math.min(h-cropHeight,centerY-cropHeight/2));
  ctx.drawImage(video,x,y,cropWidth,cropHeight,0,0,canvas.width,canvas.height);
  const project=p=>({x:(p.x*w-x)/cropWidth*canvas.width,y:(p.y*h-y)/cropHeight*canvas.height});
  const a=project(heel),b=project(toe),f=project(footPoint),c=project(ballPoint),box=project(ball);
  ctx.strokeStyle='#58caff';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  ctx.strokeStyle='#ffcb58';ctx.strokeRect(box.x,box.y,ball.width*w/cropWidth*canvas.width,ball.height*h/cropHeight*canvas.height);
  if(candidate.gap<=.12){ctx.strokeStyle='white';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(c.x,c.y);ctx.stroke();ctx.setLineDash([]);for(const [point,color,label,offset] of [[f,'#58caff','足の推定接触位置',-35],[c,'#ffcb58','ボールの推定接触位置',15]]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(point.x,point.y,7,0,Math.PI*2);ctx.fill();ctx.font='bold 14px sans-serif';const labelWidth=ctx.measureText(label).width+12,labelX=Math.max(0,Math.min(canvas.width-labelWidth,point.x-30)),labelY=Math.max(32,Math.min(canvas.height-24,point.y+offset));ctx.fillRect(labelX,labelY,labelWidth,24);ctx.fillStyle='#15231b';ctx.fillText(label,labelX+6,labelY+17);}}
  ctx.fillStyle='#15231bdd';ctx.fillRect(0,0,250,30);ctx.fillStyle='white';ctx.font='16px sans-serif';ctx.fillText(`${candidate.gap<=.12?'推定接触位置':'足先とボール'} · ${frame.time.toFixed(2)}秒`,12,21);
}
const connections=[[11,12],[11,23],[12,24],[23,24],[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[27,29],[29,31],[24,26],[26,28],[28,30],[30,32]];
function draw(){const canvas=$('overlay');canvas.width=video.videoWidth||640;canvas.height=video.videoHeight||360;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!frames.length)return;const frame=frames.reduce((a,b)=>Math.abs(a.time-video.currentTime)<Math.abs(b.time-video.currentTime)?a:b);drawContact(frame);if(!$('show-pose').checked||Math.abs(frame.time-video.currentTime)>.18)return;drawBalls(ctx,frame,canvas);if(!frame.pose)return;const pose=frame.pose;ctx.strokeStyle='#c9ff72';ctx.fillStyle='#c9ff72';ctx.lineWidth=Math.max(2,canvas.width/300);const good=p=>p?.visibility>=.65;for(const[a,b]of connections){if(!good(pose[a])||!good(pose[b]))continue;ctx.beginPath();ctx.moveTo(pose[a].x*canvas.width,pose[a].y*canvas.height);ctx.lineTo(pose[b].x*canvas.width,pose[b].y*canvas.height);ctx.stroke();}for(const p of pose){if(!good(p))continue;ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,canvas.width/180,0,Math.PI*2);ctx.fill();}}

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
function animate(){if(replay&&!video.paused&&video.currentTime>=replay.end)video.currentTime=replay.start;if(!video.paused)draw();requestAnimationFrame(animate);}requestAnimationFrame(animate);
video.addEventListener('ended',()=>{if(replay){video.currentTime=replay.start;video.play().catch(()=>stopReplay());}});
window.addEventListener('pagehide',erase);
