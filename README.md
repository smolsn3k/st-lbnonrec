# Bulk Non-recursable

A SillyTavern extension that checks **Non-recursable** on every entry of one or more lorebooks in a single click, with an optional automatic mode that keeps chosen lorebooks (for example your Memory lorebooks) fixed for you.

Works on desktop and mobile.

## Installation

1. Open SillyTavern and go to the **Extensions** panel (the stacked-blocks icon).
2. Click **Install extension**.
3. Paste this URL and confirm:

   ```
   https://github.com/smolsn3k/st-lbnonrec
   ```

4. Reload SillyTavern if it doesn't refresh on its own.

You'll find a new **Bulk Non-recursable** section in the Extensions panel.

To update later, open the Extensions panel and use **Manage extensions** to update it from there.

## Usage

### Manual

1. Open **Bulk Non-recursable** in the Extensions panel.
2. Tick the lorebooks you want to process. Use the filter box to search, **Select shown** to tick everything currently visible, and **Clear** to untick all.
3. Press **Check Non-recursable** to enable the flag on every entry in those lorebooks, or **Uncheck** to remove it.

Entries that already have the requested state are skipped, and a lorebook is only saved if something actually changed.

> If a lorebook is open in the World Info editor while it gets changed, reopen it to see the updated checkboxes.

### Automatic

1. Turn on **Auto-check Non-recursable on matching lorebooks**.
2. In the box, list the lorebook names to process, one per line or separated by commas.
3. Use `*` as a wildcard. Matching is case-insensitive.

| Pattern | Matches |
| --- | --- |
| `Memory` | a lorebook named exactly "Memory" |
| `Memory - *` | "Memory - Alice", "Memory - Bob", ... |
| `*Memories` | "Alice Memories", "Bob Memories", ... |

Auto mode runs:

- on startup
- when you switch chats
- after each generation finishes
- whenever a matching lorebook is saved

It only ever **checks** the box, it never unchecks it, so it's safe to leave on. You can also press **Run auto now** to trigger it immediately, and toggle the notification that appears when entries get fixed.

## Notes

- The extension sets the lorebook entry flag called *Non-recursable* (`excludeRecursion` in the lorebook JSON).
- All settings are stored in your SillyTavern settings, so they sync with your profile.

## License

Add the license of your choice here (for example MIT).
