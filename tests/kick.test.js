import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyKick } from '../src/kick.js';
const frame = (time, y) => ({ time, pose: Array.from({length:33},()=>({x:.5,y,visibility:.99})) });
test('left and right feet describe high and low follow-through with evidence',()=>{
  for(const foot of ['left','right']){
    const options={foot,direction:'side'};
    assert.match(classifyKick(frame(1,.9),frame(2,.7),options,.8).label,/足が上がる/);
    const low=classifyKick(frame(1,.9),frame(2,.88),options,.8);
    assert.match(low.label,/低く/);assert.equal(low.time,2);assert.ok(low.change&&low.drill);
  }
});
test('ambiguous geometry, occlusion and unsupported views abstain',()=>{
  const options={foot:'right',direction:'side'};
  const hidden=frame(2,.7);hidden.pose[28].visibility=.1;
  for(const result of [
    classifyKick(frame(1,.9),frame(2,.82),options,.8),
    classifyKick(frame(1,.9),hidden,options,.8),
    classifyKick(frame(1,.9),frame(2,.7),{...options,direction:'front'},.8),
    classifyKick(frame(1,.9),frame(1,.7),options,.8),
    classifyKick(null,frame(2,.7),options,.8)
  ]) {assert.equal(result.time,null);assert.match(result.label,/判別できません/);}
});
