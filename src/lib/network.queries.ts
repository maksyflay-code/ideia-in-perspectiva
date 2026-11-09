import { queryOptions } from "@tanstack/react-query";
import { getMe, getNetwork } from "./network.functions";

export const networkQuery = queryOptions({ queryKey: ["network"], queryFn: () => getNetwork() });
export const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMe() });
import { getZabbixStatus } from "./network.functions";
export const zabbixQuery = queryOptions({
  queryKey: ["zabbix"],
  queryFn: () => getZabbixStatus(),
  refetchInterval: 60000,
});
