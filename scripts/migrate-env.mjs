#!/usr/bin/env python3
"""Migra as credenciais que hoje estão gravadas no docker-compose.yml da VM
para o arquivo .env (fora do git). Só escreve chaves que ainda não existem no .env.
Somente leitura do compose; não toca no banco nem no container."""
import os, re, sys

COMPOSE = "docker-compose.yml"
ENV = ".env"
KEYS = ["ADMIN_USER", "ADMIN_PASSWORD", "SESSION_SECRET",
        "ZABBIX_URL", "ZABBIX_USER", "ZABBIX_PASSWORD", "MAP_USERS"]

if not os.path.exists(COMPOSE):
    sys.exit("docker-compose.yml não encontrado - rode dentro de /opt/mapa-dwdm")

# valores literais do compose atual (ignora linhas que usam ${VAR})
found = {}
for line in open(COMPOSE, encoding="utf-8"):
    m = re.match(r"^\s*([A-Z0-9_]+):\s*(.+?)\s*(?:#.*)?$", line)
    if not m:
        continue
    k, v = m.group(1), m.group(2).strip().strip('"').strip("'")
    if k in KEYS and "${" not in v and v:
        found[k] = v

# .env existente: preserva tudo, adiciona só o que falta
existing = {}
if os.path.exists(ENV):
    for line in open(ENV, encoding="utf-8"):
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            existing[m.group(1)] = m.group(2)

added = [k for k in KEYS if k in found and k not in existing]
if added:
    with open(ENV, "a", encoding="utf-8") as f:
        if os.path.exists(ENV) and os.path.getsize(ENV) > 0:
            f.write("\n")
        for k in added:
            f.write(f"{k}={found[k]}\n")
    print("gravado no .env:", ", ".join(added))
else:
    print(".env já estava completo - nada a gravar")

os.chmod(ENV, 0o600)
missing = [k for k in ("ZABBIX_PASSWORD", "SESSION_SECRET") if k not in existing and k not in found]
if missing:
    print("ATENCAO: sem valor para", ", ".join(missing), "- preencha no .env")
print("OK")
