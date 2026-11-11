import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQuery, networkQuery } from "@/lib/network.queries";
import MapPage from "@/components/MapPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rede IVI Telecom · Switches" },
      { name: "description", content: "Mapa dos switches da Rede IVI Telecom com ligações e estado do Zabbix." },
      { property: "og:title", content: "Rede IVI Telecom · Switches" },
      { property: "og:description", content: "Mapa dos switches da Rede IVI Telecom com ligações e estado do Zabbix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery);
    if (!me.viewer) throw redirect({ to: "/login" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(networkQuery),
  component: () => <MapPage kind="sw" />,
});
