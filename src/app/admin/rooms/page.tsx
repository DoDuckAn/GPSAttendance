'use client';

// ============================================================
// Admin — Room Management
// Features:
//   • Create room: GPS capture + map-click to add corners
//   • Live polygon preview on Leaflet map (right column)
//   • Edit existing rooms (same GPS + map interface)
//   • Inline map viewer for each room in the list
// ============================================================

import { useCallback, useEffect, useState, FormEvent } from 'react';
import dynamic from 'next/dynamic';

// ── Types ─────────────────────────────────────────────────────

interface LatLng {
  lat: number;
  lng: number;
}

interface Room {
  _id: string;
  name: string;
  corners: LatLng[];
  center: LatLng | null;
  bufferRadius: number;
  createdAt: string;
}

// ── Dynamic Leaflet map (no SSR — Leaflet requires window) ────

const RoomMap = dynamic(() => import('./RoomMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
      <span className="text-gray-400 text-sm animate-pulse">⌛ Đang tải bản đồ...</span>
    </div>
  ),
});

// ── CornerList sub-component ──────────────────────────────────

interface CornerListProps {
  corners: LatLng[];
  onRemove: (i: number) => void;
  onClear: () => void;
  onGpsCapture: () => void;
  gpsLoading: boolean;
  gpsError: string | null;
  gpsMsg?: string | null;
}

function CornerList({
  corners,
  onRemove,
  onClear,
  onGpsCapture,
  gpsLoading,
  gpsError,
  gpsMsg,
}: CornerListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Cac goc phong
          <span className="ml-1.5 font-normal text-gray-400">({corners.length} diem)</span>
          {corners.length >= 3 && (
            <span className="ml-1.5 text-green-500 text-xs font-semibold">polygon OK</span>
          )}
        </span>
        {corners.length > 0 && (
          <button type="button" onClick={onClear} className="text-xs text-red-500 hover:text-red-700 underline">
            Xoa het
          </button>
        )}
      </div>

      {corners.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-3 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          Chua co goc nao. Dung GPS hoac nhap tren ban do.
        </p>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {corners.map((c, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {i + 1}
              </div>
              <span className="font-mono text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">
                {c.lat.toFixed(6)}, {c.lng.toFixed(6)}
              </span>
              <button type="button" onClick={() => onRemove(i)} className="text-gray-300 hover:text-red-500 text-xl leading-none flex-shrink-0 transition-colors">
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onGpsCapture}
        disabled={gpsLoading}
        className={`w-full py-2.5 rounded-lg border-2 border-dashed text-sm font-medium flex items-center justify-center gap-2 transition-all select-none ${gpsLoading ? 'border-blue-300 text-blue-400 bg-blue-50 dark:bg-blue-900/10 cursor-wait' : 'border-blue-400 text-blue-600 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-[0.98] cursor-pointer'}`}
      >
        {gpsLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-left text-xs leading-tight">{gpsMsg || 'Dang khoi dong GPS...'}</span>
          </>
        ) : (
          'Them goc tai vi tri GPS hien tai'
        )}
      </button>

      {gpsError && (
        <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2.5 py-1.5">
          {gpsError}
        </p>
      )}
      <p className="text-xs text-gray-400">Hoac nhap tren ban do ben canh de chon goc.</p>
    </div>
  );
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [name, setName] = useState('');
  const [buffer, setBuffer] = useState(30);
  const [corners, setCorners] = useState<LatLng[]>([]);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [currLoc, setCurrLoc] = useState<LatLng | null>(null);
  const [creating, setCreating] = useState(false);
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [eName, setEName] = useState('');
  const [eBuffer, setEBuffer] = useState(30);
  const [eCorners, setECorners] = useState<LatLng[]>([]);
  const [eGpsLoading, setEGpsLoading] = useState(false);
  const [eGpsError, setEGpsError] = useState<string | null>(null);
  const [eGpsMsg, setEGpsMsg] = useState<string | null>(null);
  const [eCurrLoc, setECurrLoc] = useState<LatLng | null>(null);
  const [updating, setUpdating] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    const res = await fetch('/api/rooms');
    setRooms(await res.json());
    setPageLoading(false);
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // ── Multi-sample GPS capture for corners ────────────────────
  // Thu 10 mau, loc bo mau sai so > 25m, tinh trung binh co trong so
  const CORNER_SAMPLES = 10;
  const CORNER_MAX_ACCURACY = 25; // met

  const grabGps = (
    onGot: (p: LatLng) => void,
    setLoading: (b: boolean) => void,
    setErr: (s: string | null) => void,
    setMsg: (s: string | null) => void,
  ) => {
    if (!navigator.geolocation) { setErr('Trinh duyet khong ho tro GPS'); return; }
    setLoading(true); setErr(null); setMsg('Dang khoi dong GPS...');

    const samples: { lat: number; lng: number; accuracy: number }[] = [];
    let watchId: number;
    let timeoutId: ReturnType<typeof setTimeout>;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timeoutId);
      setLoading(false);
      setMsg(null);

      if (samples.length === 0) { setErr('Khong lay duoc mau GPS nao'); return; }

      // Uu tien mau co do chinh xac tot; fallback neu khong du
      const good = samples.filter(s => s.accuracy <= CORNER_MAX_ACCURACY);
      const useArr = good.length >= 3 ? good : samples;

      // Trung binh co trong so: weight = 1 / accuracy^2
      let wLat = 0, wLng = 0, wSum = 0;
      for (const s of useArr) {
        const w = 1 / (s.accuracy * s.accuracy);
        wLat += s.lat * w; wLng += s.lng * w; wSum += w;
      }
      onGot({ lat: wLat / wSum, lng: wLng / wSum });
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        samples.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setMsg(`Thu mau ${samples.length}/${CORNER_SAMPLES} (±${pos.coords.accuracy.toFixed(1)}m)`);
        if (samples.length >= CORNER_SAMPLES) finish();
      },
      (err) => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        navigator.geolocation.clearWatch(watchId);
        setLoading(false); setMsg(null);
        setErr('GPS loi: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );

    // Timeout 30s: dung voi bat cu so mau nao da co
    timeoutId = setTimeout(() => { if (!done) finish(); }, 30000);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), corners, bufferRadius: buffer }) });
    setName(''); setBuffer(30); setCorners([]); setCurrLoc(null); setGpsError(null); setGpsMsg(null); setCreating(false);
    loadRooms();
  };

  const handleUpdate = async () => {
    if (!editRoom) return;
    setUpdating(true);
    await fetch(`/api/rooms/${editRoom._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: eName, corners: eCorners, bufferRadius: eBuffer }) });
    cancelEdit(); setUpdating(false); loadRooms();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xoa phong nay?')) return;
    await fetch(`/api/rooms/${id}`, { method: 'DELETE' });
    if (viewId === id) setViewId(null);
    if (editRoom?._id === id) cancelEdit();
    loadRooms();
  };

  const startEdit = (room: Room) => {
    setEditRoom(room); setEName(room.name); setEBuffer(room.bufferRadius);
    setECorners([...(room.corners || [])]); setECurrLoc(null); setEGpsError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => { setEditRoom(null); setECorners([]); setECurrLoc(null); setEGpsError(null); setEGpsMsg(null); };

  const aCorners = editRoom ? eCorners : corners;
  const aBuffer = editRoom ? eBuffer : buffer;
  const aCurrLoc = editRoom ? eCurrLoc : currLoc;
  const onMapClick = (lat: number, lng: number) =>
    editRoom ? setECorners(p => [...p, { lat, lng }]) : setCorners(p => [...p, { lat, lng }]);

  if (pageLoading) return <div className="text-gray-400 text-center py-16">Dang tai...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quan ly Phong</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {editRoom ? 'Chinh sua: ' + editRoom.name : 'Tao phong moi'}
          </h2>
          {editRoom && (
            <button onClick={cancelEdit} className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
              Huy chinh sua
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-5 space-y-5 lg:border-r border-gray-200 dark:border-gray-800">
            {editRoom ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Ten phong</label>
                  <input type="text" value={eName} onChange={e => setEName(e.target.value)} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Buffer: {eBuffer}m</label>
                  <input type="range" min={5} max={300} step={5} value={eBuffer} onChange={e => setEBuffer(+e.target.value)} className="w-full accent-blue-600" />
                </div>
                <CornerList corners={eCorners} onRemove={i => setECorners(p => p.filter((_, j) => j !== i))} onClear={() => setECorners([])}
                  onGpsCapture={() => grabGps(p => { setECorners(c => [...c, p]); setECurrLoc(p); }, setEGpsLoading, setEGpsError, setEGpsMsg)}
                  gpsLoading={eGpsLoading} gpsError={eGpsError} gpsMsg={eGpsMsg} />
                <div className="flex gap-2 pt-1">
                  <button onClick={handleUpdate} disabled={updating || !eName.trim()} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">{updating ? 'Dang luu...' : 'Luu thay doi'}</button>
                  <button onClick={cancelEdit} className="px-5 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300">Huy</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleCreate} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Ten phong *</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="VD: Lab A1-101" required className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Buffer: {buffer}m</label>
                  <input type="range" min={5} max={300} step={5} value={buffer} onChange={e => setBuffer(+e.target.value)} className="w-full accent-blue-600" />
                </div>
                <CornerList corners={corners} onRemove={i => setCorners(p => p.filter((_, j) => j !== i))} onClear={() => setCorners([])}
                  onGpsCapture={() => grabGps(p => { setCorners(c => [...c, p]); setCurrLoc(p); }, setGpsLoading, setGpsError, setGpsMsg)}
                  gpsLoading={gpsLoading} gpsError={gpsError} gpsMsg={gpsMsg} />
                <button type="submit" disabled={creating || !name.trim()} className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">{creating ? 'Dang tao...' : 'Tao phong'}</button>
              </form>
            )}
          </div>

          <div className="h-[430px] lg:h-auto p-3 bg-gray-50 dark:bg-gray-800/20 relative">
            <div className="h-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <RoomMap corners={aCorners} bufferRadius={aBuffer} currentLocation={aCurrLoc} onMapClick={onMapClick} />
            </div>
            {aCorners.length === 0 && (
              <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none px-3">
                <div className="bg-black/60 text-white text-xs px-3.5 py-1.5 rounded-full backdrop-blur-sm">Nhap len ban do de them goc phong</div>
              </div>
            )}
            <div className="absolute top-5 right-5 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs space-y-1 pointer-events-none border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 bg-blue-600 rounded-full flex-shrink-0" /><span className="text-gray-600 dark:text-gray-300">Goc phong</span></div>
              <div className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 bg-green-500 rounded-full flex-shrink-0" /><span className="text-gray-600 dark:text-gray-300">Vi tri GPS</span></div>
              <div className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 bg-amber-400 rounded-full flex-shrink-0" /><span className="text-gray-600 dark:text-gray-300">Tam phong</span></div>
              <div className="flex items-center gap-1.5"><span className="w-5 h-0 border border-dashed border-amber-400 flex-shrink-0 mt-1" /><span className="text-gray-600 dark:text-gray-300">Buffer</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Danh sach phong <span className="text-gray-400 font-normal text-base">({rooms.length})</span></h2>
        {rooms.length === 0 && (<p className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">Chua co phong nao.</p>)}
        {rooms.map(room => (
          <div key={room._id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white text-base">{room.name}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="text-xs bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 px-2 py-0.5 rounded-full">buffer {room.bufferRadius}m</span>
                  <span className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full">{room.corners?.length || 0} goc</span>
                  {(room.corners?.length || 0) >= 3 && (<span className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-full">polygon</span>)}
                </div>
                {room.center && (<p className="text-xs font-mono text-gray-400 mt-1">tam: {room.center.lat.toFixed(6)}, {room.center.lng.toFixed(6)}</p>)}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setViewId(viewId === room._id ? null : room._id)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewId === room._id ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
                  {viewId === room._id ? 'An' : 'Map'}
                </button>
                <button onClick={() => startEdit(room)} className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-sm hover:bg-blue-200">Sua</button>
                <button onClick={() => handleDelete(room._id)} className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-sm hover:bg-red-200">Xoa</button>
              </div>
            </div>
            {viewId === room._id && (
              <div className="border-t border-gray-200 dark:border-gray-800 h-[340px] p-3 bg-gray-50 dark:bg-gray-800/20">
                <RoomMap corners={room.corners || []} bufferRadius={room.bufferRadius} readOnly />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
