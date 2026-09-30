import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proximity,contactWindow} from '../src/contact.js';
const frame=(time=1)=>{const pose=Array.from({length:33},()=>({x:.5,y:.8,visibility:.99}));for(const i of [29,30])pose[i].x=.4;return {time,people:1,pose,balls:[{x:.49,y:.78,width:.04,height:.04,score:.8}]};};
test('projects closest locations for either foot and bounds replay to video',()=>{
  for(const foot of ['right','left']){const p=proximity(frame(),foot,16/9);assert.ok(p);assert.equal(p.gap,0);assert.equal(p.footPoint.x,.5);assert.ok(Math.abs(p.ballPoint.x-.49)<1e-8);assert.ok(Math.abs(((p.ballPoint.x-.51)/.02)**2+((p.ballPoint.y-.8)/.02)**2-1)<1e-8);const window=contactWindow([frame(.1)],[{},{},{time:.1}],foot,1,1);assert.equal(window.start,0);assert.ok(window.end<=1);}
});
test('missing or ambiguous detections do not fabricate contact markers',()=>{
  for(const change of [f=>f.balls=[],f=>f.balls.push({...f.balls[0]}),f=>f.pose[32].visibility=.1,f=>f.people=2,f=>f.balls[0].width=NaN]){const data=frame();change(data);assert.equal(proximity(data,'right'),null);assert.equal(contactWindow([data],[{},{},{time:1}],'right',1,10),null);}
  const distant=frame();distant.balls[0].y=.1;assert.equal(contactWindow([distant],[{},{},{time:1}],'right',1,10),null);
  assert.equal(contactWindow([frame()],[],'right',1,10),null);
});
