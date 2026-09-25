import { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import type { Html5QrcodeCameraScanConfig } from 'html5-qrcode';

const SCANNER_ELEMENT_ID = 'sls-barcode-scanner';

// Formatos mínimos exigidos por la tarea. html5-qrcode ya trae el
// reconocimiento (ZXing por debajo); no se reimplementa aquí.
const FORMATS = [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128];

export type CameraErrorReason = 'PERMISSION_DENIED' | 'NO_CAMERA' | 'CAMERA_ERROR';

interface BarcodeScannerProps {
  onDetected: (rawText: string) => void;
  onError: (reason: CameraErrorReason) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onDetected, onError, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasResolvedRef = useRef(false); // evita procesar la misma lectura dos veces

  useEffect(() => {
    hasResolvedRef.current = false;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, {
      formatsToSupport: FORMATS,
      verbose: false,
    });
    scannerRef.current = scanner;

    const config: Html5QrcodeCameraScanConfig = { fps: 10, qrbox: { width: 250, height: 150 } };

    const handleSuccess = (decodedText: string) => {
      if (hasResolvedRef.current) return; // ignora lecturas duplicadas en ráfaga
      hasResolvedRef.current = true;
      void stopScanner().finally(() => onDetected(decodedText));
    };

    // Se dispara en cada frame sin lectura: es ruido normal, no un error real.
    const handleScanFailure = (): void => {};

    let cancelled = false;
    async function start(): Promise<void> {
      try {
        await scanner.start({ facingMode: { exact: 'environment' } }, config, handleSuccess, handleScanFailure);
        if (cancelled) await stopScanner();
      } catch {
        if (cancelled) return;
        try {
          await scanner.start({ facingMode: 'environment' }, config, handleSuccess, handleScanFailure);
          if (cancelled) await stopScanner();
        } catch (err) {
          if (!cancelled) onError(mapCameraError(err));
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function stopScanner(): Promise<void> {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch {
      // Si ya estaba detenido, no hay nada que hacer.
    }
  }

  return (
    <div className="scanner-overlay">
      <div className="scanner-header">
        <span>Apunta al código de la guía</span>
        <button type="button" onClick={() => void stopScanner().finally(onClose)}>
          Cancelar
        </button>
      </div>
      <div id={SCANNER_ELEMENT_ID} className="scanner-viewport" />
    </div>
  );
}

function mapCameraError(err: unknown): CameraErrorReason {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError') return 'PERMISSION_DENIED';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'NO_CAMERA';
  return 'CAMERA_ERROR';
}
