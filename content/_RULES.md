# Content rules for "Weltquiz" (German geography quiz)

A geography quiz web game for a curious adult who wants to learn about the world.
Everything is shown to a learner as TRUE, so accuracy beats everything else.
All text is German with real umlauts (ä ö ü ß) and correct German typography („…“ for quotes are fine, or none).

## Country object schema (JSON)

{
  "iso": "NL",
  "name": "Niederlande",
  "aliases": ["Holland", "Königreich der Niederlande", "Netherlands", "Nederland"],
  "capital": { "name": "Amsterdam", "aliases": [] },
  "otherCapitals": [ { "name": "Den Haag", "aliases": ["The Hague", "'s-Gravenhage"], "role": "Regierungssitz" } ],
  "capitalNote": "Amsterdam ist die Hauptstadt, Regierung und Parlament sitzen aber in Den Haag.",
  "languages": ["Niederländisch"],
  "moreLanguages": false,
  "currency": "Euro",
  "facts": ["…", "…", "…"]
}

- name: the usual German short name (Auswärtiges Amt / Duden style), e.g. "Tschechien", "Elfenbeinküste", "Vereinigtes Königreich", "USA", "China", "Taiwan", "Zypern", "Republik Moldau", "Vatikanstadt", "Demokratische Republik Kongo", "Republik Kongo", "Mikronesien", "Salomonen".
- aliases: other names a German speaker might type into a search box: official long form, older or colloquial German names ("Weißrussland", "Swasiland", "Birma", "Holland"), the English name, the local name if it is well known, common abbreviations ("USA", "UK", "VAE"), and parts people wrongly use for the whole (UK: "England", "Schottland"). Do not repeat "name". No duplicates.
- capital.name: the German exonym if one is common ("Warschau", "Peking", "Neu-Delhi", "Kopenhagen", "Kiew", "Mexiko-Stadt"), otherwise the usual spelling. capital.aliases: English and local spellings and other German spellings ("Kyjiw", "Kyiv", "Kiev").
- otherCapitals: ONLY when a country officially has more than one capital, or an official seat of government that differs from the capital. Every entry is accepted as a correct quiz answer, so do not list former capitals or merely big cities unless told to below. Otherwise [].
- capitalNote: a short German note shown after a capital question, only when useful (several capitals, a recent change, a common mix-up like Australien → Canberra, nicht Sydney; Türkei → Ankara, nicht Istanbul). Otherwise "".
- languages: official language(s) at national level, German names, at most 4, most important first. moreLanguages: true if the country has more official languages than you listed.
- currency: German name of the current currency, e.g. "Euro", "US-Dollar", "Schweizer Franken", "Złoty", "Rand", "CFA-Franc BCEAO", "Ostkaribischer Dollar".

## Facts (the most important part)

- Exactly 3 per country, German, one or two sentences each, 60–220 characters.
- The UI already shows a "Wusstest du?" heading and the country's name, so do not start with "Wusstest du", and do not open every fact with the country's name.
- Surprising and memorable – the kind of thing you'd tell a friend. Tone example: "Suriname ist das einzige Land Südamerikas, in dem Niederländisch Amtssprache ist."
- Mix topics within a country: geography/nature records, culture, food, language, history, curiosities about the flag or the borders. At least one of the three should help remember WHERE the country is or what it looks like (neighbours, shape, a landmark, a river), because the game is a map quiz.
- Correct as of September 2026 and stable over time. No exact population figures, no GDP ranks, no current office holders, no sports results, nothing that changes every year. Round numbers with "etwa" only when you are sure.
- Words like "einzige", "erste", "größte", "älteste", "höchste": only when certain. Otherwise weaken ("eines der …") or pick another fact. When you are not sure about a fact, verify it with WebSearch (load it first with ToolSearch query "select:WebSearch,WebFetch") or replace it with one you are sure about. Do not repeat popular myths (e.g. the Great Wall is NOT visible from the Moon with the naked eye; Napoleon was not unusually short).
- Neutral and respectful. No jokes at a country's expense; don't make war, disaster or poverty the fact; no politically loaded claims about disputed territories.
- Recent changes to respect: Bulgarien zahlt seit 1. Januar 2026 mit dem Euro, Kroatien seit 2023. Kasachstans Hauptstadt heißt seit 2022 wieder Astana. Burundis Hauptstadt ist seit 2019 Gitega. Eswatini heißt seit 2018 so, Nordmazedonien seit 2019, Tschechien nutzt international „Czechia“, die Türkei „Türkiye“. The USA made English its official language by executive order in March 2025 (so never claim the USA has no official language).

## Output

- Write exactly the file you were told to write: a JSON array, one object per country, in the given order, valid JSON (no comments, no trailing commas, UTF-8).
- Validate it: node -e "const a=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(a.length)" <file>
- Then re-read every fact once more as a skeptical fact-checker and fix or replace anything you would not bet money on.
- Final reply: the file path, how many countries you wrote, and a short list of anything you were unsure about and how you resolved it. Nothing else.
