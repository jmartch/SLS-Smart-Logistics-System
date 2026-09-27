import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface ImageQrScannerProps {
  onDetected: (rawText: string) => void;
  onClose: () => void;
}

export default function ImageQrScanner({ onDetected, onClose }: ImageQrScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    return () => {
      activeRef.current = false;
    };
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(true);
    const scanner = new Html5Qrcode('image-qr-reader', {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });
    try {
      const decodedText = await scanner.scanFile(file, true);

      if (!activeRef.current) return;

      activeRef.current = false;
      onDetected(decodedText);
    } catch {
      if (activeRef.current) {
        setError('No encontramos un código QR legible en esa imagen.');
      }
    } finally {
      try {
        scanner.clear();
      } catch {
        // El lector puede quedar limpio después de una lectura fallida.
      }

      if (inputRef.current) {
        inputRef.current.value = '';
      }
      if (activeRef.current) {
        setReading(false);
      }
    }
  }

  function handleClose() {
    activeRef.current = false;
    onClose();
  }

  return (
    <div className="scanner-overlay image-scanner-overlay" role="dialog" aria-modal="true" aria-labelledby="image-scanner-title">
      <div className="image-scanner-card">
        <div className="scanner-header image-scanner-header">
          <div><p className="eyebrow">LECTURA QR</p><h2 id="image-scanner-title">Sube una imagen</h2></div>
          <button type="button" onClick={handleClose}>
            Cerrar
          </button>
        </div>
        <p className="image-scanner-copy">Elige una foto del código de la guía. La lectura ocurre en este dispositivo.</p>
        <button type="button" className="upload-button" onClick={() => inputRef.current?.click()} disabled={reading}>
          {reading ? 'Leyendo código...' : 'Seleccionar imagen'}
        </button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => void handleFile(event.target.files?.[0])} />
        <div id="image-qr-reader" className="image-qr-reader" aria-hidden="true" />
        {error && <p className="notice notice-error">{error}</p>}
      </div>
    </div>
  );
}
