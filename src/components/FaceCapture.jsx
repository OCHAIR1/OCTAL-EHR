import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Webcam face capture component.
 * Once captured and submitted, the photo is LOCKED — cannot be retaken.
 */
export default function FaceCapture({ onCapture, locked = false, existingPhoto = null }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [photo, setPhoto] = useState(existingPhoto)
  const [error, setError] = useState(null)
  const [cameraActive, setCameraActive] = useState(false)

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false
      })
      setStream(mediaStream)
      setCameraActive(true)
      setError(null)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch (err) {
      setError('Camera access denied. Please allow camera permissions to continue.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      setStream(null)
      setCameraActive(false)
    }
  }, [stream])

  const capture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const video = videoRef.current
    canvas.width = 480
    canvas.height = 480

    const ctx = canvas.getContext('2d')
    // Center-crop to square
    const size = Math.min(video.videoWidth, video.videoHeight)
    const sx = (video.videoWidth - size) / 2
    const sy = (video.videoHeight - size) / 2
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 480, 480)

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      setPhoto(url)
      stopCamera()
      if (onCapture) onCapture(blob, url)
    }, 'image/webp', 0.85)
  }, [stopCamera, onCapture])

  const retake = useCallback(() => {
    if (locked) return
    setPhoto(null)
    if (onCapture) onCapture(null, null)
    startCamera()
  }, [locked, startCamera, onCapture])

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [stream])

  if (locked && photo) {
    return (
      <div className="face-capture">
        <img src={photo} alt="Profile" className="face-preview face-preview--locked" />
        <p className="face-capture-hint" style={{ fontWeight: 600, color: 'var(--green)' }}>
          ✓ Photo locked — cannot be changed after submission
        </p>
      </div>
    )
  }

  return (
    <div className="face-capture">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {!photo && !cameraActive && (
        <>
          <div style={{
            width: 240, height: 240, borderRadius: '50%',
            background: 'var(--surface)', border: '4px dashed var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 48, color: 'var(--border)'
          }}>
            👤
          </div>
          <button className="btn-primary" style={{ width: 'auto', padding: '0 32px', height: 48 }} onClick={startCamera}>
            Open Camera
          </button>
          <p className="face-capture-hint">
            Position your face clearly. This photo will be used for your medical ID and cannot be changed after submission.
          </p>
        </>
      )}

      {!photo && cameraActive && (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="face-preview"
            style={{ transform: 'scaleX(-1)' }}
            onLoadedMetadata={(e) => e.target.play()}
          />
          <button className="btn-primary" style={{ width: 'auto', padding: '0 32px', height: 48 }} onClick={capture}>
            📸 Capture
          </button>
          <p className="face-capture-hint">Center your face in the circle</p>
        </>
      )}

      {photo && !locked && (
        <>
          <img src={photo} alt="Captured" className="face-preview" />
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-primary" style={{ width: 'auto', padding: '0 24px', height: 44, fontSize: 13 }}
              onClick={() => { /* parent handles proceed */ }}>
              ✓ Use this photo
            </button>
            <button className="btn-secondary" style={{ width: 'auto', padding: '0 24px', height: 44, marginTop: 0, fontSize: 13 }}
              onClick={retake}>
              Retake
            </button>
          </div>
        </>
      )}

      {error && <div className="error-box">{error}</div>}
    </div>
  )
}
