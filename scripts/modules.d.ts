// Minimal declarations for build-time libraries that ship without types.
declare module 'd3-geo-projection' {
  export function geoProject(object: unknown, projection: unknown): unknown;
}
declare module 'polylabel' {
  export default function polylabel(polygon: number[][][], precision?: number): [number, number] & { distance: number };
}
