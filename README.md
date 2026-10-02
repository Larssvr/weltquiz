# Weltquiz

Ein Geografie-Spiel im Browser: Länder auf der Karte erkennen, Hauptstädte, Meere, Seen und Ozeane benennen, Flaggen zuordnen – mit tippfehler-toleranter Suche, Fun Facts zu jedem Land und einer Fortschrittskarte.

**Spielen:** https://larssvr.github.io/weltquiz/

## Spielmodi

- **Länder erkennen** – ein Land ist markiert, du schreibst den Namen (oder umgekehrt: Name → auf der Karte antippen)
- **Hauptstädte** – Land → Hauptstadt oder Hauptstadt → Land, inkl. „Stolperstädten“ wie Sydney oder Istanbul
- **Meere, Seen & Ozeane** – 136 Gewässer
- **Flaggen** – Flagge → Land oder Land → eine von vier (ähnlichen) Flaggen
- **Entdecken** – freie Karte mit Infos zu jedem Land und Gewässer
- **Fakten** – über 900 überraschende Fakten zu Ländern, Meeren und der Welt
- **Fortschritt** – was du sicher weißt, auch die Karte des anderen Spielers
- **Duell** – Emilia gegen Lars: wer hat mehr gelernt? Mit Vergleichskarte und den Minispiel-Rekorden

## Minispiele

- **Tagesrätsel** – jeden Tag dieselben fünf Orte für beide, ein Versuch; das Ergebnis wird direkt verglichen
- **Blitzrunde** – 60 Sekunden Länder antippen, Rekorde je Region
- **Städte-Pin** – Ort auf der Karte setzen, Punkte nach Entfernung (bis 25 km volle Punktzahl)
- **Nachbarn** – alle Länder mit gemeinsamer Landgrenze finden
- **Entweder-oder** – größer, mehr Einwohner, weiter nördlich? Serie bis zum ersten Fehler
- **Umrisse** – Länder an ihrer Form erkennen, ohne Zeitdruck

## Technik

Statische Seite ohne Build-Schritt: HTML, CSS, JavaScript (ES-Module), [d3](https://d3js.org) und [topojson-client](https://github.com/topojson/topojson-client).

## Spieler & Online-Speicher

Der Fortschritt von Emilia und Lars liegt zusätzlich auf einem kleinen Server (`server/`, Node ohne Abhängigkeiten,
läuft auf Railway mit Volume unter `/data`) – ebenso die Minispiel-Rekorde und die Ergebnisse des Tagesrätsels.
Er führt Stände von mehreren Geräten zusammen, löscht nie etwas und legt jeden Tag eine Sicherungskopie an.
Ohne Internet spielt man lokal weiter; der Stand wird später nachgeliefert. Fehlt dem Server etwas, das auf einem
Gerät liegt, schickt die App es beim nächsten Abgleich von selbst nach.

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
- Flaggen: [svg-country-flags](https://github.com/hampusborgos/country-flags) (gemeinfrei, aus Wikimedia Commons)
- Schriften: Barlow, Barlow Condensed und Spectral (SIL Open Font License), selbst gehostet
- Lizenztexte der verwendeten Bibliotheken und Schriften: `licenses/`
