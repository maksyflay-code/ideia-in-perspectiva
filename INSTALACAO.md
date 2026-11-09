# Instalação na VM (Proxmox)

Requisitos: VM Linux (Debian/Ubuntu) com Docker e Docker Compose.

```bash
# 1. Instalar Docker (Debian/Ubuntu)
curl -fsSL https://get.docker.com | sh

# 2. Copiar a pasta do projeto para a VM e entrar nela
cd mapa-dwdm

# 3. Editar senha e segredo em docker-compose.yml
nano docker-compose.yml

# 4. Subir
docker compose up -d --build
```

Acesse `http://IP-DA-VM:3000` (mapa) e `http://IP-DA-VM:3000/admin` (painel).

## Dados e backup
O banco fica em `./data/mapa.db` (SQLite, um único arquivo). Para backup, copie esse arquivo.
Com `SEED_DEMO: "1"` o primeiro start cria 5 POPs de exemplo; use `"0"` para começar vazio
(ou apague os exemplos no painel).

## Atualizar
```bash
docker compose up -d --build
```

## Observação
O fundo do mapa é carregado de `tiles.openfreemap.org` (gratuito, sem chave), então a VM/navegador
precisa de acesso à internet para exibir as ruas. POPs e ligações são servidos pela própria VM.
