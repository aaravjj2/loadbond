# Narration script for loadbond-walkthrough.mp4

Each block matches one slide and its time in the video. Read at a relaxed pace; the timings leave room.

**0:00 · Slide 1 (8 s).** This is LoadBond. It answers one question for clean-energy developers: what does your security actually secure?

**0:08 · Slide 2 (14 s).** At the end of 2025, more than two thousand gigawatts of projects were waiting to connect to the U.S. grid. The median project takes about five years, and three quarters of the capacity eventually withdraws. All of it must post financial security while it waits.

**0:22 · Slide 3 (16 s).** Since FERC Order 2023, that security escalates at every stage, up to 20% of the project's network-upgrade costs when the agreement is signed. Letters of credit cost one to three percent a year and use up the developer's credit lines.

**0:38 · Slide 4 (18 s).** Here is a real agreement: Chestnut Solar, a 75-megawatt project in Virginia. Page 14 says the security is $2,111,149. But Appendix 2 says more security is required if tax documentation is missing, and never says how much. So the correct answer is not $2.1 million. It is at least $2.1 million.

**0:56 · Slide 5 (14 s).** Spreadsheets hold one number. Contract tools store the PDF but don't compute. AI summaries invent a figure. In collateral, a confident wrong number is worse than "unknown".

**1:10 · Slide 6 (16 s).** LoadBond loads the filing, uses a local AI model to find sentences with money and conditions, and requires a person to approve each exact quote. Then a rules engine checks every state the contract allows.

**1:26 · Slide 7 (16 s).** On the real agreement, it reports the letter of credit as "at least $2,111,149", obligations of $7.16 million, and the drawable amount as unknown, because those terms live in a separate tariff that isn't loaded.

**1:42 · Slide 8 (14 s).** The design principles: unknown stays unknown, lower bounds instead of false maximums, exact enumeration instead of simulation, and AI that only proposes while people decide.

**1:56 · Slide 9 (18 s).** We tested on a real filing and published what broke. Five problems were found and fixed. The AI finds every amount but is right only 60% of the time, which is exactly why the engine, not the model, produces the number.

**2:14 · Slide 10 (16 s).** On this one project, letter-of-credit fees are twenty to sixty thousand dollars a year. Across signed but unbuilt projects, posted security is plausibly in the tens of billions. Capital stuck in collateral is capital not building clean energy.

**2:30 · Slide 11 (14 s).** It runs today on a laptop. Next, we interview ten developer treasury teams. And if they can't show a real case where conditional security was misjudged, we stop.

**2:44 · Slide 12 (9 s).** "At least $2,111,149" is the honest answer. LoadBond is built to give it.
