// ================================================================
// TrendChart — Ingresos, gastos y balance de los últimos seis meses
//
// SVG dibujado a mano, tomando como referencia los gráficos de Balance
// Dual (trendCard / netWorthTrendCard). Sustituye al LineChart de
// Recharts, que costaba 111 KB gzip para estas tres líneas.
//
// Qué conserva de la versión con Recharts: las tres series con los
// mismos colores (objeto `chart` de StatsPage, resuelto para modo
// oscuro), Balance en trazo discontinuo, rejilla punteada, eje Y en
// `$12k`, leyenda debajo, y un tooltip que sigue al dedo o al ratón.
// ================================================================

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { formatMoney } from '@/lib/utils';
import { escalaBonita, formatoTickDinero, trazarLinea } from '@/lib/chart-geometry';
import type { PuntoTendencia } from '@/hooks/useStatsPeriod';

export interface TrendChartColors {
  tick: string;
  grid: string;
  tipBg: string;
  tipFg: string;
  tipLabel: string;
  income: string;
  expense: string;
  balance: string;
}

interface TrendChartProps {
  data: PuntoTendencia[];
  colors: TrendChartColors;
  /** Alto del área de dibujo en px. El ancho se toma del contenedor. */
  height?: number;
}

type Serie = {
  key: 'Ingresos' | 'Gastos' | 'Balance';
  color: keyof Pick<TrendChartColors, 'income' | 'expense' | 'balance'>;
  dashed?: boolean;
};

const SERIES: Serie[] = [
  { key: 'Ingresos', color: 'income' },
  { key: 'Gastos', color: 'expense' },
  { key: 'Balance', color: 'balance', dashed: true },
];

const PAD_L = 52; // sitio para "$1.5M"
const PAD_R = 18; // que la última etiqueta de mes (centrada) no se corte
const PAD_T = 12;
const PAD_B = 26;
/** Ancho de respaldo antes de medir (y en jsdom, que no mide nada). */
const ANCHO_INICIAL = 520;

/** Ancho real del contenedor, siguiendo sus cambios de tamaño. Es lo que
 *  hacía ResponsiveContainer: sin esto el SVG escalaría con su viewBox y
 *  el texto se haría ilegible en un móvil estrecho. */
function useAnchoContenedor<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(ANCHO_INICIAL);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const w = el.clientWidth;
      if (w > 0) setAncho(w);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, ancho };
}

export function TrendChart({ data, colors, height = 240 }: TrendChartProps) {
  const { ref, ancho: W } = useAnchoContenedor<HTMLDivElement>();
  const H = height;
  const svgRef = useRef<SVGSVGElement>(null);
  const [activo, setActivo] = useState<number | null>(null);

  const geo = useMemo(() => {
    const valores = data.flatMap((d) => [d.Ingresos, d.Gastos, d.Balance]);
    const escala = escalaBonita(Math.min(...valores), Math.max(...valores), 5);
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;
    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
    const xDe = (i: number) => PAD_L + i * stepX;
    const yDe = (v: number) => PAD_T + innerH * (1 - (v - escala.min) / (escala.max - escala.min));

    const paths = SERIES.map((s) => ({
      ...s,
      d: trazarLinea(data.map((p, i) => [xDe(i), yDe(p[s.key])] as const)),
      puntos: data.map((p, i) => [xDe(i), yDe(p[s.key])] as const),
    }));

    return { escala, xDe, yDe, paths, yCero: yDe(0) };
  }, [data, W, H]);

  /** Índice del mes más cercano a la posición horizontal del puntero. */
  const indiceEn = (clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * W;
    let mejor = 0;
    let dist = Infinity;
    data.forEach((_, i) => {
      const d = Math.abs(geo.xDe(i) - x);
      if (d < dist) {
        dist = d;
        mejor = i;
      }
    });
    return mejor;
  };

  const onPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    setActivo(indiceEn(e.clientX));
  };

  const punto = activo !== null ? data[activo] : null;
  const xActivo = activo !== null ? geo.xDe(activo) : 0;
  // El tooltip se abre hacia el lado donde hay sitio.
  const tooltipALaIzquierda = xActivo > W / 2;

  const resumen = data
    .map((d) => `${d.month}: ingresos ${formatMoney(d.Ingresos)}, gastos ${formatMoney(d.Gastos)}, balance ${formatMoney(d.Balance)}`)
    .join('. ');

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Evolución de los últimos ${data.length} meses. ${resumen}`}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerLeave={() => setActivo(null)}
      >
        {/* Rejilla + eje Y */}
        {geo.escala.ticks.map((t) => {
          const y = geo.yDe(t);
          const esCero = t === 0 && geo.escala.min < 0;
          return (
            <g key={t}>
              <line
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
                stroke={colors.grid}
                strokeWidth={1}
                strokeDasharray={esCero ? undefined : '3 3'}
              />
              <text
                x={PAD_L - 8}
                y={y + 3.5}
                fontSize={11}
                fill={colors.tick}
                textAnchor="end"
                className="font-mono"
              >
                {formatoTickDinero(t)}
              </text>
            </g>
          );
        })}

        {/* Eje X: meses */}
        {data.map((d, i) => (
          <text
            key={d.month + i}
            x={geo.xDe(i)}
            y={H - 8}
            fontSize={12}
            fill={colors.tick}
            textAnchor="middle"
          >
            {d.month}
          </text>
        ))}

        {/* Guía vertical del punto activo */}
        {activo !== null && (
          <line
            x1={xActivo}
            y1={PAD_T}
            x2={xActivo}
            y2={H - PAD_B}
            stroke={colors.grid}
            strokeWidth={1}
          />
        )}

        {/* Series */}
        {geo.paths.map((s) => (
          <g key={s.key} data-serie={s.key}>
            <path
              d={s.d}
              fill="none"
              stroke={colors[s.color]}
              strokeWidth={2.5}
              strokeDasharray={s.dashed ? '6 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.puntos.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={i === activo ? 6 : 4}
                fill={colors[s.color]}
                stroke={i === activo ? '#fff' : 'none'}
                strokeWidth={i === activo ? 2 : 0}
              />
            ))}
          </g>
        ))}
      </svg>

      {/* Tooltip (HTML: el texto envuelve y respeta el tema sin más trabajo) */}
      {punto && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-2 z-10 rounded-xl border px-3 py-2 text-xs shadow-lg"
          style={{
            left: xActivo,
            transform: tooltipALaIzquierda ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            backgroundColor: colors.tipBg,
            color: colors.tipFg,
            borderColor: colors.grid,
          }}
        >
          <p className="mb-1 font-semibold" style={{ color: colors.tipLabel }}>
            {punto.month}
          </p>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center gap-2 whitespace-nowrap">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: colors[s.color] }}
              />
              <span style={{ color: colors.tipLabel }}>{s.key}</span>
              <span className="ml-auto font-mono tabular-nums">{formatMoney(punto[s.key])}</span>
            </p>
          ))}
        </div>
      )}

      {/* Leyenda */}
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" style={{ color: colors.tipLabel }}>
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-0 w-4"
              style={{
                borderTop: `${s.dashed ? '2px dashed' : '3px solid'} ${colors[s.color]}`,
              }}
            />
            {s.key}
          </li>
        ))}
      </ul>
    </div>
  );
}
