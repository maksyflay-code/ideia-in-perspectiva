import { queryOptions } from "@tanstack/react-query";
import { getTraffic, getTrafficSettings } from "./traffic.functions";
export const trafficQuery = queryOptions({ queryKey: ["traffic"], queryFn: () => getTraffic(), refetchInterval: 60000, staleTime: 30000, retry: false });
export const trafficSettingsQuery = queryOptions({ queryKey: ["traffic-settings"], queryFn: () => getTrafficSettings(), retry: false });