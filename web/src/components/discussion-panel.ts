type DiscussionPanelOptions = {
    ariaLabel: string;
    className?: string;
    closeAttribute: string;
    closeLabel: string;
    copyAttribute: string;
    copyLabel: string;
    copyHelp: string;
    id?: string;
    listAttribute: string;
    newAction?: { attribute: string; hidden?: boolean; label: string };
    panelAttribute?: string;
    scrimAttribute: string;
    scrimLabel: string;
    subtitle?: string;
    summaryAttribute: string;
    title: string;
};

export function createDiscussionPanel(options: DiscussionPanelOptions) {
    const scrim = document.createElement('button');
    scrim.type = 'button';
    scrim.className = 'portal-review-scrim';
    scrim.hidden = true;
    scrim.setAttribute(options.scrimAttribute, '');
    scrim.setAttribute('aria-label', options.scrimLabel);

    const panel = document.createElement('aside');
    panel.className = `portal-review-panel${options.className ? ` ${options.className}` : ''}`;
    panel.hidden = true;
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', options.ariaLabel);
    if (options.panelAttribute)
        panel.setAttribute(options.panelAttribute, '');
    if (options.id)
        panel.id = options.id;

    const header = document.createElement('header');
    const heading = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = options.title;
    const subtitle = document.createElement('span');
    subtitle.textContent = options.subtitle || '';
    subtitle.hidden = !options.subtitle;
    heading.append(title, subtitle);
    const actions = document.createElement('div');
    if (options.newAction) {
        const create = document.createElement('button');
        create.type = 'button';
        create.textContent = options.newAction.label;
        create.hidden = options.newAction.hidden === true;
        create.setAttribute(options.newAction.attribute, '');
        actions.append(create);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = options.closeLabel;
    close.setAttribute(options.closeAttribute, '');
    actions.append(close);
    header.append(heading, actions);

    const summary = document.createElement('p');
    summary.className = 'portal-review-summary';
    summary.setAttribute(options.summaryAttribute, '');
    const list = document.createElement('div');
    list.className = 'portal-review-list';
    list.setAttribute(options.listAttribute, '');
    const footer = document.createElement('footer');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'portal-review-send';
    copy.textContent = options.copyLabel;
    copy.setAttribute(options.copyAttribute, '');
    const help = document.createElement('small');
    help.textContent = options.copyHelp;
    footer.append(copy, help);
    panel.append(header, summary, list, footer);
    return { panel, scrim };
}
