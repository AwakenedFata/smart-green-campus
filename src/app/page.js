"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, AlertTriangle, CheckCircle, Search, Clock, Leaf, MapPin, AlertCircle, Info, ChevronRight, Check, Camera, X } from "lucide-react";
import Lenis from "lenis";
import Webcam from "react-webcam";

export default function Home() {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [location, setLocation] = useState("Taman");
  const [intentionallyPlanted, setIntentionallyPlanted] = useState("Tidak");
  const [obstructsFacility, setObstructsFacility] = useState("Tidak");
  const [organ, setOrgan] = useState("auto");

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");

  const [plantResult, setPlantResult] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const [history, setHistory] = useState([]);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const webcamRef = useRef(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem("smart_green_campus_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history");
      }
    }

    // Initialize Lenis smooth scroll
    const lenis = new Lenis();
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  const saveToHistory = (plant, analysis, loc) => {
    const newRecord = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      plantName: plant.scientificName || "Unknown",
      commonName: plant.commonNames?.[0] || "",
      confidence: plant.confidence,
      location: loc,
      status: analysis.status,
      priority: analysis.priority,
    };
    const updated = [newRecord, ...history].slice(0, 50); // Keep last 50
    setHistory(updated);
    localStorage.setItem("smart_green_campus_history", JSON.stringify(updated));
  };

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            } else {
              resolve(file); // fallback
            }
          }, 'image/jpeg', 0.8);
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
      setPlantResult(null);
      setAiAnalysis(null);
      setError(null);

      // Compress image if it's larger than 2MB (Vercel has 4.5MB limit)
      if (file.size > 2 * 1024 * 1024) {
        try {
          const compressed = await compressImage(file);
          setImageFile(compressed);
        } catch (err) {
          console.error("Compression failed", err);
          setImageFile(file);
        }
      } else {
        setImageFile(file);
      }
    }
  };

  const captureCamera = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      fetch(imageSrc)
        .then(res => res.blob())
        .then(async (blob) => {
          const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
          setImagePreview(imageSrc);
          setPlantResult(null);
          setAiAnalysis(null);
          setError(null);
          setShowCamera(false);

          if (file.size > 2 * 1024 * 1024) {
            try {
              const compressed = await compressImage(file);
              setImageFile(compressed);
            } catch (err) {
              setImageFile(file);
            }
          } else {
            setImageFile(file);
          }
        });
    }
  }, [webcamRef]);

  const executeFallback = (plantData) => {
    let status = "PANTAU";
    if (plantData.confidence < 0.50) {
      status = "VERIFIKASI";
    } else if (intentionallyPlanted === "Ya") {
      status = "TANAMAN_DIPERLIHARA";
    } else if (intentionallyPlanted === "Tidak" && obstructsFacility === "Ya") {
      status = "TINDAK_LANJUT";
    }

    let priority = "RENDAH";
    if (status === "TINDAK_LANJUT") priority = "TINGGI";
    if (status === "PANTAU") priority = "SEDANG";

    const isLowConfidence = plantData.confidence < 0.50;
    const summaryMsg = isLowConfidence
      ? "Identifikasi belum cukup meyakinkan untuk menghasilkan rekomendasi lanjutan. Oleh karena itu diperlukan verifikasi langsung oleh petugas."
      : "Analisis AI lanjutan sementara tidak tersedia. Hasil identifikasi Pl@ntNet tetap dapat digunakan sebagai referensi.";

    return {
      status,
      priority,
      plant_role: "POTENSI_TANAMAN_LIAR",
      recommendation_confidence: 50,
      summary: summaryMsg,
      reasoning_summary: ["didasarkan pada prosedur pemeliharaan standar."],
      recommended_actions: ["Lakukan verifikasi manual ke lapangan."],
      follow_up_days: 7,
      verification_needed: true,
      warning: "Rekomendasi merupakan bantuan untuk petugas dan perlu verifikasi kondisi lapangan."
    };
  };

  const handleAnalyze = async () => {
    if (!imageFile) {
      setError("Silakan upload foto tanaman terlebih dahulu.");
      return;
    }

    setLoading(true);
    setError(null);
    setPlantResult(null);
    setAiAnalysis(null);

    let currentPlantData = null;

    try {
      setLoadingStep("Menganalisis gambar...");
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("organ", organ);

      const plantNetRes = await fetch("/api/identify", {
        method: "POST",
        body: formData,
      });

      if (!plantNetRes.ok) {
        const errData = await plantNetRes.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal mengidentifikasi tanaman.");
      }

      const plantData = await plantNetRes.json();
      currentPlantData = plantData;
      setPlantResult(plantData);

      const campus_context = {
        area_type: location,
        intentionally_planted: intentionallyPlanted,
        obstructs_facility: obstructsFacility
      };

      if (plantData.confidence < 0.50) {
        // Validation: Confidence < 0.50 -> Fallback directly to Verifikasi without Groq
        const fallbackRes = executeFallback(plantData);
        setAiAnalysis(fallbackRes);
        saveToHistory(plantData, fallbackRes, location);
        setLoading(false);
        return;
      }

      setLoadingStep("Menyusun rekomendasi pemeliharaan...");

      try {
        const groqRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plant_identification: plantData,
            campus_context
          }),
        });

        if (!groqRes.ok) {
          throw new Error("Analisis lanjutan sementara tidak tersedia.");
        }

        const groqData = await groqRes.json();
        setAiAnalysis(groqData);
        saveToHistory(plantData, groqData, location);
      } catch (groqErr) {
        console.warn("Groq failed, using fallback:", groqErr);
        setError("Analisis AI lanjutan sementara tidak tersedia. Hasil identifikasi Pl@ntNet tetap dapat digunakan sebagai referensi.");
        const fallbackRes = executeFallback(plantData);
        setAiAnalysis(fallbackRes);
        saveToHistory(plantData, fallbackRes, location);
      }
    } catch (err) {
      setError(err.message || "Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "TANAMAN_DIPERLIHARA": return "bg-green-100 text-green-800 border-green-300";
      case "PANTAU": return "bg-blue-100 text-blue-800 border-blue-300";
      case "TINDAK_LANJUT": return "bg-red-100 text-red-800 border-red-300";
      case "VERIFIKASI": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default: return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case "TINGGI": return "bg-red-500 text-white";
      case "SEDANG": return "bg-yellow-500 text-white";
      case "RENDAH": return "bg-green-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  const formatStatusText = (status) => {
    return status?.replace(/_/g, " ");
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* HEADER */}
      <header className="bg-emerald-700 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <img src="/smart-green-campus.png" alt="Smart Green Campus Logo" className="h-10 w-auto object-contain" />
              Smart Green Campus
            </h1>
            <p className="text-emerald-100 text-sm hidden sm:block">AI Plant Monitoring & Maintenance Assistant</p>
          </div>
          <button
            onClick={() => setShowDashboard(!showDashboard)}
            className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {showDashboard ? "Kembali" : "Dashboard"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {showDashboard ? (
          <Dashboard history={history} />
        ) : (
          <div className="space-y-8">
            {/* HERO */}
            <div className="text-center space-y-4 py-8">
              <h2 className="text-4xl font-extrabold text-gray-800 tracking-tight">Kenali tanaman di sekitar kampus</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">Upload foto tanaman liar atau tanaman taman, dan dapatkan rekomendasi pemeliharaan otomatis dari AI.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* LEFT COLUMN: Input Form */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">

                {/* Upload Zone */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-lg flex items-center gap-2"><Upload className="w-5 h-5 text-emerald-600" /> Upload / Kamera</h3>
                    <button
                      onClick={() => setShowCamera(!showCamera)}
                      className="text-emerald-600 font-medium text-sm flex items-center gap-1 hover:text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full transition-colors"
                    >
                      {showCamera ? <><X className="w-4 h-4" /> Tutup Kamera</> : <><Camera className="w-4 h-4" /> Buka Kamera</>}
                    </button>
                  </div>

                  {showCamera ? (
                    <div className="space-y-4">
                      <div className="relative rounded-xl overflow-hidden bg-black flex flex-col items-center justify-center min-h-[300px]">
                        <Webcam
                          audio={false}
                          ref={webcamRef}
                          screenshotFormat="image/jpeg"
                          videoConstraints={{ facingMode: "environment" }}
                          className="w-full h-full object-cover absolute inset-0"
                        />
                        {/* Viewfinder Scanner UI overlay */}
                        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                          <div className="w-48 h-48 sm:w-64 sm:h-64 border border-emerald-400/30 rounded-lg relative bg-emerald-900/10">
                            {/* Animated scanline */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-[scan_2s_ease-in-out_infinite]" />

                            {/* Corner markers */}
                            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-500 rounded-tl-sm"></div>
                            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-500 rounded-tr-sm"></div>
                            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-500 rounded-bl-sm"></div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-500 rounded-br-sm"></div>

                            <p className="absolute -bottom-8 left-0 right-0 text-center text-white text-xs font-medium drop-shadow-md">Arahkan tanaman ke dalam kotak</p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={captureCamera}
                        className="w-full bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl shadow-sm flex items-center justify-center gap-2 hover:bg-emerald-500 transition-transform active:scale-95"
                      >
                        <Camera className="w-5 h-5" /> Ambil Gambar
                      </button>
                    </div>
                  ) : (
                    <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:bg-gray-50 transition cursor-pointer flex flex-col items-center justify-center min-h-[300px] overflow-hidden bg-gray-50">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      {imagePreview ? (
                        <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover rounded-lg z-0" />
                      ) : (
                        <div className="space-y-2 text-gray-500">
                          <Upload className="w-10 h-10 mx-auto text-gray-400" />
                          <p className="font-medium">Klik atau drag gambar ke sini</p>
                          <p className="text-xs">Mendukung JPG, PNG</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-600" /> Konteks Identifikasi</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bagian tanaman yang difoto:</label>
                    <select
                      value={organ}
                      onChange={(e) => setOrgan(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="auto">Otomatis (Auto)</option>
                      <option value="leaf">Daun</option>
                      <option value="flower">Bunga</option>
                      <option value="fruit">Buah</option>
                      <option value="bark">Batang</option>
                    </select>
                  </div>
                </div>

                {/* Context Form */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-600" /> Konteks Lokasi</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi penemuan:</label>
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option>Taman</option>
                      <option>Jalur pejalan kaki</option>
                      <option>Pinggir gedung</option>
                      <option>Parkiran</option>
                      <option>Lapangan</option>
                      <option>Selokan / saluran air</option>
                      <option>Area kosong</option>
                      <option>Area lain</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col justify-end">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sengaja ditanam?</label>
                      <select
                        value={intentionallyPlanted}
                        onChange={(e) => setIntentionallyPlanted(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option>Ya</option>
                        <option>Tidak</option>
                        <option>Tidak tahu</option>
                      </select>
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mengganggu fasilitas?</label>
                      <select
                        value={obstructsFacility}
                        onChange={(e) => setObstructsFacility(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option>Ya</option>
                        <option>Tidak</option>
                        <option>Tidak tahu</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={loading || !imageFile}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> Menganalisis...</>
                  ) : (
                    <><Search className="w-5 h-5" /> Identifikasi Tanaman</>
                  )}
                </button>
              </div>

              {/* RIGHT COLUMN: Results */}
              <div className="space-y-6 flex flex-col h-full justify-center">

                {loading && (
                  <div className="bg-white p-8 rounded-2xl shadow-sm border border-emerald-100 flex flex-col items-center justify-center h-full text-center space-y-4 min-h-[300px]">
                    <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin"></div>
                    <p className="text-lg font-medium text-emerald-800">{loadingStep}</p>
                    <p className="text-sm text-gray-500">Proses ini memakan waktu beberapa detik...</p>
                  </div>
                )}

                {!loading && error && (
                  <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-red-700 flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-1" />
                    <div>
                      <h4 className="font-bold text-lg mb-1">Terjadi Kesalahan</h4>
                      <p>{error}</p>
                    </div>
                  </div>
                )}

                {!loading && !plantResult && !error && (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center h-full p-8 text-center text-gray-400 min-h-[400px]">
                    <Search className="w-12 h-12 mb-4 opacity-50" />
                    <p className="font-medium text-lg text-gray-500">Belum ada hasil</p>
                    <p className="text-sm">Upload gambar dan isi konteks untuk melihat rekomendasi AI.</p>
                  </div>
                )}

                {!loading && plantResult && aiAnalysis && (
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">

                    {/* Status Header */}
                    <div className={`p-6 border-b flex flex-col sm:flex-row justify-between items-center text-center sm:text-left gap-4 sm:gap-2 ${getStatusColor(aiAnalysis.status)}`}>
                      <div className="flex flex-col items-center sm:items-start w-full">
                        <p className="text-sm font-bold uppercase tracking-wider opacity-80 mb-1">Status Rekomendasi</p>
                        <h2 className="text-3xl font-extrabold capitalize">{formatStatusText(aiAnalysis.status)}</h2>
                      </div>
                      <div className={`px-4 py-2 rounded-full font-bold text-sm flex items-center justify-center gap-1 shadow-sm w-full sm:w-auto ${getPriorityBadge(aiAnalysis.priority)}`}>
                        <AlertCircle className="w-4 h-4" /> Prioritas {aiAnalysis.priority}
                      </div>
                    </div>

                    <div className="p-6 space-y-6">

                      {/* Identity Row */}
                      <div className="flex flex-col gap-4 pb-4 border-b border-gray-100 text-center sm:text-left">
                        {imagePreview && (
                          <img src={imagePreview} className="w-full h-[300px] rounded-lg object-cover shadow-sm border border-gray-200" alt="Scanned plant" />
                        )}
                        <div className="flex flex-col items-center sm:items-start w-full">
                          <h3 className="text-xl font-bold text-gray-900 italic">{plantResult.scientificName}</h3>
                          <p className="text-gray-600 font-medium">{plantResult.commonNames?.[0] || "Nama umum tidak tersedia"}</p>
                          <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-2 text-xs">
                            <span className="bg-gray-100 px-2 py-1 rounded text-gray-600 border border-gray-200">Family: {plantResult.family || "-"}</span>
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-200 font-medium">Confidence: {Math.round(plantResult.confidence * 100)}%</span>
                          </div>
                        </div>
                      </div>

                      {/* AI Reasoning */}
                      <div>
                        <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-3">
                          <Info className="w-5 h-5 text-blue-500" /> Kenapa?
                        </h4>
                        <div className="bg-blue-50 text-blue-900 p-4 rounded-xl text-sm leading-relaxed border border-blue-100 space-y-2">
                          <p className="font-medium mb-1">{aiAnalysis.summary}</p>
                          <ul className="list-disc pl-4 space-y-1">
                            {aiAnalysis.reasoning_summary?.map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Actions */}
                      <div>
                        <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-3">
                          <CheckCircle className="w-5 h-5 text-emerald-500" /> Apa yang harus dilakukan petugas?
                        </h4>
                        <ul className="space-y-2">
                          {aiAnalysis.recommended_actions?.map((action, idx) => (
                            <li key={idx} className="flex items-start gap-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                              <span className="text-gray-700 text-sm">{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Follow-up & Warning */}
                      <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-100">
                        {aiAnalysis.follow_up_days > 0 && (
                          <div className="flex-1 bg-amber-50 p-3 rounded-lg border border-amber-100 flex items-center gap-3">
                            <Clock className="w-6 h-6 text-amber-600" />
                            <div>
                              <p className="text-xs text-amber-800 font-bold uppercase">Follow-up</p>
                              <p className="text-sm font-medium text-amber-900">Periksa lagi dalam {aiAnalysis.follow_up_days} hari</p>
                            </div>
                          </div>
                        )}
                        <div className="flex-[2] bg-gray-50 p-3 rounded-lg text-xs text-gray-500 flex gap-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <p>{aiAnalysis.warning}</p>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Dashboard({ history }) {
  const stats = {
    total: history.length,
    tindakLanjut: history.filter(h => h.status === "TINDAK_LANJUT").length,
    pantau: history.filter(h => h.status === "PANTAU").length,
    dipelihara: history.filter(h => h.status === "TANAMAN_DIPERLIHARA").length,
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "TANAMAN_DIPERLIHARA": return "bg-green-100 text-green-800";
      case "PANTAU": return "bg-blue-100 text-blue-800";
      case "TINDAK_LANJUT": return "bg-red-100 text-red-800";
      case "VERIFIKASI": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Dashboard Monitoring</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Total Diidentifikasi</p>
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-200 border-l-4 border-l-red-500">
          <p className="text-sm text-gray-500 font-medium">Perlu Tindak Lanjut</p>
          <p className="text-3xl font-bold text-red-600">{stats.tindakLanjut}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-200 border-l-4 border-l-blue-500">
          <p className="text-sm text-gray-500 font-medium">Dalam Pantauan</p>
          <p className="text-3xl font-bold text-blue-600">{stats.pantau}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-200 border-l-4 border-l-green-500">
          <p className="text-sm text-gray-500 font-medium">Dipelihara</p>
          <p className="text-3xl font-bold text-green-600">{stats.dipelihara}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-bold text-gray-700">Riwayat Monitoring Terbaru</h3>
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Belum ada data monitoring.</div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm text-xs uppercase text-gray-500 font-semibold">
                <tr>
                  <th className="p-4 py-3">Nama Tanaman</th>
                  <th className="p-4 py-3">Lokasi</th>
                  <th className="p-4 py-3">Tanggal</th>
                  <th className="p-4 py-3 text-center">Status</th>
                  <th className="p-4 py-3 text-center">Prioritas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50/50 transition">
                    <td className="p-4">
                      <p className="font-bold text-gray-900 italic whitespace-nowrap">{record.plantName}</p>
                      {record.commonName && <p className="text-sm text-gray-500 whitespace-nowrap truncate max-w-[200px]">{record.commonName}</p>}
                    </td>
                    <td className="p-4 whitespace-nowrap text-sm text-gray-700">
                      <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-gray-400" /> {record.location}</span>
                    </td>
                    <td className="p-4 whitespace-nowrap text-sm text-gray-700">
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-gray-400" /> {new Date(record.timestamp).toLocaleDateString("id-ID")}</span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block ${getStatusColor(record.status)}`}>
                        {record.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-semibold text-sm text-gray-800">{record.priority}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
