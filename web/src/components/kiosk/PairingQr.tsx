import { QRCodeSVG } from 'qrcode.react';

export function PairingQr({ value, label }: { value: string; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-3 rounded-2xl">
        <QRCodeSVG value={value} size={220} level="M" includeMargin={false} />
      </div>
      {label && <p className="text-text-dim text-sm text-center max-w-xs">{label}</p>}
    </div>
  );
}
