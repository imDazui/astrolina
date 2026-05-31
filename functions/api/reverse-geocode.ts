// Cloudflare Pages Function — GET /api/reverse-geocode?lat=…&lng=…
//
// Reverse-geocodes a map point (pin/hover) to a "City, Region, Country" label,
// proxying Nominatim's /reverse from the edge with a policy-compliant
// User-Agent and a week-long cache. Coordinates are rounded to ~110 m so nearby
// hovers share a cache entry and the public endpoint is hit sparingly.
//
// Note: not part of any tsconfig project, so the Cloudflare runtime globals
// below (`caches`, the event context) are intentionally untyped here.

import { fetchReverseGeocode } from '../_shared/geocodeSource';

declare const caches: {
  default: {
    match(req: Request): Promise<Response | undefined>;
    put(req: Request, resp: Response): Promise<void>;
  };
};

interface EventContext {
  request: Request;
  waitUntil: (promise: Promise<unknown>) => void;
}

const WEEK = 60 * 60 * 24 * 7;

export const onRequestGet = async (
  context: EventContext,
): Promise<Response> => {
  const url = new URL(context.request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ label: null });
  }

  // Snap to ~110 m so jittery hovers collapse to one cache entry / upstream hit.
  const rlat = lat.toFixed(3);
  const rlng = lng.toFixed(3);
  const cacheKey = new Request(
    `${url.origin}/api/reverse-geocode?lat=${rlat}&lng=${rlng}`,
  );
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  try {
    const label = await fetchReverseGeocode(Number(rlat), Number(rlng));
    const resp = Response.json(
      { label },
      { headers: { 'cache-control': `public, max-age=${WEEK}` } },
    );
    context.waitUntil(caches.default.put(cacheKey, resp.clone()));
    return resp;
  } catch {
    return Response.json({ error: 'reverse_geocode_failed' }, { status: 502 });
  }
};
