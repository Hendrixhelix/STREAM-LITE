import { useCallback, useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "";

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const loadTracks = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/tracks`);
      if (!res.ok) throw new Error("Could not load tracks");
      const data = await res.json();
      setTracks(data.tracks ?? []);
      setError("");
    } catch {
      setError("Could not load tracks. Is the server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  async function uploadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".mp3")) {
      setError("Only MP3 files are allowed.");
      return;
    }

    setUploading(true);
    setError("");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API}/api/tracks`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setTracks((prev) => [data, ...prev]);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e) {
    uploadFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    uploadFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Hendrix Play</h1>
        <p>Upload MP3s and listen — no account needed.</p>
      </header>

      <section
        className={`dropzone${dragOver ? " dropzone--active" : ""}${uploading ? " dropzone--busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          id="file-input"
          type="file"
          accept="audio/mpeg,.mp3"
          onChange={onFileChange}
          disabled={uploading}
          hidden
        />
        <label htmlFor="file-input" className="dropzone-label">
          {uploading ? (
            <span>Uploading…</span>
          ) : (
            <>
              <span className="dropzone-icon">♪</span>
              <span>Drop an MP3 here or click to browse</span>
              <span className="dropzone-hint">Max 50 MB</span>
            </>
          )}
        </label>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="tracks">
        <h2>Tracks</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : tracks.length === 0 ? (
          <p className="muted">No tracks yet. Upload your first MP3 above.</p>
        ) : (
          <ul className="track-list">
            {tracks.map((track) => (
              <li key={track.id} className="track">
                <div className="track-info">
                  <span className="track-title">{track.title}</span>
                  <span className="track-meta">
                    {formatSize(track.size)}
                    {track.uploadedAt &&
                      ` · ${new Date(track.uploadedAt).toLocaleDateString()}`}
                  </span>
                </div>
                <audio controls preload="none" src={`${API}${track.streamUrl}`} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default App;
