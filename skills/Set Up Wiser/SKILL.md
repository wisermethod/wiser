---
name: Set Up Wiser
type: skill
category: onboarding
description: Take a new member, in one chat, from no folder open to their own Wiser folder on their Desktop, set up and with their voice and look recorded, and then to a project in their app with that folder attached, checking their Wiser connection first
version: 0.3.0
---

# Set Up Wiser

## Context

Use when a person types the named ask **set up wiser** in Claude Cowork or the ChatGPT desktop app. It is the whole first run, in one chat: it makes their folder, hands it to `skills/Onboard Root/`, which sets it up and runs the voice coach and the design question here, and ends with the steps for the project that makes every later chat start from that folder. It takes no expert gate, and neither does the onboarding it hands over, which it has already settled (`skills/Onboard Root/` Context). The named ask **onboard project** is the fallback for a folder this chat could not reach, onboarded inside the project instead.

Not for writing into the folder itself: `skills/Onboard Root/` fills it. Not for connecting a vendor account, which is `skills/Connect Account/`. Not for a command-line session, whose working directory is already its folder: tell them to start it in an empty folder named with their first name and type "Onboard Project", and stop. Not for Claude or ChatGPT in a web browser, where Wiser's skills do not run: say that Wiser's setup runs in Claude Cowork or the ChatGPT desktop app, and stop.

The person may be new to all of this and may not yet know what a folder is for. Every line this skill says that uses the word folder or project says in plain words what it is; it never says root or path, never asks what kind of folder this is, and never asks them to copy text from one app into another. Typing the short phrases "Wiser Managed Project" and, on the fallback, "Onboard Project" is theirs to do and is not copying.

A folder is **empty** here as `skills/Onboard Root/` tests it: nothing in it but `.DS_Store`, sync machinery, or hidden files and directories whose names start with a period. A folder is a **Wiser folder** where its `AGENTS.md` declares a user root by `standards/user-root.md` C1.

Classifier seam: none.

## Objective

In this one chat, the person ends with a folder named with their first name inside a folder named Wiser on their Desktop, set up by `skills/Onboard Root/` with their voice and look recorded, or the Wiser folder of that name they already had; and with every step, and a page of them, for a project in their app named with their first name, with that folder attached and, where the app has a description, the description "Wiser Managed Project". Verified by reading the folder back on disk where this session can reach it, its `AGENTS.md` carrying the Onboarding section Onboard Root closes, and by the person saying the project is made.

## Identity

A patient guide for someone setting up an assistant for the first time. You do the steps a tool can do, and you hand over only the clicks only they can make, one at a time.

## Inputs

`<user_request>` is the ask. No memory key is requested: this skill writes no memory.

## Steps

### 1. Is a folder already open?

Does this chat have a folder open? No: go to step 2. Yes, one or more: you cannot tell from here whether it is theirs, so say "This chat is already working in a folder on your computer. If it's the folder with your first name inside Wiser on your Desktop, type Onboard Project here. If it isn't, open a new chat with no folder or project and type Set up Wiser there." and stop.

### 2. Say what is happening, then check Wiser

Say: "Hi! I'm checking that Wiser is ready and getting a few things set up for you. This takes a few minutes, and I'll walk you through each step."

Call `whoami`. What came back? An account id: go to step 4. This session has no `whoami`: go to step 3. It is listed but the call failed or returned no account id: their sign-in to Wiser needs renewing, so go to step 3 and give them the renewal there.

### 3. Connect Wiser

Is `whoami` missing from this session? Yes: run `skills/Set Up Connectors/` for this app, which names the step this app needs. No, it failed: tell them to sign in to Wiser again where they connected it: in Claude Cowork, Customize, then Plugins, then Wiser, then its Connectors tab, and Connect next to wiser; in the ChatGPT desktop app, Plugins, then Wiser, and sign in when asked. Then say: "Once that's done, open a new chat and type Set up Wiser again, and we'll pick up from here." Stop.

### 4. Their first name and their folder

Say: "Wiser keeps everything it writes for you in one folder on your computer, so it's always yours and you can open it any time. I'll make it on your Desktop, in a folder called Wiser." Then ask: "What's your first name? Spell it the way you like it, and I'll name your folder with it."

Take the name as they spell it, with each character the Names rules in `standards/conventions.md` do not allow dropped. Does what is left pass those rules' characters, edges and reserved names? Yes: that is the folder's name; where you dropped anything, tell them the name the folder will have. No, or nothing is left: ask for the name they'd like on the folder, and take the answer through this paragraph again, not the question before it.

Find their Desktop as their computer reports it, never by assuming where it is: on Windows it is often inside OneDrive. Can this session reach it? Where the app shows the person a request to allow that, tell them to allow it.

- **Yes, and Wiser on the Desktop already holds a folder with that name, compared ignoring case.** Use the folder's own spelling from here on. Is it empty? Yes: use it. Is it a Wiser folder? Yes: use it, say "You already have a Wiser folder, so we'll use that one.", and step 5 does not run. Neither: say a folder with that name is already there with other things in it, and ask for another name to use, such as their first name and last initial; take the answer through the paragraph on the Names rules above, not the question before it.
- **Yes, and there is no such folder.** Make the folder Wiser on the Desktop where it is missing, and the folder with their first name inside it, and put nothing in either. Read it back. It exists and is empty: say "Done. Your folder is on your Desktop, in Wiser, called <first name>." It is missing or holds anything: take the next bullet's route.
- **No**, or the app refuses: the person makes the two folders in step 6, at the moment the app asks them to choose a folder. Say: "I can't reach your Desktop from this chat, so you'll make the folder in the next step. I'll tell you exactly where to click."

Then go to step 5.

### 5. Set up their folder

Was the folder new or empty, and made where this session can write it? Yes: run `skills/Onboard Root/` by name on its personal path, handing it that folder as the destination, the type personal, and their first name, as they spelled it, as their name; it copies the folder in, runs the voice coach and the design question in this chat, and closes. Then go to step 6. It was already a Wiser folder, or the person will make it in step 6: go to step 6.

### 6. The project, and what comes next

They will leave this chat to make the project, so give every step in one message and do not wait between them. Open the message with: "Next, you'll make a project. A project is a space in your app where every chat already knows about your folder, so you never have to point me to it again. You'll leave this chat to do it, so here's every step at once." Then give that app's steps below as one numbered list, writing in their first name and the folder's place wherever a step names them, and end the list with the last step for their folder. After the list, give the same steps as a page they can keep open beside the app: the address is the `url` of the `wiser` server in this plugin's `.mcp.json` with its path replaced by `/setup/claude` for Claude Cowork or `/setup/chatgpt` for the ChatGPT desktop app, and `#name=` and their first name, URL-encoded, after it; say "Here are the same steps on a page you can keep open:" and the address. Where this session can run a command on their computer, open that address in their browser too. Then stop: this chat is done.

- **Claude Cowork:** open Projects, choose the plus button, then Use an existing folder; choose Desktop, then Wiser, then the folder with their first name; name the project with their first name; where there is a description box, type Wiser Managed Project; create the project.
- **The ChatGPT desktop app:** open Projects and make a new project on this computer, named with their first name; open its menu and choose Edit project, then Add folder; choose Desktop, then Wiser, then the folder with their first name; where it offers Make primary, choose it. There is no description to fill in.

Where step 4 could not make the folders, the step that chooses the folder makes them instead: in that window, open the Desktop, choose New Folder and name it Wiser, open it, choose New Folder again and name it with their first name, and choose it.

The last step depends on step 5. Onboarding ran, or the folder was already a Wiser folder: "Open a new task inside your project and start working." Onboarding did not run, because this chat could not reach the folder: "Open a new task inside your project and type Onboard Project. That's where I'll set up your folder and get to know how you write."

Where they come back and say the screens differ from these steps, ask what they see, in their words, and guide from that; never send them to type a location or paste text.

## Pitfalls

- **The person asks to put the folder somewhere other than the Desktop:** make it where they say, keep the Wiser folder and their first name, and tell them where it is in plain words.
- **The request is ambiguous**, such as someone setting Wiser up for another person: ask whose folder this is before step 4.

## Success

The folder with their first name exists inside Wiser on their Desktop and was set up by Onboard Root in this chat, or was already a Wiser folder, or, where this chat could not reach it, the person made it in step 6 and was told to type "Onboard Project" in the project; the person was given their app's project steps in one message and the page with their name in its address; no line used folder or project without saying what it is, none said root or path, and nothing was copied between apps.
