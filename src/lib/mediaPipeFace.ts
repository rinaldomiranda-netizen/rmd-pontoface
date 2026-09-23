import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarkerPromise: Promise<any> | null = null;

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function createLandmarker(): Promise<any> {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.35,
    minFacePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
    outputFaceBlendshapes: true,
  });
}

export function loadMediaPipeFaceLandmarker(): Promise<any> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker().catch((error) => {
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

export function detectBlinkFrame(
  landmarker: any,
  video: HTMLVideoElement,
): { blinkLeft: number; blinkRight: number; blinkScore: number } | null {
  // In the current Web API, VIDEO mode uses the video's current frame time.
  const result = landmarker.detectForVideo(video);
  if (!result?.faceLandmarks?.length) return null;

  const categories = result.faceBlendshapes?.[0] || [];
  const left = Number(categories.find((c: any) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0);
  const right = Number(categories.find((c: any) => c.categoryName === 'eyeBlinkRight')?.score ?? 0);

  return {
    blinkLeft: left,
    blinkRight: right,
    blinkScore: Math.max(left, right),
  };
}
