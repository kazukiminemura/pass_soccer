// Bounding boxes are normalized to the original frame, including cropped detections.
export function normalizeBalls(detections, width, height, region = {x:0,y:0,width:1,height:1}) {
  const balls=[];
  for(const detection of detections) {
    const category=detection.categories?.find(c=>c.categoryName==='sports ball' && c.score>=.3);
    const b=detection.boundingBox;
    if(!category || !b || ![b.originX,b.originY,b.width,b.height,category.score].every(Number.isFinite) || b.width<=0 || b.height<=0)continue;
    const x=Math.max(0,region.x+b.originX/width*region.width),y=Math.max(0,region.y+b.originY/height*region.height);
    const right=Math.min(1,region.x+(b.originX+b.width)/width*region.width),bottom=Math.min(1,region.y+(b.originY+b.height)/height*region.height);
    if(right>x&&bottom>y)balls.push({x,y,width:right-x,height:bottom-y,score:category.score});
  }
  return balls;
}
export function mergeBalls(balls) {
  return [...balls].sort((a,b)=>b.score-a.score).filter((box,index,all)=>!all.slice(0,index).some(other=>{
    const overlap=Math.max(0,Math.min(box.x+box.width,other.x+other.width)-Math.max(box.x,other.x))*Math.max(0,Math.min(box.y+box.height,other.y+other.height)-Math.max(box.y,other.y));
    return overlap/(box.width*box.height+other.width*other.height-overlap)>.3;
  }));
}
export function footRegion(pose) {
  const points=[25,26,27,28,31,32].map(i=>pose?.[i]).filter(p=>p?.visibility>=.65&&Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(points.length<4)return null;
  const x=Math.max(0,Math.min(...points.map(p=>p.x))-.25),y=Math.max(0,Math.min(...points.map(p=>p.y))-.08);
  const right=Math.min(1,Math.max(...points.map(p=>p.x))+.25),bottom=Math.min(1,Math.max(...points.map(p=>p.y))+.12);
  return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
}
export function summarizeBalls(frames) {
  const detected=frames.filter(f=>f.balls?.length),best=detected.reduce((a,b)=>!a||Math.max(...b.balls.map(v=>v.score))>Math.max(...a.balls.map(v=>v.score))?b:a,null);
  return {detectedFrames:detected.length,totalFrames:frames.length,multipleFrames:detected.filter(f=>f.balls.length>1).length,bestTime:best?.time??null};
}
