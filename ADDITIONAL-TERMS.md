# Additional terms for SignalForge

SignalForge is free software under the **GNU General Public License, version 3
or later** (GPL-3.0-or-later). The full licence text is in [`LICENSE`](LICENSE);
it is the licence, and nothing on this page takes anything away from it.

Section 7 of the GPL lets an author add a small number of *additional terms* on
top. SignalForge adds two, and they pull in opposite directions on purpose:

1. **One requirement** — the author attribution of section 7(b): the line saying
   who wrote this has to stay with the code.
2. **One permission** — the *runtime exception* at the end of this page: effect
   files you build with SignalForge are free of the GPL entirely, even though
   the program writes a little of its own code into each of them.

Both are set out below, each followed by what it means in plain words.

---

## The term

GPL-3.0 section 7(b) permits a licensor to require *"preservation of specified
reasonable legal notices or author attributions in that material or in the
Appropriate Legal Notices displayed by works containing it"*. Those are the
GPL's words; everything in the box below is **this project's own wording** of
what it requires under that permission.

> **You must preserve the following author attribution, and you must not remove
> it or make it less visible:**
>
> ```
> SignalForge — Copyright (C) 2026 Max Leopold Blumenschein
> Licensed under the GNU General Public License, version 3 or later.
> ```
>
> This attribution must be preserved:
>
> 1. in the source files that carry it (the comment at the top of each file), and
> 2. in any **Appropriate Legal Notices** displayed by a work that contains
>    SignalForge code — that is, wherever such a work tells the user who made it,
>    who holds the copyright, or under what licence it is offered.
>
> Where a modified version is distributed, this attribution must remain, and any
> attribution for the modifications must be added **beside** it rather than in
> place of it.

**Why this term stays with the code.** GPL-3.0 section 7 lets a recipient strip
out an added term that is a *"further restriction"*, but it defines those as
*"all **other** non-permissive additional terms"* — that is, everything the
list (a) to (f) does not cover. An attribution requirement is covered, by (b).
It is therefore not a further restriction and not one of the terms section 7
allows to be removed.

(An earlier version of this file claimed the term could only be removed by
somebody who also removed the attribution itself. That was wrong: no such
condition exists anywhere in the GPL, and it is corrected here rather than
quietly deleted.)

---

## What that means, in plain words

**You may:** use SignalForge for anything, including at work and to make money;
read, study and change the source; share it; share your changed version;
publish effects you built with it and sell them. No permission needed, no fee.

**You must, if you pass the software or a changed version on:**

- **Say who made it.** The copyright line above stays in the files, and if your
  version has an about box, a credits screen, a licence page or a readme, the
  line belongs there too — next to your own name, not instead of it.
- **Keep it open.** Your version is under the GPL as well, and whoever gets it
  from you gets the source code with it. You cannot take SignalForge, close the
  source and sell that.
- **Say what you changed**, if you changed it. This is the GPL's own rule
  (section 5(a)), not an extra one.

**What is *not* covered by the licence:** the name **SignalForge**, the app's
icon and its visual identity. Copyright licences do not grant trademark rights,
and none are granted here. Fork the code freely — but give your fork its own
name, so nobody downloads yours believing it is this one.

**No affiliation:** SignalForge is an independent project. It is not made by,
endorsed by, or affiliated with WhirlwindFX or SignalRGB. It writes ordinary
effect files into the folder SignalRGB reads; it does not modify SignalRGB.

---

## Effects you build with SignalForge — the runtime exception

An effect file is your work: your picture, your colours, your arrangement. But
SignalForge writes a small amount of **its own code** into each exported effect
so that the effect can draw itself, and without saying otherwise, that code
would drag the GPL along with it into a file that is otherwise entirely yours.

So it says otherwise. This is a formal *additional permission* under GPL-3.0
section 7, and not merely a friendly assurance:

> **SignalForge runtime exception.**
>
> As a special exception, the copyright holder of SignalForge grants you
> permission to convey effect files produced by SignalForge — including the
> portions of SignalForge's own code that the program embeds in them so that
> they can run — **under terms of your choice**, without any of the conditions
> of the GNU General Public License applying to those effect files, and without
> the attribution term above applying to them.
>
> This exception covers only the code SignalForge embeds in the effects it
> produces. It grants no permission regarding SignalForge itself, whose licence
> is unchanged.

In plain words: an effect you export carries **no obligation of any kind**. Sell
it, give it away, keep it to yourself, put your own name on it, publish it under
whatever licence you like.

The `publisher` line an exported effect carries is filled in from the name you
type in the app. It names *you*, the person who made the effect — not this
program.
