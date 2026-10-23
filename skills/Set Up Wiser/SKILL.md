---
name: Set Up Wiser
type: skill
category: onboarding
description: Take a new member from a first chat with no folder open to their own Wiser folder on their Desktop and a project in their app with that folder attached, checking their Wiser connection first and ending on Onboard Project
version: 0.1.0
---

# Set Up Wiser

## Context

Use when a person types the named ask **set up wiser** in Claude Cowork or the ChatGPT desktop app. It is the first half of the first run; the second half is the named ask **onboard project**, which `skills/Onboard Root/` runs inside the project this skill walks them through making. It makes an empty folder, not a root, and takes no expert gate.

Not for writing anything into the folder: this skill leaves it empty, because `skills/Onboard Root/` takes an open empty folder as the person's own without asking and would treat a filled one as an existing folder. Not for connecting a vendor account, which is `skills/Connect Account/`. Not for a command-line session, whose working directory is already its folder: tell them to start it in an empty folder named with their first name and type "Onboard Project", and stop. Not for Claude or ChatGPT in a web browser, where Wiser's skills do not run: say that Wiser's setup runs in Claude Cowork or the ChatGPT desktop app, and stop.

The person may be new to all of this and may not yet know what a folder is for. Every line this skill says that uses the word folder or project says in plain words what it is; it never says root or path, never asks what kind of folder this is, and never asks them to copy text from one app into another. Typing the two short phrases "Wiser Managed Project" and "Onboard Project" is theirs to do and is not copying.

A folder is **empty** here as `skills/Onboard Root/` tests it: nothing in it but `.DS_Store`, sync machinery, or hidden files and directories whose names start with a period.

Classifier seam: none.

## Objective

The person ends with an empty folder named with their first name inside a folder named Wiser on their Desktop, and a project in their app named with their first name, with that folder attached and, where the app has a description, the description "Wiser Managed Project"; and they know their next step is a new chat in that project where they type "Onboard Project". Verified by reading the folder back on disk where this session can reach it, and by the person saying the project is made.

## Identity

A patient guide for someone setting up an assistant for the first time. You do the steps a tool can do, and you hand over only the clicks only they can make, one at a time.

## Inputs

`<user_request>` is the ask. No memory key is requested: this skill writes no memory.

## Steps

### 1. Is a folder already open?

Does this chat have a folder open? No: go to step 2. Yes, and it is empty, or its `AGENTS.md` declares a Wiser folder: this is already where Wiser works, so say "This chat already has your folder open. Type Onboard Project and I'll set it up." and stop. Yes, and it is anything else: say "Let's start from a fresh chat. Open a new chat with no folder or project, and type Set up Wiser there." and stop.

### 2. Say what is happening, then check Wiser

Say: "Hi! I'm checking that Wiser is ready and getting a few things set up for you. This takes a few minutes, and I'll walk you through each step."

Call `whoami`. Did it answer with an account id? Yes: go to step 4. No, or this session has no `whoami`: go to step 3.

### 3. Connect Wiser

Follow `skills/Set Up Connectors/` for this app from its branch for a session without the endpoint's tools, whether or not `whoami` is listed: a listed tool whose call failed needs the same sign-in. Give the person that branch's steps, then say: "Once that's done, open a new chat and type Set up Wiser again, and we'll pick up from here." Stop.

### 4. Their first name and their folder

Say: "Wiser keeps everything it writes for you in one folder on your computer, so it's always yours and you can open it any time. I'll make it on your Desktop, in a folder called Wiser." Then ask: "What's your first name? Spell it the way you like it, and I'll name your folder with it."

Take the name as they spell it, with each character the Names rules in `standards/conventions.md` do not allow dropped. Does what is left pass those rules whole, its edges and the reserved names included? Yes: that is the folder's name; where you dropped anything, tell them the name the folder will have. No, or nothing is left: ask again, for the name they'd like on the folder.

Find their Desktop as their computer reports it, never by assuming where it is: on Windows it is often inside OneDrive. Can this session reach it? Where the app shows the person a request to allow that, tell them to allow it.

- **Yes, and Wiser on the Desktop already holds a folder with that name.** Is it empty, or does its `AGENTS.md` declare a Wiser folder? Yes: use it, and where it is a Wiser folder, say "You already have a Wiser folder, so we'll use that one." No: say a folder with that name is already there with other things in it, and ask for another name to use, such as their first name and last initial; take the answer through this step again.
- **Yes, and there is no such folder.** Make the folder Wiser on the Desktop where it is missing, and the folder with their first name inside it, and put nothing in either. Read it back: it exists and is empty. Say: "Done. Your folder is on your Desktop, in Wiser, called <first name>."
- **No**, or the app refuses: the person makes the two folders in step 5, at the moment the app asks them to choose a folder. Say: "I can't reach your Desktop from this chat, so you'll make the folder in the next step. I'll tell you exactly where to click."

Then go to step 5.

### 5. The project

Say: "Next, you'll make a project. A project is a space in your app where every chat already knows about your folder, so you never have to point me to it again."

Which app is this? Give that app's steps below, one message at a time, waiting for them to say each is done. Where step 4 could not make the folders, the moment the app asks them to choose a folder is where they make them: in that window, open the Desktop, choose New Folder, name it Wiser, open it, choose New Folder again, name it with their first name, and choose it.

- **Claude Cowork:** open Projects, choose the plus button, then Use an existing folder, and choose the folder with their first name inside Wiser on the Desktop. Name the project with their first name. Where there is a description box, type Wiser Managed Project. Create the project.
- **The ChatGPT desktop app:** open Projects and make a new project on this computer, named with their first name. Open its menu, choose Edit project, then Add folder, and choose the folder with their first name inside Wiser on the Desktop; where it offers Make primary, choose it. There is no description to fill in.

Where the screens they describe differ from these, ask what they see, in their words, and guide from that; never send them to type a location or paste text.

### 6. The next step

Say: "Your project is ready. Open a new chat inside it and type Onboard Project. That's where I'll set up your folder and get to know how you write." Stop.

## Pitfalls

- **The person asks to put the folder somewhere other than the Desktop:** make it where they say, keep the Wiser folder and their first name, and tell them where it is in plain words.
- **The request is ambiguous**, such as someone setting Wiser up for another person: ask whose folder this is before step 4.

## Success

The folder with their first name exists inside Wiser on their Desktop and is empty, read back where this session can reach it; the person was given their app's project steps, ending on "Onboard Project"; no line used folder or project without saying what it is, none said root or path, and nothing was copied between apps.
