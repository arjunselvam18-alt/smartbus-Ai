import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  Play,
  Square,
  RotateCcw,
  Users,
  Sliders,
  AlertTriangle,
  Info,
  Sparkles,
  Video,
  CheckCircle2,
  Clock,
  Radio,
  FileVideo,
  Image as ImageIcon,
  ShieldAlert,
  Cpu,
  Layers,
} from 'lucide-react';
import { AIDetectionResult, BoundingBox, Bus, CrowdLevel } from '../../types';
import { CrowdBadge } from '../common/CrowdBadge';
import { CrowdSourceDetails } from '../common/CrowdSourceDetails';
import { CROWD_COLORS } from '../../data/mockData';

interface AICameraVisionProps {
  buses: Bus[];
  selectedBusId?: string;
  onUpdateBusCrowd?: (busId: string, passengerCount: number, capacity?: number) => void;
}

// Pre-calibrated high-precision benchmark passenger detections for authentic bus interior CCTV
const BUS_INTERIOR_BENCHMARK_BOXES: BoundingBox[] = [
  { id: 'p_1', label: 'person', confidence: 0.94, box: [740, 100, 970, 220] }, // Seated passenger reading bottom-left
  { id: 'p_2', label: 'person', confidence: 0.96, box: [640, 200, 970, 370] }, // Seated passenger left mid
  { id: 'p_3', label: 'person', confidence: 0.91, box: [520, 290, 870, 430] }, // Seated passenger left aisle
  { id: 'p_4', label: 'person', confidence: 0.88, box: [410, 370, 630, 485] }, // Seated passenger rear-left
  { id: 'p_5', label: 'person', confidence: 0.86, box: [385, 440, 580, 495] }, // Passenger near rear door
  { id: 'p_6', label: 'person', confidence: 0.95, box: [380, 530, 830, 625] }, // Standing passenger holding rail
  { id: 'p_7', label: 'person', confidence: 0.93, box: [480, 580, 980, 715] }, // Standing woman in aisle
  { id: 'p_8', label: 'person', confidence: 0.92, box: [630, 670, 975, 815] }, // Seated passenger right mid
  { id: 'p_9', label: 'person', confidence: 0.95, box: [740, 770, 980, 940] }, // Seated commuter right foreground
  { id: 'p_10', label: 'person', confidence: 0.89, box: [520, 655, 860, 745] }, // Seated passenger right
  { id: 'p_11', label: 'person', confidence: 0.85, box: [450, 610, 560, 680] }, // Seated passenger upper right
  { id: 'p_12', label: 'person', confidence: 0.82, box: [320, 495, 450, 530] }, // Passenger rear left
  { id: 'p_13', label: 'person', confidence: 0.81, box: [340, 520, 460, 555] }, // Passenger rear right
  { id: 'p_14', label: 'person', confidence: 0.84, box: [870, 20, 1000, 120] }, // Commuter bottom-left corner
];

const BUS_INTERIOR_QUIET_BOXES: BoundingBox[] = [
  { id: 'p_1', label: 'person', confidence: 0.95, box: [570, 270, 950, 420] }, // Seated woman reading
  { id: 'p_2', label: 'person', confidence: 0.92, box: [485, 368, 765, 468] }, // Seated commuter mid-aisle
  { id: 'p_3', label: 'person', confidence: 0.96, box: [585, 655, 860, 778] }, // Seated commuter right
];

// Presets using strictly bus interior surveillance photos
const INTERIOR_PRESETS = [
  {
    id: 'cctv_main',
    name: 'Midday Bus Interior (Medium Occupancy)',
    crowdLabel: 'MEDIUM' as CrowdLevel,
    expectedCount: 14,
    capacity: 50,
    imageUrl: '/assets/bus_interior_cctv.jpg',
    boxes: BUS_INTERIOR_BENCHMARK_BOXES,
  },
  {
    id: 'cctv_quiet',
    name: 'Afternoon Feeder Bus (Low Occupancy)',
    crowdLabel: 'LOW' as CrowdLevel,
    expectedCount: 3,
    capacity: 50,
    imageUrl: '/assets/bus_interior_quiet.jpg',
    boxes: BUS_INTERIOR_QUIET_BOXES,
  },
];

type MediaMode = 'image' | 'video' | 'camera';

export const AICameraVision: React.FC<AICameraVisionProps> = ({
  buses,
  selectedBusId,
  onUpdateBusCrowd,
}) => {
  const [activeBusId, setActiveBusId] = useState<string>(selectedBusId || buses[0]?.id || '');
  const activeBus = buses.find((b) => b.id === activeBusId) || buses[0];

  const [capacity, setCapacity] = useState<number>(activeBus?.capacity || 50);
  const [mediaMode, setMediaMode] = useState<MediaMode>('image');
  const [imageSrc, setImageSrc] = useState<string>(INTERIOR_PRESETS[0].imageUrl);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  // Hardware Camera State
  const [isCameraConnected, setIsCameraConnected] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Detection Run States
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [isProcessingFrame, setIsProcessingFrame] = useState<boolean>(false);
  const [detectionResult, setDetectionResult] = useState<AIDetectionResult | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [activePresetId, setActivePresetId] = useState<string>('cctv_main');

  // Backend Vision Engine Status
  const [engineStatus, setEngineStatus] = useState<{
    isYoloAvailable: boolean;
    isGeminiAvailable: boolean;
    activeEngine: 'YOLO_OPENCV_REAL' | 'GEMINI_AI_VISION' | 'DEMO_SIMULATION';
    yoloUrl: string;
  }>({
    isYoloAvailable: false,
    isGeminiAvailable: false,
    activeEngine: 'DEMO_SIMULATION',
    yoloUrl: 'http://localhost:8000',
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const detectionLoopRef = useRef<NodeJS.Timeout | null>(null);

  // Sync capacity when selected bus changes
  useEffect(() => {
    if (activeBus) {
      setCapacity(activeBus.capacity);
    }
  }, [activeBusId]);

  // Query Backend Vision status on mount
  useEffect(() => {
    async function checkVisionStatus() {
      try {
        const res = await fetch('/api/ai/vision-status');
        if (res.ok) {
          const data = await res.json();
          setEngineStatus(data);
        }
      } catch {
        // Fallback default
      }
    }
    checkVisionStatus();
  }, []);

  // Compute crowd classification strictly matching 0-30% LOW, 31-70% MEDIUM, 71-100% HIGH
  const calculateCrowdMetrics = useCallback(
    (passengerCount: number, busCapacity: number) => {
      const cap = Math.max(10, busCapacity);
      const occupancy = Math.min(100, Math.round((passengerCount / cap) * 100));
      let crowdStatus: CrowdLevel = 'LOW';
      if (occupancy > 70) crowdStatus = 'HIGH';
      else if (occupancy > 30) crowdStatus = 'MEDIUM';
      return { occupancy, crowdStatus };
    },
    []
  );

  // Load Initial Benchmark on Mount
  useEffect(() => {
    const initialPreset = INTERIOR_PRESETS[0];
    const { occupancy, crowdStatus } = calculateCrowdMetrics(
      initialPreset.expectedCount,
      initialPreset.capacity
    );

    setDetectionResult({
      passengerCount: initialPreset.expectedCount,
      capacity: initialPreset.capacity,
      crowdPercentage: occupancy,
      crowdCategory: crowdStatus,
      confidenceAverage: 0.91,
      boundingBoxes: initialPreset.boxes,
      processingTimeMs: 45,
      detectionSource: 'DEMO_SIMULATION',
      isDemoMode: true,
      timestamp: new Date().toISOString(),
    });
  }, [calculateCrowdMetrics]);

  // Clean up media streams and detection interval on unmount
  useEffect(() => {
    return () => {
      if (detectionLoopRef.current) clearInterval(detectionLoopRef.current);
      stopCameraStream();
    };
  }, []);

  // Camera Management
  const stopCameraStream = () => {
    if (cameraVideoRef.current && cameraVideoRef.current.srcObject) {
      const stream = cameraVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      cameraVideoRef.current.srcObject = null;
    }
    setIsCameraConnected(false);
  };

  const handleConnectCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Webcam / Video capture is not supported by your browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment', // prefer back/interior facing camera
        },
      });

      setMediaMode('camera');
      setIsCameraConnected(true);

      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Camera connection failed:', err);
      setIsCameraConnected(false);
      setCameraError(`Could not connect camera: ${err.message || 'Permission denied or no device found'}`);
    }
  };

  // Upload Handlers
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopDetection();
    stopCameraStream();
    setMediaMode('image');
    setActivePresetId('custom_upload');

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImageSrc(result);
      // Run detection on uploaded image
      runSingleFrameInference(result, capacity);
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopDetection();
    stopCameraStream();
    setMediaMode('video');
    setActivePresetId('custom_video');

    const videoUrl = URL.createObjectURL(file);
    setVideoSrc(videoUrl);

    // Reset results until Start Detection is clicked
    setDetectionResult(null);
  };

  // Capture frame from active video element for inference
  const captureFrameFromVideo = (videoEl: HTMLVideoElement): string | null => {
    if (!videoEl || videoEl.readyState < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // Single Frame Inference Runner
  const runSingleFrameInference = async (imgData: string, capVal: number) => {
    setIsProcessingFrame(true);
    try {
      const response = await fetch('/api/ai/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imgData,
          capacity: capVal,
        }),
      });

      if (!response.ok) {
        throw new Error(`Inference returned HTTP ${response.status}`);
      }

      const result: AIDetectionResult = await response.json();
      setDetectionResult(result);

      if (onUpdateBusCrowd && activeBus) {
        onUpdateBusCrowd(activeBus.id, result.passengerCount, capVal);
      }
    } catch (err: any) {
      console.warn('Real AI detection fallback to simulation:', err.message);

      // Construct a clean, transparent simulation response without pretending it was live AI
      const syntheticCount = Math.floor(10 + Math.random() * 8);
      const { occupancy, crowdStatus } = calculateCrowdMetrics(syntheticCount, capVal);

      setDetectionResult({
        passengerCount: syntheticCount,
        capacity: capVal,
        crowdPercentage: occupancy,
        crowdCategory: crowdStatus,
        confidenceAverage: 0.88,
        boundingBoxes: [],
        processingTimeMs: 120,
        detectionSource: 'DEMO_SIMULATION',
        isDemoMode: true,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsProcessingFrame(false);
    }
  };

  // Detection Controls: Start, Stop, Reset
  const startDetection = () => {
    setIsDetecting(true);

    if (mediaMode === 'image') {
      runSingleFrameInference(imageSrc, capacity);
      return;
    }

    // Continuous Frame Detection Loop for Video or Camera Stream
    if (detectionLoopRef.current) clearInterval(detectionLoopRef.current);

    const runLoop = () => {
      const activeVideo = mediaMode === 'camera' ? cameraVideoRef.current : videoRef.current;
      if (activeVideo) {
        const frame = captureFrameFromVideo(activeVideo);
        if (frame) {
          runSingleFrameInference(frame, capacity);
        }
      }
    };

    // Execute first frame immediately, then repeat every 1800ms
    runLoop();
    detectionLoopRef.current = setInterval(runLoop, 1800);
  };

  const stopDetection = () => {
    setIsDetecting(false);
    if (detectionLoopRef.current) {
      clearInterval(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
  };

  const resetDetection = () => {
    stopDetection();
    stopCameraStream();
    setMediaMode('image');
    setActivePresetId('cctv_main');
    setImageSrc(INTERIOR_PRESETS[0].imageUrl);
    setVideoSrc(null);
    setCameraError(null);

    // Revert to benchmark preset
    const preset = INTERIOR_PRESETS[0];
    const { occupancy, crowdStatus } = calculateCrowdMetrics(preset.expectedCount, capacity);

    setDetectionResult({
      passengerCount: preset.expectedCount,
      capacity: capacity,
      crowdPercentage: occupancy,
      crowdCategory: crowdStatus,
      confidenceAverage: 0.91,
      boundingBoxes: preset.boxes,
      processingTimeMs: 40,
      detectionSource: 'DEMO_SIMULATION',
      isDemoMode: true,
      timestamp: new Date().toISOString(),
    });
  };

  // Switch Preset Handler
  const loadPreset = (presetId: string) => {
    const preset = INTERIOR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    stopDetection();
    stopCameraStream();
    setMediaMode('image');
    setActivePresetId(preset.id);
    setImageSrc(preset.imageUrl);

    const { occupancy, crowdStatus } = calculateCrowdMetrics(preset.expectedCount, capacity);

    setDetectionResult({
      passengerCount: preset.expectedCount,
      capacity: capacity,
      crowdPercentage: occupancy,
      crowdCategory: crowdStatus,
      confidenceAverage: 0.92,
      boundingBoxes: preset.boxes,
      processingTimeMs: 45,
      detectionSource: 'DEMO_SIMULATION',
      isDemoMode: true,
      timestamp: new Date().toISOString(),
    });

    if (onUpdateBusCrowd && activeBus) {
      onUpdateBusCrowd(activeBus.id, preset.expectedCount, capacity);
    }
  };

  // Draw Bounding Boxes on Overlay Canvas (strictly kept inside visible image bounds)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resolve current viewport dimensions
    let activeWidth = 800;
    let activeHeight = 450;

    if (mediaMode === 'image' && imageRef.current) {
      activeWidth = imageRef.current.clientWidth || imageRef.current.naturalWidth || 800;
      activeHeight = imageRef.current.clientHeight || imageRef.current.naturalHeight || 450;
    } else if (mediaMode === 'video' && videoRef.current) {
      activeWidth = videoRef.current.clientWidth || 800;
      activeHeight = videoRef.current.clientHeight || 450;
    } else if (mediaMode === 'camera' && cameraVideoRef.current) {
      activeWidth = cameraVideoRef.current.clientWidth || 800;
      activeHeight = cameraVideoRef.current.clientHeight || 450;
    }

    canvas.width = activeWidth;
    canvas.height = activeHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showBoundingBoxes || !detectionResult || !detectionResult.boundingBoxes) return;

    const scaleX = canvas.width / 1000;
    const scaleY = canvas.height / 1000;

    detectionResult.boundingBoxes.forEach((box, index) => {
      const [ymin, xmin, ymax, xmax] = box.box;

      // Scale coordinates from 0-1000 normalized space
      const rawX = xmin * scaleX;
      const rawY = ymin * scaleY;
      const rawW = (xmax - xmin) * scaleX;
      const rawH = (ymax - ymin) * scaleY;

      // Clamp strictly inside visible image boundaries
      const x = Math.max(2, Math.min(canvas.width - 20, rawX));
      const y = Math.max(2, Math.min(canvas.height - 20, rawY));
      const width = Math.min(canvas.width - x - 2, rawW);
      const height = Math.min(canvas.height - y - 2, rawH);

      if (width <= 5 || height <= 5) return;

      // Box styling: high-visibility neon cyan border
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(x, y, width, height);

      // Corner accent markers for realistic surveillance HUD
      const cornerLen = Math.min(10, width / 4, height / 4);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3;

      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      ctx.stroke();

      // Label background & text (e.g. "P1 94%")
      const labelText = `P${index + 1} ${(box.confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 10px monospace, sans-serif';
      const textMetrics = ctx.measureText(labelText);
      const tagWidth = textMetrics.width + 8;
      const tagHeight = 16;
      const tagY = Math.max(0, y - tagHeight);

      ctx.fillStyle = 'rgba(8, 145, 178, 0.9)';
      ctx.fillRect(x, tagY, tagWidth, tagHeight);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x + 4, tagY + 11);
    });
  }, [detectionResult, showBoundingBoxes, mediaMode, imageSrc]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Bus Association */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-600" />
            <span>AI Camera Vision – Bus Interior Passenger Detection</span>
          </h2>
          <p className="text-xs text-slate-500">
            Real-time passenger detection, seat/aisle occupancy analytics, and crowd monitoring.
          </p>
        </div>

        {/* Target Bus Selector */}
        <div className="flex items-center gap-2.5">
          <label className="text-xs font-semibold text-slate-600">Assign To Vehicle:</label>
          <select
            value={activeBusId}
            onChange={(e) => setActiveBusId(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.routeNumber || b.busNumber} – {b.routeName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Vision Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Bus Interior Viewport & Controls (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Viewport Frame */}
          <div className="relative bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl aspect-video flex items-center justify-center select-none">
            {/* Mode 1: Real Camera Feed Preview (only when actual hardware connected) */}
            {mediaMode === 'camera' && (
              <div className="relative w-full h-full flex items-center justify-center">
                {isCameraConnected ? (
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-6 space-y-3 text-slate-400">
                    <Radio className="w-10 h-10 text-rose-500 mx-auto animate-pulse" />
                    <p className="text-sm font-semibold text-white">Camera Disconnected</p>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      No active camera source is connected. Connect an onboard USB camera or click &quot;Connect Camera Feed&quot; below.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Mode 2: Uploaded Video Player */}
            {mediaMode === 'video' && videoSrc && (
              <video
                ref={videoRef}
                src={videoSrc}
                autoPlay
                loop
                muted
                playsInline
                controls
                className="w-full h-full object-contain bg-black"
              />
            )}

            {/* Mode 3: Bus Interior Image (Benchmark or Uploaded) */}
            {mediaMode === 'image' && (
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Bus Interior Feed"
                className="w-full h-full object-cover"
                onLoad={() => {
                  // Trigger redraw on image load
                  setShowBoundingBoxes((prev) => !prev);
                  setTimeout(() => setShowBoundingBoxes(true), 20);
                }}
              />
            )}

            {/* Canvas Bounding Box Overlay */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            />

            {/* In-Flight Processing Spinner */}
            {isProcessingFrame && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2 z-20">
                <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-semibold tracking-wider uppercase font-mono">
                  Inferring Passenger Bounding Boxes...
                </p>
              </div>
            )}

            {/* Surveillance HUD Overlays (Top Left) */}
            <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
              <span className="px-2.5 py-1 text-[11px] font-bold font-mono rounded-lg bg-black/80 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-md">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                CAM-01 [INTERIOR AISLE]
              </span>

              {/* Explicit Mode Indicator per requirement */}
              {detectionResult?.isDemoMode ? (
                <span className="px-2.5 py-1 text-[11px] font-bold font-mono rounded-lg bg-amber-950/90 text-amber-300 border border-amber-600/50 flex items-center gap-1 shadow-md">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>DEMO SIMULATION MODE</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 text-[11px] font-bold font-mono rounded-lg bg-blue-950/90 text-cyan-300 border border-cyan-500/50 flex items-center gap-1 shadow-md">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>LIVE AI DETECTION</span>
                </span>
              )}
            </div>

            {/* Bounding Box Toggle (Top Right) */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  showBoundingBoxes
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-black/70 text-slate-400 border-slate-700'
                }`}
              >
                {showBoundingBoxes ? 'Boxes: ON' : 'Boxes: OFF'}
              </button>
            </div>

            {/* Active Media Badge (Bottom Left) */}
            <div className="absolute bottom-3 left-3 z-20 text-[10px] font-mono text-slate-300 bg-black/60 px-2 py-0.5 rounded backdrop-blur-xs">
              Source:{' '}
              <strong className="text-white uppercase">
                {mediaMode === 'camera'
                  ? isCameraConnected
                    ? 'Connected Live Camera'
                    : 'Camera Disconnected'
                  : mediaMode === 'video'
                  ? 'Uploaded Video Stream'
                  : activePresetId === 'custom_upload'
                  ? 'Custom Uploaded Image'
                  : 'Bus Interior Benchmark'}
              </strong>
            </div>
          </div>

          {/* Camera Error Notice if any */}
          {cameraError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Input & Action Control Bar */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Media Inputs: Upload Image, Upload Video, Camera Preview */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-blue-600" />
                  <span>Upload Image</span>
                </button>

                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                >
                  <FileVideo className="w-4 h-4 text-purple-600" />
                  <span>Upload Video</span>
                </button>

                <button
                  type="button"
                  onClick={handleConnectCamera}
                  className={`px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors border cursor-pointer ${
                    isCameraConnected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                  }`}
                >
                  <Camera className={`w-4 h-4 ${isCameraConnected ? 'text-emerald-600' : 'text-slate-600'}`} />
                  <span>{isCameraConnected ? 'Camera Connected' : 'Connect Camera Feed'}</span>
                </button>
              </div>

              {/* Execution Controls: Start Detection, Stop Detection, Reset Detection */}
              <div className="flex items-center gap-2">
                {!isDetecting ? (
                  <button
                    type="button"
                    onClick={startDetection}
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Start Detection</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopDetection}
                    className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>Stop Detection</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={resetDetection}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  title="Reset Detection to Benchmark Interior"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Benchmark Interior Scenarios Selection */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Bus Interior Benchmark Samples:
              </span>
              <div className="flex items-center gap-2">
                {INTERIOR_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => loadPreset(p.id)}
                    className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all border cursor-pointer ${
                      activePresetId === p.id && mediaMode === 'image'
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    {p.name.split(' (')[0]} ({p.expectedCount} pax)
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Crowd Analytics Dashboard Panel (4 Cols - Kept Separate from Preview) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Crowd Analytics</span>
              </h3>

              {/* Execution Status Badge */}
              {isDetecting ? (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-emerald-100 text-emerald-800 animate-pulse">
                  Detecting Live
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-slate-100 text-slate-600">
                  Ready / Paused
                </span>
              )}
            </div>

            {detectionResult ? (
              <div className="space-y-4">
                {/* 1. Total Detected Passengers & Capacity */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-semibold block uppercase tracking-wide">
                      Total Detected Passengers
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-extrabold text-slate-900 font-mono">
                        {detectionResult.passengerCount}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        / {detectionResult.capacity} Capacity
                      </span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    <Users className="w-6 h-6" />
                  </div>
                </div>

                {/* 2. Occupancy & LOW / MEDIUM / HIGH Crowd Status */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Crowd Status:</span>
                    <CrowdBadge
                      level={detectionResult.crowdCategory}
                      percentage={detectionResult.crowdPercentage}
                      size="lg"
                    />
                  </div>

                  {/* Occupancy Percentage Meter */}
                  <div>
                    <div className="flex justify-between text-xs font-mono font-bold text-slate-700 mb-1">
                      <span>Occupancy:</span>
                      <span className="text-blue-700">{detectionResult.crowdPercentage}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          CROWD_COLORS[detectionResult.crowdCategory]?.bar || 'bg-blue-600'
                        }`}
                        style={{ width: `${Math.min(100, detectionResult.crowdPercentage)}%` }}
                      />
                    </div>
                  </div>

                  {/* Standardized 4-Line Specification Block */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Passengers:</span>
                      <strong className="text-slate-900">{detectionResult.passengerCount}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Capacity:</span>
                      <strong className="text-slate-900">{detectionResult.capacity}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Occupancy:</span>
                      <strong className="text-blue-700">{detectionResult.crowdPercentage}%</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Crowd:</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          detectionResult.crowdCategory === 'LOW'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : detectionResult.crowdCategory === 'MEDIUM'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}
                      >
                        {detectionResult.crowdCategory}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Detection Source & Last Detection Time */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-slate-400" />
                      <span>Detection Source:</span>
                    </span>
                    <span
                      className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                        detectionResult.isDemoMode
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {detectionResult.detectionSource}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Last Detection Time:</span>
                    </span>
                    <span className="font-mono text-slate-700 text-[11px]">
                      {new Date(detectionResult.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-500 text-[11px]">
                    <span>Average Confidence:</span>
                    <span className="font-mono font-semibold text-slate-700">
                      {(detectionResult.confidenceAverage * 100).toFixed(1)}%
                    </span>
                  </div>

                  {activeBus && (activeBus.staffCrowdReport || activeBus.crowdDiscrepancy) && (
                    <div className="pt-2 border-t border-slate-200">
                      <CrowdSourceDetails bus={activeBus} compact />
                    </div>
                  )}
                </div>

                {/* Configurable Bus Capacity Slider */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-600" />
                      <span>Configurable Capacity:</span>
                    </label>
                    <span className="font-mono font-bold text-blue-700">{capacity} seats</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="90"
                    step="5"
                    value={capacity}
                    onChange={(e) => {
                      const newCap = parseInt(e.target.value, 10);
                      setCapacity(newCap);
                      if (detectionResult) {
                        const { occupancy, crowdStatus } = calculateCrowdMetrics(
                          detectionResult.passengerCount,
                          newCap
                        );
                        setDetectionResult({
                          ...detectionResult,
                          capacity: newCap,
                          crowdPercentage: occupancy,
                          crowdCategory: crowdStatus,
                        });
                        if (onUpdateBusCrowd && activeBus) {
                          onUpdateBusCrowd(activeBus.id, detectionResult.passengerCount, newCap);
                        }
                      }
                    }}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400">
                    Occupancy = (Detected Passengers / Capacity) × 100
                  </p>
                </div>

                {/* Engine Connectivity Notice */}
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-blue-600" />
                    <span>Vision Backend Architecture:</span>
                  </p>
                  <p className="leading-relaxed">
                    {engineStatus.isYoloAvailable
                      ? `Connected to local YOLOv8 + OpenCV service at ${engineStatus.yoloUrl}.`
                      : engineStatus.isGeminiAvailable
                      ? 'Running real Gemini Vision API for passenger inference.'
                      : 'Running in DEMO SIMULATION MODE. Pre-calibrated bus interior passenger coordinates are displayed.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <Users className="w-8 h-8 mx-auto text-slate-300" />
                <p>Click &quot;Start Detection&quot; or select a benchmark to analyze passenger occupancy.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
