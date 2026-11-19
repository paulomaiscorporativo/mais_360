import { cn } from "@/lib/cn";

/**
 * Composição do painel de entrada: peças reais da operação (cartão de
 * embarque, credencial com QR, contador do credenciamento) em vez de
 * ilustração genérica. Puramente decorativa.
 */

function QrPattern({ seed = 7, size = 21, className }: { seed?: number; size?: number; className?: string }) {
  // Padrão determinístico com os três "olhos" de um QR — não codifica nada.
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const cells: string[] = [];
  const eye = (x: number, y: number) => x < 7 && y < 7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inEye = eye(x, y) || eye(size - 1 - x, y) || eye(x, size - 1 - y);
      if (inEye) continue;
      if (rand() > 0.52) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  const finder = (x: number, y: number) =>
    `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} shapeRendering="crispEdges" aria-hidden>
      <path d={cells.join("") + finder(0, 0) + finder(size - 7, 0) + finder(0, size - 7)} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export function AuthShowcase({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex h-full flex-col justify-between overflow-hidden bg-[#061527] p-12 text-white",
        className,
      )}
    >
      {/* Trama de rotas */}
      <svg className="absolute inset-0 size-full opacity-[0.16]" preserveAspectRatio="none" viewBox="0 0 600 800">
        <defs>
          <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" fill="#8fb3e6" />
          </pattern>
        </defs>
        <rect width="600" height="800" fill="url(#dots)" />
        <path d="M-20 620 C 160 420, 380 520, 640 180" stroke="#a0bf27" strokeWidth="1.5" fill="none" strokeDasharray="2 7" strokeLinecap="round" />
        <path d="M-20 300 C 200 360, 300 120, 640 90" stroke="#8fb3e6" strokeWidth="1" fill="none" strokeDasharray="2 7" strokeLinecap="round" />
      </svg>
      <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(64,120,200,0.35),transparent)]" />

      <div className="relative" />

      {/* Peças */}
      <div className="relative mx-auto w-full max-w-[440px]">
        {/* Cartão de embarque */}
        <div className="relative rotate-[-2.5deg] rounded-[14px] bg-white p-5 text-[#0a1424] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-[#677184]">
            <span>Convenção Nacional 2026</span>
            <span>Grupo A · 42 pax</span>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-[34px] font-semibold leading-none tracking-tight">GRU</div>
              <div className="mt-1 text-xs text-[#677184]">São Paulo · 21:40</div>
            </div>
            <svg viewBox="0 0 120 24" className="mb-3 w-28 text-[#b9c0cc]">
              <path d="M2 12h104" stroke="currentColor" strokeDasharray="3 4" />
              <path d="M108 6l8 6-8 6" fill="none" stroke="#0a1424" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            <div className="text-right">
              <div className="text-[34px] font-semibold leading-none tracking-tight">LIS</div>
              <div className="mt-1 text-xs text-[#677184]">Lisboa · 11:05</div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-dashed border-[#d6dbe3] pt-4 text-xs">
            <span className="text-[#677184]">
              Localizador <span className="ml-1 font-mono text-[13px] font-medium text-[#0a1424]">XK7P2M</span>
            </span>
            <span className="rounded-full bg-[#eaf4ed] px-2 py-0.5 font-medium text-[#2c6e45]">Emitido</span>
          </div>
        </div>

        {/* Credencial */}
        <div className="relative -mt-6 ml-auto w-[230px] rotate-[3deg] overflow-hidden rounded-[12px] bg-white text-[#0a1424] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)]">
          <div className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold leading-tight">Marina Albuquerque</div>
              <div className="mt-0.5 truncate text-[11px] text-[#677184]">Frigorífico Horizonte</div>
            </div>
            <QrPattern className="size-14 shrink-0" />
          </div>
          <div className="bg-[#a0bf27] py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0a1424]">
            Expositor
          </div>
        </div>

        {/* Contador */}
        <div className="absolute -bottom-6 left-2 flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.07] py-2 pl-3 pr-4 backdrop-blur-md">
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#a0bf27] opacity-60" />
            <span className="relative size-2 rounded-full bg-[#a0bf27]" />
          </span>
          <span className="tabular text-sm font-medium">1.284 credenciados</span>
          <span className="text-xs text-white/50">agora</span>
        </div>
      </div>

      <div className="relative">
        <p className="font-display text-[40px] leading-[1.08] tracking-[-0.01em]">
          Toda a operação de viagens e eventos, <em className="text-[#c7dd6e]">num só lugar.</em>
        </p>
        <p className="mt-5 text-sm text-white/55">
          Viagens corporativas · Incentivo · Eventos e convites · Credenciamento · Feiras
        </p>
      </div>
    </div>
  );
}
