import type { Ink } from "../ui/text";
import type { Species } from "../state/store";

// Townsfolk and object jokes for Level 1. Every NPC has a script; most cycle
// through lines on repeat visits, some ask questions or do small bits.
export type ScriptApi = {
  say: (text: string) => Promise<void>;
  ask: (text: string) => Promise<boolean>;
  choose: (text: string, options: string[]) => Promise<number>;
  emote: () => Promise<void>;
  shake: () => void;
  sfx: (name: "exclaim" | "buzz" | "sparkle" | "bump" | "rustle" | "select") => void;
  jingle: (name: "itemGet" | "save" | "spotted") => void;
  wait: (ms: number) => Promise<void>;
  give: (item: "POTION" | "POKE_BALL", count?: number) => Promise<void>;
  received: (id: string) => boolean;
  receive: (id: string) => void;
  player: string;
  party: readonly Species[];
};
export type NpcScript = { ink: Ink; run: (api: ScriptApi, visit: number) => Promise<void> };

/** Says the nth line, wrapping around, so repeat visits stay fresh for a while. */
const cycle = (lines: string[][]) => async (api: ScriptApi, visit: number) => {
  for (const line of lines[visit % lines.length]) await api.say(line);
};

export const npcScripts: Record<string, NpcScript> = {
  lass: { ink: "red", run: cycle([
    ["Have you heard? BUPAF is the event of the year!", "I already filed my outfit as a business expense."],
    ["I walk in circles around this pond all day.", "My fitness tracker thinks I’m training for a marathon. My manager thinks I’m in a meeting."],
    ["Don’t tell anyone, but I think the town is… glitching sometimes.", "Yesterday the pond rendered as a car park for a second."],
  ]) },
  youngster: { ink: "blue", run: cycle([
    ["My RATTATA is in the top 1% of RATTATA…", "…for expense reports."],
    ["Shorts are comfy and easy to wear!", "Also, they’re tax deductible if you call them a uniform."],
    ["I wanted to battle you, but my RATTATA is on parental leave."],
  ]) },
  aide: { ink: "blue", async run(api, visit) {
    if (!api.received("aide-potion")) {
      await api.say(`Oh! You must be ${api.player}. PROF. LEDGER told me to give you this.`);
      await api.give("POTION", 2);
      api.receive("aide-potion");
      await api.say("POTIONS heal 20 HP. The PROF says they’re the only liquid asset worth holding.");
      return;
    }
    await cycle([
      ["I’m researching why POKéMON never pay rent.", "So far my main finding is: they live in balls."],
      ["The lab is locked. The PROF lost the key in a filing cabinet.", "Under K. For KEY. Or L, for LOST. Nobody knows."],
      ["Fun fact: a POKé BALL works better when the POKéMON is weak.", "Same strategy as asking your boss for a raise on a Friday afternoon."],
    ])(api, visit - 1);
  } },
  investor: { ink: "blue", async run(api, visit) {
    if (visit % 2 === 0) {
      if (await api.ask("Psst. Want a hot stock tip?")) {
        const tips = ["Buy MAGIKARP. It evolves.", "Sell everything. Then buy it back. That’s called a strategy.", "Invest in POTIONS. Everyone eventually needs one."];
        await api.say(tips[Math.floor(visit / 2) % tips.length]);
        await api.say("This is not financial advice. I am a man in a field.");
      } else await api.say("Your loss. Literally. I’ve calculated it.");
      return;
    }
    await cycle([["I put my life savings into MAGIKARP futures.", "It used SPLASH. Nothing happened. Just like my portfolio."],
      ["THE BROKER up north? He shorted my entire village.", "Then he sold us umbrellas. Then it rained. Genius."]])(api, Math.floor(visit / 2));
  } },
  blackbelt: { ink: "blue", async run(api, visit) {
    if (visit === 0 || visit % 3 === 0) {
      await api.say("HYAAH! I train by pushing boulders! I haven’t moved one yet.");
      if (await api.ask("Want to see my POWER STANCE?")) {
        api.sfx("bump"); api.shake();
        await api.wait(500);
        await api.say("…He pulled a hamstring.");
        await api.say("BLACK BELT: Can you help me file a workers’ comp claim?");
      } else await api.say("Wise. My power stance has injured three spectators.");
      return;
    }
    await cycle([["I don’t skip leg day. I skip tax day.", "It’s working out great until about April."], ["My sensei says the strongest strike is the one you don’t throw.", "So I haven’t thrown one in six years. I’m unbeatable."]])(api, visit);
  } },
  rocker: { ink: "blue", async run(api, visit) {
    await api.say("Yo! My band is called THE DEPRECIATING ASSETS.");
    if (await api.ask("Wanna hear our hit single?")) {
      api.jingle("itemGet");
      await api.say("~ Debits on the left… credits on the right… ~");
      await api.say("~ Baby, we’re balanced… every single night… ~");
      await api.say(visit % 2 ? "We’re touring three cities. All of them are this pond." : "Our album drops at the end of the fiscal year.");
    } else await api.say("Nobody ever wants to hear it. That’s why we’re depreciating.");
  } },
  oldman: { ink: "blue", async run(api, visit) {
    if (visit % 2 === 1) { await cycle([["Back in my day we did our taxes on stone tablets.", "And if you made a mistake, you got a new rock!"], ["I’ve been sitting here so long these flowers are technically my dependents."]])(api, Math.floor(visit / 2)); return; }
    await api.say("You look sharp. Let’s test you, youngster.");
    const pick = await api.choose("Quick! What is 0.1 + 0.2?", ["0.3", "0.30000000000000004", "Ask my accountant"]);
    if (pick === 0) await api.say("Wrong! A computer says it’s 0.30000000000000004. Never trust a computer.");
    else if (pick === 1) { api.sfx("sparkle"); await api.say("Correct! You’ve clearly worked with spreadsheets. My condolences."); }
    else await api.say("Ha! The correct answer for every question since 1998.");
  } },
  worker: { ink: "blue", run: cycle([
    ["We’re building THE BROKER a bigger office.", "Budget? Unlimited. Deadline? Yesterday. Plans? Napkin."],
    ["The blueprint says this is the trading floor.", "I said, where are the walls? He said, walls are a cost center."],
    ["I’ve been on this job for three years.", "It’s a 2 week job. I bill by the hour."],
  ]) },
  cooltrainer: { ink: "blue", async run(api, visit) {
    if (visit === 0) {
      await api.emote();
      api.jingle("spotted");
      await api.say("Our eyes met! That means we have to battle!");
      await api.wait(400);
      await api.say("…Wait. My POKéMON are on PTO until next quarter.");
      await api.say("Let’s circle back on this battle. I’ll send a calendar invite.");
      return;
    }
    await cycle([["Still on PTO. They’re in the ORANGE ISLANDS. Out of office."], ["I did get your calendar invite. I declined it. With a reason: no."], ["Battle? Sure! Let’s pencil it in for Q3. Of 2031."]])(api, visit - 1);
  } },
  bugcatcher: { ink: "blue", run: cycle([
    ["I’m not catching bugs.", "I’m catching bugs in THE BROKER’s spreadsheets. Found 14 so far."],
    ["My net is for CATERPIE. My other net is for safety. It’s a safety net.", "…I’ll see myself out."],
    ["Tall grass is where POKéMON hide. Get close and they jump out!", "Also where my keys are. They did not jump out."],
  ]) },
  beauty: { ink: "red", run: cycle([
    ["These flowers bloom only after the fiscal year closes.", "Right now they’re… pending."],
    ["I came here to see PROF. LEDGER’s lab.", "It’s locked. Like my savings account. On purpose."],
    ["Your partner POKéMON is adorable!", "Is it claimed as a dependent? It should be."],
  ]) },
  grandma: { ink: "red", run: cycle([
    ["My grandson moved to the big city. Plays a game about stealing cars.", "Grand Theft… something. Not very POKéMON of him."],
    ["Eat something, dear. You look like you haven’t had lunch since the last audit."],
    ["Did the town just flicker? No? It must be my eyes.", "Or this world was never quite what it seemed. Have a biscuit."],
  ]) },
  fisher: { ink: "blue", async run(api, visit) {
    if (await api.ask(visit === 0 ? "I’ve fished here three years. Caught zero fish. Want to try?" : "Back for another cast?")) {
      api.sfx("rustle");
      await api.say("…");
      await api.wait(700);
      await api.say(["Not even a nibble.", "You hooked an old boot. It has a receipt in it.", "Something bit! …It was a tax refund. It got away."][visit % 3]);
      await api.say("FISHERMAN: Fish are in a bear market right now.");
    } else await api.say("Smart. I itemize the bait as a business expense. It’s the only thing I’ve ever caught: a deduction.");
  } },
  kid: { ink: "blue", run: cycle([
    ["I’m playing a game where you steal cars and drive really fast!", "Mom says it’s not appropriate for a POKéMON game."],
    ["Shh! I’m on the last level. You have to run from five police cars.", "Imagine that happening here. Ha!"],
    ["My GAME BOY battery is at 1%. Like my allowance."],
  ]) },
  maniac: { ink: "blue", async run(api, visit) {
    if (visit % 2 === 0 && (await api.ask("I have a spreadsheet for every POKéMON! Wanna see?"))) {
      await api.say("It has 151 tabs. Your laptop fan just started screaming.");
      await api.say("Column Z is just CHARIZARD fan art. Don’t look at column Z.");
      return;
    }
    const party = api.party.map((p) => p.toUpperCase()).join(", ");
    await cycle([["POKéMON MANIAC: I’ve seen every POKéMON! Except the ones I haven’t."], [`Your portfolio: ${party}. Ooh, very diversified. Low risk.`], ["Rumor has it a PIKACHU hides in the east grass. A VENUSAUR is past the north-west ledge."]])(api, visit);
  } },
};

/** Lines for things you can face and press E on. They rotate, too. */
export const objectJokes = {
  tree: [
    "It’s a tree. It isn’t hiding anything. Probably.",
    "This tree has more branches than THE BROKER’s bank.",
    "You admire the tree. The tree does not admire you back. It’s not personal.",
    "A sticky note on the bark says: DO NOT AUDIT.",
  ],
  pond: [
    "The water is crystal clear. A MAGIKARP inside is doing its taxes.",
    "You see your reflection. It looks like it needs a holiday.",
    "The pond is 30 cm deep. Liquidity: low.",
  ],
  boulder: [
    "A boulder. It’s been here longer than the tax code.",
    "You push the boulder. It does not move. Neither do property prices.",
  ],
  post: ["A brass post. It’s engraved: BUY LOW, SELL HIGHER."],
  ledge: ["A ledge. Like the market: easy to jump down, impossible to climb back up."],
  door: ["The door is locked. A note says: Out catching rounding errors. Back at month-end."],
} as const;
