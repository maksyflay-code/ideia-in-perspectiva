import { createFileRoute } from "@tanstack/react-router";
import { networkQuery } from "@/lib/network.queries";
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
  loader: ({ context }) => context.queryClient.ensureQueryData(networkQuery),
  component: () => <MapPage kind="dwdm" />,
});
