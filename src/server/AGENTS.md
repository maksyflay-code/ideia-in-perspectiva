## Traffic metrics
- Keep traffic discovery and history on the read-only Zabbix connection, independent from map status polling, to avoid changing operational alarms.
- Persist only admin-confirmed port selections in local SQLite; separate external and customer totals and never auto-classify interfaces, because names do not prove boundaries or LAG membership.
- Treat incomplete or stale traffic as unavailable, not zero, and derive charts from Zabbix history rather than browser-generated samples.- Fortaleza OLP routes are separate parallel links (olp_route) so each route fails alone.
