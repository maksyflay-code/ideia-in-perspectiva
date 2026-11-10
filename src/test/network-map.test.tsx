import { render, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Network } from "@/lib/network.types";

const mock = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => void>,
  sources: {} as Record<string, any>,
  html: "",
}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({ default: "worker" }));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  NavigationControl: class {},
  Map: class {
    on(event: string, layer: string | ((...args: any[]) => void), callback?: (...args: any[]) => void) {
      if (typeof layer === "function") mock.handlers[event] = layer;
      else if (callback) mock.handlers[`${event}:${layer}`] = callback;
    }
    addControl() {}
    addSource(id: string, source: any) { mock.sources[id] = { ...source, setData(data: any) { this.data = data; } }; }
    addLayer() {}
    getSource(id: string) { return mock.sources[id]; }
    isStyleLoaded() { return true; }
    project([lng, lat]: number[]) { return { x: (lng ?? 0) * 10000, y: (lat ?? 0) * 10000 }; }
    fitBounds() {}
    remove() {}
  },
  LngLatBounds: class { extend() {} },
  Popup: class {
    setLngLat() { return this; }
    setHTML(html: string) { mock.html = html; return this; }
    addTo() { return this; }
  },
}));
import NetworkMap from "@/components/NetworkMap";

const network: Network = {
  pops: [
    { id: 1, name: "sw-jacuipe", city: "Jacuipe", lat: -12, lng: -39, notes: "" },
    { id: 2, name: "padtec-jacuipe", city: "Jacuipe", lat: -12, lng: -39, notes: "" },
  ], links: [], channels: [],
};

describe("Equipamentos sobrepostos", () => {
  beforeEach(() => {
    mock.handlers = {}; mock.sources = {}; mock.html = "";
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });
  it("lista o switch e o Padtec ao clicar na mesma localização", () => {
    render(<NetworkMap network={network} channelId={null} />);
    act(() => mock.handlers["load"]?.());
    const feature = mock.sources["pops"].data.features[0];
    act(() => mock.handlers["click:pops"]?.({ features: [feature] }));
    expect(mock.html).toContain("sw-jacuipe");
    expect(mock.html).toContain("padtec-jacuipe");
    expect(mock.sources["pops"].data.features).toHaveLength(1);
    expect(feature.properties.count).toBe(2);
  });
});