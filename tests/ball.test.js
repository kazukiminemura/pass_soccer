import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBalls,mergeBalls,footRegion,summarizeBalls } from '../src/ball.js';
const detection=(label='sports ball',score=.8)=>({categories:[{categoryName:label,score}],boundingBox:{originX:20,originY:30,width:20,height:20}});
test('crop boxes map to original frame and only sports ball is accepted',()=>{
  const [b]=normalizeBalls([detection()],100,100,{x:.2,y:.4,width:.5,height:.5});
  assert.ok(Math.abs(b.x-.3)<1e-9);assert.equal(b.y,.55);assert.ok(Math.abs(b.width-.1)<1e-9);
  assert.equal(normalizeBalls([detection('person'),detection('sports ball',.1)],100,100).length,0);
  assert.equal(normalizeBalls([{...detection(),boundingBox:{originX:NaN,originY:0,width:1,height:1}}],100,100).length,0);
});
test('merge repeated detections without inventing balls in missing frames',()=>{
  const balls=normalizeBalls([detection()],100,100);
  assert.equal(mergeBalls([...balls,{...balls[0],score:.5}]).length,1);
  assert.equal(mergeBalls([...balls,{...balls[0],x:.8}]).length,2);
  assert.equal(footRegion(null),null);
  const report=summarizeBalls([{time:0,balls},{time:1,balls:[]},{time:2,balls:[{...balls[0],score:.9}]}]);
  assert.equal(report.detectedFrames,2);assert.equal(report.bestTime,2);assert.equal(summarizeBalls([]).bestTime,null);
});
