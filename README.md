# Duck Drift

**[Live-Demo](https://server.b206b21.deploio.app/)**

Duck Drift ist ein 2D-Top-Down-Rennspiel für den Browser mit Multiplayer-Steuerung per Smartphone. Ein Hauptbildschirm (**Host**) zeigt das Rennen, bis zu 4 Spieler:innen steuern ihre Ente über ihr Handy (**Controller**) via Neigungssensor und Touch-Buttons. Ein schlanker Node.js-Server verbindet Host und Controller per WebSocket und speichert globale Highscores.

Entstanden als Hackathon-Projekt (5h Entwicklungszeit) — bewusst simpel gehalten, kein Build-Step, kein TypeScript, kein schweres Framework.

## Contributors

- [Lorenzo-Se](https://github.com/Lorenzo-Se)
- [im24b-ceresettim](https://github.com/im24b-ceresettim)
- [dantony-dev](https://github.com/dantony-dev)

## Projektstruktur

```
duck-drift/
├── server/
│   ├── index.js            # Express + WebSocket-Server (Relay + REST-API)
│   ├── highscores.js        # Highscore-Persistenz (Redis oder In-Memory)
│   ├── package.json
│   └── public/
│       ├── index.html       # Startseite: Lobby erstellen / beitreten
│       ├── host/             # Hauptbildschirm: Rendering, Physik, Spielregeln
│       └── controller/       # Controller-UI fürs Handy (Lenkung, Gas, Bremse)
├── tools/                    # Python-Skript zur Track-Asset-Generierung (optional)
└── .cursorrules, .cursor/rules/  # Architektur- und Protokoll-Dokumentation
```

## Voraussetzungen

- [Node.js](https://nodejs.org/) 18 oder neuer (inkl. `npm`)
- Ein moderner Browser auf einem Rechner (Host) und mindestens einem Smartphone (Controller) im **gleichen WLAN/Netzwerk**
- Optional: Redis-kompatibler Key-Value-Store (z. B. [Deploio Managed KVS](https://guides.deplo.io)) für persistente Highscores
- Optional (nur für Track-Asset-Generierung): Python 3.9+, `cairosvg`, `Pillow`

## Setup & lokal starten

### 1. Repository klonen

```bash
git clone https://github.com/Lorenzo-Se/duck-drift.git
cd duck-drift
```

### 2. Server-Abhängigkeiten installieren

```bash
cd server
npm install
```

### 3. Umgebungsvariablen setzen

Der Server benötigt zwingend die Variable `PORT` (kein fester Standardwert). `REDIS_URL` ist optional.

Am einfachsten lokal in `server/.env` (wird **nicht** automatisch geladen, siehe Hinweis unten):

```
PORT=3000
REDIS_URL=rediss://:PASSWORT@dein-kvs-host.keyvaluestore.nineapis.ch
```

> **Hinweis:** `server/.env` ist nur eine Textdatei — der Server liest sie nicht automatisch ein (kein `dotenv` installiert). Beim Start müssen die Variablen in der Shell gesetzt sein (siehe Schritt 4).

Ohne `REDIS_URL` fällt der Server automatisch auf einen In-Memory-Speicher für Highscores zurück (Daten gehen beim Neustart verloren — für lokales Testen ausreichend).

### 4. Server starten

**PowerShell (Windows):**

```powershell
$env:PORT = "3000"
npm start
```

**Bash / macOS / Linux / WSL:**

```bash
export PORT=3000
npm start
```

Oder mit Redis-Anbindung:

```bash
export PORT=3000
export REDIS_URL="rediss://:PASSWORT@dein-kvs-host.keyvaluestore.nineapis.ch"
npm start
```

Erwartete Ausgabe:

```
Connected to Redis for highscores      # oder: "REDIS_URL not set — using in-memory highscore storage"
Listening on port 3000
```

### 5. Spiel öffnen

1. Im Browser auf dem **Host-Rechner** öffnen: `http://localhost:3000/`
2. **„Lobby erstellen"** klicken → Host zeigt einen 4-stelligen Lobby-Code + QR-Code
3. Auf dem **Smartphone** (im selben Netzwerk!) den QR-Code scannen, oder manuell zu `http://<IP-DES-HOST-RECHNERS>:3000/` navigieren, Lobby-Code + Namen eingeben und beitreten

> Für den Zugriff vom Handy aus muss der Host-Rechner über die **lokale Netzwerk-IP** erreichbar sein (nicht `localhost`), z. B. `http://192.168.1.42:3000/`. IP mit `ipconfig` (Windows) bzw. `ifconfig`/`ip a` (macOS/Linux) herausfinden.

### 6. Highscore-API testen (optional)

```bash
curl -X POST http://localhost:3000/api/highscores \
  -H "Content-Type: application/json" \
  -d '{"playerName":"Alex","won":true}'

curl http://localhost:3000/api/highscores
```

### 7. Track-Assets neu generieren (optional)

Nur nötig, wenn ein neues Streckenlayout (SVG) in PNG-Texturen/Kollisionsmasken umgewandelt werden soll:

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r tools/requirements.txt

python3 tools/generate_track_pngs.py server/public/host/assets/tracks/silverstone.svg
```

## Architektur

Der Server ist ein bewusst „dummer" Relay ohne Spiellogik — er verwaltet nur Lobbys (Host + bis zu 4 Controller) und leitet WebSocket-Nachrichten gemäss einem festen JSON-Protokoll weiter. Details zum Nachrichtenprotokoll (`createRoom`, `join`, `input`, `broadcast`, ...) stehen in [`.cursorrules`](.cursorrules) und [`.cursor/rules/server.mdc`](.cursor/rules/server.mdc).

- **Server** (`server/`) — Express + `ws`, REST-API für Highscores
- **Host** (`server/public/host/`) — Rendering, Physik, Kollision, alle Spielregeln
- **Controller** (`server/public/controller/`) — Neigungssensor + Touch-Buttons für Gas/Bremse

## Deployment

Das Projekt ist für [Deploio](https://docs.deplo.io) vorbereitet. Mit angebundenem Managed Key-Value-Store injiziert Deploio automatisch `REDIS_URL`; ohne KVS läuft der Server mit In-Memory-Highscores weiter.
