import type { MeasureInfo } from '../Map/Map';
// Reuse the bottom overlay bar's chrome (.timeline-hud + .thud-* classes); this
// bar is the same component language, docked at the top.
import '../TimelineHud/TimelineHud.css';
import './MappingToolsHud.css';

export type MapTool = 'off' | 'measure';

interface MappingToolsHudProps {
  tool: MapTool;
  setTool: (t: MapTool) => void;
  measure: MeasureInfo | null;
}

const TOOLS: { tool: MapTool; label: string }[] = [
  { tool: 'off', label: 'Off' },
  { tool: 'measure', label: 'Measure' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// "12°34′ · 1395 km · 867 mi" — central angle (deg·min) then both distance units.
function fmtMeasure(m: MeasureInfo): string {
  let deg = Math.floor(m.angleDeg);
  let min = Math.round((m.angleDeg - deg) * 60);
  if (min === 60) {
    min = 0;
    deg += 1;
  }
  const km = m.km < 100 ? m.km.toFixed(1) : Math.round(m.km).toLocaleString();
  const mi =
    m.miles < 100 ? m.miles.toFixed(1) : Math.round(m.miles).toLocaleString();
  return `${deg}°${pad2(min)}′ · ${km} km · ${mi} mi`;
}

export function MappingToolsHud({
  tool,
  setTool,
  measure,
}: MappingToolsHudProps) {
  return (
    <div
      className="timeline-hud mapping-hud"
      data-mode={tool === 'off' ? 'off' : 'on'}
    >
      <div className="thud-row">
        <label className="thud-mode">
          {tool === 'off' && <span className="thud-mode-label">Tools</span>}
          <span className="thud-select-wrap">
            <select
              className="thud-select"
              value={tool}
              onChange={(e) => setTool(e.target.value as MapTool)}
            >
              {TOOLS.map(({ tool: t, label }) => (
                <option key={t} value={t}>
                  {label}
                </option>
              ))}
            </select>
            <span className="thud-select-caret">▾</span>
          </span>
        </label>

        {tool === 'measure' && (
          <>
            <span className="thud-divider" />
            {measure ? (
              <span className="thud-readout">
                <span className="thud-dot" />
                {fmtMeasure(measure)}
              </span>
            ) : (
              <span className="thud-hint">
                Click and drag on the map to measure
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
