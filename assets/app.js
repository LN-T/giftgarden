const app = document.getElementById('app');
const selection = {step: 0, place: null, budget: null, amount: null, tree: null, text: '', search: '', name: '', phone: '', line1: '', line2: '', prefilledLines: ['', ''], statusFilter: 'all'};
let config;

let language = 'fr';
const translate = (path, variables) => {
    const lookup = languageCode => path.split('.').reduce((node, key) => node?.[key], config.texts[languageCode]);
    const text = lookup(language) ?? lookup(config.languages.default) ?? path;
    return variables ? text.replace(/\{(\w+)\}/g, (match, name) => variables[name] ?? '') : text;
};

const isValidPhoneNumber = phoneNumber => /^\+?[\d\s().-]{6,25}$/.test(phoneNumber) && phoneNumber.replace(/\D/g, '').length >= 6;
const areContactFieldsValid = () => (!config.contact?.name?.required || selection.name.trim() !== '')
    && (selection.phone.trim() === '' ? !config.contact?.phone?.required : isValidPhoneNumber(selection.phone.trim()));

function chooseTree(treeId) {
    selection.tree = treeId;
    const tree = config.trees.find(candidateTree => candidateTree.id === treeId);
    const lineFromTree = [tree?.label ?? '', tree?.latin ? `(${tree.latin})` : ''];
    ['line1', 'line2'].forEach((lineKey, lineIndex) => {
        const visitorDidNotEditLine = selection[lineKey] === selection.prefilledLines[lineIndex];
        if (visitorDidNotEditLine) selection[lineKey] = lineFromTree[lineIndex];
    });
    selection.prefilledLines = lineFromTree;
}

const fullMessageText = () => [selection.line1, selection.line2, selection.text].map(line => line.trim()).filter(Boolean).join('\n');
const placeDisplayName = place => config.texts[language]?.places?.[place.id] ?? place.label;
const formatMoney = amount => translate('money', {n: amount});

const isPremiumTree = tree => tree.premium || (selection.place && tree.byPlace?.[selection.place]?.premium === true);
const treeAvailabilityInSelectedPlace = tree => {
    const placeRule = (selection.place && tree.byPlace?.[selection.place]) || {};
    return {status: placeRule.status ?? 'available', sponsor: placeRule.sponsor ?? null};
};
const reasonTreeCannotBeChosen = tree => {
    const budget = config.budgets.find(candidateBudget => candidateBudget.id === selection.budget), amount = selection.amount;
    const availability = treeAvailabilityInSelectedPlace(tree);
    if (availability.status === 'unavailable') return translate('reasons.place');
    if (availability.status === 'sponsored') return translate('reasons.sponsored');
    if (budget && tree.budgets && !tree.budgets.includes(budget.id)) return translate('reasons.budget');
    const isFreePriceWithTreeNotAllowedForFreePrice = budget?.free && config.freePriceTrees && !config.freePriceTrees.includes(tree.id);
    if (isFreePriceWithTreeNotAllowedForFreePrice) return translate('reasons.freePrice');
    const amountsAllowedForPremiumTrees = config.premiumAmounts;
    if (amountsAllowedForPremiumTrees && amount != null && isPremiumTree(tree) && !amountsAllowedForPremiumTrees.includes(amount)) return translate('reasons.premiumAmount', {n: amountsAllowedForPremiumTrees.map(formatMoney).join(' / ')});
    if (amount != null && tree.minAmount != null && amount < tree.minAmount) return translate('reasons.from', {n: formatMoney(tree.minAmount)});
    if (amount != null && tree.maxAmount != null && amount > tree.maxAmount) return translate('reasons.upto', {n: formatMoney(tree.maxAmount)});
    return null;
};

const buildElement = (tag, attributes = {}, ...children) => {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
        if (name === 'class') element.className = value; else if (name.startsWith('on')) element.addEventListener(name.slice(2), value); else if (value !== false && value != null) element.setAttribute(name, value);
    }
    element.append(...children);
    return element;
};

const buildChoiceButton = (label, pressed, onclick, disabled, note) =>
    buildElement('button', {class: 'choice', 'aria-pressed': pressed, disabled, onclick},
        label, note ? buildElement('small', {}, note) : '');

const formStepIds = () => ['place', 'budget', 'tree', ...(config.customText?.enabled ? ['message'] : []), 'contact', 'summary'];
const indexOfStepAfter = stepId => formStepIds().indexOf(stepId) + 1;
const isStepDone = stepId => ({place: !!selection.place, budget: !!selection.budget && selection.amount != null, tree: !!selection.tree, message: !isVisitorTextTooLong(), contact: areContactFieldsValid()})[stepId] ?? true;
let slideDirectionOfNewStep = null;
function goToStep(stepIndex) {
    slideDirectionOfNewStep = stepIndex >= selection.step ? 'next' : 'prev';
    selection.step = stepIndex;
    render();
    scrollTo({top: 0});
}

function renderStepper() {
    const stepperStepIds = ['home', ...formStepIds()], currentStepperIndex = currentView === 'home' ? 0 : selection.step + 1;
    const stepper = document.getElementById('stepper');
    stepper.hidden = currentView === 'thanks';
    stepper.classList.toggle('is-invisible', currentView === 'home');
    stepper.replaceChildren(...stepperStepIds.flatMap((stepId, stepIndex) => [
        ...(stepIndex ? [buildElement('div', {class: stepIndex <= currentStepperIndex ? 'stepper-line is-done' : 'stepper-line'})] : []),
        buildElement('button', {
            class: `stepper-step ${stepIndex < currentStepperIndex ? 'is-done' : stepIndex === currentStepperIndex ? 'is-current' : 'is-pending'}`, disabled: stepIndex >= currentStepperIndex,
            'aria-current': stepIndex === currentStepperIndex ? 'step' : null,
            onclick: () => (stepIndex === 0 ? showView('home') : goToStep(stepIndex - 1))
        }, buildElement('span', {class: 'stepper-circle'}, stepIndex < currentStepperIndex ? '✓' : String(stepIndex)), buildElement('span', {class: 'stepper-label'}, translate('stepper.' + stepId)))
    ]));
}

function updateStepNavigation() {
    if (!config) return;
    const stepIds = formStepIds(), isHome = currentView === 'home';
    document.getElementById('stepnav').hidden = currentView === 'thanks';
    renderStepper();
    document.getElementById('step-prev').disabled = isHome;
    const nextButton = document.getElementById('step-next');
    nextButton.hidden = !isHome && selection.step >= stepIds.length - 1;
    nextButton.disabled = !isHome && !isStepDone(stepIds[selection.step]);
}

function dropChosenTreeIfNoLongerAvailable() {
    const chosenTree = config.trees.find(candidateTree => candidateTree.id === selection.tree);
    if (chosenTree && reasonTreeCannotBeChosen(chosenTree)) chooseTree(null);
}

function render() {
    dropChosenTreeIfNoLongerAvailable();
    const budget = config.budgets.find(candidateBudget => candidateBudget.id === selection.budget);

    const stepIds = formStepIds();
    selection.step = Math.min(selection.step, stepIds.length - 1);
    const currentStepId = stepIds[selection.step];
    app.dataset.step = currentStepId;
    const buildSection = (sectionStepId, title, ...children) => buildElement('section', {'data-step': sectionStepId, hidden: currentStepId !== sectionStepId}, buildElement('h2', {}, title), buildElement('div', {class: 'choices'}, ...children));
    const idOfFocusedElement = document.activeElement?.id;

    const budgetChoices = config.budgets.map(budgetOption => buildChoiceButton(translate('budgets.' + budgetOption.id), selection.budget === budgetOption.id, () => {
        selection.budget = budgetOption.id;
        selection.amount = budgetOption.free ? null : budgetOption.amount;
        if (budgetOption.free) render(); else goToStep(indexOfStepAfter('budget'));
    }));
    if (budget?.free) {
        budgetChoices.push(buildElement('label', {class: 'amount'}, translate('amountLabel') + ' ',
            buildElement('input', {
                id: 'amount', type: 'number', min: budget.min ?? 1, step: 1, value: selection.amount ?? '', placeholder: translate('amountMin', {n: budget.min ?? 1}),
                oninput: event => {
                    const typedAmount = Number(event.target.value);
                    selection.amount = typedAmount >= (budget.min ?? 1) ? typedAmount : null;
                    render();
                },
                onkeydown: event => {
                    if (event.key === 'Enter' && selection.amount != null) goToStep(indexOfStepAfter('budget'));
                }
            })));
    }

    app.replaceChildren(
        buildSection('place', translate('stepper.place'), ...[...config.places].sort((leftPlace, rightPlace) => placeDisplayName(leftPlace).localeCompare(placeDisplayName(rightPlace), language)).map(place => buildElement('button', {
                class: 'choice place', 'aria-pressed': selection.place === place.id, onclick: () => {
                    selection.place = place.id;
                    goToStep(indexOfStepAfter('place'));
                }
            },
            place.image ? buildElement('img', {src: `${place.image}?width=120`, alt: '', loading: 'lazy'}) : '', placeDisplayName(place)))),
        buildSection('budget', translate('stepper.budget'), ...budgetChoices),
        buildElement('section', {'data-step': 'tree', hidden: currentStepId !== 'tree'}, buildElement('h2', {}, translate('stepper.tree')),
            ...(config.trees.length >= (config.searchMinTrees ?? 0) ? [buildElement('input', {
                id: 'search', type: 'search', placeholder: translate('searchTree'), 'aria-label': translate('searchTree'), value: selection.search,
                oninput: event => {
                    selection.search = event.target.value;
                    renderTrees();
                }
            })] : []),
            ...(selection.place ? [buildAvailabilityFilterBar()] : []),
            buildElement('div', {id: 'trees', class: 'trees'})),
        ...(config.customText?.enabled ? [buildElement('section', {'data-step': 'message', hidden: currentStepId !== 'message'},
            buildElement('h2', {}, translate('stepper.message')),
            buildElement('p', {class: 'step-sub'}, translate('steps.messageSubtitle')),
            buildElement('div', {class: 'stack'},
                buildElement('label', {}, translate('messageLine1Label'),
                    buildElement('input', {
                        id: 'line1', type: 'text', maxlength: 100, value: selection.line1, oninput: event => {
                            selection.line1 = event.target.value;
                            renderSummary();
                        }
                    })),
                buildElement('label', {}, translate('messageLine2Label'),
                    buildElement('input', {
                        id: 'line2', type: 'text', class: 'latin-input', maxlength: 100, value: selection.line2, oninput: event => {
                            selection.line2 = event.target.value;
                            renderSummary();
                        }
                    })),
                buildElement('label', {}, translate('messageLabel'),
                    buildElement('small', {class: 'example'}, translate('messageExample')),
                    buildElement('textarea', {
                        id: 'text', rows: 2,
                        oninput: event => {
                            selection.text = event.target.value;
                            updateMessageCounter();
                            renderSummary();
                        }
                    }, selection.text),
                    buildElement('small', {id: 'textcount', class: 'count'}),
                    buildElement('small', {id: 'texterror', class: 'error', role: 'alert', hidden: true})),
                buildElement('button', {id: 'message-ok', class: 'choice ok', onclick: () => goToStep(indexOfStepAfter('message'))}, translate('stepOk'))))] : []),
        buildElement('section', {'data-step': 'contact', hidden: currentStepId !== 'contact'}, buildElement('h2', {}, translate('stepper.contact')),
            buildElement('div', {class: 'fields'},
                buildElement('label', {}, translate('nameLabel'),
                    buildElement('input', {
                        id: 'name', type: 'text', maxlength: 100, autocomplete: 'name', placeholder: translate('namePlaceholder'), value: selection.name, oninput: event => {
                            selection.name = event.target.value;
                            renderSummary();
                        }
                    })),
                buildElement('label', {}, translate('phoneLabel'),
                    buildElement('input', {
                        id: 'phone', type: 'tel', autocomplete: 'tel', placeholder: translate('phonePlaceholder'), value: selection.phone,
                        oninput: event => {
                            selection.phone = event.target.value;
                            document.getElementById('phone-hint').hidden = selection.phone.trim() === '' || isValidPhoneNumber(selection.phone.trim());
                            renderSummary();
                        }
                    }),
                    buildElement('small', {id: 'phone-hint', hidden: selection.phone.trim() === '' || isValidPhoneNumber(selection.phone.trim())}, translate('phoneInvalid')))),
            buildElement('button', {id: 'contact-ok', class: 'choice ok', onclick: () => goToStep(indexOfStepAfter('contact'))}, translate('stepOk'))),
        buildElement('section', {id: 'summary', hidden: currentStepId !== 'summary'})
    );
    renderTrees();
    if (config.customText?.enabled) updateMessageCounter();
    renderSummary();
    updateStepNavigation();
    if (slideDirectionOfNewStep) {
        document.querySelectorAll('#app > section:not([hidden])').forEach(section => section.classList.add('slide-' + slideDirectionOfNewStep));
        slideDirectionOfNewStep = null;
    }
    const focusedElement = idOfFocusedElement && document.getElementById(idOfFocusedElement);
    if (focusedElement) {
        focusedElement.focus();
        if (['text', 'search', 'tel', 'textarea'].includes(focusedElement.type)) focusedElement.setSelectionRange(focusedElement.value.length, focusedElement.value.length);
    }
}

const isVisitorTextTooLong = () => config.customText?.enabled && config.customText.maxLength > 0 && selection.text.length > config.customText.maxLength;
const updateMessageCounter = () => {
    const maxLength = config.customText?.maxLength;
    const counter = document.getElementById('textcount'), errorMessage = document.getElementById('texterror');
    counter.textContent = maxLength ? `${selection.text.length} / ${maxLength}` : '';
    counter.classList.toggle('over', !!isVisitorTextTooLong());
    errorMessage.textContent = isVisitorTextTooLong() ? translate('messageTooLong', {max: maxLength}) : '';
    errorMessage.hidden = !isVisitorTextTooLong();
    document.getElementById('message-ok').disabled = !!isVisitorTextTooLong();
};

function buildAvailabilityFilterBar() {
    const buildFilterGroup = (title, filterKey, filterValues) => buildElement('div', {class: 'filter-group'}, buildElement('span', {}, title),
        ...filterValues.map(filterValue => buildElement('button', {
            class: 'chip-btn', 'aria-pressed': selection[filterKey] === filterValue, onclick: () => {
                selection[filterKey] = filterValue;
                render();
            }
        }, translate('treeStatus.' + filterValue))));
    return buildElement('div', {class: 'filters'},
        buildFilterGroup(translate('treeStatus.availability'), 'statusFilter', ['all', 'available', 'sponsored', 'unavailable']));
}

const removeAccentsAndLowerCase = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function renderTrees() {
    const normalizedQuery = removeAccentsAndLowerCase(selection.search.trim());
    const matchesStatusFilter = tree => {
        if (!selection.place) return true;
        return selection.statusFilter === 'all' || selection.statusFilter === treeAvailabilityInSelectedPlace(tree).status;
    };
    const visibleTrees = config.trees.filter(tree => (!normalizedQuery || removeAccentsAndLowerCase(tree.label).includes(normalizedQuery)) && matchesStatusFilter(tree));
    const buildTreeCard = tree => {
        const unavailableReason = reasonTreeCannotBeChosen(tree), availability = treeAvailabilityInSelectedPlace(tree);
        const buildStatusChip = status => buildElement('span', {class: `chip chip-${status}`}, translate('treeStatus.' + status));
        return buildElement('button', {
                class: isPremiumTree(tree) ? 'tree premium' : 'tree', 'aria-pressed': selection.tree === tree.id, disabled: !!unavailableReason, 'data-reason': unavailableReason,
                onclick: () => {
                    chooseTree(tree.id);
                    goToStep(indexOfStepAfter('tree'));
                }
            },
            tree.image ? buildElement('img', {src: tree.image, alt: '', loading: 'lazy'}) : buildElement('div', {class: 'noimg'}, '🌳'),
            ...(tree.latin ? [buildElement('em', {class: 'latin'}, tree.latin)] : []), buildElement('span', {}, tree.label),
            ...(selection.place ? [buildElement('div', {class: 'chips'}, buildStatusChip(availability.status))] : []),
            ...(tree.note ? [buildElement('small', {class: 'note'}, translate('treeNotes.' + tree.note))] : []),
            ...(availability.status === 'sponsored' && availability.sponsor ? [buildElement('small', {class: 'sponsor'}, translate('treeStatus.sponsoredBy', {name: availability.sponsor}))] : []),
            unavailableReason && availability.status === 'available' ? buildElement('small', {}, unavailableReason) : '');
    };
    const positionInLastIds = tree => (config.lastTreeIds ?? []).indexOf(tree.id);
    const sortTreesListedInLastIdsAfterOthers = (leftTree, rightTree) => (positionInLastIds(leftTree) === -1 ? -1 : positionInLastIds(leftTree)) - (positionInLastIds(rightTree) === -1 ? -1 : positionInLastIds(rightTree));
    const regularTrees = visibleTrees.filter(tree => !isPremiumTree(tree)).sort(sortTreesListedInLastIdsAfterOthers), premiumTrees = visibleTrees.filter(isPremiumTree).sort(sortTreesListedInLastIdsAfterOthers);
    const premiumSeparator = buildElement('div', {class: 'tree-sep', role: 'separator'}, buildElement('div', {class: 'tree-sep-text'}, buildElement('span', {}, translate('premiumTitle')), buildElement('small', {}, translate('premiumSubtitle'))));
    document.getElementById('trees').replaceChildren(...(visibleTrees.length
        ? [...regularTrees.map(buildTreeCard), ...(regularTrees.length && premiumTrees.length ? [premiumSeparator] : []), ...premiumTrees.map(buildTreeCard)]
        : [buildElement('p', {}, translate('noTree'))]));
}

function buildSummaryList() {
    const place = config.places.find(candidatePlace => candidatePlace.id === selection.place), tree = config.trees.find(candidateTree => candidateTree.id === selection.tree);
    const rows = [
        ['place', place && placeDisplayName(place)],
        ['amount', selection.amount != null && formatMoney(selection.amount)],
        ['tree', tree?.label],
        ...(config.customText?.enabled ? [['message', fullMessageText()]] : []),
        ['name', selection.name.trim()],
        ['phone', selection.phone.trim()],
    ];
    return buildElement('dl', {class: 'recap'}, ...rows.flatMap(([labelKey, value]) => [buildElement('dt', {}, translate('summary.labels.' + labelKey)), buildElement('dd', {}, value || '—')]));
}

function buildNonClickableTreeCard(tree) {
    return buildElement('div', {class: isPremiumTree(tree) ? 'tree tree-static premium' : 'tree tree-static'},
        tree.image ? buildElement('img', {src: tree.image, alt: ''}) : buildElement('div', {class: 'noimg'}, '🌳'),
        ...(tree.latin ? [buildElement('em', {class: 'latin'}, tree.latin)] : []),
        buildElement('span', {}, tree.label));
}

function renderThanksPage() {
    const shouldShowMailClientNotice = Boolean(mailWaitingForMailClient) || thanksPageState === 'pending';
    const areButtonsDisabled = thanksPageState === 'pending' || (Boolean(mailWaitingForMailClient) && !hasMailClientBeenOpened);
    const chosenTree = config.trees.find(candidateTree => candidateTree.id === selection.tree);
    document.getElementById('thanks').replaceChildren(
        buildElement('div', {class: 'thanks-emoji', 'aria-hidden': 'true'}, '🌳'),
        buildElement('h2', {}, translate('thanks.title', {name: selection.name.trim()})),
        buildElement('p', {}, translate(thanksPageState === 'sent' ? 'thanks.text' : 'thanks.textMail')),
        ...(chosenTree ? [buildNonClickableTreeCard(chosenTree)] : []),
        buildSummaryList(),
        ...(shouldShowMailClientNotice ? [buildElement('div', {class: 'warning', role: 'note'}, buildElement('p', {}, translate('mailWarning')))] : []),
        buildElement('div', {class: 'thanks-actions'},
            ...(shouldShowMailClientNotice
                ? [buildElement('button', {id: 'open-mail', class: 'choice', disabled: areButtonsDisabled, onclick: () => mailWaitingForMailClient && openMailClient(mailWaitingForMailClient.fields, mailWaitingForMailClient.subject)}, translate('thanks.openMail'))]
                : []),
            buildElement('button', {id: 'again', class: 'choice validate', disabled: areButtonsDisabled, onclick: () => resetForm('form')}, translate('thanks.again')),
            buildElement('button', {id: 'thanks-home', class: 'choice', disabled: areButtonsDisabled, onclick: () => resetForm('home')}, translate('thanks.home'))));
}

function renderSummary() {
    const summary = document.getElementById('summary');
    const place = config.places.find(candidatePlace => candidatePlace.id === selection.place), budget = config.budgets.find(candidateBudget => candidateBudget.id === selection.budget), tree = config.trees.find(candidateTree => candidateTree.id === selection.tree);
    const isReadyToSend = place && budget && selection.amount != null && tree && areContactFieldsValid() && !isVisitorTextTooLong();
    summary.replaceChildren(
        buildElement('h2', {}, translate('stepper.summary')),
        buildSummaryList(),
        ...(isReadyToSend ? [] : [buildElement('p', {class: 'hint'}, translate('summary.empty'))]),
        buildElement('button', {id: 'validate', class: 'choice validate', disabled: !isReadyToSend, onclick: () => sendMail(place, tree)}, translate('validate')));
    document.getElementById('contact-ok').disabled = !areContactFieldsValid();
    updateStepNavigation();
}

const preselectDefaultPlace = () => {
    if (config.defaultPlace != null && config.places.some(place => place.id === config.defaultPlace)) selection.place = config.defaultPlace;
};

const applyDefaultStatusFilter = () => {
    selection.statusFilter = config.defaultStatusFilter ?? 'all';
};

function resetForm(targetView) {
    Object.assign(selection, {step: 0, place: null, budget: null, amount: null, tree: null, text: '', search: '', name: '', phone: '', line1: '', line2: '', prefilledLines: ['', ''], statusFilter: 'all'});
    preselectDefaultPlace();
    applyDefaultStatusFilter();
    clearTimeout(mailClientOpeningTimer);
    mailWaitingForMailClient = null;
    hasMailClientBeenOpened = false;
    thanksPageState = 'sent';
    render();
    showView(targetView);
}

const decodedRecipientEmail = () => atob(config.email.toEncoded);
const formSubmitEndpointId = () => config.email.formsubmitId || decodedRecipientEmail();
const isFormSubmitEnabled = () => config.email.formsubmit === true;

function openMailClient(fields, subject) {
    const body = Object.entries(fields).map(([label, value]) => `${label} : ${value}`).join('\n');
    const recipient = config.email.label ? encodeURIComponent(`${config.email.label} <${decodedRecipientEmail()}>`) : decodedRecipientEmail();
    hasMailClientBeenOpened = true;
    renderThanksPage();
    location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

let mailWaitingForMailClient = null;
let hasMailClientBeenOpened = false;
let mailClientOpeningTimer = null;
let thanksPageState = 'sent';
function showThanksPageInMailClientMode(fields, subject) {
    mailWaitingForMailClient = {fields, subject};
    hasMailClientBeenOpened = false;
    thanksPageState = 'mail';
    clearTimeout(mailClientOpeningTimer);
    mailClientOpeningTimer = setTimeout(() => openMailClient(fields, subject), (config.email.mailClientDelaySeconds ?? 4) * 1000);
    renderThanksPage();
    showView('thanks');
}

async function sendMail(place, tree) {
    const fields = {[translate('mail.place')]: placeDisplayName(place), [translate('mail.amount')]: formatMoney(selection.amount), [translate('mail.tree')]: tree.label, [translate('mail.name')]: selection.name.trim(), [translate('mail.phone')]: selection.phone.trim()};
    if (fullMessageText()) fields[translate('mail.message')] = fullMessageText();
    const subject = translate('mail.subject');
    if (!isFormSubmitEnabled()) {
        showThanksPageInMailClientMode(fields, subject);
        return;
    }
    thanksPageState = 'pending';
    mailWaitingForMailClient = null;
    renderThanksPage();
    showView('thanks');
    try {
        const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(formSubmitEndpointId())}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Accept: 'application/json'},
            body: JSON.stringify({...(config.email.label ? {[translate('mail.source')]: config.email.label} : {}), ...fields, _subject: subject, _template: 'table', _honey: ''}),
        });
        const data = await response.json();
        if (!response.ok || String(data.success) !== 'true') throw new Error(data.message ?? response.status);
        thanksPageState = 'sent';
        renderThanksPage();
    } catch (error) {
        console.error(error);
        showThanksPageInMailClientMode(fields, subject);
    }
}

function showHeroImage(configuredImageUrl, catalog) {
    const heroImage = document.getElementById('hero');
    const imageCandidates = configuredImageUrl ? [configuredImageUrl] : catalog.filter(catalogTree => catalogTree.image && catalogTree.can_be_used_by_homepage_giftgarden === true).sort(() => Math.random() - 0.5).slice(0, 5)
        .flatMap(catalogTree => [catalogTree.image.replace(/\/\d+px-/, '/960px-'), catalogTree.image]);
    let candidateIndex = 0;
    const showNextCandidate = () => {
        if (candidateIndex >= imageCandidates.length) {
            heroImage.hidden = true;
            return;
        }
        heroImage.src = imageCandidates[candidateIndex++];
    };
    heroImage.onload = () => {
        heroImage.hidden = false;
    };
    heroImage.onerror = showNextCandidate;
    showNextCandidate();
}

const publishHeaderHeightToCss = () => rootElement.style.setProperty('--hh', document.querySelector('header').offsetHeight + 'px');
addEventListener('resize', publishHeaderHeightToCss);

function translateStaticTextsAndRedraw() {
    document.documentElement.lang = language;
    document.title = translate('siteTitle');
    document.getElementById('site-title').textContent = `🌳 ${translate('siteTitle')}`;
    document.getElementById('site-subtitle').textContent = translate('siteSubtitle');
    document.getElementById('home-title').textContent = translate('home.title');
    document.getElementById('home-text').textContent = translate('home.text');
    document.getElementById('go').textContent = translate('home.button');
    const backButton = document.getElementById('back');
    backButton.textContent = '🏠';
    backButton.title = backButton.ariaLabel = translate('back');
    for (const [buttonId, textKey] of [['step-prev', 'stepPrev'], ['step-next', 'stepNext']]) {
        const arrowButton = document.getElementById(buttonId);
        arrowButton.title = arrowButton.ariaLabel = translate(textKey);
    }
    const themeButton = document.getElementById('theme');
    themeButton.title = themeButton.ariaLabel = translate('themeLabel');
    const languageButton = document.getElementById('lang-btn');
    languageButton.ariaLabel = translate('langLabel');
    const currentLanguage = config.languages.available.find(availableLanguage => availableLanguage.code === language);
    languageButton.replaceChildren(...languageFlagAndLabel(currentLanguage));
    document.querySelectorAll('#lang-menu [role=option]').forEach(option => {
        option.ariaSelected = String(option.dataset.code === language);
    });
    render();
    if (currentView === 'thanks') renderThanksPage();
}

const languageFlagAndLabel = languageEntry => [...(languageEntry.flag ? [buildElement('img', {class: 'flag', src: `https://flagcdn.com/24x18/${languageEntry.flag}.png`, width: 24, height: 18, alt: ''})] : []), languageEntry.label];

function setupLanguagePicker() {
    const {available, default: defaultLanguage} = config.languages;
    let storedLanguage = null;
    try {
        storedLanguage = localStorage.getItem('giftgarden-lang');
    } catch {
    }
    language = available.some(availableLanguage => availableLanguage.code === storedLanguage) ? storedLanguage : defaultLanguage;
    const picker = document.getElementById('lang'), languageButton = document.getElementById('lang-btn'), menu = document.getElementById('lang-menu');
    picker.hidden = available.length < 2;
    const setMenuOpen = isOpen => {
        menu.hidden = !isOpen;
        languageButton.ariaExpanded = String(isOpen);
    };
    menu.replaceChildren(...available.map(availableLanguage => buildElement('li', {role: 'option', 'data-code': availableLanguage.code},
        buildElement('button', {
            onclick: () => {
                language = availableLanguage.code;
                try {
                    localStorage.setItem('giftgarden-lang', language);
                } catch {
                }
                setMenuOpen(false);
                translateStaticTextsAndRedraw();
            }
        }, ...languageFlagAndLabel(availableLanguage)))));
    languageButton.addEventListener('click', () => setMenuOpen(menu.hidden));
    document.addEventListener('click', event => {
        if (!picker.contains(event.target)) setMenuOpen(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') setMenuOpen(false);
    });
}

const loadJson = url => fetch(url).then(response => {
    if (!response.ok) throw new Error(url);
    return response.json();
});

const buildPlacesWithCityNameAndImage = (places, cities) => places.map(place => {
    const city = cities.find(candidateCity => candidateCity.id === place.id);
    if (!city) throw new Error(`Unknown city id ${place.id} in config.places`);
    return {...place, label: city.name, image: place.image ?? city.image};
});

const buildOfferedTrees = (catalog, treesConfig) => catalog
    .filter(catalogTree => catalogTree.available === true && (!treesConfig.offerTypes || treesConfig.offerTypes.includes(catalogTree.type)))
    .map(catalogTree => ({...treesConfig.byType?.[catalogTree.type], ...treesConfig.byId?.[catalogTree.id], id: catalogTree.id, label: catalogTree.name, image: catalogTree.image, latin: catalogTree.latin, premium: catalogTree.premium === true}));

loadJson('assets/config.json').then(async loadedConfig => {
    const catalog = await loadJson(loadedConfig.trees.source);
    const cities = await loadJson(loadedConfig.cities.source);
    const treesConfig = loadedConfig.trees;
    loadedConfig.places = buildPlacesWithCityNameAndImage(loadedConfig.places, cities);
    applyConfigTheme(loadedConfig.theme);
    showHeroImage(loadedConfig.home?.image, catalog);
    publishHeaderHeightToCss();
    loadedConfig.premiumAmounts = treesConfig.premiumAmounts;
    loadedConfig.searchMinTrees = treesConfig.searchMinTrees;
    loadedConfig.lastTreeIds = treesConfig.lastIds;
    loadedConfig.defaultStatusFilter = treesConfig.defaultStatusFilter;
    loadedConfig.freePriceTrees = treesConfig.freePriceTrees;
    loadedConfig.trees = buildOfferedTrees(catalog, treesConfig);
    config = loadedConfig;
    preselectDefaultPlace();
    applyDefaultStatusFilter();
    setupLanguagePicker();
    translateStaticTextsAndRedraw();
})
    .catch(error => {
        console.error(error);
        app.textContent = `Error: ${error.message}. config.json / trees.json could not be loaded (open the page through a local server).`;
    });

let currentView = 'home';
const showView = viewName => {
    currentView = viewName;
    document.getElementById('home').hidden = viewName !== 'home';
    app.hidden = viewName !== 'form';
    document.getElementById('thanks').hidden = viewName !== 'thanks';
    document.getElementById('back').hidden = viewName !== 'form';
    updateStepNavigation();
    scrollTo({top: 0});
};
document.getElementById('go').addEventListener('click', () => showView('form'));
document.getElementById('back').addEventListener('click', () => showView('home'));
document.getElementById('step-prev').addEventListener('click', () => (selection.step === 0 ? showView('home') : goToStep(selection.step - 1)));
document.getElementById('step-next').addEventListener('click', () => (currentView === 'home' ? showView('form') : goToStep(selection.step + 1)));
document.addEventListener('keydown', event => {
    const isTypingInAField = event.target.closest?.('input, textarea, select');
    const hasModifierKey = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (currentView === 'thanks' || hasModifierKey || isTypingInAField) return;
    const arrowButton = document.getElementById(event.key === 'ArrowDown' ? 'step-next' : event.key === 'ArrowUp' ? 'step-prev' : '');
    if (!arrowButton || arrowButton.hidden || arrowButton.disabled) return;
    event.preventDefault();
    arrowButton.click();
});

const rootElement = document.documentElement;
const storedTheme = () => {
    try {
        return localStorage.getItem('giftgarden-theme');
    } catch {
        return null;
    }
};
rootElement.dataset.theme = storedTheme() === 'dark' ? 'dark' : 'light';
const applyConfigTheme = themeConfig => {
    const isToggleEnabled = themeConfig?.toggle !== false;
    const mode = (isToggleEnabled && storedTheme()) || themeConfig?.default || 'light';
    rootElement.dataset.theme = mode === 'system' ? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light') : mode;
    document.getElementById('theme').hidden = !isToggleEnabled;
};
document.getElementById('theme').addEventListener('click', () => {
    rootElement.dataset.theme = rootElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
        localStorage.setItem('giftgarden-theme', rootElement.dataset.theme);
    } catch {
    }
});
