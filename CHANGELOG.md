# What changed in Wiser

What changed in this plugin that a member would notice, newest first. Each release is one update to the plugin's `main` branch on GitHub, named by a tag of the form `vYYYY.MM.DD`, with `.2` or `.3` added when there was more than one that day. Each line names the commits that made the change; every commit is public at github.com/wisermethod/wiser. A line says what changed and nothing about what it is worth.

Changes before September 27, 2026 are in the commit history only.

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
