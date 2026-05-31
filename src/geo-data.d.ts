// Ambient declarations for the offline country-lookup data + decoder. The
// world-atlas JSON is declared loosely so tsc doesn't infer a giant literal type
// from the ~105 KB file, and topojson-client (which ships no types) gets only
// the `feature()` shape we actually use.
declare module 'world-atlas/countries-110m.json' {
  const topology: unknown;
  export default topology;
}

declare module 'topojson-client' {
  export function feature(
    topology: unknown,
    object: unknown,
  ): {
    features: Array<{
      properties: { name?: string } | null;
      geometry: { type: string; coordinates: unknown } | null;
    }>;
  };
}
