// Trees come from the catalog file (config.trees.source). Only trees with "available": true are shown (missing = false).
// config.trees.offerTypes further limits which types are offered.
// Availability rules, set in config.trees.byType / byId (keyed by the tree's integer id in the catalog; byId wins; all optional, missing = no restriction):
//   byPlace: { <city id>: { status: "unavailable" | "available" | "sponsored" (default available), sponsor: name shown when sponsored, premium: bool } }, note: key of texts.<lang>.treeNotes shown on the card, budgets: [budget ids], minAmount, maxAmount (effective amount in €)
const app = document.getElementById('app');
const sel = {place: null, budget: null, amount: null, tree: null, text: '', search: '', name: '', phone: '', line1: '', line2: '', pre: ['', ''], fStatus: 'all'};
let cfg;

// All texts live in config.texts.<lang>; {name} placeholders are filled by T(). Missing keys fall back to the default language.
let lang = 'fr';
const T = (path, vars) => {
    const get = l => path.split('.').reduce((o, k) => o?.[k], cfg.texts[l]);
    const s = get(lang) ?? get(cfg.languages.default) ?? path;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
};
// Contact fields (config.contact.<field>.required); the phone is only format-checked when filled in
const validPhone = s => /^\+?[\d\s().-]{6,25}$/.test(s) && s.replace(/\D/g, '').length >= 6;
const contactOk = () => (!cfg.contact?.name?.required || sel.name.trim() !== '')
    && (sel.phone.trim() === '' ? !cfg.contact?.phone?.required : validPhone(sel.phone.trim()));
// The message has 3 lines: French name and Latin name in parentheses of the chosen tree (prefilled, editable) and the visitor's own text.
// Choosing another tree swaps the prefilled lines unless the visitor edited them.
function setTree(id) {
    sel.tree = id;
    const tree = cfg.trees.find(x => x.id === id);
    const next = [tree?.label ?? '', tree?.latin ? `(${tree.latin})` : ''];
    ['line1', 'line2'].forEach((k, i) => {
        if (sel[k] === sel.pre[i]) sel[k] = next[i];
    });
    sel.pre = next;
}

const messageText = () => [sel.line1, sel.line2, sel.text].map(s => s.trim()).filter(Boolean).join('\n');
// Place name: texts.<lang>.places.<city id> if given (translation), otherwise the city name from the cities file
const placeLabel = p => cfg.texts[lang]?.places?.[p.id] ?? p.label;
const money = n => T('money', {n});

// Premium: the tree's own flag from the catalog, or a per-place premium flag in config byPlace.
// Premium trees can only be chosen for the amounts listed in config.trees.premiumAmounts (any amount when missing)
const isPremium = tree => tree.premium || (sel.place && tree.byPlace?.[sel.place]?.premium === true);
// Availability of a tree in the chosen place (from config byPlace; default: available)
const treeInfo = tree => {
    const pr = (sel.place && tree.byPlace?.[sel.place]) || {};
    return {status: pr.status ?? 'available', sponsor: pr.sponsor ?? null};
};
const treeReason = tree => {
    const p = sel.place, b = cfg.budgets.find(x => x.id === sel.budget), a = sel.amount;
    const info = treeInfo(tree);
    if (info.status === 'unavailable') return T('reasons.place');
    if (info.status === 'sponsored') return T('reasons.sponsored');
    if (b && tree.budgets && !tree.budgets.includes(b.id)) return T('reasons.budget');
    // With a free price (prix libre), only the trees listed in config.trees.freePriceTrees are available
    if (b?.free && cfg.freePriceTrees && !cfg.freePriceTrees.includes(tree.id)) return T('reasons.freePrice');
    const only = cfg.premiumAmounts;
    if (only && a != null && isPremium(tree) && !only.includes(a)) return T('reasons.premiumAmount', {n: only.map(money).join(' / ')});
    if (a != null && tree.minAmount != null && a < tree.minAmount) return T('reasons.from', {n: money(tree.minAmount)});
    if (a != null && tree.maxAmount != null && a > tree.maxAmount) return T('reasons.upto', {n: money(tree.maxAmount)});
    return null;
};

const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
    }
    e.append(...kids);
    return e;
};

const choice = (label, pressed, onclick, disabled, note) =>
    el('button', {class: 'choice', 'aria-pressed': pressed, disabled, onclick},
        label, note ? el('small', {}, note) : '');

function render() {
    const b = cfg.budgets.find(x => x.id === sel.budget);
    // Drop a tree choice that is no longer available after a place/budget change
    const cur = cfg.trees.find(x => x.id === sel.tree);
    if (cur && treeReason(cur)) setTree(null);

    const ready = sel.place && sel.budget && sel.amount != null && sel.tree;
    const section = (title, ...kids) => el('section', {}, el('h2', {}, title), el('div', {class: 'choices'}, ...kids));
    const focusId = document.activeElement?.id;

    const budgetKids = cfg.budgets.map(x => choice(T('budgets.' + x.id), sel.budget === x.id, () => {
        sel.budget = x.id;
        sel.amount = x.free ? null : x.amount;
        render();
    }));
    if (b?.free) {
        budgetKids.push(el('label', {class: 'amount'}, T('amountLabel') + ' ',
            el('input', {
                id: 'amount', type: 'number', min: b.min ?? 1, step: 1, value: sel.amount ?? '', placeholder: T('amountMin', {n: b.min ?? 1}),
                oninput: e => {
                    const v = Number(e.target.value);
                    sel.amount = v >= (b.min ?? 1) ? v : null;
                    render();
                }
            })));
    }

    app.replaceChildren(
        section(T('steps.place'), ...[...cfg.places].sort((a, b) => placeLabel(a).localeCompare(placeLabel(b), lang)).map(x => el('button', {
                class: 'choice place', 'aria-pressed': sel.place === x.id, onclick: () => {
                    sel.place = x.id;
                    render();
                }
            },
            x.image ? el('img', {src: `${x.image}?width=120`, alt: '', loading: 'lazy'}) : '', placeLabel(x)))),
        section(T('steps.budget'), ...budgetKids),
        el('section', {}, el('h2', {}, T('steps.tree')),
            el('input', {
                id: 'search', type: 'search', placeholder: T('searchTree'), 'aria-label': T('searchTree'), value: sel.search,
                oninput: e => {
                    sel.search = e.target.value;
                    renderTrees();
                }
            }),
            ...(sel.place ? [filterBar()] : []),
            el('div', {id: 'trees', class: 'trees'})),
        ...(cfg.customText?.enabled ? [el('section', {},
            el('h2', {}, T('steps.message')),
            el('p', {class: 'step-sub'}, T('steps.messageSubtitle')),
            el('div', {class: 'stack'},
                el('label', {}, T('messageLine1Label'),
                    el('input', {
                        id: 'line1', type: 'text', value: sel.line1, oninput: e => {
                            sel.line1 = e.target.value;
                            renderSummary();
                        }
                    })),
                el('label', {}, T('messageLine2Label'),
                    el('input', {
                        id: 'line2', type: 'text', class: 'latin-input', value: sel.line2, oninput: e => {
                            sel.line2 = e.target.value;
                            renderSummary();
                        }
                    })),
                el('label', {}, T('messageLabel'),
                    el('small', {class: 'example'}, T('messageExample')),
                    el('textarea', {
                        id: 'text', rows: 2,
                        oninput: e => {
                            sel.text = e.target.value;
                            updateCount();
                            renderSummary();
                        }
                    }, sel.text),
                    el('small', {id: 'textcount', class: 'count'}),
                    el('small', {id: 'texterror', class: 'error', role: 'alert', hidden: true}))))] : []),
        el('section', {}, el('h2', {}, T('steps.contact')),
            el('div', {class: 'fields'},
                el('label', {}, T('nameLabel'),
                    el('input', {
                        id: 'name', type: 'text', autocomplete: 'name', placeholder: T('namePlaceholder'), value: sel.name, oninput: e => {
                            sel.name = e.target.value;
                            renderSummary();
                        }
                    })),
                el('label', {}, T('phoneLabel'),
                    el('input', {
                        id: 'phone', type: 'tel', autocomplete: 'tel', placeholder: T('phonePlaceholder'), value: sel.phone,
                        oninput: e => {
                            sel.phone = e.target.value;
                            document.getElementById('phone-hint').hidden = sel.phone.trim() === '' || validPhone(sel.phone.trim());
                            renderSummary();
                        }
                    }),
                    el('small', {id: 'phone-hint', hidden: sel.phone.trim() === '' || validPhone(sel.phone.trim())}, T('phoneInvalid'))))),
        el('section', {id: 'summary'})
    );
    renderTrees();
    if (cfg.customText?.enabled) updateCount();
    renderSummary();
    const f = focusId && document.getElementById(focusId);
    if (f) {
        f.focus();
        if (['text', 'search', 'tel', 'textarea'].includes(f.type)) f.setSelectionRange(f.value.length, f.value.length);
    }
}

// The message may not exceed config.customText.maxLength (no limit when missing). Typing past it is allowed so that an
// error can be shown, but the form cannot be sent until the message is shortened.
// The limit applies to line 3 only (the visitor's own text)
const messageTooLong = () => cfg.customText?.enabled && cfg.customText.maxLength > 0 && sel.text.length > cfg.customText.maxLength;
const updateCount = () => {
    const max = cfg.customText?.maxLength;
    const count = document.getElementById('textcount'), error = document.getElementById('texterror');
    count.textContent = max ? `${sel.text.length} / ${max}` : '';
    count.classList.toggle('over', !!messageTooLong());
    error.textContent = messageTooLong() ? T('messageTooLong', {max}) : '';
    error.hidden = !messageTooLong();
};

// Filter of the tree list by availability (only once a place is chosen, as availability depends on the place)
function filterBar() {
    const group = (title, key, values) => el('div', {class: 'filter-group'}, el('span', {}, title),
        ...values.map(v => el('button', {
            class: 'chip-btn', 'aria-pressed': sel[key] === v, onclick: () => {
                sel[key] = v;
                render();
            }
        }, T('treeStatus.' + v))));
    return el('div', {class: 'filters'},
        group(T('treeStatus.availability'), 'fStatus', ['all', 'available', 'sponsored', 'unavailable']));
}

const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function renderTrees() {
    const q = norm(sel.search.trim());
    const matches = x => {
        if (!sel.place) return true;
        return sel.fStatus === 'all' || sel.fStatus === treeInfo(x).status;
    };
    const list = cfg.trees.filter(x => (!q || norm(x.label).includes(q)) && matches(x));
    const card = x => {
        const why = treeReason(x), info = treeInfo(x);
        const chip = k => el('span', {class: `chip chip-${k}`}, T('treeStatus.' + k));
        return el('button', {
                class: isPremium(x) ? 'tree premium' : 'tree', 'aria-pressed': sel.tree === x.id, disabled: !!why, title: why ?? '',
                onclick: () => {
                    setTree(x.id);
                    render();
                }
            },
            x.image ? el('img', {src: x.image, alt: '', loading: 'lazy'}) : el('div', {class: 'noimg'}, '🌳'),
            ...(x.latin ? [el('em', {class: 'latin'}, x.latin)] : []), el('span', {}, x.label),
            ...(sel.place ? [el('div', {class: 'chips'}, chip(info.status))] : []),
            ...(x.note ? [el('small', {class: 'note'}, T('treeNotes.' + x.note))] : []),
            ...(info.status === 'sponsored' && info.sponsor ? [el('small', {class: 'sponsor'}, T('treeStatus.sponsoredBy', {name: info.sponsor}))] : []),
            why && info.status === 'available' ? el('small', {}, why) : '');
    };
    // Premium trees come last, after a separator (shown only when both groups are in the list)
    const regular = list.filter(x => !isPremium(x)), premium = list.filter(isPremium);
    document.getElementById('trees').replaceChildren(...(list.length
        ? [...regular.map(card), ...(regular.length && premium.length ? [el('div', {class: 'tree-sep', role: 'separator'}, el('div', {class: 'tree-sep-text'}, el('span', {}, T('premiumTitle')), el('small', {}, T('premiumSubtitle'))))] : []), ...premium.map(card)]
        : [el('p', {}, T('noTree'))]));
}

// Recap of every field of the form, as label / value rows ("—" while a field is empty)
function summaryList() {
    const place = cfg.places.find(x => x.id === sel.place), b = cfg.budgets.find(x => x.id === sel.budget), tree = cfg.trees.find(x => x.id === sel.tree);
    const rows = [
        ['place', place && placeLabel(place)],
        ['budget', b && T('budgets.' + b.id)],
        ['amount', sel.amount != null && money(sel.amount)],
        ['tree', tree?.label],
        ...(cfg.customText?.enabled ? [['message', messageText()]] : []),
        ['name', sel.name.trim()],
        ['phone', sel.phone.trim()],
    ];
    return el('dl', {class: 'recap'}, ...rows.flatMap(([k, v]) => [el('dt', {}, T('summary.labels.' + k)), el('dd', {}, v || '—')]));
}

// Thank-you page, shown after the request has been sent
// Card of the chosen tree (photo, Latin name, name), same look as in the list but not clickable
function treeCardStatic(x) {
    return el('div', {class: isPremium(x) ? 'tree tree-static premium' : 'tree tree-static'},
        x.image ? el('img', {src: x.image, alt: ''}) : el('div', {class: 'noimg'}, '🌳'),
        ...(x.latin ? [el('em', {class: 'latin'}, x.latin)] : []),
        el('span', {}, x.label));
}

function renderThanks() {
    // The mail-client block (warning + button) is shown at once, while FormSubmit is still awaited or once it failed, so that
    // it is already there when the mail client opens; it disappears if the sending is confirmed. All the buttons are
    // disabled until the mail client has been opened (they stay disabled while FormSubmit is awaited).
    const mailBlock = Boolean(pendingMail) || thanksState === 'pending';
    const locked = thanksState === 'pending' || (Boolean(pendingMail) && !mailOpened);
    const chosen = cfg.trees.find(x => x.id === sel.tree);
    document.getElementById('thanks').replaceChildren(
        el('div', {class: 'thanks-emoji', 'aria-hidden': 'true'}, '🌳'),
        el('h2', {}, T('thanks.title', {name: sel.name.trim()})),
        el('p', {}, T(thanksState === 'sent' ? 'thanks.text' : 'thanks.textMail')),
        ...(chosen ? [treeCardStatic(chosen)] : []),
        summaryList(),
        ...(mailBlock ? [el('div', {class: 'warning', role: 'note'}, el('p', {}, T('mailWarning')))] : []),
        // All the buttons of this page share the same size (see .thanks-actions in style.css)
        el('div', {class: 'thanks-actions'},
            ...(mailBlock
                ? [el('button', {id: 'open-mail', class: 'choice', disabled: locked, onclick: () => pendingMail && openMailClient(pendingMail.fields, pendingMail.subject)}, T('thanks.openMail'))]
                : []),
            el('button', {id: 'again', class: 'choice validate', disabled: locked, onclick: () => resetForm('form')}, T('thanks.again')),
            el('button', {id: 'thanks-home', class: 'choice', disabled: locked, onclick: () => resetForm('home')}, T('thanks.home'))));
}

function renderSummary() {
    const s = document.getElementById('summary');
    const place = cfg.places.find(x => x.id === sel.place), b = cfg.budgets.find(x => x.id === sel.budget), tree = cfg.trees.find(x => x.id === sel.tree);
    const ready = place && b && sel.amount != null && tree && contactOk() && !messageTooLong();
    s.replaceChildren(
        el('h2', {}, T('summary.title')),
        summaryList(),
        ...(ready ? [] : [el('p', {class: 'hint'}, T('summary.empty'))]),
        // The mail-client warning applies when the request goes through the visitor's mail client (FormSubmit off)
        ...(!useFormSubmit() ? [el('div', {class: 'warning', role: 'note'}, el('p', {}, T('mailWarning')))] : []),
        el('button', {id: 'validate', class: 'choice validate', disabled: !ready, onclick: () => sendMail(place, tree)}, T('validate')));
}

// Starts over with an empty form after a request has been sent
// Preselects config.defaultPlace (a city id from config.places), if any
const applyDefaultPlace = () => {
    if (cfg.defaultPlace != null && cfg.places.some(p => p.id === cfg.defaultPlace)) sel.place = cfg.defaultPlace;
};

function resetForm(to) {
    Object.assign(sel, {place: null, budget: null, amount: null, tree: null, text: '', search: '', name: '', phone: '', line1: '', line2: '', pre: ['', ''], fStatus: 'all'});
    applyDefaultPlace();
    clearTimeout(mailTimer);
    pendingMail = null;
    mailOpened = false;
    thanksState = 'sent';
    render();
    showView(to);
}

// The target address is stored base64-encoded in the config (hides it from simple scrapers; this is obfuscation, not secrecy)
const emailTo = () => atob(cfg.email.toEncoded);

// FormSubmit can be switched off with config.email.formsubmit = false (anything else, or missing, means on)
const useFormSubmit = () => cfg.email.formsubmit !== false;

// Opens the visitor's mail client with the message prefilled
function openMailClient(fields, subject) {
    const body = Object.entries(fields).map(([k, v]) => `${k} : ${v}`).join('\n');
    // Recipient shown as "label <address>" when email.label is set (percent-encoded, as RFC 6068 requires)
    const recipient = cfg.email.label ? encodeURIComponent(`${cfg.email.label} <${emailTo()}>`) : emailTo();
    mailOpened = true;
    renderThanks();
    location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Mail-client mode (FormSubmit off, or FormSubmit failed): the thank-you page is shown first and the mail client opens
// a few seconds later (config.email.mailClientDelaySeconds, 4 by default). The visitor can also open it with a button.
let pendingMail = null; // {fields, subject} while the thank-you page is in mail-client mode
let mailOpened = false; // true once the mail client has been opened: only then are the buttons of the thank-you page enabled
let mailTimer = null;
function showMailClientThanks(fields, subject) {
    pendingMail = {fields, subject};
    mailOpened = false;
    thanksState = 'mail';
    clearTimeout(mailTimer);
    mailTimer = setTimeout(() => openMailClient(fields, subject), (cfg.email.mailClientDelaySeconds ?? 4) * 1000);
    renderThanks();
    showView('thanks');
}

// Sends through FormSubmit (no key; the address must be activated once via the mail FormSubmit sends).
// If that fails, or if FormSubmit is switched off, the mail client is used instead (see showMailClientThanks).
// State of the thank-you page: 'pending' (FormSubmit answer awaited, nothing is claimed yet), 'sent', or, with pendingMail set,
// the mail-client mode. The visitor is sent to the thank-you page as soon as they validate.
let thanksState = 'sent';

async function sendMail(place, tree) {
    const fields = {[T('mail.place')]: placeLabel(place), [T('mail.amount')]: money(sel.amount), [T('mail.tree')]: tree.label, [T('mail.name')]: sel.name.trim(), [T('mail.phone')]: sel.phone.trim()};
    if (messageText()) fields[T('mail.message')] = messageText();
    const subject = T('mail.subject');
    if (!useFormSubmit()) {
        showMailClientThanks(fields, subject);
        return;
    }
    // Straight to the thank-you page; the answer of FormSubmit then confirms it, or switches the page to the mail client
    thanksState = 'pending';
    pendingMail = null;
    renderThanks();
    showView('thanks');
    try {
        const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(emailTo())}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Accept: 'application/json'},
            // FormSubmit has no sender-name option: the label goes in the table as a first row
            body: JSON.stringify({...(cfg.email.label ? {[T('mail.source')]: cfg.email.label} : {}), ...fields, _subject: subject, _template: 'table'}),
        });
        const data = await r.json();
        if (!r.ok || String(data.success) !== 'true') throw new Error(data.message ?? r.status);
        thanksState = 'sent';
        renderThanks();
    } catch (err) {
        console.error(err);
        showMailClientThanks(fields, subject);
    }
}

// Home picture: config.home.image if set, otherwise a random photo among the catalog trees flagged
// can_be_used_by_homepage_giftgarden (no picture when none is flagged).
// For the random one, a larger Wikimedia thumbnail (960px) is tried first, then the catalog's own size, then another tree.
function showHeroImage(url, catalog) {
    const hero = document.getElementById('hero');
    const candidates = url ? [url] : catalog.filter(t => t.image && t.can_be_used_by_homepage_giftgarden === true).sort(() => Math.random() - 0.5).slice(0, 5)
        .flatMap(t => [t.image.replace(/\/\d+px-/, '/960px-'), t.image]);
    let i = 0;
    const next = () => {
        if (i >= candidates.length) {
            hero.hidden = true;
            return;
        }
        hero.src = candidates[i++];
    };
    hero.onload = () => {
        hero.hidden = false;
    };
    hero.onerror = next;
    next();
}

// The home page fills the screen height under the header
const setHeaderHeight = () => root.style.setProperty('--hh', document.querySelector('header').offsetHeight + 'px');
addEventListener('resize', setHeaderHeight);

// Applies the current language to every static text, then redraws the form
function applyLang() {
    document.documentElement.lang = lang;
    document.title = T('siteTitle');
    document.getElementById('site-title').textContent = `🌳 ${T('siteTitle')}`;
    document.getElementById('site-subtitle').textContent = T('siteSubtitle');
    document.getElementById('home-title').textContent = T('home.title');
    document.getElementById('home-text').textContent = T('home.text');
    document.getElementById('go').textContent = T('home.button');
    document.getElementById('back').textContent = T('back');
    const theme = document.getElementById('theme');
    theme.title = theme.ariaLabel = T('themeLabel');
    const btn = document.getElementById('lang-btn');
    btn.ariaLabel = T('langLabel');
    const cur = cfg.languages.available.find(l => l.code === lang);
    btn.replaceChildren(...langLabel(cur));
    document.querySelectorAll('#lang-menu [role=option]').forEach(o => {
        o.ariaSelected = String(o.dataset.code === lang);
    });
    render();
    if (view === 'thanks') renderThanks();
}

// Flag image (flagcdn) + label, used in the picker button and its menu
const langLabel = l => [...(l.flag ? [el('img', {class: 'flag', src: `https://flagcdn.com/24x18/${l.flag}.png`, width: 24, height: 18, alt: ''})] : []), l.label];

function setupLang() {
    const {available, default: def} = cfg.languages;
    let stored = null;
    try {
        stored = localStorage.getItem('giftgarden-lang');
    } catch {
    }
    lang = available.some(l => l.code === stored) ? stored : def;
    const picker = document.getElementById('lang'), btn = document.getElementById('lang-btn'), menu = document.getElementById('lang-menu');
    picker.hidden = available.length < 2;
    const toggle = open => {
        menu.hidden = !open;
        btn.ariaExpanded = String(open);
    };
    menu.replaceChildren(...available.map(l => el('li', {role: 'option', 'data-code': l.code},
        el('button', {
            onclick: () => {
                lang = l.code;
                try {
                    localStorage.setItem('giftgarden-lang', lang);
                } catch {
                }
                toggle(false);
                applyLang();
            }
        }, ...langLabel(l)))));
    btn.addEventListener('click', () => toggle(menu.hidden));
    document.addEventListener('click', e => {
        if (!picker.contains(e.target)) toggle(false);
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') toggle(false);
    });
}

const loadJson = url => fetch(url).then(r => {
    if (!r.ok) throw new Error(url);
    return r.json();
});
loadJson('assets/config.json').then(async c => {
    const catalog = await loadJson(c.trees.source);
    // Places are cities of the cities file, referenced by integer id: name and blason come from there (config can override `image`)
    const cities = await loadJson(c.cities.source);
    c.places = c.places.map(p => {
        const city = cities.find(x => x.id === p.id);
        if (!city) throw new Error(`Unknown city id ${p.id} in config.places`);
        return {...p, label: city.name, image: p.image ?? city.image};
    });
    applyConfigTheme(c.theme);
    showHeroImage(c.home?.image, catalog);
    setHeaderHeight();
    c.premiumAmounts = c.trees.premiumAmounts;
    c.freePriceTrees = c.trees.freePriceTrees; // c.trees is replaced by the tree list just below
    c.trees = catalog.filter(t => t.available === true && (!c.trees.offerTypes || c.trees.offerTypes.includes(t.type)))
        .map(t => ({...c.trees.byType?.[t.type], ...c.trees.byId?.[t.id], id: t.id, label: t.name, image: t.image, latin: t.latin, premium: t.premium === true}));
    cfg = c;
    applyDefaultPlace();
    setupLang();
    applyLang();
})
    .catch(err => {
        console.error(err);
        app.textContent = `Error: ${err.message}. config.json / trees.json could not be loaded (open the page through a local server).`;
    });

// The selection is kept in `sel`, so going back to the home page does not lose it
let view = 'home';
const showView = v => {
    view = v;
    document.getElementById('home').hidden = v !== 'home';
    app.hidden = v !== 'form';
    document.getElementById('thanks').hidden = v !== 'thanks';
    document.getElementById('back').hidden = v !== 'form';
    scrollTo({top: 0});
};
document.getElementById('go').addEventListener('click', () => showView('form'));
document.getElementById('back').addEventListener('click', () => showView('home'));

const root = document.documentElement;
// Theme: config.theme.default is "light" (default), "dark" or "system"; config.theme.toggle: false hides the button
const storedTheme = () => {
    try {
        return localStorage.getItem('giftgarden-theme');
    } catch {
        return null;
    }
};
root.dataset.theme = storedTheme() === 'dark' ? 'dark' : 'light';
const applyConfigTheme = th => {
    const toggle = th?.toggle !== false;
    const mode = (toggle && storedTheme()) || th?.default || 'light';
    root.dataset.theme = mode === 'system' ? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light') : mode;
    document.getElementById('theme').hidden = !toggle;
};
document.getElementById('theme').addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
        localStorage.setItem('giftgarden-theme', root.dataset.theme);
    } catch {
    }
});
