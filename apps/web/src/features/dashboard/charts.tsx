/**
 * Inline-SVG charts for the dashboard — no chart deps. Built to the dataviz
 * method: one axis per chart, thin marks with 2px surface gaps, recessive
 * grid, selective direct labels, crosshair/tooltip hover, legend for two
 * series (identity also carried by DIRECTION, so the CVD floor-band palette
 * is legal), text in text tokens with numerals in the mono face.
 * Palette: var(--chart-1)/var(--chart-2) — validated on both surfaces.
 */
import { useState } from 'react';
import { formatINR } from '@finpilot/shared';
import { C } from '../../lib/ui';

const CH1 = 'var(--chart-1)';
const CH2 = 'var(--chart-2)';

/** ₹ axis ticks: compact Indian units (full formatINR lives in tooltips). */
export function compactINR(paise: number): string {
  const r = paise / 100;
  const abs = Math.abs(r);
  const sign = r < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function niceTicks(min: number, max: number, n = 4): number[] {
  if (min === max) {
    max = min + 1;
  }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = span / n / step;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = step * mult;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / s) * s; v <= max; v += s) ticks.push(v);
  return ticks;
}

interface TooltipState {
  index: number;
  x: number;
  y: number;
}

function TooltipBox({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -110%)',
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        boxShadow: 'var(--shadow-lift)',
        padding: '0.45rem 0.65rem',
        fontSize: '0.75rem',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        zIndex: 10,
      }}
    >
      {children}
    </div>
  );
}

/** P10–P90 uncertainty band + P50 line for projected cash (one measure, one axis). */
export function CashBandChart({
  labels,
  p10,
  p50,
  p90,
}: {
  labels: string[];
  p10: number[];
  p50: number[];
  p90: number[];
}) {
  const [hover, setHover] = useState<TooltipState | null>(null);
  const W = 640;
  const H = 220;
  const PAD = { l: 54, r: 60, t: 12, b: 24 };
  const n = labels.length;
  if (n === 0) return null;

  const all = [...p10, ...p50, ...p90, 0];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const ticks = niceTicks(min, max, 4);
  const lo = Math.min(min, ticks[0] ?? min);
  const hi = Math.max(max, ticks[ticks.length - 1] ?? max);
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, n - 1);
  const y = (v: number) => PAD.t + ((hi - v) * (H - PAD.t - PAD.b)) / Math.max(1, hi - lo);

  const line = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const band = `${line(p90)} ${p10.map((v, i) => `L${x(n - 1 - i)},${y(p10[n - 1 - i]!)}`).join(' ')} Z`;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block' }}
        role="img"
        aria-label="Projected cash, 13 weeks"
      >
        {/* recessive grid + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={C.border} strokeWidth={1} />
            <text
              x={PAD.l - 8}
              y={y(t) + 3}
              textAnchor="end"
              fontSize={10}
              fill={C.muted}
              className="fp-mono"
            >
              {compactINR(t)}
            </text>
          </g>
        ))}
        {/* zero line when it's inside the range */}
        {lo < 0 && hi > 0 && (
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(0)}
            y2={y(0)}
            stroke={C.muted}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}
        {/* x labels — every other week */}
        {labels.map((lab, i) =>
          i % 2 === 0 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={C.muted}>
              {lab}
            </text>
          ) : null,
        )}
        {/* band + median line */}
        <path d={band} fill={CH1} opacity={0.13} />
        <path d={line(p10)} fill="none" stroke={CH1} strokeWidth={1} opacity={0.35} />
        <path d={line(p90)} fill="none" stroke={CH1} strokeWidth={1} opacity={0.35} />
        <path d={line(p50)} fill="none" stroke={CH1} strokeWidth={2} strokeLinejoin="round" />
        {/* selective direct labels at the line end — the legend for a 1-measure chart */}
        <text x={W - PAD.r + 6} y={y(p50[n - 1]!) + 3} fontSize={10} fontWeight={700} fill={CH1}>
          P50
        </text>
        <text x={W - PAD.r + 6} y={y(p90[n - 1]!) + 3} fontSize={9} fill={C.muted}>
          P90
        </text>
        <text x={W - PAD.r + 6} y={y(p10[n - 1]!) + 3} fontSize={9} fill={C.muted}>
          P10
        </text>
        {/* crosshair */}
        {hover && (
          <g>
            <line
              x1={x(hover.index)}
              x2={x(hover.index)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke={C.muted}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={x(hover.index)}
              cy={y(p50[hover.index]!)}
              r={4}
              fill={CH1}
              stroke={C.panel}
              strokeWidth={2}
            />
          </g>
        )}
        {/* hover hit layer — one column per week, larger than the mark */}
        {labels.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W - PAD.l - PAD.r) / (2 * n)}
            width={(W - PAD.l - PAD.r) / n}
            y={0}
            height={H}
            fill="transparent"
            onMouseEnter={(e) => {
              const rect = (
                e.currentTarget.ownerSVGElement as SVGSVGElement
              ).getBoundingClientRect();
              setHover({ index: i, x: (x(i) / W) * rect.width, y: (y(p50[i]!) / H) * rect.height });
            }}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover && (
        <TooltipBox x={hover.x} y={hover.y}>
          <b>{labels[hover.index]}</b>
          <div className="fp-mono">P90 {formatINR(p90[hover.index]!)}</div>
          <div className="fp-mono" style={{ color: CH1, fontWeight: 700 }}>
            P50 {formatINR(p50[hover.index]!)}
          </div>
          <div className="fp-mono">P10 {formatINR(p10[hover.index]!)}</div>
        </TooltipBox>
      )}
    </div>
  );
}

/** Weekly money in vs out: mirrored bars around zero — identity is carried by
 *  direction AND color AND the legend, so the floor-band palette is legal. */
export function FlowMirrorChart({
  labels,
  inflow,
  outflow,
}: {
  labels: string[];
  inflow: number[];
  outflow: number[];
}) {
  const [hover, setHover] = useState<TooltipState | null>(null);
  const W = 640;
  const H = 190;
  const PAD = { l: 54, r: 16, t: 14, b: 24 };
  const n = labels.length;
  if (n === 0) return null;

  const peak = Math.max(1, ...inflow, ...outflow);
  const mid = PAD.t + (H - PAD.t - PAD.b) / 2;
  const half = (H - PAD.t - PAD.b) / 2 - 2;
  const slot = (W - PAD.l - PAD.r) / n;
  const barW = Math.min(22, slot - 4); // ≥2px gap between adjacent bars
  const xOf = (i: number) => PAD.l + i * slot + (slot - barW) / 2;
  const hOf = (v: number) => (v / peak) * half;
  const maxIn = inflow.indexOf(Math.max(...inflow));
  const maxOut = outflow.indexOf(Math.max(...outflow));

  return (
    <div style={{ position: 'relative' }}>
      {/* legend — two series, always present */}
      <div
        style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}
      >
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: CH2,
              borderRadius: 3,
              marginRight: 5,
            }}
          />
          Money in (↑)
        </span>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: CH1,
              borderRadius: 3,
              marginRight: 5,
            }}
          />
          Money out (↓)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block' }}
        role="img"
        aria-label="Weekly inflow and outflow due"
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={mid} y2={mid} stroke={C.border} strokeWidth={1.5} />
        <text
          x={PAD.l - 8}
          y={mid - half + 4}
          textAnchor="end"
          fontSize={10}
          fill={C.muted}
          className="fp-mono"
        >
          {compactINR(peak)}
        </text>
        <text
          x={PAD.l - 8}
          y={mid + half + 2}
          textAnchor="end"
          fontSize={10}
          fill={C.muted}
          className="fp-mono"
        >
          {compactINR(peak)}
        </text>
        {labels.map((lab, i) => {
          const hIn = hOf(inflow[i]!);
          const hOut = hOf(outflow[i]!);
          return (
            <g key={i}>
              {/* rounded data-end, anchored to the baseline; 2px gap across zero */}
              {inflow[i]! > 0 && (
                <rect x={xOf(i)} y={mid - 1 - hIn} width={barW} height={hIn} fill={CH2} rx={3} />
              )}
              {outflow[i]! > 0 && (
                <rect x={xOf(i)} y={mid + 1} width={barW} height={hOut} fill={CH1} rx={3} />
              )}
              {/* selective direct labels: only the peak of each series */}
              {i === maxIn && inflow[i]! > 0 && (
                <text
                  x={xOf(i) + barW / 2}
                  y={mid - hIn - 6}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={700}
                  fill={C.text}
                  className="fp-mono"
                >
                  {compactINR(inflow[i]!)}
                </text>
              )}
              {i === maxOut && outflow[i]! > 0 && (
                <text
                  x={xOf(i) + barW / 2}
                  y={mid + hOut + 12}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={700}
                  fill={C.text}
                  className="fp-mono"
                >
                  {compactINR(outflow[i]!)}
                </text>
              )}
              {i % 2 === 0 && (
                <text
                  x={xOf(i) + barW / 2}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill={C.muted}
                >
                  {lab}
                </text>
              )}
              <rect
                x={PAD.l + i * slot}
                width={slot}
                y={0}
                height={H}
                fill="transparent"
                onMouseEnter={(e) => {
                  const rect = (
                    e.currentTarget.ownerSVGElement as SVGSVGElement
                  ).getBoundingClientRect();
                  setHover({
                    index: i,
                    x: ((xOf(i) + barW / 2) / W) * rect.width,
                    y: ((mid - hIn) / H) * rect.height,
                  });
                }}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover && (
        <TooltipBox x={hover.x} y={hover.y}>
          <b>{labels[hover.index]}</b>
          <div className="fp-mono" style={{ color: CH2 }}>
            in {formatINR(inflow[hover.index]!)}
          </div>
          <div className="fp-mono" style={{ color: CH1 }}>
            out {formatINR(outflow[hover.index]!)}
          </div>
        </TooltipBox>
      )}
    </div>
  );
}

/** Health score radial gauge — a stat, not a series chart: status color is
 *  reinforced by the number and label, never color alone. */
export function HealthGauge({ score }: { score: number }) {
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, score / 100));
  const color = score >= 70 ? C.green : score >= 40 ? C.amber : C.red;
  const label = score >= 70 ? 'Healthy' : score >= 40 ? 'Watch' : 'At risk';
  return (
    <div style={{ position: 'relative', width: 140, height: 140 }}>
      <svg
        viewBox="0 0 140 140"
        style={{ width: 140, height: 140 }}
        role="img"
        aria-label={`Health score ${score} of 100 — ${label}`}
      >
        <circle cx={70} cy={70} r={R} fill="none" stroke={C.panel2} strokeWidth={11} />
        <circle
          cx={70}
          cy={70}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${CIRC * frac} ${CIRC}`}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="fp-mono" style={{ fontSize: '1.9rem', fontWeight: 700, color }}>
          {score}
        </span>
        <span
          style={{
            fontSize: '0.68rem',
            color: C.muted,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
