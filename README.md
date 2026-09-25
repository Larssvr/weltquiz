# Weltquiz

Ein Geografie-Spiel im Browser: Länder auf der Karte erkennen, Hauptstädte, Meere, Seen und Ozeane benennen, Flaggen zuordnen – mit tippfehler-toleranter Suche, Fun Facts zu jedem Land und einer Fortschrittskarte.

**Spielen:** https://larssvr.github.io/weltquiz/

## Spielmodi

- **Länder erkennen** – ein Land ist markiert, du schreibst den Namen (oder umgekehrt: Name → auf der Karte antippen)
- **Hauptstädte** – Land → Hauptstadt oder Hauptstadt → Land, inkl. „Stolperstädten“ wie Sydney oder Istanbul
- **Meere, Seen & Ozeane** – 136 Gewässer
- **Flaggen** – Flagge → Land oder Land → eine von vier (ähnlichen) Flaggen
- **Entdecken** – freie Karte mit Infos zu jedem Land und Gewässer
- **Fakten** – Hunderte überraschende Fakten zu Ländern, Meeren und der Welt
- **Fortschritt** – was du sicher weißt (wird nur im eigenen Browser gespeichert)

## Technik

Statische Seite ohne Build-Schritt: HTML, CSS, JavaScript (ES-Module), [d3](https://d3js.org) und [topojson-client](https://github.com/topojson/topojson-client).

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
- Flaggen: [svg-country-flags](https://github.com/hampusborgos/country-flags) (gemeinfrei, aus Wikimedia Commons)
- Schriften: Barlow, Barlow Condensed und Spectral (SIL Open Font License), selbst gehostet
- Lizenztexte der verwendeten Bibliotheken und Schriften: `licenses/`
