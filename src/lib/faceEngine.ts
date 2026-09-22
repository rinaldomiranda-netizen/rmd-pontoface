import * as faceapi from 'face-api.js';

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

export function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const url = '/models';
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(url);
    } catch (e) { loadingPromise = null; throw new Error('tinyFaceDetector: ' + ((e as any)?.message || e)); }
    try {
      await faceapi.nets.faceLandmark68Net.loadFromUri(url);
    } catch (e) { loadingPromise = null; throw new Error('faceLandmark68Net: ' + ((e as any)?.message || e)); }
    try {
      await faceapi.nets.faceRecognitionNet.loadFromUri(url);
    } catch (e) { loadingPromise = null; throw new Error('faceRecognitionNet: ' + ((e as any)?.message || e)); }
    modelsLoaded = true;
  })();
  return loadingPromise;
}

export function detectorOptions() {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
}

export type DetectionResult = {
  descriptor: Float32Array;
  landmarks: faceapi.FaceLandmarks68;
  box: faceapi.Box;
};

export async function detectFace(input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): Promise<DetectionResult | null> {
  const result = await faceapi
    .detectSingleFace(input, detectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!result) return null;
  return { descriptor: result.descriptor, landmarks: result.landmarks, box: result.detection.box };
}

function dist(a: faceapi.Point, b: faceapi.Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Eye Aspect Ratio: baixo = olho fechado, alto = olho aberto.
export function eyeAspectRatio(eye: faceapi.Point[]): number {
  const a = dist(eye[1], eye[5]);
  const b = dist(eye[2], eye[4]);
  const c = dist(eye[0], eye[3]);
  if (c === 0) return 0;
  return (a + b) / (2 * c);
}

export function averageEAR(landmarks: faceapi.FaceLandmarks68): number {
  const left = eyeAspectRatio(landmarks.getLeftEye());
  const right = eyeAspectRatio(landmarks.getRightEye());
  return (left + right) / 2;
}

// Distância euclidiana entre dois descritores faciais (128 números).
export function descriptorDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}
