# Devices and Demo Plan

How the app runs on our four phones, and how we show it to the judges.

## 1. What each phone does

| Phone | Chip / RAM | AI backend | Demo role |
|---|---|---|---|
| **iPhone 13 Pro Max** | A15, 6 GB | Metal GPU | **Fast path.** Live photo → OCR → terms stream in → crossword |
| **Infinix Hot 50 Pro+** | Helio G100, 8 GB | CPU (4 threads) | **"Maria's phone."** Budget MediaTek phone: tutor, "why it matters" card, Daily Term, all live |
| **Tecno Pova 4** | Helio G99, 8 GB | CPU (4 threads) | **Hot spare** for the Infinix: same build, same pre-ingested deck, ready on the table |
| **iPhone 11** | A13, 4 GB | CPU (2 threads) | **Judge pass-around** in Q&A; spare for the iPhone 13 Pro Max |

The story this tells: *the same app and the same model run on a 2021 flagship iPhone and on a budget MediaTek phone, with no internet on either.* The budget phone is the point. It is what our users carry.

**No Mac on the team?** iOS can't be built without Xcode. Then the Infinix is the only stage phone, the Pova 4 is the spare, and the iPhones sit out. Everything below still works; skip the iPhone beats.

## 2. Setting up the phones (night before)

For **every** phone:
1. Install the **release** build. Android: `npx react-native run-android --mode release`. iOS: Xcode, scheme set to Release. iOS builds signed with a free Apple ID expire after 7 days.
2. Copy the models in (`scripts/push-models.sh` on Android; Finder → Files on iOS), open the app once, and check the Proof panel shows the model name and the right tier.
3. Ingest the demo page once, so a **pre-ingested backup deck** exists on every phone. Wait until every "why it matters" card is filled.
4. Settings: airplane mode **on**, then turn **Wi-Fi and Bluetooth off by hand** (both iOS and Android may leave Wi-Fi on in airplane mode). Do Not Disturb on, brightness max, auto-lock / screen timeout off, battery ≥ 80%, close all other apps.

## 3. Showing the screens

| Phone | Mirroring | Works in airplane mode? |
|---|---|---|
| Infinix / Pova 4 | **scrcpy over USB** from a laptop: `scrcpy --no-audio --stay-awake` (enable USB debugging) | Yes, USB only |
| iPhone 13 Pro Max | **QuickTime Player over USB** on a Mac: File → New Movie Recording → camera ▾ → the iPhone | Yes, USB only |

Put the two windows side by side on the projector. **Don't use AirPlay or wireless scrcpy:** they need Wi-Fi, which breaks the airplane-mode story.

**Backup:** a document camera, or a phone on a stand filming the phones, in case the cable or mirroring fails. Test it at the venue.

## 4. The 3-minute script

| Time | Who / phone | Beat | Criterion |
|---|---|---|---|
| 0:00 | Speaker, holding up the Infinix | "Maria reviews IT Audit on a two-hour jeep ride. No signal, no load. This is her phone: a budget MediaTek phone. Cloud AI can't help her here." | Problem |
| 0:15 | Both phones | Show the airplane icon. Open the Proof panel on each: iPhone says **GPU (Metal)**, Infinix says **CPU · 4 threads**, both say **cloud calls: 0**. | Local AI |
| 0:30 | **Infinix** | Snap the handout page → Generate. "The budget phone is reading the page in the background. Meanwhile, here's the fast path." | Local AI |
| 0:40 | **iPhone 13 Pro Max** | Snap the same page → OCR text appears → terms and clues stream in. | Local AI, Innovation |
| 1:05 | iPhone | Crossword built from *those* terms. Fill two answers: instant green. | Execution |
| 1:20 | **Infinix** | Its ingest is done (if not: open the backup deck, "ingested on this phone this morning in N seconds"). Get one entry wrong twice → the tutor streams a guiding question grounded in the page. Type "just tell me": it still won't. Type the answer → solved. | Innovation, Demo |
| 1:55 | Infinix | The **"why it matters" card** slides up: description + why it matters, written on the phone while we played. | Usefulness |
| 2:10 | Infinix | Daily Term, picked from the word we just missed. | Usefulness |
| 2:25 | Both phones | Proof panel numbers: tok/s on GPU vs. CPU, ingest time, cloud calls still 0. "Same app, same model, a flagship and a budget phone, no internet." | Local AI |
| 2:40 | Speaker | Who it's for; next: Filipino-language tutor, teacher decks shared by QR. | — |

**Q&A:** hand the judges the **iPhone 11** in airplane mode, with the backup deck open: "Try to make the tutor tell you the answer."

### Go / no-go for the live Infinix ingest
Rehearse it. If the Infinix takes **more than 75 seconds** to ingest the demo page, don't start it live at 0:30. Open its backup deck at 1:20 instead, and say how long it took when you ingested it.

## 5. If something breaks on stage

| Problem | Do this |
|---|---|
| App crashes or freezes | Switch to the spare (Pova 4 for Android, iPhone 11 for iOS). Same build, same backup deck |
| Model fails to load | Splash screen → "Choose model file". If that fails, switch phones |
| OCR reads junk | "Phone cameras vary; here's the same page I ingested this morning." Open the backup deck |
| Tutor is slow on the budget phone | Keep talking through what's happening ("it's thinking on the CPU, no server"). The template fallback appears if it fails twice |
| Mirroring dies | Document camera / filming phone |
| A judge asks to see it fail without internet | It already is: point at the cloud-calls counter |

## 6. Rehearsal checklist (M6)
- [ ] 5 full runs of the script on the stage phones, release builds, airplane mode, Wi-Fi off
- [ ] Each run timed; total ≤ 3:00
- [ ] Spare-phone swap practiced once
- [ ] Mirroring tested on the venue projector (or the closest thing)
- [ ] Backup video recorded the night before
- [ ] iOS builds less than 7 days old
