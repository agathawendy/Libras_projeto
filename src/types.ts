export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmarks {
  landmarks: Landmark[];
  handedness: 'Left' | 'Right';
  score: number;
}

export interface LetterReference {
  letter: string;
  description: string;
  tips: string[];
}
