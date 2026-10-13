import type { UsageCounters, UsageReport } from "@talorys/shared";

function formatEstimate(value: number | null, currency = false): string {
  if (value === null) return "—";
  const precision = currency ? 8 : 6;
  const formatted = value > 0 && value < 10 ** -precision
    ? value.toExponential(2)
    : value.toLocaleString(undefined, { minimumFractionDigits: currency ? 2 : 0, maximumFractionDigits: precision });
  return currency ? `$${formatted}` : formatted;
}

export function UsageBreakdown({ counters, compact = false }: { counters: UsageCounters; compact?: boolean }) {
  const legacy = counters.input_tokens_legacy + counters.output_tokens_legacy;
  const partial = counters.unpriced_calls > 0 || legacy > 0;
  const rows = compact ? [
    ["Tokens · provider reported", (counters.input_tokens_reported + counters.output_tokens_reported).toLocaleString()],
    ["Tokens · fallback estimated", (counters.input_tokens_estimated + counters.output_tokens_estimated).toLocaleString()],
  ] : [
    ["Input tokens · provider reported", counters.input_tokens_reported.toLocaleString()],
    ["Output tokens · provider reported", counters.output_tokens_reported.toLocaleString()],
    ["Input tokens · fallback estimated", counters.input_tokens_estimated.toLocaleString()],
    ["Output tokens · fallback estimated", counters.output_tokens_estimated.toLocaleString()],
  ];
  if (legacy > 0) {
    if (compact) rows.push(["Legacy tokens · unknown provenance", legacy.toLocaleString()]);
    else rows.push(
      ["Input tokens · legacy / unknown", counters.input_tokens_legacy.toLocaleString()],
      ["Output tokens · legacy / unknown", counters.output_tokens_legacy.toLocaleString()],
    );
  }
  rows.push(
    [`Estimated Neurons${partial ? " · partial" : ""}`, formatEstimate(counters.neurons_estimate)],
    [`Estimated inference USD${partial ? " · partial" : ""}`, formatEstimate(counters.cost_usd_estimate, true)],
    ["Embedding requests · separate cap", counters.embedding_requests.toLocaleString()],
  );
  if (counters.mock_calls > 0) rows.push(["Mock calls · nonbillable", counters.mock_calls.toLocaleString()]);

  return <div>
    <dl className="space-y-2 text-xs text-fg-muted">
      {rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3">
        <dt>{label}</dt><dd className="shrink-0 tabular-nums text-fg">{value}</dd>
      </div>)}
    </dl>
    <div className="mt-3 space-y-1 text-xs leading-5 text-fg-subtle">
      {counters.priced_calls === 0
        ? <p>Price estimates unavailable: no priced billable calls recorded.</p>
        : <p>{partial ? "Partial subtotal" : "Price coverage"}: {counters.priced_calls.toLocaleString()} priced billable calls.</p>}
      {counters.unpriced_calls > 0 && <p>{counters.unpriced_calls.toLocaleString()} unpriced calls (unsupported or unknown model); not assumed free.</p>}
      {legacy > 0 && <p>Legacy tokens have unknown model and provenance and are excluded from pricing.</p>}
      {counters.mock_calls > 0 && <p>Demo/mock tokens are estimates; mock calls consume no real AI and are excluded from pricing.</p>}
    </div>
  </div>;
}

export function UsagePricingNote({ data }: { data: UsageReport }) {
  return <div className="space-y-1 text-xs leading-5 text-fg-subtle">
    <p>{data.note}</p>
    <p>Static rates recorded at call time. <a href={data.pricing.source_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Published Workers AI pricing</a> · as of {data.pricing.as_of} · ${data.pricing.usd_per_1000_neurons.toLocaleString(undefined, { maximumFractionDigits: 8 })} per 1,000 Neurons.</p>
  </div>;
}
