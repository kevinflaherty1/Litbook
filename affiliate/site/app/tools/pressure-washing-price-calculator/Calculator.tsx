"use client";

import { useState } from "react";
import { conditions, DEFAULT_MINIMUM, estimate, surfaces, type LineItem } from "@/lib/pricing";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function Calculator() {
  const [items, setItems] = useState<LineItem[]>([{ surfaceId: "concrete", sqft: 500 }]);
  const [condition, setCondition] = useState("moderate");
  const [oilStains, setOilStains] = useState(0);
  const [minimum, setMinimum] = useState(DEFAULT_MINIMUM);

  const factor = conditions.find((c) => c.id === condition)?.factor ?? 1;
  const result = estimate(items, factor, oilStains, minimum);

  const update = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  return (
    <div className="calc">
      {items.map((item, i) => {
        const s = surfaces.find((x) => x.id === item.surfaceId);
        return (
          <div key={i} className="row">
            <div>
              <label htmlFor={`surface-${i}`}>Surface {items.length > 1 ? i + 1 : ""}</label>
              <select id={`surface-${i}`} value={item.surfaceId} onChange={(e) => update(i, { surfaceId: e.target.value })}>
                {surfaces.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`sqft-${i}`}>Square feet</label>
              <input
                id={`sqft-${i}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={Number.isFinite(item.sqft) ? item.sqft : ""}
                onChange={(e) => update(i, { sqft: e.target.valueAsNumber })}
              />
              {s && <div className="small">{s.hint}</div>}
            </div>
            {items.length > 1 && (
              <div style={{ alignSelf: "end", paddingTop: 8 }}>
                <button type="button" className="small" onClick={() => setItems((p) => p.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
      <p>
        <button type="button" onClick={() => setItems((p) => [...p, { surfaceId: "siding", sqft: 1500 }])}>
          + Add another surface
        </button>
      </p>

      <div className="row">
        <div>
          <label htmlFor="condition">Condition</label>
          <select id="condition" value={condition} onChange={(e) => setCondition(e.target.value)}>
            {conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="oil">Oil stain treatments</label>
          <input id="oil" type="number" min={0} value={oilStains} onChange={(e) => setOilStains(Math.max(0, e.target.valueAsNumber || 0))} />
        </div>
        <div>
          <label htmlFor="min">Your job minimum ($)</label>
          <input id="min" type="number" min={0} value={minimum} onChange={(e) => setMinimum(Math.max(0, e.target.valueAsNumber || 0))} />
        </div>
      </div>

      <div className="result" aria-live="polite">
        <div className="small">Suggested price range</div>
        <div className="big">
          {money(result.low)} – {money(result.high)}
        </div>
        <div>
          Middle of the range: <strong>{money(result.mid)}</strong>
        </div>
        {result.minimumApplied && <div className="small">Your job minimum was applied.</div>}
      </div>
    </div>
  );
}
