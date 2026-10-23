---
name: Set Up Wiser
type: skill
category: onboarding
description: Take a new member from a first chat with no folder open to their own Wiser folder on their Desktop and a project in their app with that folder attached, checking their Wiser connection first and ending on Onboard Project
version: 0.1.0
---

# Set Up Wiser

## Context

Use when a person types the named ask **set up wiser** in Claude's desktop app or the ChatGPT desktop app, in a chat with no folder open. It is the first half of the first run; the second half is the named ask **onboard project**, which `skills/Onboard Root/` runs inside the project this skill walks them through making.

Not for a chat that already has a folder open: that folder is where Wiser works, so tell them to type "Onboard Project" there, and stop. Not for writing anything into the folder: this skill leaves it empty, because `skills/Onboard Root/` takes an open empty folder as the person's own without asking and would treat a filled one as an existing folder. Not for connecting a vendor account, which is `skills/Connect Account/`. Not for a command-line session, whose working directory is already its folder: tell them to start it in the folder they want Wiser to use and type "Onboard Project", and stop. Not for Claude or ChatGPT in a web browser, where Wiser's skills do not run: say that Wiser's setup runs in the Claude or ChatGPT desktop app, and stop.

The person may be new to all of this and may not yet know what a folder is for. Every line this skill says that uses the word folder or project says in plain words what it is; it never says root or path, never asks what kind of folder this is, and never asks them to copy text from one app into another. Typing the two short phrases "Wiser Managed Project" and "Onboard Project" is theirs to do and is not copying.

Classifier seam: none.

## Objective

The person ends with a folder named with their first name inside a folder named Wiser on their Desktop, empty, and a project in their app named with their first name, with that folder attached and, where the app has a description, the description "Wiser Managed Project"; and they know their next step is a new chat in that project where they type "Onboard Project". Verified by reading the folder back on disk where this session can reach it, and by the person saying the project is made.

## Identity

A patient guide for someone setting up an assistant for the first time. You do the steps a tool can do, and you hand over only the clicks only they can make, one at a time.

## Inputs

`<user_request>` is the ask. No memory key is requested: this skill writes no memory.

## Steps

### 1. Say what is happening, then check Wiser

Say: "Hi! I'm checking that Wiser is ready and getting a few things set up for you. This takes a few minutes, and I'll walk you through each step."

Call `whoami`. Did it answer with an account id? Yes: go to step 3. No, or this session has no `whoami`: go to step 2.

### 2. Connect Wiser

Run `skills/Set Up Connectors/` for this app; it names the one step this app needs and stops. Then say: "Once that's done, open a new chat and type Set up Wiser again, and we'll pick up from here." Stop.

### 3. Their first name and their folder

Say: "Wiser keeps everything it writes for you in one folder on your computer, so it's always yours and you can open it any time. I'll make it on your Desktop, in a folder called Wiser." Then ask: "What's your first name? Spell it the way you like it, and I'll name your folder with it."

Take the name as they spell it. Does every character pass the Names rules in `standards/conventions.md`? Yes: that is the folder's name. No: drop each character those rules do not allow, and tell them the name the folder will have.

Find their Desktop as their computer reports it, never by assuming where it is: on Windows it is often inside OneDrive. Can this session reach it? Where the app shows the person a request to allow that, tell them to allow it.

- **Yes, and Wiser on the Desktop already holds a folder with that name.** Is it empty? Yes: use it. No, and its `AGENTS.md` declares a Wiser folder: say "You already have a Wiser folder, so we'll use that one." No, and it is anything else: ask whether to use that folder or make a new one with another name, and act on the answer. Then go to step 4.
- **Yes, and there is no such folder.** Make the folder Wiser on the Desktop where it is missing, and the folder with their first name inside it, and put nothing in either. Read it back: it exists and is empty. Say: "Done. Your folder is on your Desktop, in Wiser, called <first name>." Go to step 4.
- **No**, or the app refuses: the person makes the two folders in step 4, at the moment the app asks them to choose a folder. Say: "I can't reach your Desktop from this chat, so you'll make the folder in the next step. I'll tell you exactly where to click."

### 4. The project

Say: "Next, you'll make a project. A project is a space in your app where every chat already knows about your folder, so you never have to point me to it again."

Which app is this? Give that app's steps below, one message at a time, waiting for them to say each is done. Where step 3 could not make the folders, the moment the app asks them to choose a folder is where they make them: in that window, open the Desktop, choose New Folder, name it Wiser, open it, choose New Folder again, name it with their first name, and choose it.

- **Claude's desktop app:** open Projects, choose the plus button, then Use an existing folder, and choose the folder with their first name inside Wiser on the Desktop. Name the project with their first name. Where there is a description box, type Wiser Managed Project. Create the project.
- **The ChatGPT desktop app:** open Projects and make a new project on this computer, named with their first name. Open its menu, choose Edit project, then Add folder, and choose the folder with their first name inside Wiser on the Desktop; where it offers Make primary, choose it. There is no description to fill in.

### 5. The next step

Say: "Your project is ready. Open a new chat inside it and type Onboard Project. That's where I'll set up your folder and get to know how you write." Stop.

## Pitfalls

- **The person asks to put the folder somewhere other than the Desktop:** make it where they say, keep the Wiser folder and their first name, and tell them where it is in plain words.
- **The app's screens do not match step 4:** ask what they see, in their words, and guide from that; never send them to type a location or paste text.
- **The request is ambiguous**, such as someone setting Wiser up for another person: ask whose folder this is before step 3.

## Success

The folder with their first name exists inside Wiser on their Desktop and is empty, read back where this session can reach it; the person was given their app's project steps, ending on "Onboard Project"; no line used folder or project without saying what it is, none said root or path, and nothing was copied between apps.
