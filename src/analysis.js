import { summarizeBalls } from './ball.js';
import { classifyKick } from './kick.js';
export const LIMITS = { bytes: 100 * 1024 * 1024, minSeconds: 10, maxSeconds: 30, timeout: 60000, fps: 6 };
export function validateFile(file) {
  if (!file || !/\.(mp4|mov|webm)$/i.test(file.name)) throw new Error('MP4・MOV・WebMの動画を選んでください。');
  if (file.size > LIMITS.bytes || file.size === 0) throw new Error('動画は0MBより大きく、100MB以内にしてください。');
}
export function validateDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < LIMITS.minSeconds || seconds > LIMITS.maxSeconds) throw new Error('10〜30秒の動画を選んでください。');
}
const visible = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.visibility >= .65 && p.x > .02 && p.x < .98 && p.y > .02 && p.y < .98;
const mid = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export function evaluate(frames, options, elapsed) {
  const foot = options.foot === 'right' ? 28 : 27, support = foot === 28 ? 27 : 28;
  // Analyze a continuous action, rather than requiring a tutorial's entire clip to show feet.
  const usable = frames.filter(f => f.pose?.length === 33 && [foot,support].every(i => visible(f.pose[i])) && [11,12].some(i=>visible(f.pose[i])) && [23,24].some(i=>visible(f.pose[i])) && f.people === 1 && f.light>=45 && f.sharpness>=3);
  const issues = [];
  if (usable.length<4) {
    if (frames.some(f => f.people > 1)) issues.push('複数の人物の場面を除外しました。選手1人の蹴る場面を指定してください。');
    if (frames.filter(f=>f.light < 45).length / frames.length > .3) issues.push('暗い場面が多くあります。明るい場所で撮影してください。');
    if (frames.filter(f=>f.sharpness < 3).length / frames.length > .5) issues.push('映像の輪郭が不鮮明です。ピントと固定状態を確認してください。');
    issues.push('足元と胴体を確認できる連続した蹴る場面が不足しています。蹴る場面を含む区間を指定してください。');
  }
  const ball=summarizeBalls(frames);
  const base = { issues, phases: [], advice: [], metrics: null, elapsed, frameCount: frames.length,ball,
    kick: {label:'蹴り方の特徴は判別できません',reason:'撮影条件と蹴り動作を確認できた場合に表示します。',time:null},
    certainty: '未判定', limits: ['身体重心・左右の足への荷重は測定していません。骨盤の動きは重心移動の目安です。',ball.detectedFrames?'ボール候補の位置は検出しましたが、足との接触・足首の向き・ボール速度・パス精度は確定できません。':'ボールは未検出です。画面内で大きく映し、足元の遮蔽・ブレ・明るさを確認してください。接触とボールの動きは判定できません。','ボール検出はスポーツ用ボールの一般モデルによる候補です。スコアは精度や成功確率ではありません。小さいボール・遮蔽・高速移動では見失うことがあります。','関節位置はAIの推定です。場面候補と助言の妥当性は指導者による検証前です。'] };
  if (issues.length) return base;
  let peak = 1, speed = 0;
  for (let i=1;i<usable.length;i++) {
    const dt=usable[i].time-usable[i-1].time;
    if (dt > .4 || dt <= 0) continue;
    const a=usable[i],b=usable[i-1];
    if (distance(mid(a.pose[23],a.pose[24]),mid(b.pose[23],b.pose[24]))>.18) continue;
    const d=distance({x:a.pose[foot].x-a.pose[support].x,y:a.pose[foot].y-a.pose[support].y},{x:b.pose[foot].x-b.pose[support].x,y:b.pose[foot].y-b.pose[support].y})/dt;
    if(d>speed){speed=d;peak=i;}
  }
  if (speed < .08) {base.issues.push('明確な蹴り動作を抽出できませんでした。パス1回を横から撮影してください。');return base;}
  let start=peak-1,end=peak;
  const continuous=(a,b)=>b.time-a.time<=.35&&distance(mid(a.pose[23],a.pose[24]),mid(b.pose[23],b.pose[24]))<=.18;
  while(start>0&&continuous(usable[start-1],usable[start]))start--;
  while(end<usable.length-1&&continuous(usable[end],usable[end+1]))end++;
  const action=usable.slice(start,end+1);
  if(action.length<4){base.issues.push('動きの候補はありますが、前後が短すぎます。蹴る前後が続く区間を指定してください。');return base;}
  base.limits.push(`解析には ${action[0].time.toFixed(2)}〜${action.at(-1).time.toFixed(2)}秒の連続した場面を使用しました。説明・見切れ・複数人物の場面は除外します。カメラの移動は完全には補正できません。`);
  const at = offset => action.reduce((best,f)=>Math.abs(f.time-(usable[peak].time+offset))<Math.abs(best.time-(usable[peak].time+offset))?f:best,action[0]);
  base.phases = [['準備の候補',-.8],['軸足接地付近の候補',-.3],['インパクト付近の候補',0],['蹴り終わりの候補',.5]].map(([label,offset])=>({label,time:at(offset).time,pose:at(offset).pose}));
  const before=at(-.8),impact=at(0),after=at(.5);
  const pelvis = mid(impact.pose[23],impact.pose[24]),shoulder=mid(impact.pose[11],impact.pose[12]);
  const tilt=[11,12,23,24].every(i=>visible(impact.pose[i]))?Math.atan2(Math.abs(shoulder.x-pelvis.x)*options.aspect,Math.abs(shoulder.y-pelvis.y))*180/Math.PI:null;
  const height=Math.abs(before.pose[0].y-mid(before.pose[27],before.pose[28]).y);
  if (!visible(before.pose[0]) || height < .15) {base.issues.push('頭の位置を確認できず、移動量を正規化できません。全身を撮り直してください。');base.phases=[];return base;}
  const shift=(mid(after.pose[23],after.pose[24]).x-mid(before.pose[23],before.pose[24]).x)*options.aspect/height;
  const supportMove=distance({x:before.pose[support].x*options.aspect,y:before.pose[support].y},{x:impact.pose[support].x*options.aspect,y:impact.pose[support].y})/height;
  const kickMove=distance({x:before.pose[foot].x*options.aspect,y:before.pose[foot].y},{x:after.pose[foot].x*options.aspect,y:after.pose[foot].y})/height;
  base.metrics={tilt,shift,supportMove,kickMove};base.certainty='参考（可視性条件を通過・精度未検証）';
  const add=(title,observation,change,drill,time)=>base.advice.push({title,observation,change,drill,time,certainty:base.certainty});
  base.kick=classifyKick(before,after,options,height);
  base.limits.push('蹴り方の分類は画面上の足首の上昇量による暫定ルールです。インサイド・インステップ・アウトサイド・トーキックの接触面は自動判別できません。分類境界と助言は指導者による検証前です。');
  if(base.kick.time!==null) add('今の振り抜きに合わせて試す',base.kick.reason,base.kick.change,base.kick.drill,base.kick.time);
  if(tilt>15) add('体幹の傾きを振り返る',`動作候補の時点で、画面上の体幹が鉛直から約${tilt.toFixed(0)}°傾いています。`,'狙う方向を確認し、上体の傾きを小さくするパスと今のパスを試して比べてください。','静止球を同じ目標へ5本ずつパスし、上体を起こした場合の蹴りやすさを比べます。',impact.time);
  if(options.direction==='side'&&[before,after].every(f=>[23,24].every(i=>visible(f.pose[i])))) add('骨盤の移動を確かめる',`準備候補から蹴り終わり候補まで、骨盤は画面の${shift>=0?'右':'左'}へ身長の目安の約${Math.abs(shift*100).toFixed(0)}%移動しました。`,'目標へ向かう動きか動画で確認し、蹴った後に一歩進める姿勢を試してください。荷重の大小は判断できません。','同じ距離・同じ目標へパスを5回。蹴り終わりで無理なくバランスを保てるか確認します。',after.time);
  add('軸足と蹴り足を見比べる',`画面内の移動量は、軸足が身長の目安の約${(supportMove*100).toFixed(0)}%、蹴り足が約${(kickMove*100).toFixed(0)}%でした。接地や接触は確認できません。`,'動画で軸足の置き場所を確認し、同じ位置に置く練習を試してください。','ボールの横に目印を置き、軸足を置いて止まる動作を5回。その後、力を抑えてパスを5回。',impact.time);
  if(options.goal==='accuracy') base.advice.forEach(a=>a.drill+=' 目標を設置して到達位置を自分で記録してください。');
  base.advice=base.advice.slice(0,3);
  return base;
}
