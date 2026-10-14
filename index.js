import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders } from '../../../../script.js';
import * as WI from '../../../world-info.js';

const MODULE = 'bulk_non_recursable';
const TAG = '[Bulk Non-recursable]';

const defaults = {
    autoEnabled: false,
    autoPatterns: '',
    autoNotify: true,
    selected: [],
};

let settings;
let allNames = [];
const savingNow = new Set();
const pendingAuto = new Set();
let autoTimer = null;
let sweepTimer = null;

/* ---------------- helpers ---------------- */

function loadSettings() {
    extension_settings[MODULE] = Object.assign({}, defaults, extension_settings[MODULE] ?? {});
    settings = extension_settings[MODULE];
}

async function getWorldNames() {
    let names = Array.isArray(WI.world_names) ? [...WI.world_names] : [];
    if (!names.length) {
        try {
            const r = await fetch('/api/settings/get', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({}),
            });
            const d = await r.json();
            names = Array.isArray(d.world_names) ? d.world_names : [];
        } catch (e) {
            console.warn(TAG, 'could not fetch lorebook list', e);
        }
    }
    return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function patternList() {
    return String(settings.autoPatterns || '')
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean);
}

function escapeRegex(s) {
    return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function nameMatchesAuto(name) {
    const lower = String(name).toLowerCase();
    return patternList().some(p => {
        const re = new RegExp('^' + p.toLowerCase().split('*').map(escapeRegex).join('.*') + '$');
        return re.test(lower);
    });
}

/**
 * Set excludeRecursion (the "Non-recursable" checkbox) on every entry of a lorebook.
 * Only saves if something actually changed.
 */
async function processBook(name, value = true) {
    const data = await WI.loadWorldInfo(name);
    if (!data || !data.entries) return { name, total: 0, changed: 0, ok: false };

    let total = 0;
    let changed = 0;
    for (const entry of Object.values(data.entries)) {
        total++;
        if (!!entry.excludeRecursion !== value) {
            entry.excludeRecursion = value;
            changed++;
        }
    }

    if (changed > 0) {
        savingNow.add(name);
        try {
            await WI.saveWorldInfo(name, data, true);
            try { if (typeof WI.reloadEditor === 'function') WI.reloadEditor(name); } catch { /* editor refresh is optional */ }
        } finally {
            setTimeout(() => savingNow.delete(name), 1500);
        }
    }
    return { name, total, changed, ok: true };
}

/* ---------------- manual mode ---------------- */

async function runManual(value) {
    const names = settings.selected.filter(n => allNames.includes(n));
    if (!names.length) {
        toastr.warning('Select at least one lorebook first.', 'Bulk Non-recursable');
        return;
    }
    setStatus('Working…');
    let books = 0, entries = 0, changed = 0;
    for (const name of names) {
        try {
            const r = await processBook(name, value);
            if (r.ok) { books++; entries += r.total; changed += r.changed; }
        } catch (e) {
            console.error(TAG, name, e);
            toastr.error(`Failed on "${name}": ${e?.message ?? e}`, 'Bulk Non-recursable');
        }
    }
    const verb = value ? 'checked' : 'unchecked';
    const msg = `${books} lorebook(s), ${entries} entries. Non-recursable ${verb} on ${changed} entries (rest were already ${verb}).`;
    setStatus(msg);
    toastr.success(msg, 'Bulk Non-recursable');
}

/* ---------------- auto mode ---------------- */

async function flushAuto() {
    const names = [...pendingAuto];
    pendingAuto.clear();
    let changed = 0;
    for (const name of names) {
        if (savingNow.has(name)) continue;
        try {
            const r = await processBook(name, true);
            if (r.ok) changed += r.changed;
        } catch (e) {
            console.error(TAG, 'auto failed for', name, e);
        }
    }
    if (changed > 0) {
        console.log(TAG, `auto: set Non-recursable on ${changed} entries`);
        if (settings.autoNotify) toastr.info(`Non-recursable set on ${changed} new entries`, 'Bulk Non-recursable');
        setStatus(`Auto: set Non-recursable on ${changed} entries just now.`);
    }
}

function queueAuto(names) {
    if (!settings.autoEnabled) return;
    let added = false;
    for (const n of names) {
        if (!savingNow.has(n) && nameMatchesAuto(n)) { pendingAuto.add(n); added = true; }
    }
    if (!added) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(flushAuto, 1500);
}

async function sweepAuto() {
    if (!settings.autoEnabled || !patternList().length) return;
    allNames = await getWorldNames();
    queueAuto(allNames);
}

function queueSweep(delay = 3000) {
    if (!settings.autoEnabled) return;
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweepAuto, delay);
}

/* ---------------- UI ---------------- */

function setStatus(text) {
    $('#bnr_status').text(text || '');
}

function renderList() {
    const filter = String($('#bnr_filter').val() || '').toLowerCase();
    const $list = $('#bnr_list').empty();
    const visible = allNames.filter(n => n.toLowerCase().includes(filter));

    if (!visible.length) {
        $list.append($('<div class="bnr-empty"></div>').text(allNames.length ? 'No matches.' : 'No lorebooks found.'));
    }

    for (const name of visible) {
        const $cb = $('<input type="checkbox">').prop('checked', settings.selected.includes(name));
        $cb.on('change', function () {
            const set = new Set(settings.selected);
            if (this.checked) set.add(name); else set.delete(name);
            settings.selected = [...set];
            saveSettingsDebounced();
            updateCount();
        });
        const $row = $('<label class="bnr-row"></label>').append($cb, $('<span></span>').text(name));
        $list.append($row);
    }
    updateCount();
}

function updateCount() {
    const n = settings.selected.filter(x => allNames.includes(x)).length;
    $('#bnr_count').text(`${n} selected`);
}

async function refreshList() {
    allNames = await getWorldNames();
    renderList();
}

function buildUI() {
    const html = `
    <div class="bnr-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Bulk Non-recursable</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="bnr-section">
                    <h4>Manual</h4>
                    <small>Pick lorebooks, then apply to every entry in them.</small>
                    <input id="bnr_filter" class="text_pole" type="search" placeholder="Filter lorebooks…">
                    <div class="bnr-toolbar">
                        <div id="bnr_all" class="menu_button">Select shown</div>
                        <div id="bnr_none" class="menu_button">Clear</div>
                        <div id="bnr_refresh" class="menu_button" title="Reload lorebook list"><i class="fa-solid fa-rotate"></i></div>
                        <span id="bnr_count" class="bnr-count"></span>
                    </div>
                    <div id="bnr_list" class="bnr-list"></div>
                    <div class="bnr-toolbar">
                        <div id="bnr_apply" class="menu_button bnr-primary">Check Non-recursable</div>
                        <div id="bnr_undo" class="menu_button">Uncheck</div>
                    </div>
                </div>

                <hr>

                <div class="bnr-section">
                    <h4>Automatic</h4>
                    <label class="checkbox_label">
                        <input id="bnr_auto" type="checkbox">
                        <span>Auto-check Non-recursable on matching lorebooks</span>
                    </label>
                    <small>One lorebook name per line (or comma-separated). Use <code>*</code> as a wildcard, e.g. <code>Memory*</code> or <code>*Memories</code>. Case-insensitive.</small>
                    <textarea id="bnr_patterns" class="text_pole" rows="4" placeholder="Memory&#10;Memory - *"></textarea>
                    <label class="checkbox_label">
                        <input id="bnr_notify" type="checkbox">
                        <span>Show a notification when entries get fixed</span>
                    </label>
                    <div class="bnr-toolbar">
                        <div id="bnr_run_auto" class="menu_button">Run auto now</div>
                    </div>
                    <small>Runs on startup, on chat change, after each generation, and whenever a matching lorebook is saved. It only ever checks the box, never unchecks it.</small>
                </div>

                <div id="bnr_status" class="bnr-status"></div>
            </div>
        </div>
    </div>`;

    const $target = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
    $target.append(html);

    $('#bnr_auto').prop('checked', settings.autoEnabled).on('change', function () {
        settings.autoEnabled = this.checked;
        saveSettingsDebounced();
        if (this.checked) queueSweep(300);
    });
    $('#bnr_notify').prop('checked', settings.autoNotify).on('change', function () {
        settings.autoNotify = this.checked;
        saveSettingsDebounced();
    });
    $('#bnr_patterns').val(settings.autoPatterns).on('input', function () {
        settings.autoPatterns = String($(this).val());
        saveSettingsDebounced();
    });

    $('#bnr_filter').on('input', renderList);
    $('#bnr_refresh').on('click', refreshList);
    $('#bnr_all').on('click', () => {
        const filter = String($('#bnr_filter').val() || '').toLowerCase();
        const set = new Set(settings.selected);
        allNames.filter(n => n.toLowerCase().includes(filter)).forEach(n => set.add(n));
        settings.selected = [...set];
        saveSettingsDebounced();
        renderList();
    });
    $('#bnr_none').on('click', () => {
        settings.selected = [];
        saveSettingsDebounced();
        renderList();
    });
    $('#bnr_apply').on('click', () => runManual(true));
    $('#bnr_undo').on('click', () => runManual(false));
    $('#bnr_run_auto').on('click', async () => {
        if (!patternList().length) {
            toastr.warning('Add at least one lorebook name first.', 'Bulk Non-recursable');
            return;
        }
        const wasOn = settings.autoEnabled;
        settings.autoEnabled = true;
        await sweepAuto();
        settings.autoEnabled = wasOn;
        setStatus('Auto run queued…');
    });

    refreshList();
}

/* ---------------- init ---------------- */

jQuery(async () => {
    loadSettings();
    buildUI();

    if (event_types.WORLDINFO_UPDATED) {
        eventSource.on(event_types.WORLDINFO_UPDATED, (name) => {
            if (typeof name === 'string') queueAuto([name]);
        });
    }
    if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, () => queueSweep(2000));
    if (event_types.GENERATION_ENDED) eventSource.on(event_types.GENERATION_ENDED, () => queueSweep(3000));
    if (event_types.APP_READY) eventSource.on(event_types.APP_READY, () => queueSweep(2000));

    queueSweep(4000);
});
