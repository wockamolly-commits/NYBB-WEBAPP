"use client";

import { LoaderCircle, LocateFixed } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import type { LatLngPoint } from "@/lib/staff/branch-location-schema";
import { CEBU_CENTER } from "@/lib/staff/location-search";

/**
 * A map to put one pin on: click anywhere to drop it, drag it to correct it.
 *
 * Loaded through `next/dynamic` from the settings screen, only when a branch's
 * drawer is opened, so Mapbox GL JS costs nothing to a manager who never
 * touches a location. Same style and same reasons as the storefront's
 * `RouteMap`: classic Streets, because Mapbox Standard would need
 * `'wasm-unsafe-eval'` in the Content Security Policy.
 *
 * The point is owned by the parent. This component reports moves up and
 * follows changes down, so a pasted pair moves the pin and a dragged pin
 * rewrites the pasted pair.
 */

const STYLE = "mapbox://styles/mapbox/streets-v12";
const ORANGE = "#ef6212";
const INK = "#0b0b0c";
const BONE = "#f5f1ea";
/** Cebu City, where a map with no pin yet should start. */
const CEBU: [number, number] = [CEBU_CENTER.lng, CEBU_CENTER.lat];

/** The "you are here" dot, drawn as the storefront's RouteMap draws it. */
function youElement(): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  Object.assign(element.style, {
    width: "18px",
    height: "18px",
    borderRadius: "9999px",
    background: INK,
    border: `3px solid ${BONE}`,
    boxShadow: "0 0 0 6px rgba(11, 11, 12, 0.18)",
  });
  return element;
}

type LocateStatus = "idle" | "locating" | "denied" | "failed" | "unsupported";

const LOCATE_MESSAGES: Partial<Record<LocateStatus, string>> = {
  denied: "Location access is blocked for this site. Allow it in the browser's address bar, then try again.",
  failed: "Your location could not be found. Try again, or search for the place instead.",
  unsupported: "This browser cannot share its location. Search for the place instead.",
};

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pinElement(): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  Object.assign(element.style, {
    width: "26px",
    height: "26px",
    borderRadius: "9999px 9999px 9999px 0",
    transform: "rotate(-45deg)",
    background: ORANGE,
    border: `3px solid ${BONE}`,
    boxShadow: "0 2px 6px rgba(11, 11, 12, 0.35)",
    cursor: "grab",
  });
  return element;
}

export default function LocationPickerMap({
  point,
  onChange,
  label,
}: {
  point: LatLngPoint | null;
  onChange: (point: LatLngPoint) => void;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  // The first point frames the map; later ones only move the pin.
  const initialPoint = useRef(point);

  const youRef = useRef<mapboxgl.Marker | null>(null);
  const [locateStatus, setLocateStatus] = useState<LocateStatus>("idle");

  // Centres the map on where the person is standing and marks it with a blue
  // dot. It does not move the branch pin: being near a counter is not being
  // at it, so the pin is still placed by a click, which is one tap from here
  // for somebody standing at the counter. Asked only when pressed, never on
  // load, so nobody is prompted for their location just for opening a drawer.
  function locate() {
    const map = mapRef.current;
    if (!map) return;
    if (!("geolocation" in navigator)) {
      setLocateStatus("unsupported");
      return;
    }
    setLocateStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const current = mapRef.current;
        if (!current) return;
        const lngLat: [number, number] = [coords.longitude, coords.latitude];
        youRef.current ??= new mapboxgl.Marker({ element: youElement() });
        youRef.current.setLngLat(lngLat).addTo(current);
        current.easeTo({ center: lngLat, zoom: Math.max(current.getZoom(), 17), duration: reducedMotion() ? 0 : 500 });
        setLocateStatus("idle");
      },
      (error) => setLocateStatus(error.code === error.PERMISSION_DENIED ? "denied" : "failed"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }

  useEffect(() => {
    const container = containerRef.current;
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!container || !accessToken) return;

    const start = initialPoint.current;
    const map = new mapboxgl.Map({
      container,
      accessToken,
      style: STYLE,
      center: start ? [start.lng, start.lat] : CEBU,
      zoom: start ? 17 : 12,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.touchZoomRotate.disableRotation();
    map.getCanvas().setAttribute("aria-label", label);
    map.getCanvas().style.cursor = "crosshair";

    const marker = new mapboxgl.Marker({ element: pinElement(), anchor: "bottom", draggable: true });
    markerRef.current = marker;
    if (start) marker.setLngLat([start.lng, start.lat]).addTo(map);

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLngLat();
      onChangeRef.current({ lat, lng });
    });
    map.on("click", (event) => {
      const { lat, lng } = event.lngLat;
      marker.setLngLat([lng, lat]).addTo(map);
      onChangeRef.current({ lat, lng });
    });

    // The drawer animates open, so the container can start at no size.
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container);

    return () => {
      resize.disconnect();
      markerRef.current = null;
      youRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // The label is read once, at creation, like the rest of the canvas setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A pasted pair, or a reset after a save, moves the pin and brings it into
  // view. A pin the map itself just placed is already where it should be.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (!point) {
      marker.remove();
      return;
    }
    // Undefined until the pin has been placed once.
    const current = marker.getLngLat() as mapboxgl.LngLat | undefined;
    if (current && Math.abs(current.lat - point.lat) < 1e-9 && Math.abs(current.lng - point.lng) < 1e-9) return;
    marker.setLngLat([point.lng, point.lat]).addTo(map);
    map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 16), duration: 0 });
  }, [point]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-2 left-2 max-w-[calc(100%-1rem)]">
        <button
          type="button"
          onClick={locate}
          disabled={locateStatus === "locating"}
          className="bg-nybb-ink/90 text-nybb-bone hover:bg-nybb-ink focus-visible:outline-nybb-orange inline-flex min-h-11 items-center gap-2 rounded-md px-3.5 text-sm shadow-md focus-visible:outline-2 disabled:cursor-wait"
        >
          {locateStatus === "locating" ? (
            <LoaderCircle aria-hidden className="text-nybb-orange size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <LocateFixed aria-hidden className="text-nybb-orange size-4" />
          )}
          {locateStatus === "locating" ? "Finding you" : "My location"}
        </button>
        <p role="status" className="empty:hidden bg-nybb-ink/90 text-nybb-bone mt-2 max-w-72 rounded-md px-3 py-2 text-xs leading-snug shadow-md">
          {LOCATE_MESSAGES[locateStatus] ?? ""}
        </p>
      </div>
    </div>
  );
}
