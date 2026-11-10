import { render, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Network } from "@/lib/network.types";

const mock = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => void>,
  sources: {} as Record<string, any>,
  html: "",
  layers: {} as Record<string, any>,
  paints: vi.fn(),
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
    addLayer(layer: any) { mock.layers[layer.id] = layer; }
    getLayer(id: string) { return mock.layers[id]; }
    setPaintProperty(...args: any[]) { mock.paints(...args); }
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
    vi.restoreAllMocks();
    mock.handlers = {}; mock.sources = {}; mock.html = ""; mock.layers = {}; mock.paints.mockClear();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
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
  it("atualiza a ligação caída e recuperada sem mover o mapa", () => {
    const net: Network = { ...network, links: [{ id: 8, from_pop: 1, to_pop: 2, distance_km: 10, zabbix_host: "sw-jacuipe", zabbix_item: "88" }] };
    const status = (state: "up" | "down") => ({ enabled: true, byName: {}, byLink: { "8": { state, message: "" } } });
    const view = render(<NetworkMap network={net} channelId={null} zabbix={status("up")} />);
    act(() => mock.handlers["load"]?.());
    expect(mock.sources["links"].data.features[0].properties.state).toBe("up");
    view.rerender(<NetworkMap network={net} channelId={null} zabbix={status("down")} />);
    expect(mock.sources["links"].data.features[0].properties.state).toBe("down");
    view.rerender(<NetworkMap network={net} channelId={null} zabbix={status("up")} />);
    expect(mock.sources["links"].data.features[0].properties.state).toBe("up");
  });
  it("só indica fluxo quando a porta confirma estado ativo, nunca por alarmes dos POPs", () => {
    const link = { id: 8, from_pop: 1, to_pop: 2, distance_km: 10, zabbix_host: "sw-jacuipe", zabbix_item: "" };
    const net: Network = { ...network, links: [link] };
    const byName = { "padtec-jacuipe": { state: "down" as const, problems: [{ name: "Alarme Padtec", severity: 4 }] } };
    const view = render(<NetworkMap network={net} channelId={null} zabbix={{ enabled: true, byName }} />);
    act(() => mock.handlers["load"]?.());
    expect(mock.sources["links"].data.features[0].properties.flowing).toBe(false);
    const monitored = { ...net, links: [{ ...link, zabbix_item: "88" }] };
    for (const state of ["unknown", "down", "up"] as const) {
      view.rerender(<NetworkMap network={monitored} channelId={null} zabbix={{ enabled: true, byName, byLink: { "8": { state, message: "" } } }} />);
      expect(mock.sources["links"].data.features[0].properties.flowing).toBe(state === "up");
    }
    view.rerender(<NetworkMap network={monitored} channelId={null} zabbix={{ enabled: true, byName, error: "offline", byLink: { "8": { state: "up", message: "" } } }} />);
    expect(mock.sources["links"].data.features[0].properties.flowing).toBe(false);
  });
  it("avança a animação e cancela ao sair", () => {
    const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const view = render(<NetworkMap network={network} channelId={null} />);
    act(() => mock.handlers["load"]?.());
    const callback = request.mock.calls.at(-1)?.[0];
    act(() => callback?.(200));
    expect(mock.paints).toHaveBeenCalledWith("link-flow", "line-dasharray", [0, 0.4, 1, 2.6]);
    view.unmount();
    expect(cancel).toHaveBeenCalledWith(42);
  });
  it("não agenda animação quando movimento reduzido está ativo", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const request = vi.spyOn(window, "requestAnimationFrame");
    render(<NetworkMap network={network} channelId={null} />);
    act(() => mock.handlers["load"]?.());
    expect(request).not.toHaveBeenCalled();
  });
});