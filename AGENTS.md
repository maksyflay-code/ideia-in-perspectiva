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
- Map points within 22 screen pixels are separated in a compact screen-space grid with original-size markers; marker, popup and link positions share the display layout, recalculated on camera changes without altering saved coordinates, so every equipment remains accessible.
- Self-hosted on a Proxmox VM via Docker (NITRO_PRESET=node-server); never depend on Lovable Cloud or other hosted backends.
- Storage is SQLite via Node's built-in `node:sqlite` in `src/server/db.server.ts`, imported dynamically so the Worker bundle never resolves it; schema is created with CREATE TABLE IF NOT EXISTS on startup.
- Admin auth is a single env-configured user (ADMIN_USER/ADMIN_PASSWORD) with an HMAC-signed httpOnly cookie; every mutating server function must call requireAdmin().
- Zabbix integration is read-only via JSON-RPC in `src/server/zabbix.server.ts`, configured by ZABBIX_URL/ZABBIX_USER/ZABBIX_PASSWORD env; POP name must equal Zabbix technical host name. Why: no credentials in code, matching by name avoids extra mapping.
- Link failures use the configured host's operational-interface item only (1 up, 2 down, readings older than 300 seconds unknown); never infer link failure from host alarms or zero traffic, because those do not establish an interface outage.
- Link animation uses a filtered MapLibre dash layer with reduced-motion support: unmonitored links have decorative channel-colored animation, confirmed up links animate in the online color, and monitored unknown/down links stay static; a topmost red failure layer overrides channel colors so decoration never replaces a confirmed failure.
- Update live map sources whenever they exist, without gating on isStyleLoaded(); pending tile loads must not discard Zabbix status updates.
- Identify DWDM endpoints by padtec-/eci- names and show their links with a green, thicker line and moving canvas lightning symbols; decoration never establishes capacity or status, monitored unknown/down stop bolts, confirmed failure stays topmost red, and reduced motion hides bolts.
