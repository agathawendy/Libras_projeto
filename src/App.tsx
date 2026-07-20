/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera as CameraIcon, 
  CameraOff, 
  Volume2, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Award, 
  HelpCircle, 
  Dna, 
  Sparkles, 
  BookOpen, 
  Keyboard, 
  Download, 
  Upload, 
  Lightbulb, 
  Info, 
  ArrowRight, 
  RotateCcw, 
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Landmark } from './types';
import { classifyLibras, LibrasKNNClassifier, distance } from './classifier';
import { LIBRAS_ALPHABET } from './dictionary';

export default function App() {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'translate' | 'reference' | 'knn_lab' | 'practice'>('translate');

  // MediaPipe & Camera States
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [scriptsError, setScriptsError] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraPermissionError, setCameraPermissionError] = useState(false);
  const [fps, setFps] = useState(0);

  // Recognition States
  const [detectedLetter, setDetectedLetter] = useState<string>('?');
  const [confidence, setConfidence] = useState<number>(0);
  const [debugTelemetry, setDebugTelemetry] = useState<any>(null);
  const [classifierMode, setClassifierMode] = useState<'heuristic' | 'knn'>('heuristic');

  // Word Builder State
  const [word, setWord] = useState<string>('');
  const [lastLoggedLetter, setLastLoggedLetter] = useState<string>('');
  const [logProgress, setLogProgress] = useState<number>(0); // 0 to 100 for auto-append hold

  // Custom KNN Dataset States
  const [knnSamples, setKnnSamples] = useState<Record<string, number>>({});
  const [knnTargetLetter, setKnnTargetLetter] = useState<string>('A');
  const [knnTotalSamples, setKnnTotalSamples] = useState(0);
  const [exportDataUrl, setExportDataUrl] = useState<string | null>(null);

  // Practice Mode States
  const [targetPracticeLetter, setTargetPracticeLetter] = useState<string>('L');
  const [practiceScore, setPracticeScore] = useState<number>(0);
  const [practiceStreak, setPracticeStreak] = useState<number>(0);
  const [practiceStatus, setPracticeStatus] = useState<'waiting' | 'success'>('waiting');
  const [practiceMatchTime, setPracticeMatchTime] = useState<number>(0); // hold matching state

  // Dictionary State
  const [selectedDictLetter, setSelectedDictLetter] = useState<string>('A');

  // Refs for tracking MediaPipe and video/canvas elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeLandmarksRef = useRef<Landmark[] | null>(null);
  const knnClassifierRef = useRef<LibrasKNNClassifier>(new LibrasKNNClassifier());
  const cameraInstanceRef = useRef<any>(null);
  const handsInstanceRef = useRef<any>(null);

  // FPS Counter Refs
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const fpsTimerRef = useRef<number>(0);

  // Auto-append tracking refs
  const holdLetterRef = useRef<string>('');
  const holdDurationRef = useRef<number>(0); // frames held

  // Synchronized refs to prevent stale closure bugs in MediaPipe callbacks
  const cameraActiveRef = useRef(false);
  
  const classifierModeRef = useRef(classifierMode);
  useEffect(() => {
    classifierModeRef.current = classifierMode;
  }, [classifierMode]);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const practiceStatusRef = useRef(practiceStatus);
  useEffect(() => {
    practiceStatusRef.current = practiceStatus;
  }, [practiceStatus]);

  const targetPracticeLetterRef = useRef(targetPracticeLetter);
  useEffect(() => {
    targetPracticeLetterRef.current = targetPracticeLetter;
  }, [targetPracticeLetter]);

  // 1. Load MediaPipe Scripts dynamically
  useEffect(() => {
    let isMounted = true;

    const loadMediaPipe = async () => {
      try {
        const scripts = [
          'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
          'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'
        ];

        for (const src of scripts) {
          if (!document.querySelector(`script[src="${src}"]`)) {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = src;
              script.crossOrigin = 'anonymous';
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
        }

        if (isMounted) {
          setScriptsLoaded(true);
        }
      } catch (err) {
        console.error('Error loading MediaPipe scripts:', err);
        if (isMounted) {
          setScriptsError(true);
        }
      }
    };

    loadMediaPipe();

    // Load saved KNN Dataset from localStorage or initialize with built-in high-quality defaults
    const savedKnn = localStorage.getItem('tcc_libras_knn_dataset');
    if (savedKnn) {
      knnClassifierRef.current.importDataset(savedKnn);
    } else {
      // If no custom dataset was saved yet, persist the built-in default dataset so it's ready
      try {
        localStorage.setItem('tcc_libras_knn_dataset', knnClassifierRef.current.exportDataset());
      } catch (e) {
        console.error("Failed to persist default KNN dataset to localStorage:", e);
      }
    }
    setKnnSamples(knnClassifierRef.current.getSamplesByLabel());
    setKnnTotalSamples(knnClassifierRef.current.getDatasetSize());

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, []);

  // 2. Initialize MediaPipe Hands
  const initMediaPipeHands = () => {
    if (handsInstanceRef.current) return handsInstanceRef.current;

    const HandsClass = (window as any).Hands;
    if (!HandsClass) return null;

    const hands = new HandsClass({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults(onHandsResults);
    handsInstanceRef.current = hands;
    return hands;
  };

  // 3. Handle Hands Results
  const onHandsResults = (results: any) => {
    // Calculate FPS
    const now = performance.now();
    frameCountRef.current++;
    if (now - fpsTimerRef.current >= 1000) {
      setFps(Math.round((frameCountRef.current * 1000) / (now - fpsTimerRef.current)));
      frameCountRef.current = 0;
      fpsTimerRef.current = now;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sync canvas resolution to match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks: Landmark[] = results.multiHandLandmarks[0];
      activeLandmarksRef.current = landmarks;

      // Draw customized beautiful overlay skeleton
      drawCustomSkeleton(ctx, landmarks);

      // Perform translation based on mode
      let resultLetter = '?';
      let resultConfidence = 0;
      let telemetry = null;

      if (classifierModeRef.current === 'heuristic') {
        const res = classifyLibras(landmarks);
        resultLetter = res.letter;
        resultConfidence = res.confidence;
        telemetry = res.debugInfo;
      } else {
        // KNN Mode
        const res = knnClassifierRef.current.classify(landmarks);
        resultLetter = res.letter;
        resultConfidence = res.confidence;
        // Inject some heuristics debug data in KNN mode too
        const heur = classifyLibras(landmarks);
        telemetry = {
          ...heur.debugInfo,
          knnActive: true
        };
      }

      setDetectedLetter(resultLetter);
      setConfidence(resultConfidence);
      setDebugTelemetry(telemetry);

      // Handle hold-to-append auto progression
      handleHoldToAppend(resultLetter, resultConfidence);

      // Handle Practice game matching
      handlePracticeTracking(resultLetter, resultConfidence);

    } else {
      activeLandmarksRef.current = null;
      setDetectedLetter('?');
      setConfidence(0);
      setDebugTelemetry(null);
      setLogProgress(0);
      holdDurationRef.current = 0;
    }
  };

  // 4. Custom Hand Skeleton Draw Routine (Emerald Glowing Style)
  const drawCustomSkeleton = (ctx: CanvasRenderingContext2D, landmarks: Landmark[]) => {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Bone links
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // index
      [9, 10], [10, 11], [11, 12],   // middle
      [13, 14], [14, 15], [15, 16], // ring
      [0, 17], [17, 18], [18, 19], [19, 20], // pinky
      [5, 9], [9, 13], [13, 17] // palm base links
    ];

    // Draw connecting bones
    ctx.strokeStyle = '#10b981'; // Emerald Green
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#059669'; // Emerald glow
    ctx.shadowBlur = 8;

    for (const [p1, p2] of connections) {
      const pt1 = landmarks[p1];
      const pt2 = landmarks[p2];
      if (pt1 && pt2) {
        ctx.beginPath();
        ctx.moveTo(pt1.x * w, pt1.y * h);
        ctx.lineTo(pt2.x * w, pt2.y * h);
        ctx.stroke();
      }
    }

    // Reset shadow for joint dots to make them crisp
    ctx.shadowBlur = 0;

    // Draw joints
    for (let i = 0; i < landmarks.length; i++) {
      const pt = landmarks[i];
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 6, 0, 2 * Math.PI);
      
      // Color scheme for different hand sections
      if (i === 4 || i === 8 || i === 12 || i === 16 || i === 20) {
        ctx.fillStyle = '#f43f5e'; // Rose pink for tips
      } else if (i === 0) {
        ctx.fillStyle = '#3b82f6'; // Bright blue for wrist
      } else {
        ctx.fillStyle = '#fbbf24'; // Golden amber for middle joints
      }
      
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };

  // 5. Hold to append letters auto word builder logic
  const handleHoldToAppend = (letter: string, conf: number) => {
    if (letter === '?' || conf < 0.70) {
      holdDurationRef.current = 0;
      setLogProgress(0);
      return;
    }

    if (letter === holdLetterRef.current) {
      holdDurationRef.current += 1;
      // Let's require ~25 frames (~1 second on average camera fps) to lock
      const targetFrames = 25;
      const progress = Math.min((holdDurationRef.current / targetFrames) * 100, 100);
      setLogProgress(progress);

      if (holdDurationRef.current >= targetFrames) {
        // Trigger append!
        setWord(prev => prev + letter);
        setLastLoggedLetter(letter);
        holdDurationRef.current = 0; // reset
        setLogProgress(0);

        // Feedback sound or click feeling
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(letter.toLowerCase());
          utterance.rate = 1.2;
          window.speechSynthesis.speak(utterance);
        }
      }
    } else {
      holdLetterRef.current = letter;
      holdDurationRef.current = 0;
      setLogProgress(0);
    }
  };

  // 6. Practice Mode Matching Loop
  const handlePracticeTracking = (letter: string, conf: number) => {
    if (activeTabRef.current !== 'practice' || practiceStatusRef.current === 'success') return;

    if (letter === targetPracticeLetterRef.current && conf >= 0.75) {
      setPracticeMatchTime(prev => {
        const next = prev + 1;
        if (next >= 15) { // Held for 15 frames (~0.6 seconds)
          // Score Point!
          setPracticeStatus('success');
          setPracticeScore(s => s + 10);
          setPracticeStreak(st => st + 1);

          // Audio text-to-speech feedback
          speakText(`Perfeito! Letra ${targetPracticeLetterRef.current} detectada.`);

          // Auto trigger next letter in 2.5 seconds
          setTimeout(() => {
            selectNextPracticeLetter();
          }, 2500);

          return 0;
        }
        return next;
      });
    } else {
      setPracticeMatchTime(0);
    }
  };

  const selectNextPracticeLetter = () => {
    const index = Math.floor(Math.random() * LIBRAS_ALPHABET.length);
    const nextLetter = LIBRAS_ALPHABET[index].letter;
    setTargetPracticeLetter(nextLetter);
    setPracticeStatus('waiting');
    setPracticeMatchTime(0);
  };

  // 7. Start Camera
  const startCamera = async () => {
    if (!scriptsLoaded) return;
    setCameraLoading(true);
    setCameraPermissionError(false);

    try {
      const hands = initMediaPipeHands();
      if (!hands) {
        setCameraLoading(false);
        return;
      }

      const video = videoRef.current;
      if (!video) {
        setCameraLoading(false);
        return;
      }

      // Pre-initialize standard constraints
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      };

      // Get user media to verify permission first (important for frames inside AI Studio)
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();

      cameraActiveRef.current = true;
      setCameraActive(true);
      setCameraLoading(false);

      const CameraClass = (window as any).Camera;
      if (CameraClass) {
        const camera = new CameraClass(video, {
          onFrame: async () => {
            if (videoRef.current && cameraActiveRef.current) {
              await hands.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480
        });
        cameraInstanceRef.current = camera;
        camera.start();
      }

    } catch (err: any) {
      console.error('Failed to access webcam:', err);
      setCameraLoading(false);
      setCameraActive(false);
      setCameraPermissionError(true);
    }
  };

  // 8. Stop Camera
  const stopCamera = () => {
    cameraActiveRef.current = false;
    setCameraActive(false);
    if (cameraInstanceRef.current) {
      try {
        cameraInstanceRef.current.stop();
      } catch (e) {}
      cameraInstanceRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setDetectedLetter('?');
    setConfidence(0);
    setDebugTelemetry(null);
  };

  // 9. Speak Text (Accessibility browser TTS helper)
  const speakText = (text: string) => {
    if (window.speechSynthesis) {
      // Cancel active speaking to start fresh
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // 10. Record KNN Landmark Sample
  const captureKnnSample = () => {
    if (!activeLandmarksRef.current) return;
    
    knnClassifierRef.current.addSample(activeLandmarksRef.current, knnTargetLetter);
    const updated = knnClassifierRef.current.getSamplesByLabel();
    setKnnSamples(updated);
    setKnnTotalSamples(knnClassifierRef.current.getDatasetSize());

    // Save to local storage
    localStorage.setItem('tcc_libras_knn_dataset', knnClassifierRef.current.exportDataset());

    // Flash some sound/visual response
    speakText(`Gravado ${knnTargetLetter}`);
  };

  // Restore KNN Default Dataset
  const clearKnnDataset = () => {
    if (window.confirm("Deseja apagar as calibrações personalizadas e restaurar a base de dados padrão pré-treinada do TCC? (Recomendado)")) {
      knnClassifierRef.current.resetToDefaults();
      try {
        localStorage.setItem('tcc_libras_knn_dataset', knnClassifierRef.current.exportDataset());
      } catch (e) {
        console.error("Failed to save default dataset on clear:", e);
      }
      setKnnSamples(knnClassifierRef.current.getSamplesByLabel());
      setKnnTotalSamples(knnClassifierRef.current.getDatasetSize());
      speakText("Base de dados padrão restaurada");
    }
  };

  // Export JSON Dataset
  const handleExportKnn = () => {
    const dataStr = knnClassifierRef.current.exportDataset();
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    setExportDataUrl(dataUri);
  };

  // Import JSON Dataset from file picker
  const handleImportKnn = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        const fileContent = event.target?.result as string;
        const success = knnClassifierRef.current.importDataset(fileContent);
        if (success) {
          localStorage.setItem('tcc_libras_knn_dataset', fileContent);
          setKnnSamples(knnClassifierRef.current.getSamplesByLabel());
          setKnnTotalSamples(knnClassifierRef.current.getDatasetSize());
          alert("Base de dados KNN importada com sucesso!");
        } else {
          alert("Arquivo inválido. Certifique-se de carregar um JSON válido exportado por esta ferramenta.");
        }
      };
    }
  };

  // Generate hints for target practice
  const getPracticeHint = () => {
    const match = LIBRAS_ALPHABET.find(item => item.letter === targetPracticeLetter);
    if (!match) return "Sem dicas disponíveis.";

    // If we have live telemetry, let's compare finger states to target!
    if (debugTelemetry && debugTelemetry.fingerStates) {
      const cur = debugTelemetry.fingerStates;
      // We can generate super targeted warnings
      if (targetPracticeLetter === 'L') {
        if (cur.Index !== 'Ext') return "Dica: Tente esticar o dedo Indicador para o alto.";
        if (cur.Thumb !== 'Ext') return "Dica: Afaste bem o Polegar para o lado, formando um ângulo reto.";
        if (cur.Middle === 'Ext' || cur.Ring === 'Ext') return "Dica: Mantenha Médio, Anelar e Mínimo totalmente dobrados.";
      }
      if (targetPracticeLetter === 'B') {
        if (cur.Index !== 'Ext' || cur.Middle !== 'Ext') return "Dica: Estique bem todos os quatro dedos juntos para cima.";
        if (cur.Thumb === 'Ext') return "Dica: Dobre o Polegar cruzando na frente da palma.";
      }
      if (targetPracticeLetter === 'I') {
        if (cur.Pinky !== 'Ext') return "Dica: Estique bem apenas o seu dedo mínimo (pinky).";
        if (cur.Index === 'Ext') return "Dica: Dobre o indicador para baixo.";
      }
      if (targetPracticeLetter === 'Y') {
        if (cur.Thumb !== 'Ext' || cur.Pinky !== 'Ext') return "Dica: Estique o Polegar e o Mínimo bem abertos para as laterais.";
        if (cur.Index === 'Ext') return "Dica: Mantenha os três dedos do meio fechados.";
      }
    }

    return match.tips[0] || match.description;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      
      {/* 1. Header Navigation Bar */}
      <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
              <Dna className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">Tradutor Libras</h1>
                <span className="text-xs bg-slate-800 text-slate-400 border border-slate-700/50 px-2 py-0.5 rounded-full font-mono">TCC Protótipo</span>
              </div>
              <p className="text-xs text-slate-400">Reconhecimento do Alfabeto de Libras por Visão Computacional</p>
            </div>
          </div>

          {/* Tab Selection */}
          <nav className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800/80">
            <button
              id="tab-translate"
              onClick={() => setActiveTab('translate')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'translate' 
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <CameraIcon className="w-4 h-4" />
              <span>Tradutor</span>
            </button>
            <button
              id="tab-practice"
              onClick={() => setActiveTab('practice')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'practice' 
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>Praticar</span>
            </button>
            <button
              id="tab-reference"
              onClick={() => setActiveTab('reference')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'reference' 
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Dicionário</span>
            </button>
            <button
              id="tab-knn"
              onClick={() => setActiveTab('knn_lab')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'knn_lab' 
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Lab TCC</span>
            </button>
          </nav>
        </div>
      </header>

      {/* 2. Main Body Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Camera Feed and Telemetry Skeleton Display (Span 7) */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-slate-900/40 rounded-2xl p-4 border border-slate-800/80 flex flex-col gap-4 h-full">
            
            {/* Header of feed */}
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <h2 className="text-sm font-semibold text-slate-200">Vídeo em Tempo Real</h2>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded-md border border-slate-800/50">
                <span>FPS: {fps}</span>
                <span className="text-slate-600">|</span>
                <span>Modo: {classifierMode === 'heuristic' ? 'Heurística' : 'Lab KNN'}</span>
              </div>
            </div>

            {/* Video Canvas Container */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden shadow-2xl bg-slate-950 border border-slate-800 flex items-center justify-center">
              
              {/* MediaPipe Video Hook */}
              <video 
                ref={videoRef} 
                className="absolute inset-0 w-full h-full object-cover rounded-xl"
                playsInline
                muted
                style={{ transform: 'scaleX(-1)' }} // Mirror view for natural interaction
              />

              {/* Landmark Drawing Overlap */}
              <canvas 
                ref={canvasRef} 
                className="absolute inset-0 w-full h-full object-cover rounded-xl pointer-events-none"
                style={{ transform: 'scaleX(-1)' }} // Mirror view match
              />

              {/* Static UI for non-active camera */}
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 z-10">
                  <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center text-slate-400 mb-4">
                    <CameraOff className="w-8 h-8" />
                  </div>
                  
                  {cameraPermissionError ? (
                    <div className="max-w-md p-4 bg-rose-950/20 rounded-xl border border-rose-500/30">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 mx-auto mb-3">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <h3 className="text-rose-400 font-bold mb-2 text-base">Permissão de Câmera Bloqueada no iFrame</h3>
                      <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                        Detectamos que a câmera foi bloqueada. Navegadores modernos frequentemente barram o uso de webcam dentro de janelas integradas (iFrames) como esta visualização do AI Studio.
                      </p>
                      <p className="text-xs text-emerald-400 font-semibold mb-5">
                        💡 Para resolver, clique no botão abaixo para abrir o app em uma aba dedicada e autorizar a câmera:
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
                        <a 
                          href={window.location.href} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold px-4 py-2.5 rounded-xl transition duration-150 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Abrir em Nova Aba (Recomendado)</span>
                        </a>
                        <button 
                          onClick={startCamera}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-xl transition duration-150 border border-slate-700/50"
                        >
                          Tentar Novamente Aqui
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-sm">
                      <h3 className="text-white font-bold mb-1">Iniciar Detecção de Libras</h3>
                      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                        Sua câmera processará e extrairá as coordenadas da mão em tempo real localmente no seu navegador.
                      </p>
                      
                      {!scriptsLoaded ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-semibold">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Carregando dependências MediaPipe...</span>
                        </div>
                      ) : (
                        <button
                          onClick={startCamera}
                          disabled={cameraLoading}
                          className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-6 py-3 rounded-xl transition duration-150 shadow-lg shadow-emerald-500/20 inline-flex items-center gap-2 text-sm"
                        >
                          {cameraLoading ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Ligando Câmera...</span>
                            </>
                          ) : (
                            <>
                              <CameraIcon className="w-4 h-4" />
                              <span>Ativar Webcam</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Hold Progress Radial Ring */}
              {cameraActive && logProgress > 0 && (
                <div className="absolute bottom-4 right-4 bg-slate-900/95 border border-slate-800/80 px-3 py-2 rounded-xl flex items-center gap-2 backdrop-blur shadow-xl">
                  <div className="w-6 h-6 rounded-full border-2 border-slate-700 relative overflow-hidden flex items-center justify-center">
                    <div 
                      className="absolute inset-0 bg-emerald-500 origin-bottom transition-all duration-75"
                      style={{ height: `${logProgress}%`, opacity: 0.4 }}
                    />
                    <span className="text-[10px] font-mono font-bold text-emerald-400 z-10">
                      {Math.round(logProgress)}%
                    </span>
                  </div>
                  <span className="text-xs text-slate-300 font-semibold font-mono">Hold {holdLetterRef.current}</span>
                </div>
              )}
            </div>

            {/* Quick Action Controls */}
            {cameraActive && (
              <div className="flex gap-2 w-full">
                <button
                  onClick={stopCamera}
                  className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 font-semibold py-2.5 rounded-xl transition duration-150 flex items-center justify-center gap-2 text-sm"
                >
                  <CameraOff className="w-4 h-4" />
                  <span>Pausar Câmera</span>
                </button>
                <button
                  onClick={() => {
                    setWord('');
                    setLastLoggedLetter('');
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 rounded-xl transition duration-150 border border-slate-700/50 flex items-center justify-center gap-2 text-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Limpar Letras</span>
                </button>
              </div>
            )}

            {/* Active coordinates debug visualization (Lab context) */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/50 text-xs font-mono flex flex-col gap-2 mt-auto">
              <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                <Info className="w-3.5 h-3.5 text-emerald-400" />
                <span>Instruções Rápidas de Uso</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 leading-relaxed">
                <li>Posicione uma única mão visível no centro do feed da câmera.</li>
                <li>Mantenha a mão estabilizada por <strong className="text-emerald-400">1 segundo</strong> para registrar a letra no painel de palavras.</li>
                <li>Para melhores resultados, procure manter um ambiente bem iluminado.</li>
              </ul>
            </div>

          </div>
        </section>

        {/* RIGHT COLUMN: Results panel, Word Builder & Mode contents (Span 5) */}
        <section className="lg:col-span-5 flex flex-col gap-6">

          {/* Tab 1: Translation Panel */}
          {activeTab === 'translate' && (
            <div className="flex flex-col gap-6">
              
              {/* Primary Detection Display Card */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center relative overflow-hidden text-center min-h-[250px] shadow-lg">
                <div className="absolute top-3 left-3 bg-slate-950/80 px-2.5 py-1 rounded-md text-[10px] font-mono text-emerald-400 border border-slate-800 uppercase tracking-wider font-bold">
                  Sinal Detectado
                </div>

                <AnimatePresence mode="wait">
                  <motion.div 
                    key={detectedLetter}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <span className="text-[120px] font-black leading-none tracking-tight text-white font-sans filter drop-shadow-[0_10px_10px_rgba(16,185,129,0.15)] select-none">
                      {detectedLetter}
                    </span>
                    
                    {detectedLetter !== '?' && (
                      <div className="mt-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Confiança: {Math.round(confidence * 100)}%</span>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Telemetry quick peek */}
                {debugTelemetry && (
                  <div className="mt-6 w-full grid grid-cols-5 gap-1.5 text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-4">
                    {Object.entries(debugTelemetry.fingerStates || {}).map(([finger, state]: any) => (
                      <div key={finger} className="flex flex-col bg-slate-950/80 p-1.5 rounded border border-slate-900">
                        <span className="text-slate-500 text-[9px] uppercase">{finger === 'Thumb' ? 'Pol' : finger === 'Index' ? 'Ind' : finger === 'Middle' ? 'Méd' : finger === 'Ring' ? 'Ane' : 'Mín'}</span>
                        <span className={`font-bold mt-0.5 ${state === 'Ext' ? 'text-emerald-400' : state === 'Closed' ? 'text-rose-500' : 'text-amber-500'}`}>
                          {state === 'Ext' ? 'Est' : state === 'Closed' ? 'Fech' : 'Curv'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Elegant Word Builder Canvas */}
              <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <Keyboard className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Quadro de Letras (Formador de Palavras)</h3>
                  </div>
                  <button 
                    onClick={() => {
                      setWord('');
                      setLastLoggedLetter('');
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>
                </div>

                {/* Written block */}
                <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 min-h-[100px] flex flex-wrap items-center gap-1 content-center relative group">
                  {word.length > 0 ? (
                    <span className="text-2xl font-bold tracking-wide text-white font-mono break-all px-1 select-all">
                      {word}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-500 italic select-none">
                      As letras reconhecidas aparecerão aqui para formar palavras...
                    </span>
                  )}
                  
                  {/* Glowing vertical cursor */}
                  <span className="w-1.5 h-6 bg-emerald-400 animate-pulse rounded-full" />
                </div>

                {/* Accessory Keyboard Tools */}
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => setWord(prev => prev + ' ')}
                    className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/50 text-xs font-semibold py-2 rounded-lg transition"
                  >
                    Espaço
                  </button>
                  <button
                    onClick={() => setWord(prev => prev.slice(0, -1))}
                    className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/50 text-xs font-semibold py-2 rounded-lg transition"
                  >
                    Apagar
                  </button>
                  <button
                    onClick={() => {
                      if (detectedLetter !== '?') {
                        setWord(prev => prev + detectedLetter);
                      }
                    }}
                    disabled={detectedLetter === '?'}
                    className="col-span-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold py-2 rounded-lg transition disabled:opacity-50"
                  >
                    + Add Atual ({detectedLetter})
                  </button>
                </div>

                {/* Text To Speech Trigger */}
                <button
                  onClick={() => speakText(word || "Nenhuma palavra formada")}
                  disabled={!word.trim()}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-3 rounded-xl transition duration-150 shadow-md shadow-emerald-500/5 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Falar Palavra / Frase</span>
                </button>
              </div>

            </div>
          )}

          {/* Tab 2: Interactive Practice Game */}
          {activeTab === 'practice' && (
            <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Award className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-slate-200">Jogo Prático de Libras</h3>
                </div>
                
                {/* Score badge */}
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-md">
                    Pontos: {practiceScore}
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold px-2.5 py-1 rounded-md">
                    Combo 🔥: {practiceStreak}
                  </div>
                </div>
              </div>

              {/* Game Goal Display */}
              <div className="bg-slate-950 border border-slate-800/80 p-6 rounded-xl flex flex-col items-center text-center relative overflow-hidden">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-mono">Faça a Letra</span>
                
                <AnimatePresence mode="wait">
                  <motion.div
                    key={targetPracticeLetter}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    className="my-3 flex flex-col items-center"
                  >
                    <span className="text-8xl font-black text-emerald-400 select-none">
                      {targetPracticeLetter}
                    </span>
                  </motion.div>
                </AnimatePresence>

                {/* Match indicator / holding */}
                {practiceStatus === 'success' ? (
                  <div className="text-emerald-400 text-sm font-bold flex items-center gap-1.5 animate-bounce mt-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-full">
                    <CheckCircle className="w-4 h-4" />
                    <span>Excelente! Letra correta!</span>
                  </div>
                ) : practiceMatchTime > 0 ? (
                  <div className="text-amber-400 text-xs font-bold flex items-center gap-1.5 mt-2">
                    <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>Reconhecendo... Mantenha a posição ({(practiceMatchTime/15*100).toFixed(0)}%)</span>
                  </div>
                ) : (
                  <div className="text-slate-400 text-xs italic mt-2">
                    Mostre o sinal na câmera para pontuar!
                  </div>
                )}
              </div>

              {/* AI Real-time Intelligent Guide / Feedback Box */}
              <div className="bg-slate-950/80 border border-slate-800/50 rounded-xl p-4 flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <Lightbulb className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">Guia Inteligente do Tutor</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">
                    {getPracticeHint()}
                  </p>
                </div>
              </div>

              {/* Game management controls */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={selectNextPracticeLetter}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50 text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Pular Letra</span>
                </button>
                <button
                  onClick={() => {
                    setPracticeScore(0);
                    setPracticeStreak(0);
                    selectNextPracticeLetter();
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50 text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Zerar Placar</span>
                </button>
              </div>

            </div>
          )}

          {/* Tab 3: Dictionary Guide */}
          {activeTab === 'reference' && (
            <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 flex flex-col gap-4">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-slate-200">Dicionário de Sinais Libras</h3>
              </div>

              {/* Alphabet Grid Selector */}
              <div className="grid grid-cols-6 sm:grid-cols-7 gap-1.5 max-h-[130px] overflow-y-auto p-1 bg-slate-950 rounded-xl border border-slate-800/50 scrollbar-thin">
                {LIBRAS_ALPHABET.map(item => (
                  <button
                    key={item.letter}
                    onClick={() => setSelectedDictLetter(item.letter)}
                    className={`aspect-square rounded-lg font-bold text-sm flex items-center justify-center transition ${
                      selectedDictLetter === item.letter
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10 scale-105'
                        : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {item.letter}
                  </button>
                ))}
              </div>

              {/* Selected Letter Detail Display Card */}
              {(() => {
                const item = LIBRAS_ALPHABET.find(x => x.letter === selectedDictLetter);
                if (!item) return null;
                return (
                  <div className="bg-slate-950 border border-slate-800/80 p-5 rounded-xl flex flex-col gap-4 relative">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-bold">Letra Selecionada</span>
                        <h4 className="text-4xl font-black text-white mt-1">{item.letter}</h4>
                      </div>
                      
                      {/* SVG Landmark Diagram representation */}
                      <div className="w-16 h-16 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-800 p-2">
                        {/* A very clean minimalist representation of the hand shape based on bones */}
                        <svg viewBox="0 0 100 100" className="w-full h-full text-emerald-400">
                          {/* Wrist point */}
                          <circle cx="50" cy="90" r="4" fill="currentColor" />
                          
                          {/* Skeleton connections based on the letter */}
                          {item.letter === 'L' && (
                            <>
                              <line x1="50" y1="90" x2="30" y2="70" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                              <line x1="30" y1="70" x2="10" y2="70" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /> {/* thumb */}
                              <line x1="50" y1="90" x2="50" y2="40" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                              <line x1="50" y1="40" x2="50" y2="15" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /> {/* index */}
                              {/* folded fingers */}
                              <circle cx="65" cy="70" r="3" fill="#ef4444" />
                              <circle cx="75" cy="73" r="3" fill="#ef4444" />
                              <circle cx="85" cy="78" r="3" fill="#ef4444" />
                            </>
                          )}
                          {item.letter === 'B' && (
                            <>
                              <line x1="50" y1="90" x2="50" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                              <line x1="42" y1="90" x2="42" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                              <line x1="58" y1="90" x2="58" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                              <line x1="66" y1="90" x2="66" y2="28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                              {/* thumb folded */}
                              <line x1="50" y1="90" x2="35" y2="80" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
                              <line x1="35" y1="80" x2="50" y2="70" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
                            </>
                          )}
                          {item.letter === 'I' && (
                            <>
                              <line x1="50" y1="90" x2="70" y2="40" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                              <line x1="70" y1="40" x2="75" y2="15" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /> {/* pinky */}
                              {/* folded index/middle/ring */}
                              <circle cx="35" cy="70" r="3" fill="#ef4444" />
                              <circle cx="45" cy="70" r="3" fill="#ef4444" />
                              <circle cx="55" cy="70" r="3" fill="#ef4444" />
                            </>
                          )}
                          {/* Generic default skeleton logo for other letters */}
                          {item.letter !== 'L' && item.letter !== 'B' && item.letter !== 'I' && (
                            <>
                              <line x1="50" y1="90" x2="35" y2="60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                              <line x1="50" y1="90" x2="50" y2="50" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                              <line x1="50" y1="90" x2="65" y2="60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                              <circle cx="35" cy="60" r="4" fill="currentColor" />
                              <circle cx="50" cy="50" r="4" fill="currentColor" />
                              <circle cx="65" cy="60" r="4" fill="currentColor" />
                            </>
                          )}
                        </svg>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descrição do Sinal</span>
                      <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
                    </div>

                    <div className="flex flex-col gap-1.5 bg-slate-900/60 p-3 rounded-lg border border-slate-800/40">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span>Dicas de Execução</span>
                      </span>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-slate-400 leading-relaxed">
                        {item.tips.map((tip, idx) => (
                          <li key={idx}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Tab 4: KNN Laboratory / Telemetry / Custom Training */}
          {activeTab === 'knn_lab' && (
            <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 flex flex-col gap-5">
              
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-slate-200">Laboratório do TCC & Calibração</h3>
                </div>
                
                {/* Mode toggle */}
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800/80 text-xs">
                  <button
                    onClick={() => setClassifierMode('heuristic')}
                    className={`px-2.5 py-1 rounded font-medium transition ${
                      classifierMode === 'heuristic'
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    Heurística
                  </button>
                  <button
                    onClick={() => setClassifierMode('knn')}
                    className={`px-2.5 py-1 rounded font-medium transition ${
                      classifierMode === 'knn'
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    KNN Personalizado
                  </button>
                </div>
              </div>

              {/* Calibration Capture Form */}
              <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl flex flex-col gap-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Gravação de Amostras (KNN)</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Grave as poses de sua própria mão para calibrar o classificador! 
                  Selecione uma letra, posicione sua mão correspondente na câmera e clique em "Gravar Amostra".
                </p>

                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Letra Alvo</label>
                    <select
                      value={knnTargetLetter}
                      onChange={(e) => setKnnTargetLetter(e.target.value)}
                      className="w-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg py-2 px-3 text-sm font-bold focus:outline-none focus:border-emerald-500"
                    >
                      {LIBRAS_ALPHABET.map(x => (
                        <option key={x.letter} value={x.letter}>{x.letter}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 flex flex-col pt-5">
                    <button
                      onClick={captureKnnSample}
                      disabled={!cameraActive || !activeLandmarksRef.current}
                      className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold text-xs py-2.5 rounded-lg transition duration-150 flex items-center justify-center gap-1 shadow-md shadow-emerald-500/5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Gravar Amostra</span>
                    </button>
                  </div>
                </div>

                {/* Training status */}
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 bg-slate-900/40 p-2.5 rounded border border-slate-900 mt-2">
                  <span>Amostras Gravadas: <strong>{knnTotalSamples}</strong></span>
                  <span>Pontos p/ Letra {knnTargetLetter}: <strong>{knnSamples[knnTargetLetter] || 0}</strong></span>
                </div>
              </div>

              {/* Data Import / Export */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={handleExportKnn}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 py-2 rounded-lg flex items-center justify-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar JSON</span>
                </button>
                <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 py-2 rounded-lg flex items-center justify-center gap-1 transition cursor-pointer text-center">
                  <Upload className="w-3.5 h-3.5 inline" />
                  <span>Importar JSON</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportKnn}
                    className="hidden"
                  />
                </label>
              </div>

              {exportDataUrl && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-center">
                  <a
                    href={exportDataUrl}
                    download="libras_knn_dataset.json"
                    className="text-xs text-emerald-400 font-bold hover:underline"
                  >
                    Clique para Baixar o Arquivo Exportado
                  </a>
                </div>
              )}

              {/* Live Telemetry Data Feed */}
              <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl flex flex-col gap-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <Dna className="w-4 h-4 text-emerald-400" />
                  <span>Telemetria de Marcos (Vetor de Atributos)</span>
                </h4>
                
                {debugTelemetry ? (
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 mt-1">
                    <div className="bg-slate-900/60 p-2 rounded border border-slate-900/40">
                      <span className="text-slate-500 uppercase">Indice Extensão:</span>
                      <span className="float-right text-white">{debugTelemetry.fingerRatios.Index}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded border border-slate-900/40">
                      <span className="text-slate-500 uppercase">Médio Extensão:</span>
                      <span className="float-right text-white">{debugTelemetry.fingerRatios.Middle}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded border border-slate-900/40">
                      <span className="text-slate-500 uppercase">Anelar Extensão:</span>
                      <span className="float-right text-white">{debugTelemetry.fingerRatios.Ring}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded border border-slate-900/40">
                      <span className="text-slate-500 uppercase">Mínimo Extensão:</span>
                      <span className="float-right text-white">{debugTelemetry.fingerRatios.Pinky}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded border border-slate-900/40 col-span-2">
                      <span className="text-slate-500 uppercase">Distância Polegar-Indicador:</span>
                      <span className="float-right text-white">{debugTelemetry.thumbIndexDistance}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded border border-slate-900/40 col-span-2">
                      <span className="text-slate-500 uppercase">Orientação de Palma:</span>
                      <span className="float-right text-emerald-400 font-bold">{debugTelemetry.orientation}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-slate-600 italic">Ligue a câmera e posicione a mão para ver as coordenadas e métricas...</span>
                )}
              </div>

              {/* Clear dataset warning trigger */}
              {knnTotalSamples > 0 && (
                <button
                  onClick={clearKnnDataset}
                  className="text-xs text-amber-500/80 hover:text-amber-400 font-semibold py-2.5 border border-amber-500/20 hover:border-amber-500/40 rounded-xl transition text-center bg-amber-500/5"
                >
                  Restaurar Amostras de Referência Padrão (TCC)
                </button>
              )}

            </div>
          )}

        </section>

      </main>

      {/* 3. Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 px-6 py-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center text-xs text-slate-500">
          <div>
            <p>© 2026 Tradutor de Libras TCC Lab. Desenvolvido para reconhecimento inclusivo de sinais.</p>
            <p className="mt-1 text-slate-600">Baseado no pipeline original de MediaPipe Hands + Classificação de Gestos.</p>
          </div>
          <div className="flex gap-4">
            <span className="hover:text-slate-300 transition cursor-default">OpenCV 4.8</span>
            <span className="hover:text-slate-300 transition cursor-default">MediaPipe Hands</span>
            <span className="hover:text-slate-300 transition cursor-default">KNN Classifiers</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
