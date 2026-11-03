import { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import type { Html5QrcodeCameraScanConfig } from 'html5-qrcode';

const SCANNER_ELEMENT_ID = 'sls-barcode-scanner';

// Formatos soportados: QR y CODE_128
const FORMATS = [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128];

export type CameraErrorReason = 'PERMISSION_DENIED' | 'NO_CAMERA' | 'CAMERA_ERROR';

interface BarcodeScannerProps {
  onDetected: (rawText: string) => void;
  onError: (reason: CameraErrorReason) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onDetected, onError, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasResolvedRef = useRef(false);

  useEffect(() => {
    hasResolvedRef.current = false;
    let cancelled = false;
    let activeScanner: Html5Qrcode | null = null;

    // Limpia cualquier nodo residual antes de iniciar una nueva instancia
    const containerEl = document.getElementById(SCANNER_ELEMENT_ID);
    if (containerEl) {
      containerEl.innerHTML = '';
    }

    // Pequeño retardo para que el doble montaje inmediato de React StrictMode
    // cancele el primer efecto antes de solicitar getUserMedia, evitando dos <video> apilados.
    const startTimer = window.setTimeout(() => {
      if (cancelled) return;

      const host = document.getElementById(SCANNER_ELEMENT_ID);
      if (host) {
        host.innerHTML = '';
      }

      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, {
        formatsToSupport: FORMATS,
        verbose: false,
      });
      activeScanner = scanner;
      scannerRef.current = scanner;

      const config: Html5QrcodeCameraScanConfig = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const boxSize = Math.max(180, Math.min(280, Math.floor(minEdge * 0.72)));
          return { width: boxSize, height: boxSize };
        },
      };

      const handleSuccess = (decodedText: string) => {
        if (hasResolvedRef.current || cancelled) return;
        hasResolvedRef.current = true;
        void stopScannerInstance(scanner).finally(() => onDetected(decodedText));
      };

      const handleScanFailure = (): void => {};

      void (async () => {
        try {
          await scanner.start(
            { facingMode: 'environment' },
            config,
            handleSuccess,
            handleScanFailure,
          );
          if (cancelled) {
            await stopScannerInstance(scanner);
          }
        } catch (err) {
          if (!cancelled) {
            onError(mapCameraError(err));
          }
        }
      })();
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (activeScanner) {
        void stopScannerInstance(activeScanner);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose(): void {
    const scanner = scannerRef.current;
    if (!scanner) {
      onClose();
      return;
    }
    void stopScannerInstance(scanner).finally(onClose);
  }

  return (
    <div className="scanner-overlay" role="dialog" aria-modal="true" aria-labelledby="barcode-scanner-title">
      <div className="scanner-header">
        <div>
          <span id="barcode-scanner-title" style={{ fontWeight: 700, display: 'block' }}>
            Apunta al código QR de la guía
          </span>
          <small style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
            Acerca la cámara a unos 15–25 cm del código QR
          </small>
        </div>
        <button type="button" onClick={handleClose}>
          Cancelar
        </button>
      </div>
      <div className="scanner-viewport-wrapper">
        <div id={SCANNER_ELEMENT_ID} className="scanner-viewport" />
      </div>
    </div>
  );
}

async function stopScannerInstance(scanner: Html5Qrcode): Promise<void> {
  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
  } catch {
    // Ignorar si ya se había detenido
  }
  try {
    scanner.clear();
  } catch {
    // Ignorar si el contenedor ya fue desmontado
  }
  const containerEl = document.getElementById(SCANNER_ELEMENT_ID);
  if (containerEl) {
    containerEl.innerHTML = '';
  }
}

function mapCameraError(err: unknown): CameraErrorReason {
  const description = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/NotAllowedError|Permission denied/i.test(description)) return 'PERMISSION_DENIED';
  if (/NotFoundError|OverconstrainedError|not found/i.test(description)) return 'NO_CAMERA';
  return 'CAMERA_ERROR';
}
