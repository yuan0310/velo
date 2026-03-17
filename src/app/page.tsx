"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Download, Scissors, Music, Film, CheckCircle2, AlertCircle, Loader2, Zap, X, Play, Pause, FolderOpen, RefreshCw, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DownloadItem {
  id: string;
  title: string;
  thumbnail: string;
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
  format: string;
  quality: string;
  error?: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedVideo, setResolvedVideo] = useState<any>(null);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Configuration for the currently resolved video
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("");
  const [format, setFormat] = useState("mp4"); // mp4, aiff
  const [resolution, setResolution] = useState("1080p");

  // Queue of downloads
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  // Update System
  const [ytdlpVersion, setYtdlpVersion] = useState<string>("...");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetch("/api/admin/update")
      .then(res => res.json())
      .then(data => setYtdlpVersion(data.version || "Unknown"))
      .catch(() => setYtdlpVersion("Unknown"));
  }, []);

  const handleUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for pip install

    try {
      const res = await fetch("/api/admin/update", {
        method: "POST",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        setYtdlpVersion(data.newVersion);
        alert(`Successfully updated to ${data.newVersion}!`);
      } else {
        throw new Error(data.error + (data.details ? ` (${data.details})` : ""));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        alert("Update timed out. The process might still be running in the background, or your internet is very slow.");
      } else {
        alert("Update failed: " + err.message + "\n\nYou can also try manually running: python -m pip install -U yt-dlp");
      }
    } finally {
      setIsUpdating(false);
      clearTimeout(timeoutId);
    }
  };

  const resolveVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const res = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResolvedVideo(data);
      setEndTime(formatDuration(data.duration));
      setStartTime("00:00:00");
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError("Analysis timed out. Try a different URL or check your connection.");
      } else {
        setError(err.message || "Failed to fetch video info");
      }
    } finally {
      setIsResolving(false);
      clearTimeout(timeoutId);
    }
  };

  const handleMarkStart = () => {
    if (videoRef.current) {
      setStartTime(formatDuration(videoRef.current.currentTime));
    }
  };

  const handleMarkEnd = () => {
    if (videoRef.current) {
      setEndTime(formatDuration(videoRef.current.currentTime));
    }
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const parseTimeToSeconds = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  };

  const addToQueue = async () => {
    if (!resolvedVideo) return;

    const downloadId = Math.random().toString(36).substring(7);
    const newItem: DownloadItem = {
      id: downloadId,
      title: resolvedVideo.title,
      thumbnail: resolvedVideo.thumbnail,
      progress: 0,
      status: 'pending',
      format: format.toUpperCase(),
      quality: format === 'aiff' ? 'Lossless' : resolution,
    };

    setDownloads(prev => [newItem, ...prev]);

    // Clear the current view to allow next search
    const currentVideo = { ...resolvedVideo };
    const currentConfig = { startTime, endTime, format, resolution };
    setResolvedVideo(null);
    setUrl("");

    // Start the actual processing
    startDownload(downloadId, currentVideo, currentConfig);
  };

  const startDownload = async (id: string, video: any, config: any) => {
    let fileHandle;
    try {
      const suggestedName = `${video.title.replace(/[\\/*?:"<>|]/g, "")}_clip.${config.format === "aiff" ? "aiff" : "mp4"}`;
      fileHandle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{
          description: config.format === "aiff" ? 'AIFF Audio' : 'Video (H.264 MP4)',
          accept: { [config.format === "aiff" ? 'audio/aiff' : 'video/mp4']: [`.${config.format === "aiff" ? "aiff" : "mp4"}`] },
        }],
      });
    } catch (e) {
      setDownloads(prev => prev.filter(d => d.id !== id));
      return;
    }

    updateDownloadStatus(id, { status: 'processing' });

    try {
      const params = new URLSearchParams({
        url: video.original_url || url, // fallback to current url if not in info
        startTime: config.startTime,
        endTime: config.endTime,
        format: config.format,
        resolution: config.resolution,
      });

      const res = await fetch(`/api/download?${params.toString()}`);
      if (!res.ok) throw new Error("Server error");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const writable = await fileHandle.createWritable();

      let totalBytes = video.filesize_approx || 0;
      if (config.startTime || config.endTime) {
        const totalDuration = video.duration;
        const startSec = parseTimeToSeconds(config.startTime);
        const endSec = config.endTime ? parseTimeToSeconds(config.endTime) : totalDuration;
        const clipRatio = Math.max(0.1, (endSec - startSec) / totalDuration);
        totalBytes = totalBytes * clipRatio;
      }

      if (!totalBytes) {
        const estimatedMBs = config.format === "aiff" ? video.duration * 0.2 : (parseInt(config.resolution) / 1080) * video.duration * 0.5;
        totalBytes = estimatedMBs * 1024 * 1024;
      }

      let receivedBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        receivedBytes += value.length;
        const progress = Math.min(Math.round((receivedBytes / totalBytes) * 100), 99);
        updateDownloadStatus(id, { progress });
      }

      await writable.close();
      updateDownloadStatus(id, { status: 'completed', progress: 100 });

      if (id === downloads[0]?.id) {
        const confetti = (await import("canvas-confetti")).default;
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }

    } catch (err: any) {
      updateDownloadStatus(id, { status: 'error', error: err.message });
    }
  };

  const updateDownloadStatus = (id: string, updates: Partial<DownloadItem>) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const removeFromQueue = (id: string) => {
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

  const handleLocate = async () => {
    try {
      await fetch("/api/locate", { method: "POST" });
    } catch (e) {
      console.error("Failed to open folder", e);
    }
  };

  return (
    <main className="min-h-screen hero-gradient p-4 md:p-8 pb-32">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 pt-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center space-x-2"
          >
            <Download className="w-10 h-10 text-blue-500" />
            <h1 className="text-5xl font-extrabold tracking-tight gradient-text">Velo</h1>
          </motion.div>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Professional YouTube downloading and conversion with batch support.
          </p>
        </div>

        {/* Input Area */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass rounded-3xl p-2 flex flex-col md:flex-row items-center gap-2"
          >
            <div className="relative flex-1 w-full text-foreground">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Enter the link to the video you want to download..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && resolveVideo(e as any)}
                className="w-full bg-transparent border-none focus:ring-0 pl-12 pr-4 py-4 text-white text-lg rounded-2xl placeholder:text-gray-600"
              />
            </div>
            <button
              onClick={resolveVideo}
              disabled={isResolving}
              className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 px-10 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
            >
              {isResolving ? <Loader2 className="animate-spin" /> : <Search className="w-5 h-5" />}
              {isResolving ? "Analysing..." : "Grab!"}
            </button>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center gap-2"
            >
              <AlertCircle className="w-5 h-5" />
              {error}
            </motion.div>
          )}

          {/* Current Resolved Video Configuration */}
          <AnimatePresence>
            {resolvedVideo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="glass rounded-3xl p-8 grid grid-cols-1 md:grid-cols-2 gap-8 border-blue-500/20 shadow-2xl shadow-blue-500/5">
                  <div className="space-y-4">
                    <div className="aspect-video rounded-2xl overflow-hidden glass relative group bg-black">
                      {resolvedVideo.previewUrl ? (
                        <video
                          ref={videoRef}
                          src={`/api/proxy?url=${encodeURIComponent(resolvedVideo.previewUrl)}`}
                          controls
                          className="w-full h-full object-contain"
                          poster={resolvedVideo.thumbnail}
                          onError={() => setError("Video preview failed to load. You can still try downloading it!")}
                        />
                      ) : (
                        <img src={resolvedVideo.thumbnail} className="w-full h-full object-cover" alt={resolvedVideo.title} />
                      )}
                      {!resolvedVideo.previewUrl && (
                        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono">
                          {formatDuration(resolvedVideo.duration)}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold line-clamp-2 leading-tight">{resolvedVideo.title}</h3>
                      <p className="text-gray-500 text-sm mt-1">{resolvedVideo.uploader}</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                          <Scissors className="w-3 h-3" /> Clipping Range
                        </label>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="relative group">
                            <input
                              type="text"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-12 py-3 focus:border-blue-500 outline-none text-sm transition-colors"
                              placeholder="Start (00:00:00)"
                            />
                            <button
                              onClick={handleMarkStart}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                              title="Mark Current Time as Start"
                            >
                              <Play className="w-4 h-4 fill-current" />
                            </button>
                          </div>

                          <div className="relative group">
                            <input
                              type="text"
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-12 py-3 focus:border-blue-500 outline-none text-sm transition-colors"
                              placeholder="End (00:00:00)"
                            />
                            <button
                              onClick={handleMarkEnd}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                              title="Mark Current Time as End"
                            >
                              <Pause className="w-4 h-4 fill-current" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-600 font-medium">Use the player to find the exact spot, then click the icons to mark.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Format</label>
                        <select
                          value={format}
                          onChange={(e) => setFormat(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-blue-500 outline-none appearance-none cursor-pointer"
                        >
                          <option value="mp4">Video (MP4/H.264)</option>
                          <option value="aiff">Audio (AIFF/Lossless)</option>
                        </select>
                      </div>
                      {format === 'mp4' && (
                        <div className="flex-1 space-y-2">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Quality</label>
                          <select
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-blue-500 outline-none appearance-none cursor-pointer"
                          >
                            <option value="1080p">1080p HD</option>
                            <option value="720p">720p HD</option>
                            <option value="480p">480p SD</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={addToQueue}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold py-4 rounded-2xl shadow-xl transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
                    >
                      <Zap className="w-5 h-5 fill-current" />
                      Grab this clip!
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Downloads List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-bold flex items-center gap-3 italic">
              Current Downloads
              {downloads.length > 0 && (
                <span className="not-italic bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">
                  {downloads.filter(d => d.status === 'processing').length} active
                </span>
              )}
            </h2>
          </div>

          <div className="glass rounded-3xl overflow-hidden border border-white/5">
            {downloads.length === 0 ? (
              <div className="p-20 text-center space-y-4 opacity-30">
                <Download className="w-16 h-16 mx-auto" />
                <p className="text-sm font-medium">Your download list is currently empty.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                <AnimatePresence>
                  {downloads.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="p-4 md:p-6 hover:bg-white/[0.02] transition-colors group"
                    >
                      <div className="flex items-center gap-4 md:gap-6">
                        <div className="w-24 md:w-32 aspect-video rounded-lg overflow-hidden glass shrink-0 relative">
                          <img src={item.thumbnail} className="w-full h-full object-cover" />
                          <div className={cn(
                            "absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity",
                            item.status === 'completed' && "opacity-100 bg-black/20"
                          )}>
                            {item.status === 'completed' ? <CheckCircle2 className="text-green-500 w-8 h-8" /> : <FolderOpen className="text-white w-6 h-6" />}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <h4 className="font-bold truncate text-lg group-hover:text-blue-400 transition-colors">
                                {item.title}
                              </h4>
                              <div className="flex items-center gap-3 mt-1 text-xs font-bold text-gray-500 uppercase tracking-widest">
                                <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-500" /> {item.quality}</span>
                                <span className="w-1 h-1 rounded-full bg-gray-700" />
                                <span>{item.format}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {item.status === 'completed' && (
                                <motion.button
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  whileHover={{ scale: 1.1 }}
                                  onClick={handleLocate}
                                  className="p-2 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors group/folder"
                                  title="Show in Folder"
                                >
                                  <FolderOpen className="w-5 h-5 group-hover/folder:scale-110 transition-transform" />
                                </motion.button>
                              )}
                              <button
                                onClick={() => removeFromQueue(item.id)}
                                className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between items-end text-xs font-mono">
                              <span className={cn(
                                "font-bold",
                                item.status === 'completed' ? "text-green-500" :
                                  item.status === 'error' ? "text-red-500" : "text-blue-400"
                              )}>
                                {item.status === 'pending' && "Queued..."}
                                {item.status === 'processing' && `Processing (${item.progress}%)`}
                                {item.status === 'completed' && "Finished!"}
                                {item.status === 'error' && (item.error || "Failed")}
                              </span>
                              {item.status === 'processing' && <span className="text-gray-500">{(item.progress).toFixed(0)}%</span>}
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${item.progress}%` }}
                                className={cn(
                                  "h-full transition-all duration-300",
                                  item.status === 'completed' ? "bg-green-500" :
                                    item.status === 'error' ? "bg-red-500" : "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                                )}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="flex justify-center gap-4 pt-4">
            <button className="text-xs font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest">Pause all</button>
            <span className="w-1 h-1 rounded-full bg-gray-800" />
            <button className="text-xs font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest">Clear finished</button>
          </div>
        </div>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 py-4 glass text-[10px] text-gray-500 flex items-center justify-center gap-6 border-t border-white/5 z-50">
        <div className="font-bold uppercase tracking-[0.2em]">Velo v3.2</div>
        <div className="flex items-center gap-4 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px]">
            <ShieldCheck className="w-3 h-3 text-green-500" />
            Core: {ytdlpVersion}
          </span>
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className={cn(
              "flex items-center gap-1 hover:text-blue-400 transition-colors cursor-pointer disabled:opacity-50",
              isUpdating && "animate-pulse"
            )}
          >
            <RefreshCw className={cn("w-3 h-3", isUpdating && "animate-spin")} />
            {isUpdating ? "Updating..." : "Check for Updates"}
          </button>
        </div>
      </footer>
    </main>
  );
}
