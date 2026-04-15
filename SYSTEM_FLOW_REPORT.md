# System Flow Report: Indoor Positioning Attendance Platform

## 1. System Overview

This platform is a research tool for evaluating indoor positioning algorithms in the context of attendance verification. It collects real-world GPS data from users' smartphones, runs multiple positioning algorithms, and compares their results against user-provided ground truth.

### Architecture
```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Client UI  │────▶│  Next.js API     │────▶│  MongoDB      │
│  (Browser)  │◀────│  Routes          │◀────│  Atlas        │
│             │     │                  │     │               │
│ • GPS data  │     │ • Run algorithms │     │ • rooms       │
│ • Feedback  │     │ • Store results  │     │ • attendance  │
│             │     │ • Analytics      │     │   _logs       │
└─────────────┘     └──────────────────┘     └───────────────┘
       │
       │
┌─────────────┐
│  Admin UI   │
│             │
│ • Rooms     │
│ • Logs      │
│ • Analytics │
│ • Export    │
└─────────────┘
```

### Technology Stack
- **Frontend**: Next.js 15 (App Router) + TailwindCSS
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: MongoDB via Mongoose ODM
- **Charts**: Recharts (React charting library)
- **Deployment**: Vercel + MongoDB Atlas

---

## 2. End-to-End Check-in Flow

### Step 1: Room Selection
```
User opens / → Client fetches GET /api/rooms → User selects a room
```

### Step 2: GPS Data Collection
```
User clicks "Check In"
  ↓
Browser requests Geolocation permission
  ↓
navigator.geolocation.watchPosition() starts
  ↓
System collects 12 GPS samples at 800ms intervals
(~10 seconds total)
  ↓
Each sample records:
  • latitude, longitude
  • accuracy (meters, 68% CI)
  • timestamp
  • altitude, speed, heading (if available)
```

### Step 3: Algorithm Processing
```
Client sends POST /api/attendance
  {
    roomId: "...",
    samples: [{ lat, lng, accuracy, timestamp }, ...]
  }
  ↓
Server fetches room geometry from MongoDB
  ↓
Server builds RoomGeofence:
  { corners, center, bufferRadius }
  ↓
runAllAlgorithms(samples, geofence) executes:
  ├── baselineGps()         → position, inside, confidence
  ├── slidingWindowCentroid() → position, inside, confidence
  ├── kalmanFilter()        → position, inside, confidence
  ├── irlsHuber()           → position, inside, confidence
  └── hybrid()              → position, inside, confidence
  ↓
All results saved to attendance_logs collection
  ↓
Response sent back to client with all algorithm results
```

### Step 4: Results Display
```
Client displays results from each algorithm:
  • Algorithm name
  • Computed position (lat, lng)
  • Inside/Outside decision
  • Confidence score (0-100%)
```

### Step 5: Ground Truth Collection
```
System asks: "Were you actually inside the room?"
  ↓
User clicks YES or NO
  ↓
Client sends PATCH /api/attendance/:id/feedback
  { groundTruth: true/false }
  ↓
Database record updated with ground truth
```

---

## 3. Data Pipeline

### 3.1 Data Collection Layer
```
Browser Geolocation API
  ↓
GpsSample[] (12 samples, ~800ms apart)
  ↓
POST to /api/attendance
```

### 3.2 Processing Layer
```
Raw Samples
  ↓
┌─────────────────────────────────────────────┐
│           Algorithm Orchestrator            │
│                                             │
│  samples + geofence → runAllAlgorithms()    │
│                                             │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐    │
│  │Baseline │ │ Centroid  │ │ Kalman   │    │
│  │  GPS    │ │  Window   │ │ Filter   │    │
│  └────┬────┘ └────┬─────┘ └────┬─────┘    │
│       │           │             │           │
│  ┌────┴──────┐ ┌──┴───────┐               │
│  │IRLS+Huber │ │  Hybrid  │               │
│  └────┬──────┘ └────┬─────┘               │
│       │              │                      │
│       └──────┬───────┘                      │
│              ↓                              │
│    AllAlgorithmResults                      │
└─────────────────────────────────────────────┘
```

### 3.3 Storage Layer
```
MongoDB Collections:

rooms {
  _id, name, corners[], center, bufferRadius, createdAt
}

attendance_logs {
  _id, roomId, roomName, timestamp,
  rawSamples[]: { lat, lng, accuracy, timestamp, ... },
  results: {
    gps:        { name, position, inside, confidence, metadata },
    centroid:   { name, position, inside, confidence, metadata },
    kalman:     { name, position, inside, confidence, metadata },
    irls_huber: { name, position, inside, confidence, metadata },
    hybrid:     { name, position, inside, confidence, metadata }
  },
  groundTruth: boolean | null
}
```

### 3.4 Analytics Layer
```
attendance_logs (with groundTruth ≠ null)
  ↓
For each algorithm:
  Compare predicted (inside) vs actual (groundTruth)
  ↓
  Confusion Matrix:
    TP = predicted IN  & actually IN
    FP = predicted IN  & actually OUT
    FN = predicted OUT & actually IN
    TN = predicted OUT & actually OUT
  ↓
  Metrics:
    Accuracy  = (TP + TN) / (TP + FP + FN + TN)
    Precision = TP / (TP + FP)
    Recall    = TP / (TP + FN)
    F1        = 2 · Precision · Recall / (Precision + Recall)
```

---

## 4. How Evaluation Works

### 4.1 Ground Truth Collection
The key insight: **the user knows if they are in the room**. After each check-in, we ask them to confirm. This gives us a labeled dataset for evaluation.

### 4.2 Comparison Methodology
For each check-in record that has ground truth:
1. Each algorithm produced a binary prediction: `inside = true/false`
2. The ground truth provides the correct label: `groundTruth = true/false`
3. We compute standard classification metrics

### 4.3 Visualization
The admin analytics page provides:
- **Bar chart**: Accuracy, precision, recall, F1 per algorithm
- **Radar chart**: Multi-metric comparison across algorithms
- **Confusion matrices**: Visual TP/FP/FN/TN counts per algorithm
- **Per-room breakdown**: Accuracy per algorithm per room

### 4.4 Data Export
All data can be exported for external analysis:
- **CSV**: `/api/export?format=csv` — flat table with all fields
- **JSON**: `/api/export?format=json` — full MongoDB documents
- Filtered by room: add `?roomId=...`

---

## 5. Room Configuration

### Minimal Setup
A room only requires a **name** to be created. The system uses a default buffer radius of 30 meters.

### Full Setup
For better accuracy, rooms can be configured with:
1. **Polygon corners**: 4+ lat/lng points defining the room boundary
2. **Buffer radius**: How far from the center/polygon boundary a GPS reading can be and still count as "inside"
3. **Center**: Auto-computed from corners, or use default

### No-Corner Fallback
If no corners are set, the system creates a small (~22m) square polygon around the center point. All geofencing then relies primarily on the buffer radius.

---

## 6. API Design

### RESTful Design
| Resource | Operations |
|----------|------------|
| `/api/rooms` | GET (list), POST (create) |
| `/api/rooms/:id` | GET, PUT, DELETE |
| `/api/attendance` | GET (list+filter), POST (check-in) |
| `/api/attendance/:id/feedback` | PATCH (update ground truth) |
| `/api/analytics` | GET (computed metrics) |
| `/api/export` | GET (CSV or JSON download) |

### Check-in POST Body
```json
{
  "roomId": "ObjectId string",
  "samples": [
    {
      "lat": 10.772150,
      "lng": 106.657700,
      "accuracy": 12.5,
      "timestamp": 1713200000000
    }
  ]
}
```

### Check-in Response
```json
{
  "logId": "ObjectId string",
  "results": {
    "gps": { "name": "Baseline GPS", "position": {...}, "inside": true, "confidence": 0.65 },
    "centroid": { "name": "Sliding Window Centroid", ... },
    "kalman": { "name": "Kalman Filter", ... },
    "irls_huber": { "name": "IRLS + Huber", ... },
    "hybrid": { "name": "Hybrid", ... }
  }
}
```

---

## 7. Extensibility

### Adding New Algorithms
1. Create a new file in `src/lib/algorithms/`
2. Export a function with signature: `(samples: GpsSample[], room: RoomGeofence) => AlgorithmResult`
3. Add it to `runAllAlgorithms()` in `index.ts`
4. Add the key to the attendance log schema
5. Update the analytics to include the new algorithm

### Adding WiFi Fingerprinting
The hybrid algorithm already has a slot for WiFi confidence. To integrate real WiFi data:
1. Collect WiFi scan data in the client (requires native app or Web API where available)
2. Send it alongside GPS samples
3. Implement a fingerprint database and kNN matching
4. Replace `simulateWifiConfidence()` with the real implementation

### Adding Bluetooth Beacons
Similar to WiFi, BLE beacon RSSI values can be incorporated:
1. Add beacon RSSI to the sample data
2. Implement trilateration from known beacon positions
3. Fuse with GPS estimate in the hybrid algorithm

---

## 8. Security & Privacy Notes

This system is intentionally built **without authentication** for research simplicity. For production use:
- Add user authentication (e.g., NextAuth.js)
- Anonymize GPS data after analysis
- Implement rate limiting on API routes
- Add CSRF protection
- Use input validation (currently minimal, research-focused)
