<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Map points within 22 screen pixels merge into one same-size marker at their screen centroid (worst Zabbix state, label with count); its click popup lists every member; links attach to that display position without altering saved coordinates.
- Self-hosted on a Proxmox VM via Docker (NITRO_PRESET=node-server); never depend on Lovable Cloud or other hosted backends.
- Storage is SQLite via Node's built-in `node:sqlite` in `src/server/db.server.ts`, imported dynamically so the Worker bundle never resolves it; schema is created with CREATE TABLE IF NOT EXISTS on startup.
- Auth: one admin (ADMIN_USER/ADMIN_PASSWORD) plus map viewers from MAP_USERS env (user:pass list, kept in the VM .env, never in git), sharing an HMAC-signed httpOnly cookie carrying the role; map reads call requireViewer(), every mutating server function calls requireAdmin().
- Zabbix integration is read-only via JSON-RPC in `src/server/zabbix.server.ts`, configured by ZABBIX_URL/ZABBIX_USER/ZABBIX_PASSWORD env; POP name must equal Zabbix technical host name. Why: no credentials in code, matching by name avoids extra mapping.
- Interface links use the configured host's ifOperStatus (1 up, 2 down); explicitly configured Padtec links use only a selected alarmLossLine item on Padtec - Servidor with admin-confirmed binary polarity and endpoint/Line mapping. Readings older than 300 seconds are unknown; host alarms and zero traffic never establish link failure.
- Persist monitoring type and optical alarm polarity through additive SQLite upgrades; list optical items through an admin-only server function, validate them on save, and keep optical interpretation in a browser-safe pure helper so existing interface links remain unchanged.
- Link animation uses a filtered MapLibre dash layer with reduced-motion support: unmonitored links have decorative channel-colored animation, confirmed up links animate in the online color, and monitored unknown/down links stay static; a topmost red failure layer overrides channel colors so decoration never replaces a confirmed failure.
- Update live map sources whenever they exist, without gating on isStyleLoaded(); pending tile loads must not discard Zabbix status updates.
- Identify DWDM endpoints by padtec-/eci- names and show their links with green lines and moving canvas lightning symbols; both maps use the same link width, decoration never establishes capacity or status, monitored unknown/down stop bolts, confirmed failure stays topmost red, and reduced motion hides bolts.
- Render equipment markers with native MapLibre circle layers using status tokens; this preserves live colors, grouping and popup hit targets without image downloads.
- Keep brand assets locally served for Docker deployments and isolate map popup tokens from the panel theme; branding must not introduce a hosted asset dependency or change operational map visuals.
- DWDM markers use separate online/down color tokens from switches while preserving Zabbix states and neutral unknown styling, so equipment types remain distinguishable without implying a new monitoring rule.
- Marker labels stay short: switches drop the `sw-` prefix and show only the site name, DWDM markers keep the brand on its own line; popups always show the full technical name so Zabbix matching and identification are unaffected.
- DWDM bulk imports query all current items on the VM through admin-only functions and use a browser-safe discovery helper; require explicit destination/physical-segment confirmation, retain unresolved OSC/Line references, and never infer Padtec polarity or OSC traffic status because circuit names do not prove adjacency.
- The admin-confirmed ECI ring uses a browser-safe segment planner and a transactional, admin-only import independent of Zabbix; resolve unique existing ECI POPs, reject missing/ambiguous sites, skip undirected duplicates and preserve monitoring, because OSC dashboard titles establish endpoints but not traffic status.
- ECI ring monitoring is an explicit admin action: validate exported OSC item IDs against live host/key/port, update only uniquely matched unmonitored existing segments transactionally, and retain existing monitoring; OSC ifOperStatus reflects channel state, not payload traffic or Rx-power alarms.
- Confirmed ECI branches use dedicated admin actions with live OSC validation and transactional undirected deduplication, preserving the ring and existing monitoring so a spur never rewires unrelated segments.
- Padtec ring segments come from a browser-safe fixed planner of admin-supplied OSC dashboard segments; import is admin-only, all-or-nothing when a site is missing/ambiguous, deduplicates undirected pairs, and creates links unmonitored.
