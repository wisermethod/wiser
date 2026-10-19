# What changed in Wiser

What changed in this plugin that a member would notice, newest first. Each release is one update to the plugin's `main` branch on GitHub, named by a tag of the form `vYYYY.MM.DD`, with `.2` or `.3` added when there was more than one that day. Each line names the commits that made the change; every commit is public at github.com/wisermethod/wiser. A line says what changed and nothing about what it is worth.

Changes before September 27, 2026 are in the commit history only.

## Unreleased

- The plugin's manifest names an icon for Anthropic's plugin directory: the Wiser mark on a transparent background, black, or white when the viewer's device is set to dark. Claude Code does not read it.
- The README no longer says your installed copy follows each release by itself. It now says how to turn on Claude Code's own update check for `wiser-method`: run `/plugin`, open Marketplaces, and turn on Enable auto-update.
- Bringing an existing folder up to date no longer changes its `CLAUDE.md` or `.cursor/rules` without asking. Where one still points at an earlier plugin, Onboard Root quotes those lines, says what changing them does, and on your yes changes only those lines for you, so your app starts at the folder's own `AGENTS.md`; you never edit it yourself.
- Setting up a personal Wiser folder in an empty folder you already have open, in Cowork, ChatGPT for desktop's Work mode, an editor or a terminal, makes that folder your Wiser folder under its own name once you say yes to its path, rather than a new folder named after you inside it. Your name goes in your memory files, and Onboard Root's optional check reads it from the first heading of `memory/about.md`.
- Reviews, such as each pass of Ghost Writer's gate, start from the session you are working in. A helper that session hands work to starts no review or helper of its own: where its work owes a review, it stops before what the review guards and hands back what the review needs, with the review named.
- Build Voice measures what recurs across your writing samples: signature words and phrases, spelling and contraction choices, punctuation habits and altered sayings, each with how often it appears and in which samples, and the ranges your sentence length, pronoun mix and hedging keep. It asks you, for each, whether to keep it or polish it away. Your voice file records the answers, and a confirmed copy of the measurements is saved in your folder.
- A polish of sentence length names which range it means, the average, how much it varies or the long end, and Build Voice asks when you have not said. If its final review sends your voice file back twice, Build Voice shows you what is still open and asks whether to write the file as it stands or decline the review.
- Writing in your voice aims to be better than your samples and still recognizably yours. Content Author uses your signature words and sayings sparingly, keeps your spelling and contraction choices every time, and keeps each range you polished within its new bound.
- Onboard Root now also closes your voice as provisional when your writing is too short to measure, and no longer closes it complete when Build Voice reports it provisional.
- Content Author: in a long piece, each header says what its section establishes, so the headers read alone give the argument in order; each paragraph holds one idea, and none is split only for its length; and lists hold only parallel items, such as steps or options, with reasoning left in prose. The number of sections follows the steps of the argument instead of a count set by the piece's length.
- New skill, Voice Report: ask to see your voice, for example "show me my voice" or "voice report", and get its dials for register, stance and rhythm. The dials appear in the conversation where the app can draw them; otherwise the page opens, or you get a link to it. The full page is saved in your folder's `work/onboarding/`, with a data file beside it.
- The page shows only your voice file's own lines, the measurements you confirmed, your folder's record of whether the voice is complete or still provisional, and fixed labels. It calls your voice confirmed only where its confirmation line holds a date, reads a voice line edited by hand, in bold or with a trailing colon, for its state, and shows bold and italic text without stray stars.
- Asking again the same day reuses the page while your voice is unchanged. Once it changes, the old page is archived and a new one is built.
- When Build Voice finishes your voice as complete and your folder's record does not say otherwise, it offers Voice Report, which shows the voice as dials and saves it as one page; otherwise it tells you what that record says, or that there is none. During onboarding the offer comes at the end instead, once your folder records where your voice stands, complete or not. The page is made only on your yes.

## v2026.10.17, October 17, 2026

- You can connect the same service more than once by giving each connection a short name, and Wiser uses the one you name; asked without a name where you only have named ones, it lists them rather than guessing. A named connection covers every part of that service it shares a sign-in with, so one connect is enough. (98e3d8d)
- Twenty CRM: each workspace on your install connects under its own name, its subdomain, so all of an organisation's CRMs stay connected at once instead of one replacing the next. Before any change in a workspace, Wiser checks that both parts of the connection name that workspace. (98e3d8d)

## v2026.10.15, October 15, 2026

- The classifier no longer suggests Commit and Release, Delegate Build or Prove Change, whose files declare no classifier seam. (5e2f2cc, e152a37, f8d001d)
- When a Claude Code session starts, Wiser reminds it that your standing preferences are kept on your Wiser account, not in Claude Code's own memory, and Save Preference decides whether to offer keeping a new one. (e8fa63f, 3ca9c5f)
- New skill, Save Preference: keep, list, change or forget a standing preference on your Wiser account. Each sentence is previewed word for word, with a line telling you it is kept on your Wiser account and sent to the AI apps you use with Wiser, and saved only on your yes; when saving is not open yet, it stops before asking for approval. It refuses a preference that would drop or put off a check before or after a step, give consent in advance, or change one of Wiser's own rules, such as deleting files without asking first. (bcbbfbf, 078b009, e152a37, f8d001d, 5d3200e)
- Wiser reads your saved preferences from your Wiser account when it starts work for you, follows them within its own rules, your folder's facts and voice, and what you ask in the moment, goes on without them when it cannot read them, and never passes them to a helper it hands work to. (bcbbfbf, 55d80cf, ba7f7ec)
- What Wiser keeps goes where a later session will find it: facts in your folder, preferences on your Wiser account through Save Preference, never in an app's own memory. (bcbbfbf)

## v2026.10.14.3, October 14, 2026

- Webmaster's SEO audit handles a site that is not public yet: a pre-launch review, an audit of a staging host, or a rebuild about to replace a live site. It confirms which case it is from what you say, never from an error code alone, and asks what it needs about the hosts with its first question. For a new site, Search Console, Analytics, Bing, Ahrefs and the site's own rankings are marked as not applicable before launch, so you are not sent to connect accounts that cannot exist yet and they do not keep the audit partial; keyword and search-result research still runs. (c00296a)
- Where no tool can reach the site, behind a staging login or only as a build on your machine, the evidence comes from the build's own files: each page's HTML, the sitemap, `robots.txt` and the redirects and headers files, with a kit site's own check, and pages you open in your browser. The crawl, tracking and speed readings are left open and read on the launch address once it serves. (c00296a)
- Launch blockers come first: a `noindex` on a page meant to be found, a `robots.txt` that blocks every crawler, and canonical, social or sitemap addresses still naming the staging host. A setting that only the staging host adds is checked at launch rather than reported as a blocker, and a staging host open to search engines is flagged now. For a rebuild, the live site is read as usual and every live address with no page or redirect in the new build is listed before launch. (c00296a)

## v2026.10.14.2, October 14, 2026

- When a session that worked a Playbook ends, each Playbook's resume line appears once, at the end of the session's last message, after the commit report. It no longer appears when the session stops mid-work to tell you a result only you can decide on, nor in the message that asks whether to wrap up. Where the session hands you a prompt for the next session, the prompt takes the place of its Playbook's line instead of repeating the path, and every other Playbook keeps its own line. If you decline the wrap up and go on working, the line waits for the session's real end. (3b2bfee, 00b1b2c, 4098e66)

## v2026.10.14, October 14, 2026

- Webmaster's SEO audit bounds its paid research: a reading that needs a whole list, such as a site's anchors, is paged at most ten times unless a limit you stated covers more; a spending limit you state is checked against each call's worst case before the call; a call whose outcome could not be confirmed is not sent again by the audit; a cost that did not come back is shown as unknown and the total as "at least"; and once DataForSEO refuses a call for lack of balance, no further paid call is sent and the top-up is the next step. A rate limit is told apart from an empty balance. (293b4e8, c1b0918, 47b8120)
- The audit is called full only when every reading it needs returned in full, returned no data for the window, or does not apply to the site; a narrower scope you approve by name is reported as complete for that scope, never as full; and declining a question is not approving a narrower scope. A crawl stopped by its page or depth limit, or one whose home page carries no links, leaves the audit partial. Clarity is offered only when you want it and never counted. (c1b0918, 47b8120)
- Next steps are the ones that help. A URL inspection refused while the same property's search data reads is checked first for a URL outside the property, then for the account's access to it, and the connection is not redone; a gateway that is not set up, the Wiser endpoint's daily limit, and any other status follow Connection Troubleshooter. (293b4e8, c1b0918, 47b8120)
- The crawl starts from the address your site actually serves and is re-run from it when the start redirects to another host. A tracking tag missing from a page's served HTML is checked in the rendered page before the audit says tracking is missing. (c1b0918, 47b8120)
- Paid DataForSEO search volume is a supplement rather than a required reading, since keyword research already returns volume, so a declined stop there no longer leaves an audit partial. Every DataForSEO and Ahrefs figure is labeled as its vendor's estimate, and every comparison of your site with its competitors uses one provider's figures for all of them. (c1b0918)
- Preflight names the default date windows, how the money pages are chosen, where seed terms come from, and asks which property to use when your account holds more than one. Language and country targeting, which no route reads, is labeled as not read. (c1b0918, 47b8120, 6203e3f)

## v2026.10.13.6, October 13, 2026

- Webmaster's SEO audit runs every reading that needs no answer from you before it asks anything, the readings in your own browser last among them, then asks its questions together, once. Each DataForSEO report that stops for your yes is shown with its inputs and price and takes its own yes or no. A stop that lapsed before your answer is shown to you again rather than confirmed on your earlier yes. (e3dcc8a, 7233ed3, 368639b)
- The audit reads Search Console's Manual actions and Security issues pages in your own browser, one line each, and its Crawl stats page where daily impressions fell to zero. Without a browser, what you report from those pages is recorded as yours. (e3dcc8a, 7233ed3)
- A competitor list your folder already keeps is put to you as a proposal beside DataForSEO's, and no call reads those domains until you confirm them for this audit, since a business rival may never meet your site in search. A set you name in the request is confirmed. (e3dcc8a, 7233ed3)
- The Ahrefs guide adds the Backlinks report, with each link's route to your site, straight or through a domain that redirects into it, counted for the rows read and never for the whole profile. (e3dcc8a, 7233ed3)

## v2026.10.13.5, October 13, 2026

- A new skill, Animated Explainer, makes one picture that moves to show how something works or what happened, for a section of a site built with the plugin's site kit, for any other site as three files to place, or for one slide of a deck. It draws the subject itself, its objects, places and people, in your site's or deck's colours, rather than labelled boxes. Every fact, count and order it shows is the one your sources give, and anything illustrative is put to you and labelled on the piece. With no JavaScript, with reduced motion, in print, and in a deck's PDF or PNG, the finished picture shows. The Creative Director reviews it, it stops once for your approval of the picture and its words, and it changes nothing outside its own section or slide. (61eddec)
- Designer, Visualizer, Component Design, Marketing Page Design and Create Presentation send a request for a moving explainer to it. Create Presentation places its slide in your deck, and Site Author files it into a kit site once the Creative Director's review has passed or you have accepted what it left open. (61eddec)
- Browser Control can emulate reduced motion with `emulate set --reduced-motion`, and deck-export's PNG shows a moving slide's finished picture. (61eddec)
- Designer's declared gap now names authored motion graphics made outside a page or slide, such as a title sequence, instead of all video; a generated clip is Media Generator's. (61eddec)

## v2026.10.13.4, October 13, 2026

- The virtual machines connector's guide, the setup guide's list of answers and Connection Troubleshooter now give the Wiser endpoint's limit for a command on your own machine as 65 seconds, which it has been since October 8, not 20, so a longer read such as a security audit fits. Every other call through the endpoint still has 20 seconds. The connector's guide adds that the app you use may stop waiting sooner, by its own limit. (63df57d)

## v2026.10.13.3, October 13, 2026

- A new skill, Bio Sketch, writes or brings up to date one sketch of one named person you want something from, ahead of a meeting, a pitch or another ask: who they are, whether their role is current, their standing, their dated public record, routes to reach them, and an assessment against what you want. Their role, standing and each route carry their own source and date, and what it could not find or refresh is listed as an open gap. Research Expert reviews the draft before the file is written. Your root, or another plugin, can add sections of its own through an extension file. It signs in to nothing, so a contacts database or a professional network behind a sign-in reaches it only as records you supply. (07cf920)
- Research Expert sends research on one named person you want something from to Bio Sketch, unless you ask for another output, such as one fact or a sourced report. (07cf920, 9a26119)

## v2026.10.13.2, October 13, 2026

- Classifier Trial now counts a skill the host opens through its own skill loader, which it used to record as nothing opened. A routing trial's verdict gains a line of its own for whether each case reached the primitive it should. A load counts only when it succeeded and came from the plugin under trial. (13fdef6, 1127e11, 923ba27, 0e41f96)
- For people adding a classifier seam: a routing seam's time and cost no longer have to beat the fastest repeat without the classifier. They pass when they are at most a quarter above the median without it, over all cases and in each case, and no run takes more than twice its case's median without it. A run with no measured time or cost fails. Every other seam keeps the old test. (2313af6, 923ba27, 0e41f96)

## v2026.10.13, October 13, 2026

- A new skill, Generate Ideas, gives you ideas on a topic as cards: research hypotheses, business, product or strategy ideas, content angles, or general ideas. It first asks whether you want a deep run or a general one. A deep run maps the topic's field and the fields around it, stops once so you can keep, add or remove those neighbouring fields, generates ideas several ways, and checks up to ten of them against published work, each card saying what the check found and how far it looked. A general run takes one quick look at the topic and gives ideas without checking them, and says so on every card. Either way the ideas come as a first sort for you to finish, and no idea is called new except through what a check found. (2892328)
- A new skill, Prior Art Check, answers "has anyone already done this?" for one idea of yours. It searches for existing work, compares the nearest work it can read on what the idea is for, how it works, where and for whom, and how success is judged, and gives one answer: prior work found, partial overlap naming what differs, or none found within the bounds it states, with the work cited and exactly what was searched and left unread. It does not search patents, and finds academic work through web search's paper results only; every result says both. (2892328)
- Research Expert reviews idea cards and prior-art results, sends back a claim that an idea already exists, or does not, when it comes without the bounds of the search behind it, and sends you to Generate Ideas for ideas on a topic and to Prior Art Check to find out whether an idea of yours has been done. (2892328)
- External Research no longer leaves a source unread because it came back from a different form of the same address, such as a paper served from the site's numeric address; a source counts as redirected only when the page read is a different page from the one asked for. (2892328)

## v2026.10.12.9, October 12, 2026

- Playbook Author plans a live run that has to clean up after itself so the cleanup is tried once early, on something the run does not need, instead of first at the end. A deletion your host may refuse, such as a click through a browser extension, is planned as your own click, for that early try and at the end, even when your go is already on record. (8184ad2, 3775714, 2161f48)
- For people writing connectors: the gateway's validator notes now say that a call needing your approval is refused before you are asked when a value is outside the length or number limits its action declares, and that an action you approved once is not checked that way on later calls. (8184ad2, 3775714, 2161f48)

## v2026.10.12.8, October 12, 2026

- Webmaster's SEO audit reads the PDFs its crawl finds as a reading of their own: each one's status, whether it is blocked from search, its size, and whether it earns impressions in Search Console, with an index check on any PDF that earns impressions or is blocked. Where the crawl found no PDFs, that reading is marked as not applying to the site. The crawl lists a PDF without reading it, so a finding about a PDF's title or text names the file that was read, and one that would need text nobody read is not made. (e84e76d)

## v2026.10.12.7, October 12, 2026

- Whether a piece of work needs a Playbook now has one answer, the test in the Playbook standard: work you can finish in one session is done directly, even when it changes this plugin. System Expert, Playbook Author, Prove Change and the plugin's own rules point to that test instead of giving answers of their own. (4afa098)
- System Expert places a build it does itself where a builder's would sit, gives a new skill or expert for a domain plugin its type, family and owning expert whenever you hand it that plugin's folder, and weighs choices about what people install, such as visibility, the README and the licence, for someone installing for the first time. (4afa098)
- Prove Change asks that a new test guarding a fix fail on the version before the fix, and that a test of behaviour that already worked be shown able to fail by a planted fault. It also carries checks learned in practice, among them counting what falls outside a total and comparing a copied passage word for word, and keeps the pitfalls of the zsh and dash shells in a file beside it, read when a check runs in one of them. (4afa098)
- Delegate Build checks what a Grok run read from Grok's own transcript, keeps a repository's own tests open to the builder while it withholds an acceptance check written for the work, and tells a builder plainly when reading public web pages is the task. (4afa098)
- Playbook Author writes each lesson into the step or file it concerns as a rule, not a story, puts a fact about a mechanism in that mechanism's own documentation, and treats a short go-ahead as no answer when one of the options on the table would drop planned work. (4afa098)
- Commit and Release reads the destination's main branch again right before a release merge, and tests the merge when it can no longer fast-forward. (4afa098)
- Scope Plugin Bench is shorter, and sends a request for one named skill or expert to System Expert, which decides how it gets written. (4afa098)
- The Playbook standard asks that a surprising measurement be raised as a question, that a failed checkpoint get the response its plan names before any other recovery, that approval for a paid call be asked before the call, that a gap found mid-run go to you as a decision, and that a count be worked out again each time it is used. (4afa098)
- Before anything is deleted or overwritten, the target is read, the decision made, and only then the write done, as separate steps; a copy never overwrites. (4afa098)
- Connector Advisor proves on throwaway records what deleting either side of a link does to shared history before it recommends linking. (4afa098)
- For people writing their own tools and skills: a script runs its main code only when run as a program, so a test that imports it can still fail; a skill gated on its own output is measured by an independent check; and an instruction that gates with a fixed number of correction passes says what a few small findings left at the end get. (4afa098)
- The pre-commit check that keeps the build workspace's paths out of shipped files now checks any Wiser plugin from one copy. (4afa098)

## v2026.10.12.6, October 12, 2026

- Webmaster's SEO audit now starts by saying which of its readings are ready and which need something from you, and keeps one line per reading as it goes: each Search Console window, lab and field speed, and each Ahrefs report has its own. Paid DataForSEO research runs without asking first, each charge is recorded, and the total is reported at the end. A spending limit you state holds, and the two DataForSEO reports that stop for your yes still wait for it. Competitors are proposed from DataForSEO and compared only once you confirm them, and their backlinks come from DataForSEO. Ahrefs is read in your own signed-in browser through your host's extension, and you are asked which browser only when there is more than one. Search Console's URL inspection is read through Google's chosen canonical address, so a home page is no longer reported unindexed because its bare address redirects. Anchor-text shares are worked out only from the full anchor list, and an authority comparison uses one provider's scores. The audit is called full only when every reading arrived; otherwise it is called partial and names each missing reading and its next step. Missing real-visitor speed data is reported as missing, never as a pass, and lab figures are not presented as what visitors experience. Conversion Advisor reads speed the same way, and SEO Assets takes a reading by hand only when the route for it is missing in your host, never when you have limited spending or declined a stop. (925594d)

## v2026.10.12.5, October 12, 2026

- Zone Publisher can change two more Cloudflare zone settings: Email Obfuscation, on or off, and Browser Cache TTL, any whole number of seconds from 0 to one year, where 0 leaves your server's own caching headers in place. Each is read before and after the change, as the other five settings are, and stops for your yes first. Before a change to either, Zone Publisher also reads the Configuration Rules or Cache Rules that can set it for part of the zone. IT Expert, which checks the plan before anything is written, now weighs what each one reaches: Email Obfuscation changes the addresses in the HTML your pages serve, with the exceptions Cloudflare lists, and a longer browser cache stays in visitors' browsers after you lower it again, where a purge at Cloudflare does not reach. (4cd8d9c, 685f0ad, fa4ccfd, 036ab4c)

## v2026.10.12.4, October 12, 2026

- Content Author can write one piece in another folder's voice: your folder names that folder in one of its own files, or you name it when you ask, and Content Author reads that folder's declaration, confirms a voice is bound there, and writes in it. A skill that calls Content Author passes the choice along with where it was made, and never makes one itself. Ghost Writer judges the piece against that same voice and names the file it used. If the voice cannot be found or read, nothing is written, rather than falling back to your folder's own voice, and a signature or a sender's name is never taken as a choice of voice. Your folder's other files, what the piece may say about you and where it is filed, stay your folder's. (df4041e)

## v2026.10.12.3, October 12, 2026

- A Play is now listed in the AGENTS.md of the folder that holds it, or of the nearest folder above it that has one, by its path and what it produces, and that listing is how a session finds the Play. The listing is added when a Play is written or next revised, so an older Play without one leaves your folder up to date. The glossary no longer says nothing routes to a Play. (adff00a)

## v2026.10.12.2, October 12, 2026

- Scope Plugin Bench still reads the shape of a folder where you did this work by hand first, and can now read files in it too, but only after naming which ones and why and getting your yes. What it finds still becomes made-up example cases, and no fact from that folder reaches the proposal. This replaces the earlier rule that it read the folder's shape and never its records. (afb0a81)
- A tool that returns a figure an engine calculates from facts about your case, such as a tax, keeps the engine's own guesses out of that figure: it asks for every fact it sends, a zero included, refuses when the engine says it filled one in, and has you confirm each case it does not cover, rather than listing the engine's assumptions beside the answer. (afb0a81, 6cd8ab2)

## v2026.10.12, October 12, 2026

- When a plan depends on a third-party package, Playbook Author now reads what the package does from the version the build will install, its shipped code and the answers it gives when run, and names that version beside each claim. Another version's notes, the package's README or a research summary only point the way, and a claim that the package lacks something is checked against the whole of that version. (493391a)
- Scope Plugin Bench now asks once whether you have done this work by hand in a folder the workspace does not include. If you name one, it reads only that folder's shape, its folder names, routers and headings, never its records, and turns what it shows into made-up example cases: each goes into the first slice where that slice needs it, or is put off with the condition that brings it forward. No fact from that folder reaches the proposal. (493391a, 9d8bb03)
- Delegate Build takes the meaning of each field a brief names from the cited system's own definition, not from a summary of its names. Where the work applies a rule that third-party code it drives also implements, the brief takes the rule from its own source, a law or a specification, or from that code's answers, and never sends the builder to that code to learn it. A builder writing such a rule works from a fresh start, with no copy of that code, told not to look for it, install it or go online, and its recorded reads are checked where the run keeps them. (493391a, 9d8bb03)
- When a review stops after a round that found a serious problem outside every earlier fix, Delegate Build now says that fix went unreviewed and names the check that proves it instead; a further review round runs only if you allow it. (493391a)
- Before Prove Change records the value it expects a system to produce, it reads that output's own rule to see everything the output covers, and works out the expected value for all of it from the specification. (493391a)

## v2026.10.11.4, October 11, 2026

- Scope Plugin Bench now also looks for earlier research in the folder that will own the plan, and leaves out what tools installed for themselves. When the plan will be kept in the build workspace itself, the hand-off names that workspace's own files; a proposal or hand-off bound for any other folder still names none of them. (9ed11e1)
- When Scope Plugin Bench sends a candidate to System Expert and it belongs in the domain plugin, System Expert now returns its type, family, name check and owning expert as well as its home, reading that plugin's folder without sequencing any work in it. (9ed11e1, b124c6d)
- Delegate Build first uses the delegation method your folder or your standing instructions name, with the vendor, model and effort they name, and turns to another method only where they allow one, including when that method fails to start. Case folders for a blind evaluation go in the session's own scratch folder. (9ed11e1, b124c6d)
- Playbook Author reads what a cited system does from that system's own schema, code or capture before a plan states it, and restates a changed objective in one paragraph. Where sessions run in a sequence across Playbooks, a session ends with the prompt for the next one, after any wrap-up question; where no plan states the order, or two disagree, it names the order as an open question in each Playbook instead of guessing. (9ed11e1, b124c6d, b44d198)
- A script's state check may return more than three answers where three are not enough, and a fresh gateway started to prove a call live takes its own harness label, as an instrument gateway does. (9ed11e1)

## v2026.10.11.3, October 11, 2026

- The knowledge-memory setup guide no longer says the recall figures in its backends reference were measured with the named model files, since no record shows which file those runs loaded. The files and their checksums are unchanged. (e09b740)

## v2026.10.11.2, October 11, 2026

- Three new skills carry a change to your own software, a plugin or a working folder from build to release. Prove Change tests a change against the commit that holds it, shows each check can fail, and says what passed, what failed, what could not be checked and what stays unverified. Delegate Build hands a build to a builder in another session and its review to a fresh one, and keeps only the findings it has checked. Commit and Release commits only the files you name and checks what landed, and pushes, tags and confirms a release only when you asked for it, following the release rules of the repository it is releasing. System Expert now decides which of them a change needs and in what order. (fbb6fb1, 4d644d5, fe81315, 7f717c6)
- Subagent Runner, an optional tool, runs that builder or reviewer through Claude Code, Codex or Grok when they are installed and signed in on your computer. It keeps each run inside the vendor's own permission limits and refuses a run whose limits it cannot confirm, which today means every limited Codex or Grok run; it runs a builder without limits only when you say so. Each run leaves a folder with the prompt, the output and its status. (0a70f03, 047806c)
- At the end of a Playbook session, Playbook Author now captures what the session learned. A lesson goes into the skill, expert, tool or standard whose work it concerns, a fact about your folder into that folder's own files, and anything without a clear home into the folder's inbox with the places it could go. A lesson about a plugin you cannot edit stays in the inbox as a note with the change to suggest and whether it was sent. A stop now gives each option's cost beside the recommendation. (649da30, fe81315)
- Playbooks gain the planning practice behind them: a question is asked where its answer is used, acceptance is written before a run, an unattended run lists what is still open and has another session check that list before it stops, and a resume works from the plan and its history rather than a summary. (649da30)
- Twenty-nine lessons from building Wiser now sit in the skills, experts and standards they concern, among them how to prove a connector live, how much of a server's instructions each app keeps, reading a connector's access level from its granted scopes, and checking a quotation against the original page. (f561dff, 4d644d5)
- Checking a connection that has no saved account now looks the account up with the provider rather than telling you to connect, and a provider outage is reported as the provider's error rather than as a missing connection. That error names only the request's path, nothing the provider sent. (fad40fc, ccfc9a9, 7ce83a4)

## v2026.10.11, October 11, 2026

- The knowledge-memory setup guide now names the embedding model file the Pro memory option reads: the full-precision ONNX export of all-MiniLM-L6-v2 from Hugging Face, saved as all-MiniLM-L6-v2.onnx, with that page's tokenizer.json beside it. It gives each file's size and SHA-256 and the command that checks them on a Mac, on Linux or in Windows PowerShell, because the page's optimized and quantized versions can load and return plausible results without being that file. (9641651, 81d9867)
- Where either checksum differs, the guide says to stop and replace that file before Pro work runs on it. Wiser still never downloads model files itself. (81d9867)

## v2026.10.10.6, October 10, 2026

- Cloudflare Pages can now publish an ordinary static site, a folder of built pages with no site kit and no Pages Functions, such as a one-page dashboard, through your Cloudflare connection instead of Wrangler and a hand-made token. It asks you to approve each deploy. (ea8d04f, 7c07ee6, bef62af, 62dad05)
- That deploy refuses a working folder rather than publishing it: your root itself or a folder at its top level, or a folder holding agent instructions, a git repository, archives, a memory folder or an environment file. It also refuses a site with server code and points you to the deploy that carries Pages Functions. (ea8d04f, bef62af, 62dad05)
- Cloudflare Pages can now switch on Cloudflare Web Analytics for a Pages project, and list or delete your account's Web Analytics sites. When a site already covers the domain, it attaches that site so its history continues; otherwise it creates one. The analytics script appears on your pages from the next deploy, and Webmaster reviews the switch before it runs, as it does a deploy. (ea8d04f, 7c07ee6, bef62af, 62dad05, bc89947)
- Deleting a Pages project that has Web Analytics on also deletes the Web Analytics site it sends to, with its history, even a site it only attached. Cloudflare Pages now tells you which site goes before such a delete, and before attaching a site whose history matters. (bc89947)
- Web Analytics needs one more permission on the Cloudflare token you connected for Pages: Account Settings, Read to list and attach a site, and Edit to create or delete one. Edit also lets the token change or delete your whole Cloudflare account, so the guide says to add it only for that step and remove it afterwards. Edit the same token at Cloudflare; nothing is reconnected. (7c07ee6)

## v2026.10.10.5, October 10, 2026

- Wiser can now work in a Twenty CRM workspace on an install you run yourself. It lists and counts records, reads the workspace's objects and fields, and creates records, objects, fields and new choices on a select field, asking you to approve each change before it runs. It never deletes, renames or removes anything there. (c1dc62f, bb77c27, 4ec4e86)
- It sends no email. It will not create workflows, campaigns, messages or Twenty's other built-in system records, and a record it creates can still start a workflow your workspace already has, which its guide explains. (c1dc62f, 7be4bb4)
- You connect it with an API key from the workspace's own settings, typed only on the connect page. On the Wiser service it becomes available in a later service update. (c1dc62f)

## v2026.10.10.4, October 10, 2026

- Turning a Markdown file into a Google Doc keeps its headings, bold text and bulleted lists, and the Google connector's guide now says so, so uploading Markdown is the quickest way to a formatted Doc. (a1bf5d2)
- When you approve moving a Drive file, the approval now says plainly that the file goes into the folder you named and leaves the folders it was in. (a1bf5d2)

## v2026.10.10.3, October 10, 2026

- Wiser can now make changes in your Google account, and asks you to approve each one before it runs. In Drive it can create a Google Doc, Sheet, Slides file or folder, upload text, Markdown, HTML, CSV or an Office file and turn it into a Doc, Sheet or Slides, rename a file, and move one to a folder. It can create a Google Doc and edit it, inserting and replacing text, setting headings, and making bulleted or numbered lists. It can write values to a spreadsheet and add rows to one, save a Gmail draft, which it never sends, and create and update Calendar events. Nothing is deleted or moved to the trash. (e222e3c, bb2a7a0, 810e04f)
- Guests on a Calendar event are emailed only when you ask. Google may still send some emails on its own, and says a guest outside Google Calendar may not receive an event added without emailing them. (bb2a7a0)
- These use the Google connections you already have, so nothing is reconnected. Each of them could already make changes, and the Google connector's guide now says so and lists what each one allows. (e222e3c)

## v2026.10.10.2, October 10, 2026

- Before a site that replaces another goes live, Webmaster now checks that every address the old site served, images and files as well as pages, is kept or redirected, and that you have said what may be retired. (e480406, bb06092)
- Content Author now asks which moment in your reader's journey a page or email serves before drafting it, and puts a list in the order that matters to your reader. (e480406)
- When a new action fits a service you have already connected, Connector Advisor now plans it onto that connection, so you are not asked to connect the same account twice. (e480406, bb06092)
- Browser Control now checks whose browser is on a port before using it, and no longer suggests closing a browser another session started. (e480406)
- The virtual machine connector's troubleshooting now explains a refusal that never reaches your machine, and how to find its cause without running anything that changes the machine. (e480406, bb06092)
- A Playbook that runs on its own, one step after another, now states what one step is, how the next one is chosen, and when the run stops. (e480406, bb06092)
- When a session working a Playbook ends, it now hands you one line, the Playbook's path, whether or not you let it commit, and the Playbook itself holds the next step and every open decision with a recommendation. Pasting that line into a new session is enough to resume. (a8b26a7, 1e7053c)

## v2026.10.10, October 10, 2026

- When you approve a site deploy that carries a scheduled article whose time has already passed, Cloudflare Pages now tells you the article goes live the moment the deploy lands, not at its scheduled time. (7f33120)
- When you run a site deploy through the Wiser connection in your app, which cannot read files on your computer, the connection troubleshooting skill now explains that and points you to the local gateway, instead of having no next step. (14cdb11)
- When an action was added to your local gateway after it started, the connection troubleshooting skill now tells you a new session will pick it up, instead of reporting a missing connector. (7f33120, 4c4f6c1, e8cad48)
- Wiser may now add a line to your working folder's `.stignore` or `.gitignore`, the files that keep sync and version control out of the wrong places. Nothing else at the top of a folder is written. (7f33120, 4c4f6c1)
- The snapshot Wiser takes before it reorganizes a folder now works when the folder holds files over 2 GB, and it includes a site's `tokens.css` instead of setting it aside as a password file. (7f33120, 4c4f6c1, e8cad48)
- Browser Control no longer closes its browser when a download click finds nothing to click. (7f33120)
- The site kit's guide now says correctly that a site carries an Organization record only when its published about page states the organization's facts. (7f33120, 4c4f6c1)

## v2026.10.09.3, October 9, 2026

- A program in your working folder can now hold programs of its own as well as projects, as deep as the work needs. A podcast program can keep guest sourcing, post-production and advertising as ongoing areas, each holding its own episodes and campaigns. Each folder says in its own AGENTS.md whether it has an end, which makes it a project, or not, which makes it a program; a project still holds no program. Moving a folder to a different parent still goes through a Housekeeping plan you approve, and a folder that turns out to have an end, or not, where it already sits only needs its own AGENTS.md changed. (614d9a2, 56904fd, 02e36b3)
- A working folder that does not nest programs is asked for nothing new, and update root leaves it as it is. Once a folder holds a program inside a program, update root proposes refreshing its programs/AGENTS.md so that file says so. (56904fd, 02e36b3)

## v2026.10.09.2, October 9, 2026

- On a Cloudflare account that has never turned on Cloudflare Access, Zone Publisher now records that as a reading, no Access application applies, instead of an unreadable refusal it had to ask you about. (0ab978c, c8cf283, f6abe78)
- When a service refuses a request, Wiser now passes along the service's own numeric error codes, and nothing else from its answer, so a refusal can be told apart from another with the same status; the connection troubleshooting skill reports them. (0ab978c, c8cf283, f6abe78)

## v2026.10.09, October 9, 2026

- Zone Publisher now reads a Cloudflare zone's settings and rules every time it pulls the zone, and keeps them in the archive with the records: the SSL mode, Always Use HTTPS, HSTS, Bot Fight Mode, the certificates, Workers routes, Page Rules, Access applications, every rule entrypoint, and, when a record is about to be proxied or a redirect changes, the account's redirect lists. A record is not proxied while a rule that could apply to it is still unread, and a rule it could not read is reported as not read, never as empty. (4128c59, 819b941)
- Zone Publisher can now publish redirects, a `www` to apex 301 or a `pages.dev` address sent to a custom domain, as Cloudflare Single Redirects and Bulk Redirects, and change the SSL mode, Always Use HTTPS, HSTS, the minimum TLS version and Automatic HTTPS Rewrites. Each goes through the same review by IT Expert, approval by name, and re-read from Cloudflare that a DNS change does. (0c0616c, 4128c59, 819b941, 9c0fb6e)
- Cloudflare Pages now reads whether a custom domain is active, with Cloudflare's own reason when it is not, for example "CNAME record not set", and can retry its validation. (0c0616c, 4128c59)
- Vercel Deploy can list a project's domains and remove one, removing a domain that redirects to another before the one it points at. (0c0616c, 4128c59, 819b941)
- All of this uses the Cloudflare and Vercel connections you already have. Where Cloudflare answers that a permission is missing, add that permission to the same token at Cloudflare (My Profile, API Tokens, Edit); the token keeps its value, so nothing is reconnected. The Cloudflare connector's guide lists the permission each action needs. (97c73b4, 21a25c2)

## v2026.10.08.2, October 8, 2026

- Webmaster's review before publishing now says exactly which record it reads for a site with server code: a site kit site's scheduled-article record, or another site's own build record, so the review of a scheduled article no longer has to work that out. (829a121)

## v2026.10.08, October 8, 2026

- A site built with the site kit can now publish a scheduled article by itself, at its moment, on Cloudflare Pages. Give the article a `pubDate` in the future and approve its deploy once, when you file it: at that moment it appears on its own page, in the site's article lists, tag pages and related articles, and in its feed, sitemap and `llms.txt`, with no rebuild and no second deploy. Until then nothing about it shows anywhere. The kit does this with a small piece of server code, the same for every site, that runs only when an article is scheduled; if it ever stops running, visitors see the site exactly as it was built, never a post early. (833afeb, 8121017, e250120, 95d9823)
- A scheduled article joins the site's own search at the next build after it goes live. On Vercel, or with a Wrangler deploy, a scheduled article still goes live at the first build and deploy after its date. (8121017)
- Site Author's check says, for each scheduled article, whether it will go live by itself and when. It refuses a scheduled article whose styling would put its words in the site's stylesheet early, a redirect that names a scheduled article, and any page that would later go live while breaking the site's page rules. (8121017, e250120, 95d9823)
- Deploying a site kit site to Cloudflare Pages carries that server code only when an article is scheduled, and only the exact code the kit released; the deploy says what it carried and when each article goes live. Before such a deploy, the Cloudflare Pages skill explains the free plan's daily limit on server requests, which the account's sites share, and what visitors see past it. (8121017)
- Webmaster reviews a scheduled article once, when it is filed, instead of again on the day it goes live. (8121017)

## v2026.10.07.7, October 7, 2026

- Deploying a site with Pages Functions now refuses more before anything is sent: a published file that is a copy of the Function's own source code, under any name; any folder inside a site kit's built output; a compiled bundle with module names outside plain letters, digits and simple punctuation; and a path written with `..` or doubled slashes. A database connection that fails still reports any other setting Cloudflare changed, and a migration runs only after Cloudflare has confirmed the record of migrations already applied. (9a4e639)
- The `pages-functions` tool keeps Wrangler off the network even when a settings file above its working folder names another package registry, and on Windows keeps Wrangler's files inside its own temporary folder. (9a4e639)

## v2026.10.07.6, October 7, 2026

- A website that was not built with the site kit can now go live on Cloudflare Pages with its own server code, the Pages Functions in its `functions/` folder. A new tool, `pages-functions`, compiles that folder on your computer with Cloudflare's own compiler and no Cloudflare sign-in; its first run asks to install about 210 MB. The Cloudflare Pages skill then deploys the site and the compiled code together, after Webmaster's review, through the local gateway. (3a7f5a7, 7856ccb)
- The Cloudflare connector now works with D1 databases: create one, set up its tables from a migration file the way Wrangler does and skip a file already applied, read it, change it with a confirmation every time, connect it to a Pages project under the name the site's code expects, and delete it. These use the Cloudflare Pages connection you already have; its token needs the Account, D1, Edit permission beside its Pages one, and nothing is reconnected. (3a7f5a7, 9df924a, 7856ccb, 3cb1178)
- A site kit site is still deployed only as it was, with no server code of its own. (3a7f5a7)

## v2026.10.07.5, October 7, 2026

- A site built with the site kit can schedule an article: give it a `pubDate` in the future, and it stays out of the site, its lists, feeds, sitemap, `llms.txt` and search until a build made at or after that moment. Until now such an article went live at the next build. A date and time with its offset sets the exact moment; a date alone means 00:00 UTC. (b0b6aa6)
- Site Author's check lists each scheduled article with the moment it goes live, says when one is due for a rebuild and deploy, and fails a build that shows an article early. Going live stays a step a person approves: build, check, Webmaster's review, then the deploy. (b0b6aa6)

## v2026.10.07.4, October 7, 2026

- Deploying a site to Cloudflare Pages sends its files in smaller requests, at most 3 MiB each, after a site whose first request was about 5 MiB was refused as too large and nothing was published. A site holding a single file too big to send this way, about 2.25 MiB or more, is refused before anything is uploaded, naming the file and pointing to Wrangler instead. If a request is still refused as too large, the answer now says so and gives the request's size, rather than a bare error. (50aff0b)

## v2026.10.07.3, October 7, 2026

- The README now says to install Wiser from this repository rather than from the plugin directory in Claude, whose copy does not update; tells Claude Cowork users to turn on Sync automatically when they install; and has a new Updating section saying how to bring each app's copy up to date. (811893b)

## v2026.10.07.2, October 7, 2026

- A site built with the site kit can hide a page: `noindex: true` in its frontmatter keeps the page at its address, for someone given the link, and keeps it out of search engines, the sitemap, `llms.txt` and the site's own search. Nothing names the address publicly. (ee7f371, e3b77d8)
- A site can publish downloads, such as PDFs, from `public/files/`, served at `/files/<name>`. Upgrades keep the folder exactly as it was, and Site Author's check refuses any file there that a browser would run as a page or script. (ee7f371, e3b77d8)
- Site Author now says which version it is, and which site kit it ships, at the top of its instructions and as the first line its scripts print. When two copies are present it uses the newer one and says the other is out of date. (ee7f371)

## v2026.10.07, October 7, 2026

- The virtual machines connector's guide now covers connecting through the Wiser endpoint as well as the local gateway, and says what happens there to a command that runs longer than 20 seconds: the answer comes back as `uncertain`, and the command may still finish on the machine. (f7a082d)
- When the Wiser endpoint answers that it could not confirm a call's outcome (`uncertain`), the setup guide's list of answers and Connection Troubleshooter now say what it means and what to check before trying again. (f7a082d)

## v2026.10.06.4, October 6, 2026

- A site built with the site kit can publish its own `llms.txt`, the summary AI tools read, by keeping it at `src/content/llms.txt`; the kit serves it exactly as written, and Site Author's check confirms the built file is the site's own. (fbbfeb5)
- A site that turns its top links off, with `nav` set to an empty list, no longer shows a blank header strip, and screen readers no longer announce an empty menu. (fbbfeb5)

## v2026.10.06.3, October 6, 2026

- Sites built with the site kit can turn on blog features one at a time: a page for each tag, a blog page split into pages of a set length, reading time, the date written out under each article's title, a picture beside each post in the list, and related posts at the end of an article. (bed3f4c, 0e22bda)
- A site can list classes and live sessions: each event gets its own page with the time written in its own time zone, a place or "Online", and a sign-up link, and a page can list upcoming sessions, then past ones. (bed3f4c, b9de292, 0e22bda)
- Pages can place a video (YouTube, Vimeo or a file on the site) and questions that open to show their answers. (bed3f4c, 0e22bda)
- Site Author can copy ready-made sections into a site's own folder: a testimonial, a grid of cards, numbered steps and a closing call to action, which the site then owns and can restyle. (bed3f4c, 7ad687c)
- A profile site can describe the person it is about, their work, the organisations they founded and their books, and search engines read it as that person's profile page. A site that states no organisation details no longer carries an empty one. (427d136, 0e22bda)
- Site Author's check on a built site now looks for images without descriptions, links and buttons without names, form fields without labels, embedded frames without titles and repeated ids. (bed3f4c, 0e22bda)
- Profile Page hands a kit site the person's confirmed facts for that description, instead of naming a gap. (427d136)

## v2026.10.06.2, October 6, 2026

- Sites built with the site kit can have a folder of their own code, `src/custom/`: their own header, footer, stylesheet and components, which a page places by name. Upgrading the kit never touches that folder, and a site without one looks exactly as before. Site Author files the code into it after the Creative Director has checked the design. (c0105de, 64d0cc3)
- A site can name its own icon and its language, and a page can choose the picture shown when it is shared. (c0105de, 64d0cc3)
- Site Author's check on a built site now looks at every page: each needs its title, description, link to itself, sharing details and one main heading, and none may load a script or stylesheet from another website. (c0105de, 64d0cc3)

## v2026.10.06, October 6, 2026

- Sites built with the site kit: a page set to list the site's articles (`listArticles: true`) shows each one as its title, a short description and the date written out, such as "September 24, 2026". That list no longer has a bullet beside each article or a large gap under the page title. A homepage that lists articles without that setting is unchanged. A site sets the spacing and title size through three new design tokens. (a9e7f66, 54ca841)
- Site Author's check can read a site after it is built, and stops when a link sits inside another link. That happens when an email address or a web address is written as a link's own text; the check says how to write it instead. It also stops when the built site is older than a change to its pages. (a9e7f66, 54ca841, 048ee6b)
- Site Author's check now works on a site still on an earlier kit version, and says an upgrade is available, instead of refusing it. (a9e7f66, 54ca841, 048ee6b)
- Site Author's check stops when an article's date gives a time with no time zone, because the site could then show a different day depending on the computer that built it. (54ca841, 048ee6b)
- This changelog, from this release on, with the six releases before it since September 27, 2026. (6c9d11d)

## v2026.10.05.3, October 5, 2026

- Setting up a website asks whether it should have an articles or blog section, and builds none until you answer. (7ac4622, 911df54)

## v2026.10.05.2, October 5, 2026

- New skill, Profile Page: the words for a page about one person, with every fact checked against a list of that person's claims, held for that person, or someone they name, to approve, then handed to whoever builds the page. (d0674ba, 69316fe)

## v2026.10.05, October 5, 2026

- Sites built with the site kit: on a wide page, headings and text share one reading width, with a margin on phones; the conversation player's buttons show where the keyboard is on any background; the skip link and article lists are easier to tap; and a site can set the line height of its text and the hover and pressed colours of its buttons. (c4e84c3, a04def6, 1435649)
- Upgrading a site's kit keeps the site's redirects. Before, an upgrade replaced them, and published a copy of the old redirects file with the site. (469f9c2, a04def6)

## v2026.10.04.2, October 4, 2026

- Site Author asks how a new site should look before it builds it: a narrow or wide page, sections in full-width colour bands, the site's name or logo in the header, a header that stays on screen, a Menu button on phones, an articles section, and the homepage headline. Nothing changes on an existing site until it turns a choice on. (afcb968, 66cb10e, d27f8cc, 2242630)
- A page can play a scripted conversation, with files appearing in a folder as they are saved. It holds still for people who have reduced motion turned on, and its full text is always on the page. (afcb968, 66cb10e)
- Upgrading a site's kit keeps the site's colours and fonts. (afcb968, d27f8cc, 2242630)

## v2026.10.04, October 4, 2026

- In Claude's apps, installing Wiser brings the connection to your Wiser account with it. You connect it and sign in once. (6dc7a1d, 98aa948, 740d360)
- In Claude Cowork, Wiser sends you to the plugin's own Connectors tab to connect, and says what to do when your organization has to add it for you. (f44143b, 6fb7076, a41a5c9)
- In Claude Code, the current notice about the Wiser service, when there is one, shows as one line when a session starts. You can turn it off. (5dcfc4b, 8b88aab)
- Connecting an account works the same way through your Wiser account or a local gateway, and you can ask for it in plain words. (efa996c, d9f8804, 6d97f5f)
- A list of your connected accounts reads every page of them, or says it could not, rather than showing part of the list. (6a5615c, 26bb9c8, 1fff0fc, 248efd9, 4794716)
- Site Author's description no longer uses angle brackets, so Claude Cowork's plugin upload accepts it. (0a7d313)

## v2026.09.27, September 27, 2026

- When Wiser asks before acting on an account you've connected, it shows every value it will use in full, lists included, and your approval covers exactly that action with those values, once, within fifteen minutes. (24b4551, 3668acd, 3d8b6ad)
- The vm connector reaches your servers through your own router, set up in your own account, and refuses a service name that could be read as an option. (fe63a9b, 1e80329, 6d43f38, 8bbd431)
