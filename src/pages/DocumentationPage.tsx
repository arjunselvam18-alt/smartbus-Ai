import React, { useState } from 'react';
import { GOOGLE_APPS_SCRIPT_CODE, SHEETS_SCHEMA } from '../services/googleSheets';
import {
  BookOpen,
  Copy,
  Check,
  Database,
  Code,
  Terminal,
  FileSpreadsheet,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const DocumentationPage: React.FC = () => {
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedPython, setCopiedPython] = useState(false);
  const [expandedSheet, setExpandedSheet] = useState<string | null>('Buses');

  const copyScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const PYTHON_FASTAPI_YOLO_CODE = `# SmartBus AI - Python FastAPI YOLO + OpenCV Backend Service
# Requirements: pip install fastapi uvicorn ultralytics opencv-python pydantic

import io
import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

app = FastAPI(title="SmartBus AI Vision Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load lightweight pre-trained YOLOv8 model (person class index = 0)
model = YOLO("yolov8n.pt")

@app.get("/health")
def health():
    return {"status": "online", "model": "yolov8n-coco"}

@app.post("/predict")
async def detect_passengers(
    file: UploadFile = File(...),
    capacity: int = Form(50)
):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    img_np = np.array(image)
    h, w, _ = img_np.shape

    # Run inference with class filter for person (id: 0)
    results = model(img_np, classes=[0], conf=0.35)
    boxes = results[0].boxes

    passenger_count = len(boxes)
    bounding_boxes = []

    for i, box in enumerate(boxes):
        # Extract normalized 0-1000 coordinates [ymin, xmin, ymax, xmax]
        xyxy = box.xyxy[0].tolist()
        xmin = int((xyxy[0] / w) * 1000)
        ymin = int((xyxy[1] / h) * 1000)
        xmax = int((xyxy[2] / w) * 1000)
        ymax = int((xyxy[3] / h) * 1000)
        conf = float(box.conf[0])

        bounding_boxes.append({
            "id": f"p_{i+1}",
            "label": "person",
            "confidence": round(conf, 2),
            "box": [ymin, xmin, ymax, xmax]
        })

    crowd_percentage = min(100, int((passenger_count / max(1, capacity)) * 100))
    if crowd_percentage <= 30:
        crowd_category = "LOW"
    elif crowd_percentage <= 70:
        crowd_category = "MEDIUM"
    else:
        crowd_category = "HIGH"

    return {
        "passengerCount": passenger_count,
        "capacity": capacity,
        "crowdPercentage": crowd_percentage,
        "crowdCategory": crowd_category,
        "confidenceAverage": 0.88,
        "boundingBoxes": bounding_boxes,
        "detectionSource": "YOLO_FASTAPI",
        "isDemoMode": False
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
`;

  const copyPython = () => {
    navigator.clipboard.writeText(PYTHON_FASTAPI_YOLO_CODE);
    setCopiedPython(true);
    setTimeout(() => setCopiedPython(false), 2500);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Top Banner */}
      <div className="p-6 bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-3xl shadow-xl space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Complete System Integration Architecture</span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          SmartBus AI Setup Guide & Google Sheets Schema
        </h1>
        <p className="text-xs text-blue-100 max-w-3xl leading-relaxed">
          Detailed deployment guide for the 10 Google Sheets tabs, Google Apps Script Web App source code, Python YOLOv8 microservice, and environment variables.
        </p>
      </div>

      {/* SECTION 1: 10 GOOGLE SHEETS TABS SPECIFICATION */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-800">
            1. Google Sheets Database Schema (All 10 Tabs)
          </h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Create a Google Sheet and name the tabs exactly as specified below. The provided Apps Script can also initialize all 10 sheets and headers automatically by requesting <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-mono text-[11px]">?action=setupSheets</code>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SHEETS_SCHEMA.map((sheet, idx) => {
            const isExp = expandedSheet === sheet.name;
            return (
              <div
                key={sheet.name}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs"
              >
                <div
                  onClick={() => setExpandedSheet(isExp ? null : sheet.name)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    <strong className="text-slate-900 font-semibold">{sheet.name}</strong>
                  </div>
                  {isExp ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>

                <p className="text-[11px] text-slate-500 leading-normal">{sheet.description}</p>

                {isExp && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Required Columns:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {sheet.columns.map((col) => (
                        <span
                          key={col}
                          className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-700 font-medium"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: GOOGLE APPS SCRIPT WEB APP CODE */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-800">
              2. Google Apps Script Web App Deployment Code
            </h2>
          </div>

          <button
            onClick={copyScript}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-2 shadow-xs transition-colors self-start sm:self-auto"
          >
            {copiedScript ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            <span>{copiedScript ? 'Code Copied!' : 'Copy Apps Script Code'}</span>
          </button>
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1.5 leading-relaxed">
          <strong className="font-bold block">Deployment Steps:</strong>
          <ol className="list-decimal list-inside space-y-1 text-blue-800">
            <li>Open your Google Sheet at <a href="https://sheets.google.com" target="_blank" rel="noreferrer" className="underline font-bold">sheets.google.com</a>.</li>
            <li>Click <strong>Extensions &gt; Apps Script</strong>.</li>
            <li>Replace all content in <code className="font-mono bg-blue-100 px-1 rounded">Code.gs</code> with the code below.</li>
            <li>Click <strong>Deploy &gt; New deployment</strong>.</li>
            <li>Select type: <strong>Web app</strong>. Set <em>Execute as: Me</em> and <em>Who has access: Anyone</em>.</li>
            <li>Copy the generated Web App URL and paste it into the <strong>Settings</strong> page of this application.</li>
          </ol>
        </div>

        <pre className="p-4 bg-slate-900 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto max-h-80 border border-slate-800">
          <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
        </pre>
      </div>

      {/* SECTION 3: PYTHON FASTAPI + YOLO BACKEND CODE */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-800">
              3. Python FastAPI YOLOv8 + OpenCV Service Template
            </h2>
          </div>

          <button
            onClick={copyPython}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 shadow-xs transition-colors self-start sm:self-auto"
          >
            {copiedPython ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            <span>{copiedPython ? 'Python Code Copied!' : 'Copy Python Code'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Run this microservice on any server with a GPU or CPU to provide live YOLOv8 object detection on bus interior camera feeds.
        </p>

        <pre className="p-4 bg-slate-900 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto max-h-80 border border-slate-800">
          <code>{PYTHON_FASTAPI_YOLO_CODE}</code>
        </pre>
      </div>
    </div>
  );
};
