import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export type BlinkFrame = {
  blinkLeft: number;
  blinkRight: number;
  blinkScore: number;
};

async function createLandmarker(): Promise<FaceLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.35,
    minFacePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
}

export function loadMediaPipeFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker().catch(error => {
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

export async function detectBlinkFrame(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestampMs: number
): Promise<BlinkFrame | null> {
  const result = landmarker.detectForVideo(video, timestampMs);
  if (!result.faceLandmarks?.length) return null;

  const categories = result.faceBlendshapes?.[0] || [];
  const left = categories.find(c => c.categoryName === 'eyeBlinkLeft')?.score ?? 0;
  const right = categories.find(c => c.categoryName === 'eyeBlinkRight')?.score ?? 0;

  return {
    blinkLeft: left,
    blinkRight: right,
    blinkScore: Math.max(left, right),
  };
}
