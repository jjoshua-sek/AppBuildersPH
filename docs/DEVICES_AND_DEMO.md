# Devices and Demo Plan

How the app runs on our demo phone, and how we show it to the judges.

**One phone: the Infinix Hot 50 Pro+.** The iPhones (13 Pro Max, 11) and the Tecno Pova 4 are not used, and nothing is tested on them. The iOS code paths stay in the repo but are not built for the hackathon.

## 1. The phone

| Phone | Chip / RAM | AI backend | Demo role |
|---|---|---|---|
| **Infinix Hot 50 Pro+** | Helio G100, 8 GB | CPU (2 threads) | **"Maria's phone."** Budget MediaTek phone: OCR, term extraction, crossword, tutor, "why it matters" card, Daily Term, all live |

The story this tells: *a budget MediaTek phone, the kind our users carry, runs the whole AI loop with no internet.*

**There is no second phone.** If the Infinix fails on stage, play the backup video (§5).

## 2. Setting up the phone (night before)

1. Install the **release** build: `npx react-native run-android --mode release`.
2. Copy the models in (`scripts/push-models.sh`, or the PowerShell steps in `docs/RUNTIME_SETUP.md`), open the app once, and check the Proof panel shows the model name and `android-cpu`.
3. Ingest the demo page once, so a **pre-ingested backup deck** exists. Wait until every "why it matters" card is filled.
4. Settings: airplane mode **on**, then turn **Wi-Fi and Bluetooth off by hand** (Android may leave Wi-Fi on in airplane mode). Do Not Disturb on, brightness max, screen timeout off, battery ≥ 80%, close all other apps.

## 3. Showing the screen

| Phone | Mirroring | Works in airplane mode? |
|---|---|---|
| Infinix | **scrcpy over USB** from a laptop: `scrcpy --no-audio --stay-awake` (enable USB debugging) | Yes, USB only |

**Don't use wireless scrcpy or screen casting:** they need Wi-Fi, which breaks the airplane-mode story.

**Backup:** a document camera, or a second phone on a stand filming the Infinix, in case the cable or mirroring fails. Test it at the venue.

## 4. The 3-minute script

| Time | Beat | Criterion |
|---|---|---|
| 0:00 | Speaker, holding up the Infinix: "Maria reviews IT Audit on a two-hour jeep ride. No signal, no load. This is her phone: a budget MediaTek phone. Cloud AI can't help her here." | Problem |
| 0:15 | Show the airplane icon. Open the Proof panel: **CPU · 2 threads**, **cloud calls: 0**. | Local AI |
| 0:25 | Snap the handout page → OCR text appears → Generate. Terms and clues come in as each chunk finishes. | Local AI, Innovation |
| 1:05 | Crossword built from *those* terms (if the ingest isn't done: open the backup deck, "ingested on this phone this morning in N seconds"). Fill two answers: instant green. | Execution |
| 1:20 | Get one entry wrong twice → the tutor streams a guiding question grounded in the page. Type "just tell me": it still won't. Type the answer → solved. | Innovation, Demo |
| 1:55 | The **"why it matters" card** slides up: description + why it matters, written on the phone while we played. | Usefulness |
| 2:10 | Daily Term, picked from the word we just missed. | Usefulness |
| 2:25 | Proof panel numbers: tok/s on the CPU, ingest time, cloud calls still 0. "A budget phone, no internet." | Local AI |
| 2:40 | Who it's for; next: Filipino-language tutor, teacher decks shared by QR. | — |

**Q&A:** hand the judges the Infinix in airplane mode, with the backup deck open: "Try to make the tutor tell you the answer."

### Go / no-go for the live ingest
Rehearse it. If the Infinix takes **more than 75 seconds** to ingest the demo page, don't wait for it on stage. Start it, then open the backup deck at 1:05 and say how long it took when you ingested it.

## 5. If something breaks on stage

| Problem | Do this |
|---|---|
| App crashes or freezes | Force-close and reopen (models reload in about 2 s). If it fails again, play the backup video clip |
| Model fails to load | Splash screen → "Choose model file". If that fails, play the backup video |
| OCR reads junk | "Phone cameras vary; here's the same page I ingested this morning." Open the backup deck |
| Tutor is slow | Keep talking through what's happening ("it's thinking on the CPU, no server"). The template fallback appears if it fails twice |
| Mirroring dies | Document camera / filming phone |
| A judge asks to see it fail without internet | It already is: point at the cloud-calls counter |

## 6. Rehearsal checklist (M6)
- [ ] 5 full runs of the script on the Infinix, release build, airplane mode, Wi-Fi off
- [ ] Each run timed; total ≤ 3:00
- [ ] Mirroring tested on the venue projector (or the closest thing)
- [ ] Backup video of a clean run recorded the night before
