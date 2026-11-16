import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getTraffic = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await import("@/server/auth.server");
  await auth.requireViewer();
  const { getDb } = await import("@/server/db.server");
  const service = await import("@/server/traffic.server");
  return service.readTraffic(await getDb());
});
export const getTrafficSettings = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await import("@/server/auth.server");
  await auth.requireAdmin();
  const { getDb } = await import("@/server/db.server");
  const service = await import("@/server/traffic.server");
  const selected = service.selectedTraffic(await getDb());
  try { return { ports: await service.discoverTraffic(), selected, error: "" }; }
  catch { return { ports: [], selected, error: "Não foi possível listar as portas de tráfego no Zabbix." }; }
});
export const saveTrafficSettings = createServerFn({ method: "POST" })
  .inputValidator(z.object({ selections: z.array(z.object({ portId: z.string().regex(/^\d+:\d+$/), group: z.enum(["external", "clients"]) })).max(200), confirmed: z.literal(true) }))
  .handler(async ({ data }) => {
    const auth = await import("@/server/auth.server");
    await auth.requireAdmin();
    const { getDb } = await import("@/server/db.server");
    const service = await import("@/server/traffic.server");
    return service.saveTraffic(await getDb(), data.selections);
  });