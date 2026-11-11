import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQuery, networkQuery } from "@/lib/network.queries";
import MapPage from "@/components/MapPage";

export const Route = createFileRoute("/dwdm")({
  head: () => ({
    meta: [
      { title: "Rede IVI Telecom · DWDM" },
      { name: "description", content: "Mapa dos equipamentos DWDM Padtec e ECI da Rede IVI Telecom." },
      { property: "og:title", content: "Rede IVI Telecom · DWDM" },
      { property: "og:description", content: "Mapa dos equipamentos DWDM Padtec e ECI da Rede IVI Telecom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery);
    if (!me.viewer) throw redirect({ to: "/login" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(networkQuery),
  component: () => <MapPage kind="dwdm" />,
});
