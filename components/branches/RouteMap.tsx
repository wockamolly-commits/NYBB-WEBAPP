"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/branches/nearest";
import type { RoadRoute } from "@/lib/branches/road-route";

/**
 * The drive from the customer to a counter, drawn on a Mapbox map.
 *
 * Loaded only through `next/dynamic` from the branch sheet, and only when the
 * sheet opens with a position to route from, so Mapbox GL JS (the heaviest
 * thing on the storefront) costs nothing to a visitor who never opens it.
 *
 * WHAT IT DRAWS, IN ORDER.
 *
 * The two pins go down at once, framed together, so the sheet is useful before
 * the route arrives. The route is the one the page already fetched for the
 * distances (see `useRoadRoutes`), so the line drawn here is the road the row's
 * number measures, and opening the sheet asks Mapbox for nothing more than
 * the map itself. It is drawn over the streets in the brand orange on a bone
 * casing, the way a navigation line reads on a light map. No route, and the
 * pins stand alone: a straight line between them would be drawing a road that
 * is not there.
 *
 * The style is Mapbox's classic Streets rather than Mapbox Standard, which
 * would need `'wasm-unsafe-eval'` in the Content Security Policy.
 */

const STYLE = "mapbox://styles/mapbox/streets-v12";
const ORANGE = "#ef6212";
const INK = "#0b0b0c";
const BONE = "#f5f1ea";

/** Room around the framed route for the pins and, below md, the close button. */
const FRAME_PADDING = { top: 72, right: 56, bottom: 56, left: 56 };

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A plain element for a marker. Styled here, since Mapbox positions it inline. */
function markerElement(kind: "you" | "counter"): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  if (kind === "you") {
    Object.assign(element.style, {
      width: "18px",
      height: "18px",
      borderRadius: "9999px",
      background: INK,
      border: `3px solid ${BONE}`,
      boxShadow: "0 0 0 6px rgba(11, 11, 12, 0.18)",
    });
  } else {
    Object.assign(element.style, {
      width: "22px",
      height: "22px",
      borderRadius: "9999px 9999px 9999px 0",
      transform: "rotate(-45deg)",
      background: ORANGE,
      border: `3px solid ${BONE}`,
      boxShadow: "0 2px 6px rgba(11, 11, 12, 0.35)",
    });
  }
  return element;
}

export default function RouteMap({
  from,
  to,
  route,
  label,
  onReady,
}: {
  from: LatLng;
  to: LatLng;
  /** Null while it is on its way, or when Mapbox found none. */
  route: RoadRoute | null;
  /** What the map shows, for a screen reader. */
  label: string;
  /** Called once the first frame is drawn, to lift the loading placeholder. */
  onReady: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const routeDrawn = useRef(false);
  const [styled, setStyled] = useState(false);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const container = containerRef.current;
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!container || !accessToken) return;

    let current = true;
    routeDrawn.current = false;
    const bounds = new mapboxgl.LngLatBounds([from.lng, from.lat], [from.lng, from.lat]).extend([
      to.lng,
      to.lat,
    ]);

    const map = new mapboxgl.Map({
      container,
      accessToken,
      style: STYLE,
      bounds,
      fitBoundsOptions: { padding: FRAME_PADDING, maxZoom: 16 },
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.touchZoomRotate.disableRotation();
    map.getCanvas().setAttribute("aria-label", label);

    new mapboxgl.Marker({ element: markerElement("you") }).setLngLat([from.lng, from.lat]).addTo(map);
    new mapboxgl.Marker({ element: markerElement("counter"), anchor: "bottom" })
      .setLngLat([to.lng, to.lat])
      .addTo(map);

    // The sheet may still be opening when this mounts (a child's effect runs
    // before the dialog's showModal), so the container can start at no size.
    // Following the container keeps the canvas matched to the panel, and
    // the pins are framed again for the size it actually has, until the
    // route takes over the framing.
    const resize = new ResizeObserver(() => {
      map.resize();
      if (!routeDrawn.current && container.clientWidth > 0 && container.clientHeight > 0) {
        map.fitBounds(bounds, { padding: FRAME_PADDING, maxZoom: 16, duration: 0 });
      }
    });
    resize.observe(container);

    map.once("load", () => {
      if (current) setStyled(true);
    });
    map.once("idle", () => {
      if (current) onReadyRef.current();
    });

    return () => {
      current = false;
      resize.disconnect();
      mapRef.current = null;
      setStyled(false);
      map.remove();
    };
    // A new position or counter is a new map. The label is read once, at
    // creation, like the rest of the canvas's setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.lat, from.lng, to.lat, to.lng]);

  // The line, once both the style and the route are here, in either order.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styled || !route || routeDrawn.current) return;
    routeDrawn.current = true;

    map.addSource("route", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: route.line },
      },
    });
    const lineLayout = { "line-join": "round", "line-cap": "round" } as const;
    map.addLayer({
      id: "route-casing",
      type: "line",
      source: "route",
      layout: lineLayout,
      paint: { "line-color": BONE, "line-width": 9 },
    });
    map.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: lineLayout,
      paint: { "line-color": ORANGE, "line-width": 5 },
    });

    const routeBounds = route.line.reduce(
      (box, point) => box.extend(point),
      new mapboxgl.LngLatBounds(route.line[0], route.line[0]),
    );
    map.fitBounds(routeBounds, {
      padding: FRAME_PADDING,
      maxZoom: 16,
      duration: reducedMotion() ? 0 : 600,
    });
  }, [styled, route]);

  return <div ref={containerRef} className="absolute inset-0 size-full" />;
}
