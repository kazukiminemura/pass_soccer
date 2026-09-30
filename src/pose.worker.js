import { FilesetResolver, PoseLandmarker, ObjectDetector } from '@mediapipe/tasks-vision';
import { normalizeBalls, mergeBalls, footRegion } from './ball.js';
let detector,ballDetector;
self.onmessage = async ({data}) => {
  try {
    if(data.type==='init') {
      const files = await FilesetResolver.forVisionTasks('/models/wasm');
      detector = await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'/models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6});
      ballDetector = await ObjectDetector.createFromOptions(files,{baseOptions:{modelAssetPath:'/models/efficientdet_lite0.tflite',delegate:'CPU'},runningMode:'IMAGE',categoryAllowlist:['sports ball'],scoreThreshold:.3,maxResults:10});
      self.postMessage({type:'ready'});
    } else {
      try {
        const result=detector.detectForVideo(data.bitmap,data.timestamp);
        const pose=result.landmarks[0]??null,width=data.bitmap.width,height=data.bitmap.height;
        const balls=normalizeBalls(ballDetector.detect(data.bitmap).detections,width,height);
        // A second crop keeps small balls near the feet larger at the model input.
        const region=footRegion(pose);
        if(region){
          const crop=new OffscreenCanvas(Math.max(1,Math.round(region.width*width)),Math.max(1,Math.round(region.height*height)));
          crop.getContext('2d').drawImage(data.bitmap,region.x*width,region.y*height,region.width*width,region.height*height,0,0,crop.width,crop.height);
          balls.push(...normalizeBalls(ballDetector.detect(crop).detections,crop.width,crop.height,region));
        }
        self.postMessage({type:'pose',pose,people:result.landmarks.length,balls:mergeBalls(balls)});
      } finally {data.bitmap.close();}
    }
  } catch(error) {console.error('Pose worker:',error);self.postMessage({type:'error',message:error.message});}
};
