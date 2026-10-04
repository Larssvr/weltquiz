# Weltquiz

Ein Geografie-Spiel im Browser: Länder auf der Karte erkennen, Hauptstädte, Meere, Seen und Ozeane benennen, Flaggen zuordnen – mit tippfehler-toleranter Suche, Fun Facts zu jedem Land und einer Fortschrittskarte.

**Spielen:** https://larssvr.github.io/weltquiz/

## Spielmodi

- **Länder erkennen** – ein Land ist markiert, du schreibst den Namen (oder umgekehrt: Name → auf der Karte antippen)
- **Hauptstädte** – Land → Hauptstadt oder Hauptstadt → Land, inkl. „Stolperstädten“ wie Sydney oder Istanbul
- **Meere, Seen & Ozeane** – 136 Gewässer
- **Flaggen** – Flagge → Land (eintippen oder aus sechs Ländern wählen) oder Land → eine von vier (ähnlichen) Flaggen
- **Entdecken** – freie Karte mit Infos zu jedem Land und Gewässer
- **Fakten** – über 900 überraschende Fakten zu Ländern, Meeren und der Welt
- **Fortschritt** – was du sicher weißt, auch die Karte des anderen Spielers
- **Duell** – Emilia gegen Lars: wer hat mehr gelernt? Mit Vergleichskarte und den Minispiel-Rekorden

## Minispiele

- **Tagesrätsel** – jeden Tag dieselben fünf Orte für beide, ein Versuch; das Ergebnis wird direkt verglichen
- **Blitzrunde** – 60 Sekunden Länder antippen, Rekorde je Region
- **Städte-Pin** – Ort auf der Karte setzen, Punkte nach Entfernung (bis 25 km volle Punktzahl), weltweit, je Kontinent oder in Deutschland (109 Städte, volle Punktzahl bis 10 km)
- **Nachbarn** – alle Länder mit gemeinsamer Landgrenze aus dem Kopf nennen (eintippen, Tippfehler egal); die Karte zeigt einen Nachbarn erst, wenn er genannt ist. Grenzen über ferne Landesteile (Französisch-Guayana, Ceuta und Melilla) zählen als Extrapunkt.
- **Entweder-oder** – größer, mehr Einwohner, weiter nördlich? Serie bis zum ersten Fehler
- **Umrisse** – Länder an ihrer Form erkennen, ohne Zeitdruck
- **Reiseroute** – von einem Land in ein anderes, nur über Landgrenzen: Land für Land das nächste Nachbarland nennen; der kürzeste Weg bringt die meisten Punkte
- **Heiß & kalt** – ein geheimes Land finden: Jeder Tipp verrät Entfernung (von Grenze zu Grenze) und Richtung, die Karte färbt die Tipps nach Nähe
- **Alle nennen** – alle Länder eines Kontinents oder der ganzen Welt gegen die Uhr eintippen, ohne Vorschläge
- **Ohne Grenzen** – die Karte zeigt nur Land und Meer; Punkt dorthin setzen, wo das Land liegt
- **Schätz mal** – Einwohner, Fläche und Entfernung zwischen Hauptstädten mit einem Regler schätzen

Die neueren Spiele liegen als eigene Module in `js/games/` (Schnittstelle: Kommentarblock „Spiele als Module“ in `js/games.js`, gemeinsame Geometrie in `js/games/geo.js`) mit Stilen in `css/games/`.

„Beenden“ mitten im Spiel zeigt das Ergebnis mit dem bisherigen Stand – ein Rekord zählt also auch dann.

## Technik

Statische Seite ohne Build-Schritt: HTML, CSS, JavaScript (ES-Module), [d3](https://d3js.org) und [topojson-client](https://github.com/topojson/topojson-client).

## Spieler & Online-Speicher

Emilia und Lars gibt es fest. Wer mitspielen will, tippt unter „Wer spielt?“ auf „+ Neu“ und gibt seinen Namen ein –
dann hat er ein eigenes Konto mit eigener Farbe, wählbar auf jedem Gerät. Im Duell tritt man gegen einen Gegner an
(bei mehr als zwei Spielern zur Wahl), bei Rekorden und im Tagesrätsel stehen alle, die etwas vorzuweisen haben.

Der Fortschritt aller Spieler liegt zusätzlich auf einem kleinen Server (`server/`, Node ohne Abhängigkeiten,
läuft auf Railway mit Volume unter `/data`) – ebenso die Minispiel-Rekorde und die Ergebnisse des Tagesrätsels.
Er führt Stände von mehreren Geräten zusammen, löscht nie etwas und legt jeden Tag eine Sicherungskopie an.
Ohne Internet spielt man lokal weiter; der Stand wird später nachgeliefert. Fehlt dem Server etwas, das auf einem
Gerät liegt, schickt die App es beim nächsten Abgleich von selbst nach.

## Lokal testen

Auf `localhost` spricht die App nie mit dem echten Server, sondern mit einem Test-Server auf dem eigenen Rechner
(Standard `http://127.0.0.1:8787`, anderer per `?api=…`). Den startet man mit einer Kopie der Daten:

```
cd server
PORT=8787 DATA_DIR=/tmp/weltquiz-test ALLOWED_ORIGINS=http://localhost:8766 node server.js
```

Der echte Server nimmt nur Anfragen von der veröffentlichten Seite an.

## Daten neu bauen

Die Inhalte (Namen, Hauptstädte, Fakten) liegen als JSON in `content/`, die Skripte in `tools/`:

```
cd tools
npm install
npm run download   # Natural-Earth-Rohdaten nach raw/
npm run map        # data/world.json
npm run content    # js/data/*.js aus content/*.json
```

## Quellen

- Karten: [Natural Earth](https://www.naturalearthdata.com) (gemeinfrei), Ländergrenzen in der deutschen Sichtweise (`admin_0_countries_deu`)
- Einwohner (2024) und Fläche: Wikipedia, [Liste der Staaten der Erde](https://de.wikipedia.org/wiki/Liste_der_Staaten_der_Erde) (Stand Oktober 2026), gerundet in `js/data/numbers.js`
- Städte in Deutschland: Natural Earth und [OpenStreetMap](https://www.openstreetmap.org/copyright) (© OpenStreetMap-Mitwirkende, ODbL), in `js/data/de-cities.js`
- Flaggen: [svg-country-flags](https://github.com/hampusborgos/country-flags) (gemeinfrei, aus Wikimedia Commons)
- Schriften: Barlow, Barlow Condensed und Spectral (SIL Open Font License), selbst gehostet
- Lizenztexte der verwendeten Bibliotheken und Schriften: `licenses/`
