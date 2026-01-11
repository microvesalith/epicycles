
export interface Point {
  x: number;
  y: number;
}

export interface Complex {
  re: number;
  im: number;
}

export interface Coefficient {
  k: number;
  amp: number;
  phase: number;
  val: Complex;
}

export interface AppState {
  isDrawing: boolean;
  isPlaying: boolean;
  t: number;
  harmonicsK: number;
  samplingN: number;
  speed: number;
  showLabels: boolean;
  useSymmetric: boolean;
  rawStroke: Point[];
  resampledSignal: Complex[];
  coefficients: Coefficient[];
  trail: Point[];
}
