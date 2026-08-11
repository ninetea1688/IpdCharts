import { useEffect, useRef, useState, type JSX } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button, Card, Field } from "../components/ui";
import { Camera, CameraOff } from "lucide-react";

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
}

export default function QrScanner({
  onScan,
  onError,
}: QrScannerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    scannerRef.current = new Html5Qrcode(containerRef.current.id);

    return () => {
      if (scannerRef.current?.isScanning) {
        void scannerRef.current.stop();
      }
    };
  }, []);

  async function startScan() {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText: string) => {
          setLastScan(decodedText);
          onScan(decodedText);
        },
        (errorMessage: string) => {
          // ignore parse errors — normal during scanning
          if (!errorMessage.includes("NotFoundException") && onError) {
            onError(errorMessage);
          }
        },
      );
      setScanning(true);
    } catch (err) {
      console.error("Scanner start failed:", err);
    }
  }

  async function stopScan() {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.stop();
      setScanning(false);
    } catch (err) {
      console.error("Scanner stop failed:", err);
    }
  }

  return (
    <Card className="p-4">
      <Field label="สแกน QR/Barcode">
        <div className="relative">
          <div
            ref={containerRef}
            id="qr-reader"
            className="w-full overflow-hidden rounded-md bg-slate-100"
            style={{ minHeight: 200 }}
          />
          {!scanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
              <CameraOff className="size-8 text-white/60" />
            </div>
          )}
        </div>
      </Field>

      <div className="mt-3 flex gap-2">
        {scanning ? (
          <Button variant="outline" onClick={() => void stopScan()}>
            <CameraOff className="size-4" />
            หยุดสแกน
          </Button>
        ) : (
          <Button onClick={() => void startScan()}>
            <Camera className="size-4" />
            เริ่มสแกน
          </Button>
        )}
      </div>

      {lastScan && (
        <p className="mt-2 text-xs text-slate-500">
          สแกนล่าสุด: <code className="rounded bg-slate-100 px-1 font-mono">{lastScan}</code>
        </p>
      )}
    </Card>
  );
}
