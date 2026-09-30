const visible=p=>p&&p.visibility>=.65&&[p.x,p.y].every(Number.isFinite)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
// Contact estimates from 2D landmarks and an elliptical ball outline, not measured surface points.
export function proximity(frame,foot,aspect=1){
  if(frame.people!==1||frame.balls?.length!==1)return null;
  const [heel,toe]=(foot==='right'?[30,32]:[29,31]).map(i=>frame.pose?.[i]);
  if(!visible(heel)||!visible(toe))return null;
  const ball=frame.balls[0];
  if(![ball.x,ball.y,ball.width,ball.height,aspect].every(Number.isFinite)||ball.width<=0||ball.height<=0||aspect<=0)return null;
  const center={x:ball.x+ball.width/2,y:ball.y+ball.height/2};
  const dx=(toe.x-heel.x)*aspect,dy=toe.y-heel.y,length=dx*dx+dy*dy;
  if(length<1e-8)return null;
  const t=Math.max(0,Math.min(1,((center.x-heel.x)*aspect*dx+(center.y-heel.y)*dy)/length));
  const footPoint={x:heel.x+t*(toe.x-heel.x),y:heel.y+t*(toe.y-heel.y)};
  const rx=ball.width/2,ry=ball.height/2;
  let ux=(footPoint.x-center.x)/rx,uy=(footPoint.y-center.y)/ry;
  if(Math.hypot(ux,uy)<1e-8){ux=(heel.x-center.x)/rx;uy=(heel.y-center.y)/ry;}
  const radius=Math.hypot(ux,uy)||1;
  const ballPoint={x:center.x+rx*ux/radius,y:center.y+ry*uy/radius};
  const gap=radius<=1?0:Math.hypot((footPoint.x-ballPoint.x)*aspect,footPoint.y-ballPoint.y);
  return {heel,toe,ball,footPoint,ballPoint,gap,time:frame.time};
}
export function contactWindow(frames,phases,foot,aspect,duration){
  const impact=phases[2]?.time;
  if(!Number.isFinite(impact))return null;
  const candidates=frames.filter(f=>Math.abs(f.time-impact)<=.5).map(f=>proximity(f,foot,aspect)).filter(Boolean);
  const best=candidates.reduce((a,b)=>!a||b.gap<a.gap?b:a,null);
  if(!best||best.gap>.12)return null;
  return {time:best.time,start:Math.max(0,best.time-.5),end:Math.min(duration,best.time+.7),foot};
}
