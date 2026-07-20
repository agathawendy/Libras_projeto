import { Landmark } from './types';

// Helper to calculate 3D Euclidean distance
export function distance(p1: Landmark, p2: Landmark): number {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow(p1.z - p2.z, 2)
  );
}

// Calculate angle between three points (p1-p2-p3, where p2 is the vertex)
export function calculateAngle(p1: Landmark, p2: Landmark, p3: Landmark): number {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };

  const dotProduct = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

  if (len1 === 0 || len2 === 0) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dotProduct / (len1 * len2)));
  return Math.acos(cosTheta) * (180 / Math.PI);
}

// Classify the Libras letter based on landmarks
export function classifyLibras(landmarks: Landmark[]): { letter: string; confidence: number; debugInfo: any } {
  if (!landmarks || landmarks.length < 21) {
    return { letter: '?', confidence: 0, debugInfo: null };
  }

  // 0: Wrist
  const wrist = landmarks[0];

  // Palm scale (wrist to middle finger MCP)
  const palmScale = distance(wrist, landmarks[9]);
  if (palmScale === 0) return { letter: '?', confidence: 0, debugInfo: null };

  // Calculate finger extensions
  // Extension ratio: distance(tip, mcp) / (distance(pip, mcp) + distance(tip, pip))
  // Highly stable against depth perspective changes
  const getFingerRatio = (tip: number, pip: number, mcp: number) => {
    const dTipMcp = distance(landmarks[tip], landmarks[mcp]);
    const dPipMcp = distance(landmarks[pip], landmarks[mcp]);
    const dTipPip = distance(landmarks[tip], landmarks[pip]);
    return dTipMcp / (dPipMcp + dTipPip);
  };

  const ratioIndex = getFingerRatio(8, 6, 5);
  const ratioMiddle = getFingerRatio(12, 10, 9);
  const ratioRing = getFingerRatio(16, 14, 13);
  const ratioPinky = getFingerRatio(20, 18, 17);

  // Thumb state
  // Check distance from thumb tip (4) to index MCP (5) and wrist (0)
  const dThumbIndexMcp = distance(landmarks[4], landmarks[5]) / palmScale;
  const dThumbPinkyMcp = distance(landmarks[4], landmarks[17]) / palmScale;
  const dThumbWrist = distance(landmarks[4], wrist) / palmScale;
  
  // Thumb angle relative to hand
  const thumbAngle = calculateAngle(landmarks[4], landmarks[2], landmarks[5]);

  // Finger states
  const extIndex = ratioIndex > 0.78;
  const extMiddle = ratioMiddle > 0.78;
  const extRing = ratioRing > 0.78;
  const extPinky = ratioPinky > 0.78;

  const closedIndex = ratioIndex < 0.45;
  const closedMiddle = ratioMiddle < 0.45;
  const closedRing = ratioRing < 0.45;
  const closedPinky = ratioPinky < 0.45;

  const curvedIndex = !extIndex && !closedIndex;
  const curvedMiddle = !extMiddle && !closedMiddle;
  const curvedRing = !extRing && !closedRing;
  const curvedPinky = !extPinky && !closedPinky;

  // Let's check thumb extension
  // If it is extended outward
  const extThumb = dThumbIndexMcp > 1.0 || thumbAngle > 35;
  const closedThumb = dThumbIndexMcp < 0.65;

  // Distances between fingertips
  const dIndexMiddleTips = distance(landmarks[8], landmarks[12]) / palmScale;
  const dMiddleRingTips = distance(landmarks[12], landmarks[16]) / palmScale;
  const dRingPinkyTips = distance(landmarks[16], landmarks[20]) / palmScale;

  // Is index and middle crossed? (Letter R)
  // If crossed, index tip is to the right of middle tip (or left depending on hand)
  // And they are very close together
  const dIndexMiddleMcp = distance(landmarks[5], landmarks[9]) / palmScale;
  // If tips are closer than MCPs, they are crossed or touching
  const isCrossedIndexMiddle = dIndexMiddleTips < 0.25 && (landmarks[8].x > landmarks[12].x === landmarks[5].x < landmarks[9].x);

  // Hand orientation vectors
  // y-axis in MediaPipe goes DOWNWARDS
  const isHandUpright = landmarks[9].y < wrist.y; // Middle finger MCP above wrist
  const isHandHorizontal = Math.abs(landmarks[9].y - wrist.y) < Math.abs(landmarks[9].x - wrist.x);
  const isPointingDown = landmarks[9].y > wrist.y;

  let letter = '?';
  let confidence = 0.5;

  // --- RECONHECIMENTO DE LETRAS (LIBRAS ALPHABET RULES) ---

  // 1. Letra B: Todas as 4 pontas de dedos estendidas e juntas, polegar dobrado
  if (extIndex && extMiddle && extRing && extPinky && closedThumb) {
    letter = 'B';
    confidence = 0.95;
  }
  // 2. Letra U: Indicador e Médio estendidos e colados, Anelar e Mínimo fechados
  else if (extIndex && extMiddle && closedRing && closedPinky && dIndexMiddleTips < 0.35) {
    letter = 'U';
    confidence = 0.90;
  }
  // 3. Letra V: Indicador e Médio estendidos e afastados (V), Anelar e Mínimo fechados
  else if (extIndex && extMiddle && closedRing && closedPinky && dIndexMiddleTips >= 0.35) {
    letter = 'V';
    confidence = 0.92;
  }
  // 4. Letra W: Indicador, Médio e Anelar estendidos e separados, Mínimo fechado
  else if (extIndex && extMiddle && extRing && closedPinky) {
    letter = 'W';
    confidence = 0.92;
  }
  // 5. Letra I: Apenas Mínimo estendido, outros fechados
  else if (closedIndex && closedMiddle && closedRing && extPinky && !extThumb) {
    letter = 'I';
    confidence = 0.90;
  }
  // 6. Letra Y: Mínimo e Polegar estendidos, outros fechados (Hang Loose)
  else if (closedIndex && closedMiddle && closedRing && extPinky && extThumb) {
    letter = 'Y';
    confidence = 0.95;
  }
  // 7. Letra L: Indicador estendido para cima, Polegar estendido para o lado, outros fechados
  else if (extIndex && closedMiddle && closedRing && closedPinky && extThumb && dThumbIndexMcp > 0.8) {
    letter = 'L';
    confidence = 0.95;
  }
  // 8. Letra F: Indicador dobrado tocando o polegar, outros 3 dedos estendidos para cima
  // No F, o polegar fica por fora do indicador
  else if (closedIndex && extMiddle && extRing && extPinky && dThumbIndexMcp < 0.6) {
    letter = 'F';
    confidence = 0.88;
  }
  // 9. Letra T: Parecido com o F, mas o polegar fica por dentro do indicador
  else if (closedIndex && extMiddle && extRing && extPinky && dThumbIndexMcp >= 0.6 && dThumbIndexMcp < 0.9) {
    letter = 'T';
    confidence = 0.85;
  }
  // 10. Letra D: Indicador estendido para cima, outros 3 dedos fechados em círculo tocando o polegar
  else if (extIndex && closedMiddle && closedRing && closedPinky && dThumbIndexMcp < 0.5) {
    letter = 'D';
    confidence = 0.90;
  }
  // 11. Letra R: Indicador e Médio estendidos e cruzados
  else if (extIndex && extMiddle && closedRing && closedPinky && isCrossedIndexMiddle) {
    letter = 'R';
    confidence = 0.88;
  }
  // 12. Letra A: Punho fechado, polegar encostado na lateral do indicador
  else if (closedIndex && closedMiddle && closedRing && closedPinky && dThumbIndexMcp < 0.6 && landmarks[4].x < landmarks[5].x) {
    letter = 'A';
    confidence = 0.85;
  }
  // 13. Letra S: Punho fechado, polegar dobrado na frente dos outros dedos
  else if (closedIndex && closedMiddle && closedRing && closedPinky && dThumbIndexMcp < 0.5 && landmarks[4].x >= landmarks[5].x) {
    letter = 'S';
    confidence = 0.85;
  }
  // 14. Letra C: Dedos curvados formando um semicírculo
  else if (curvedIndex && curvedMiddle && curvedRing && curvedPinky && dThumbIndexMcp > 0.5) {
    letter = 'C';
    confidence = 0.88;
  }
  // 15. Letra O: Dedos curvados com todas as pontas tocando o polegar (círculo fechado)
  else if (curvedIndex && curvedMiddle && curvedRing && curvedPinky && dThumbIndexMcp < 0.4) {
    letter = 'O';
    confidence = 0.90;
  }
  // 16. Letra G: Indicador estendido para cima, Polegar estendido paralelo, outros fechados (apontando)
  else if (extIndex && closedMiddle && closedRing && closedPinky && extThumb && dThumbIndexMcp < 0.8) {
    letter = 'G';
    confidence = 0.85;
  }
  // 17. Letra Q: Indicador e Polegar apontando para baixo, outros fechados
  else if (closedMiddle && closedRing && closedPinky && isPointingDown && dThumbIndexMcp < 0.8) {
    letter = 'Q';
    confidence = 0.85;
  }
  // 18. Letra M: Dedos Indicador, Médio e Anelar apontados para baixo, mínimo fechado
  else if (ratioIndex < 0.55 && ratioMiddle < 0.55 && ratioRing < 0.55 && closedPinky && isPointingDown) {
    letter = 'M';
    confidence = 0.85;
  }
  // 19. Letra N: Dedos Indicador e Médio apontados para baixo, outros fechados
  else if (ratioIndex < 0.55 && ratioMiddle < 0.55 && closedRing && closedPinky && isPointingDown) {
    letter = 'N';
    confidence = 0.85;
  }
  // 20. Letra H: Indicador e Médio estendidos horizontalmente com o polegar entre eles
  else if (extIndex && extMiddle && closedRing && closedPinky && isHandHorizontal) {
    letter = 'H';
    confidence = 0.82;
  }
  // 21. Letra K: Indicador e Médio estendidos em V, polegar tocando entre eles, movimento para cima
  else if (extIndex && extMiddle && closedRing && closedPinky && !isHandHorizontal && dThumbIndexMcp > 0.4 && dThumbIndexMcp < 0.7) {
    letter = 'K';
    confidence = 0.80;
  }
  // 22. Letra P: Mesma configuração do K ou H mas apontado para baixo ou na horizontal
  else if (extIndex && extMiddle && closedRing && closedPinky && isPointingDown && dThumbIndexMcp > 0.4) {
    letter = 'P';
    confidence = 0.80;
  }
  // 23. Letra X: Indicador flexionado (gancho), outros fechados
  else if (curvedIndex && closedMiddle && closedRing && closedPinky) {
    letter = 'X';
    confidence = 0.82;
  }
  // 24. Letra E: Dedos semi-dobrados pressionados contra a palma
  else if (curvedIndex && curvedMiddle && curvedRing && curvedPinky && dThumbIndexMcp < 0.55) {
    letter = 'E';
    confidence = 0.80;
  }
  // Fallback simple heuristics to avoid complete miss
  else {
    // If 4 fingers are closed
    if (closedIndex && closedMiddle && closedRing && closedPinky) {
      if (extThumb) {
        letter = 'A';
      } else {
        letter = 'S';
      }
      confidence = 0.60;
    }
    // If all fingers are open
    else if (extIndex && extMiddle && extRing && extPinky) {
      letter = 'B';
      confidence = 0.60;
    }
    // If index only is open
    else if (extIndex && closedMiddle && closedRing && closedPinky) {
      if (extThumb) {
        letter = 'L';
      } else {
        letter = 'D'; // could be D or Z or G
      }
      confidence = 0.55;
    }
  }

  // Let's bundle some debugging data to render in the UI
  const debugInfo = {
    fingerRatios: {
      Index: ratioIndex.toFixed(2),
      Middle: ratioMiddle.toFixed(2),
      Ring: ratioRing.toFixed(2),
      Pinky: ratioPinky.toFixed(2),
    },
    fingerStates: {
      Index: extIndex ? 'Ext' : (closedIndex ? 'Closed' : 'Curved'),
      Middle: extMiddle ? 'Ext' : (closedMiddle ? 'Closed' : 'Curved'),
      Ring: extRing ? 'Ext' : (closedRing ? 'Closed' : 'Curved'),
      Pinky: extPinky ? 'Ext' : (closedPinky ? 'Closed' : 'Curved'),
      Thumb: extThumb ? 'Ext' : (closedThumb ? 'Closed' : 'Curved'),
    },
    thumbIndexDistance: dThumbIndexMcp.toFixed(2),
    isCrossedIndexMiddle,
    orientation: isHandUpright ? 'Upright' : (isHandHorizontal ? 'Horizontal' : 'Downward')
  };

  return { letter, confidence, debugInfo };
}

// Simple KNN classifier implementation to allow user calibration!
export class LibrasKNNClassifier {
  private dataset: { features: number[]; label: string }[] = [];

  constructor() {
    this.loadDefaultDataset();
  }

  // Load high-quality synthetic prototypical dataset for the full Libras alphabet (A-Z)
  // Generates 5 augmented variations per letter to create a resilient point cloud in the 20-D space
  public loadDefaultDataset() {
    this.dataset = [];
    
    // Prototypical hand configurations for Libras letters (A-Z)
    // Features array: [4 finger ratios, 5 wrist distances, 3 thumb relationships, 4 inter-fingers, 4 directions]
    const profiles: { label: string; features: number[] }[] = [
      // A: fist closed, thumb on side
      { label: 'A', features: [0.4, 0.4, 0.4, 0.4, 0.85, 0.75, 0.75, 0.75, 0.7, 0.7, 1.1, 0.2, 0.25, 0.25, 0.25, 0.35, 0.0, -1.0, -0.3, -0.9] },
      // B: flat palm open, thumb folded in front
      { label: 'B', features: [1.0, 1.0, 1.0, 1.0, 0.65, 1.9, 2.0, 1.9, 1.7, 0.45, 0.75, 0.15, 0.22, 0.22, 0.22, 0.35, 0.0, -1.0, -0.3, -0.9] },
      // C: hand in C shape
      { label: 'C', features: [0.65, 0.65, 0.65, 0.65, 1.1, 1.3, 1.35, 1.3, 1.15, 0.85, 1.1, 0.35, 0.45, 0.45, 0.45, 0.65, 0.0, -1.0, -0.3, -0.9] },
      // D: index pointing up, others forming circle with thumb
      { label: 'D', features: [1.0, 0.4, 0.4, 0.4, 0.75, 1.9, 0.8, 0.8, 0.75, 0.5, 0.8, 0.2, 0.85, 0.25, 0.25, 0.55, 0.0, -1.0, -0.3, -0.9] },
      // E: fingers bent against palm (claw)
      { label: 'E', features: [0.45, 0.45, 0.45, 0.45, 0.65, 0.8, 0.8, 0.8, 0.75, 0.5, 0.75, 0.15, 0.22, 0.22, 0.22, 0.25, 0.0, -1.0, -0.3, -0.9] },
      // F: index folded touching thumb, others up
      { label: 'F', features: [0.4, 1.0, 1.0, 1.0, 0.75, 0.85, 1.95, 1.85, 1.7, 0.4, 0.95, 0.2, 0.95, 0.25, 0.25, 0.25, 0.0, -1.0, -0.3, -0.9] },
      // G: index up, thumb to the side
      { label: 'G', features: [1.0, 0.4, 0.4, 0.4, 1.15, 1.85, 0.75, 0.75, 0.7, 0.9, 1.35, 0.45, 0.65, 0.85, 0.25, 0.25, 0.0, -1.0, -0.3, -0.9] },
      // H: index and middle extended horizontally, thumb between
      { label: 'H', features: [1.0, 1.0, 0.4, 0.4, 0.8, 1.6, 1.6, 0.75, 0.75, 0.65, 0.95, 0.3, 0.4, 0.75, 0.25, 0.35, 0.9, -0.2, 0.8, -0.3] },
      // I: pinky open, others closed
      { label: 'I', features: [0.4, 0.4, 0.4, 1.0, 0.65, 0.75, 0.75, 0.75, 1.65, 0.55, 0.75, 0.15, 0.25, 0.25, 0.75, 0.65, 0.0, -1.0, -0.3, -0.9] },
      // J: pinky open, tilted
      { label: 'J', features: [0.4, 0.4, 0.4, 0.9, 0.7, 0.8, 0.8, 0.8, 1.5, 0.6, 0.8, 0.2, 0.25, 0.25, 0.65, 0.55, -0.5, -0.85, -0.7, -0.7] },
      // K: index and middle in V, thumb in middle
      { label: 'K', features: [1.0, 1.0, 0.4, 0.4, 0.9, 1.85, 1.85, 0.75, 0.75, 0.7, 0.95, 0.35, 0.5, 0.85, 0.25, 0.45, 0.0, -1.0, -0.3, -0.9] },
      // L: index up, thumb side (L shape)
      { label: 'L', features: [1.0, 0.4, 0.4, 0.4, 1.3, 1.9, 0.75, 0.75, 0.7, 1.15, 1.45, 0.55, 1.15, 0.85, 0.25, 0.25, 0.0, -1.0, -0.3, -0.9] },
      // M: index, middle, ring down, pinky closed
      { label: 'M', features: [0.45, 0.45, 0.45, 0.4, 0.65, 1.0, 1.0, 1.0, 0.75, 0.55, 0.75, 0.15, 0.25, 0.25, 0.25, 0.35, 0.0, 1.0, -0.2, 0.9] },
      // N: index, middle down, others closed
      { label: 'N', features: [0.45, 0.45, 0.4, 0.4, 0.65, 1.0, 1.0, 0.75, 0.75, 0.55, 0.75, 0.15, 0.25, 0.65, 0.25, 0.35, 0.0, 1.0, -0.2, 0.9] },
      // O: closed circle, finger tips touching thumb
      { label: 'O', features: [0.5, 0.5, 0.5, 0.5, 0.7, 0.95, 0.95, 0.95, 0.85, 0.5, 0.75, 0.22, 0.18, 0.18, 0.18, 0.18, 0.0, -1.0, -0.3, -0.9] },
      // P: like K but pointing down
      { label: 'P', features: [1.0, 1.0, 0.4, 0.4, 0.85, 1.45, 1.45, 0.75, 0.75, 0.65, 0.85, 0.3, 0.45, 0.75, 0.25, 0.35, 0.2, 0.95, 0.0, 0.85] },
      // Q: thumb and index pointing down, pincher
      { label: 'Q', features: [1.0, 0.4, 0.4, 0.4, 1.15, 1.55, 0.75, 0.75, 0.7, 0.85, 1.15, 0.4, 0.55, 0.75, 0.25, 0.25, 0.0, 1.0, -0.2, 0.9] },
      // R: index and middle crossed
      { label: 'R', features: [1.0, 1.0, 0.4, 0.4, 0.65, 1.75, 1.75, 0.75, 0.75, 0.55, 0.75, 0.15, 0.12, 0.85, 0.25, 0.35, 0.0, -1.0, -0.3, -0.9] },
      // S: fist closed, thumb in front
      { label: 'S', features: [0.4, 0.4, 0.4, 0.4, 0.65, 0.75, 0.75, 0.75, 0.75, 0.45, 0.8, 0.15, 0.22, 0.22, 0.22, 0.25, 0.0, -1.0, -0.3, -0.9] },
      // T: index folded, thumb tucked inside
      { label: 'T', features: [0.4, 1.0, 1.0, 1.0, 0.8, 0.85, 1.95, 1.85, 1.7, 0.6, 1.0, 0.25, 0.85, 0.25, 0.25, 0.32, 0.0, -1.0, -0.3, -0.9] },
      // U: index and middle up and together
      { label: 'U', features: [1.0, 1.0, 0.4, 0.4, 0.65, 1.85, 1.85, 0.75, 0.75, 0.55, 0.75, 0.15, 0.2, 0.85, 0.25, 0.35, 0.0, -1.0, -0.3, -0.9] },
      // V: index and middle open in V
      { label: 'V', features: [1.0, 1.0, 0.4, 0.4, 0.65, 1.85, 1.85, 0.75, 0.75, 0.55, 0.75, 0.15, 0.5, 0.85, 0.25, 0.4, 0.0, -1.0, -0.3, -0.9] },
      // W: index, middle, ring open
      { label: 'W', features: [1.0, 1.0, 1.0, 0.4, 0.65, 1.85, 1.95, 1.85, 0.75, 0.55, 0.75, 0.15, 0.45, 0.45, 0.85, 0.38, 0.0, -1.0, -0.3, -0.9] },
      // X: hook shape
      { label: 'X', features: [0.6, 0.4, 0.4, 0.4, 0.65, 1.25, 0.75, 0.75, 0.75, 0.55, 0.75, 0.15, 0.55, 0.25, 0.25, 0.35, 0.0, -1.0, -0.3, -0.9] },
      // Y: pinky and thumb extended, hang loose
      { label: 'Y', features: [0.4, 0.4, 0.4, 1.0, 1.25, 0.75, 0.75, 0.75, 1.75, 1.15, 1.55, 0.5, 0.25, 0.25, 0.85, 1.25, 0.0, -1.0, -0.3, -0.9] },
      // Z: same static posture as D
      { label: 'Z', features: [1.0, 0.4, 0.4, 0.4, 0.75, 1.85, 0.8, 0.8, 0.75, 0.55, 0.8, 0.2, 0.85, 0.25, 0.25, 0.55, 0.0, -1.0, -0.3, -0.9] }
    ];

    for (const prof of profiles) {
      // 1. Add direct prototype
      this.dataset.push({ label: prof.label, features: [...prof.features] });
      
      // 2. Add slightly scaled up version (simulate bigger hands/closer to camera)
      const scaledUp = [...prof.features];
      for (let i = 4; i <= 15; i++) scaledUp[i] *= 1.15;
      this.dataset.push({ label: prof.label, features: scaledUp });

      // 3. Add slightly scaled down version (simulate smaller hands/further from camera)
      const scaledDown = [...prof.features];
      for (let i = 4; i <= 15; i++) scaledDown[i] *= 0.85;
      this.dataset.push({ label: prof.label, features: scaledDown });

      // 4. Add version with subtle random noise to simulate finger jitter / camera noise
      const noise1 = prof.features.map((f, idx) => {
        const jitter = (Math.random() - 0.5) * 0.06;
        return f + jitter;
      });
      this.dataset.push({ label: prof.label, features: noise1 });

      // 5. Add a second noise variation for a denser point cluster
      const noise2 = prof.features.map((f, idx) => {
        const jitter = (Math.random() - 0.5) * 0.08;
        return f + jitter;
      });
      this.dataset.push({ label: prof.label, features: noise2 });
    }
  }

  public resetToDefaults() {
    this.loadDefaultDataset();
  }

  // Convert hand landmarks to a highly scale-and-rotation invariant feature vector
  // Returns 20 dimensions: 5 finger ratios, 5 relative distances to wrist, 5 joint angles, etc.
  public static extractFeatures(landmarks: Landmark[]): number[] {
    const wrist = landmarks[0];
    const palmScale = distance(wrist, landmarks[9]);
    if (palmScale === 0) return Array(20).fill(0);

    const features: number[] = [];

    // 1. Finger extension ratios (4 dimensions)
    const getFingerRatio = (tip: number, pip: number, mcp: number) => {
      const dTipMcp = distance(landmarks[tip], landmarks[mcp]);
      const dPipMcp = distance(landmarks[pip], landmarks[mcp]);
      const dTipPip = distance(landmarks[tip], landmarks[pip]);
      return dTipMcp / (dPipMcp + dTipPip || 1);
    };

    features.push(getFingerRatio(8, 6, 5));
    features.push(getFingerRatio(12, 10, 9));
    features.push(getFingerRatio(16, 14, 13));
    features.push(getFingerRatio(20, 18, 17));

    // 2. Distances from tips to wrist, normalized (5 dimensions)
    features.push(distance(landmarks[4], wrist) / palmScale); // Thumb tip
    features.push(distance(landmarks[8], wrist) / palmScale); // Index tip
    features.push(distance(landmarks[12], wrist) / palmScale); // Middle tip
    features.push(distance(landmarks[16], wrist) / palmScale); // Ring tip
    features.push(distance(landmarks[20], wrist) / palmScale); // Pinky tip

    // 3. Thumb relative distances (3 dimensions)
    features.push(distance(landmarks[4], landmarks[5]) / palmScale); // Thumb to index MCP
    features.push(distance(landmarks[4], landmarks[17]) / palmScale); // Thumb to pinky MCP
    features.push(calculateAngle(landmarks[4], landmarks[2], landmarks[5]) / 180); // Normalized angle

    // 4. Inter-finger tip distances (4 dimensions)
    features.push(distance(landmarks[8], landmarks[12]) / palmScale); // Index-Middle
    features.push(distance(landmarks[12], landmarks[16]) / palmScale); // Middle-Ring
    features.push(distance(landmarks[16], landmarks[20]) / palmScale); // Ring-Pinky
    features.push(distance(landmarks[4], landmarks[8]) / palmScale); // Thumb-Index

    // 5. Hand direction vectors normalized relative to wrist (4 dimensions)
    // We want the relative angle/position of middle MCP and index MCP to the wrist
    features.push((landmarks[9].x - wrist.x) / palmScale);
    features.push((landmarks[9].y - wrist.y) / palmScale);
    features.push((landmarks[5].x - wrist.x) / palmScale);
    features.push((landmarks[5].y - wrist.y) / palmScale);

    return features;
  }

  public addSample(landmarks: Landmark[], label: string) {
    const features = LibrasKNNClassifier.extractFeatures(landmarks);
    this.dataset.push({ features, label });
  }

  public clear() {
    this.dataset = [];
  }

  public getDatasetSize(): number {
    return this.dataset.length;
  }

  public getSamplesByLabel(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const sample of this.dataset) {
      counts[sample.label] = (counts[sample.label] || 0) + 1;
    }
    return counts;
  }

  public classify(landmarks: Landmark[], k = 3): { letter: string; confidence: number } {
    if (this.dataset.length === 0) {
      return { letter: '?', confidence: 0 };
    }

    const testFeatures = LibrasKNNClassifier.extractFeatures(landmarks);
    
    // Calculate distance to all samples
    const distances = this.dataset.map(sample => {
      let sumOfSquares = 0;
      for (let i = 0; i < testFeatures.length; i++) {
        sumOfSquares += Math.pow(testFeatures[i] - sample.features[i], 2);
      }
      return {
        distance: Math.sqrt(sumOfSquares),
        label: sample.label
      };
    });

    // Sort by distance ascending
    distances.sort((a, b) => a.distance - b.distance);

    // Get top K
    const neighbors = distances.slice(0, Math.min(k, distances.length));

    // Vote
    const votes: Record<string, number> = {};
    for (const neighbor of neighbors) {
      votes[neighbor.label] = (votes[neighbor.label] || 0) + 1;
    }

    let bestLabel = '?';
    let maxVotes = 0;
    for (const label in votes) {
      if (votes[label] > maxVotes) {
        maxVotes = votes[label];
        bestLabel = label;
      }
    }

    // Confidence is votes/k
    const confidence = maxVotes / neighbors.length;

    return { letter: bestLabel, confidence };
  }

  // Export dataset as JSON
  public exportDataset(): string {
    return JSON.stringify(this.dataset);
  }

  // Import dataset from JSON
  public importDataset(jsonStr: string) {
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data)) {
        this.dataset = data;
        return true;
      }
    } catch (e) {
      console.error("Failed to import KNN dataset:", e);
    }
    return false;
  }
}
