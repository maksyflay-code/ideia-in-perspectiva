import { render, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Network } from "@/lib/network.types";
import { displayPositions, equipmentType } from "@/lib/map-layout";

const mock = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => void>,
  sources: {} as Record<string, any>,
  html: "",
  layers: {} as Record<string, any>,
  images: {} as Record<string, boolean>,
  paints: vi.fn(),
  styleLoaded: true,
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
    addImage(id: string) { mock.images[id] = true; }
    addSource(id: string, source: any) { mock.sources[id] = { ...source, setData(data: any) { this.data = data; } }; }
    addLayer(layer: any) { mock.layers[layer.id] = layer; }
    getLayer(id: string) { return mock.layers[id]; }
    setPaintProperty(...args: any[]) { mock.paints(...args); }
    getSource(id: string) { return mock.sources[id]; }
    isStyleLoaded() { return mock.styleLoaded; }
    project([lng, lat]: number[]) { return { x: (lng ?? 0) * 10000, y: (lat ?? 0) * 10000 }; }
    unproject([x, y]: number[]) { return { lng: (x ?? 0) / 10000, lat: (y ?? 0) / 10000 }; }
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
    mock.handlers = {}; mock.sources = {}; mock.html = ""; mock.layers = {}; mock.images = {}; mock.paints.mockClear();
    mock.styleLoaded = true;
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });
  it("mostra switch, Padtec e ECI da mesma cidade como pontos separados", () => {
    const net = { ...network, pops: [...network.pops, { ...network.pops[0], id: 3, name: "eci-jacuipe" }] } as Network;
    const saved = JSON.stringify(net);
    render(<NetworkMap network={net} channelId={null} />);
    act(() => mock.handlers["load"]?.());
    const features = mock.sources["pops"].data.features;
    expect(features).toHaveLength(3);
    expect(JSON.stringify(net)).toBe(saved);
  });
  it("cada ponto mostra o estado do seu equipamento", () => {
    render(<NetworkMap network={network} channelId={null} zabbix={{ enabled: true, byName: { "sw-jacuipe": { state: "ok", problems: [] }, "padtec-jacuipe": { state: "down", problems: [] } } }} />);
    act(() => mock.handlers["load"]?.());
    const f = mock.sources["pops"].data.features;
    expect(f.find((x: any) => x.properties.name === "padtec-jacuipe").properties.state).toBe("down");
    expect(f.find((x: any) => x.properties.name === "sw-jacuipe").properties.state).toBe("ok");
  });
  it("separa equipamentos próximos lado a lado", () => {
    const camera = {
      project: ([lng, lat]: [number, number]) => ({ x: lng * 10000, y: lat * 10000 }),
      unproject: ([x, y]: [number, number]) => ({ lng: x / 10000, lat: y / 10000 }),
    };
    const positions = displayPositions(network.pops, camera);
    const a = camera.project(positions.get(1)!), b = camera.project(positions.get(2)!);
    expect(Math.round(Math.abs(a.x - b.x))).toBe(24); expect(a.y).toBeCloseTo(b.y);
    expect(equipmentType("padtec-paulo-afonso")).toBe("padtec");
  });
  it("liga as linhas às posições visuais e anima raios só em DWDM ativo ou não monitorado", () => {
    const net: Network = {
      ...network,
      pops: [...network.pops, { id: 3, name: "eci-serrinha", city: "Serrinha", lat: -11.7, lng: -39, notes: "" }],
      links: [{ id: 9, from_pop: 2, to_pop: 3, distance_km: 50, zabbix_host: "eci-serrinha", zabbix_item: "" }],
    };
    const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    const view = render(<NetworkMap network={net} channelId={null} />);
    act(() => mock.handlers["load"]?.());
    const link = mock.sources["links"].data.features[0];
    expect(link.properties.dwdm).toBe(true);
    expect(link.geometry.coordinates[0]).toEqual(mock.sources["pops"].data.features.find((x: any) => x.properties.id === 2).geometry.coordinates);
    act(() => request.mock.calls.at(-1)?.[0]?.(200));
    expect(mock.sources["dwdm-bolts"].data.features.length).toBeGreaterThan(0);
    const monitored = { ...net, links: [{ ...net.links[0], zabbix_item: "99" }] } as Network;
    for (const state of ["down", "unknown", "up"] as const) {
      view.rerender(<NetworkMap network={monitored} channelId={null} zabbix={{ enabled: true, byName: {}, byLink: { "9": { state, message: "" } } }} />);
      act(() => request.mock.calls.at(-1)?.[0]?.(state === "down" ? 400 : state === "unknown" ? 600 : 800));
      expect(mock.sources["dwdm-bolts"].data.features.length > 0).toBe(state === "up");
    }
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
  it("atualiza suspeita das duas pontas e para raios sem alterar links monitorados", () => {
    const net: Network = {
      pops: [
        { id: 1, name: "padtec-mossoro", city: "Mossoró", lat: -5, lng: -37, notes: "" },
        { id: 2, name: "padtec-santa-luzia", city: "Santa Luzia", lat: -6, lng: -36, notes: "" },
      ],
      links: [{ id: 1, from_pop: 1, to_pop: 2, distance_km: 100, zabbix_host: "", zabbix_item: "" }], channels: [],
    };
    const critical = { state: "down" as const, problems: [{ name: "Alarme", severity: 4 }] };
    const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    const view = render(<NetworkMap network={net} channelId={null} />);
    act(() => mock.handlers["load"]?.());
    view.rerender(<NetworkMap network={net} channelId={null} zabbix={{ enabled: true, byName: { "padtec-mossoro": critical, "padtec-santa-luzia": critical } }} />);
    expect(mock.sources["links"].data.features[0].properties.state).toBe("suspect");
    expect(mock.sources["links"].data.features[0].properties.flowing).toBe(false);
    act(() => request.mock.calls.at(-1)?.[0]?.(200));
    expect(mock.sources["dwdm-bolts"].data.features).toHaveLength(0);
    view.rerender(<NetworkMap network={net} channelId={null} zabbix={{ enabled: true, byName: { "padtec-mossoro": critical, "padtec-santa-luzia": { state: "ok", problems: [] } } }} />);
    expect(mock.sources["links"].data.features[0].properties.state).toBe("unmonitored");
    expect(mock.sources["links"].data.features[0].properties.flowing).toBe(true);
  });
  it("restaura animação decorativa sem porta configurada, mesmo com alarmes nos POPs", () => {
    const link = { id: 8, from_pop: 1, to_pop: 2, distance_km: 10, zabbix_host: "sw-jacuipe", zabbix_item: "" };
    const net: Network = { ...network, links: [link] };
    const byName = { "padtec-jacuipe": { state: "down" as const, problems: [{ name: "Alarme Padtec", severity: 4 }] } };
    const view = render(<NetworkMap network={net} channelId={null} zabbix={{ enabled: true, byName }} />);
    act(() => mock.handlers["load"]?.());
    expect(mock.sources["links"].data.features[0].properties.flowing).toBe(true);
    expect(mock.sources["links"].data.features[0].properties.state).toBe("unmonitored");
  });
  it("anima porta ativa quando o Zabbix responde durante carregamento de tiles", () => {
    const net: Network = { ...network, links: [{ id: 8, from_pop: 1, to_pop: 2, distance_km: 10, zabbix_host: "sw-jacuipe", zabbix_item: "88" }] };
    const view = render(<NetworkMap network={net} channelId={null} zabbix={{ enabled: true, byName: {} }} />);
    act(() => mock.handlers["load"]?.());
    expect(mock.sources["links"].data.features[0].properties.flowing).toBe(false);
    mock.styleLoaded = false;
    view.rerender(<NetworkMap network={net} channelId={null} zabbix={{ enabled: true, byName: {}, byLink: { "8": { state: "up", message: "Porta ativa" } } }} />);
    expect(mock.sources["links"].data.features[0].properties.state).toBe("up");
    expect(mock.sources["links"].data.features[0].properties.flowing).toBe(true);
    expect(mock.layers["link-flow"].filter[1]).toEqual(["==", ["get", "flowing"], true]);
  });
  it("mantém porta monitorada desconhecida ou caída sem animação", () => {
    const link = { id: 8, from_pop: 1, to_pop: 2, distance_km: 10, zabbix_host: "sw-jacuipe", zabbix_item: "88" };
    const net: Network = { ...network, links: [link] };
    const byName = {};
    const view = render(<NetworkMap network={net} channelId={null} zabbix={{ enabled: true, byName }} />);
    act(() => mock.handlers["load"]?.());
    const monitored = { ...net, links: [{ ...link, zabbix_item: "88" }] };
    for (const state of ["unknown", "down", "up"] as const) {
      view.rerender(<NetworkMap network={monitored} channelId={null} zabbix={{ enabled: true, byName, byLink: { "8": { state, message: "" } } }} />);
      expect(mock.sources["links"].data.features[0].properties.flowing).toBe(state === "up");
    }
    view.rerender(<NetworkMap network={monitored} channelId={null} zabbix={{ enabled: true, byName, error: "offline", byLink: { "8": { state: "up", message: "" } } }} />);
    expect(mock.sources["links"].data.features[0].properties.flowing).toBe(false);
  });
  it("linha de switch ativa tem só a animação de pacotes, sem tracejado", () => {
    const net: Network = { ...network, pops: [network.pops[0]!, { id: 5, name: "sw-serrinha", city: "Serrinha", lat: -11.7, lng: -39, notes: "" }], links: [{ id: 8, from_pop: 1, to_pop: 5, distance_km: 10, zabbix_host: "sw-jacuipe", zabbix_item: "88" }] };
    const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    render(<NetworkMap network={net} channelId={null} zabbix={{ enabled: true, byName: {}, byLink: { "8": { state: "up", message: "" } } }} />);
    act(() => mock.handlers["load"]?.());
    expect(mock.layers["link-flow"].filter[2]).toEqual(["==", ["get", "dwdm"], true]);
    act(() => request.mock.calls.at(-1)?.[0]?.(200));
    expect(mock.sources["sw-pulses"].data.features.length).toBeGreaterThan(0);
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
