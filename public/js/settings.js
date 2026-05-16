import { State } from './state.js';
import { modulesConfig } from './utils.js';
import { initDashboard } from './ui.js';

export function switchNavView(viewId, title) {
    document.querySelectorAll('.kb-nav-page').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    document.getElementById('settings-title').innerText = title;
    document.getElementById('settings-back').style.display = viewId === 'view_main' ? 'none' : 'flex';
}

export function renderSettingsList() {
    const listContainer = document.getElementById('modules-list-settings');
    listContainer.innerHTML = '';

    State.priorities.forEach(modId => {
        const mod = modulesConfig.find(m => m.id === modId);
        if (!mod) return;

        const row = document.createElement('div');
        row.className = 'kb-ios-row kb-draggable-list-item';
        row.dataset.id = mod.id;
        row.setAttribute('draggable', 'true');
        
        row.innerHTML = `
            <div class="kb-ios-icon-wrap">
                <span style="color:var(--text-muted); font-size:20px; margin-right:8px; cursor:grab;">≡</span>
                <span style="font-weight:600;">${mod.name}</span>
            </div>
        `;
        listContainer.appendChild(row);
    });

    applyDragAndDrop();
}

export function applyDragAndDrop() {
    let dragSrcEl = null;
    let tempOrder = [...State.priorities];
    const items = document.querySelectorAll('.kb-draggable-list-item');
    const container = document.getElementById('modules-list-settings');

    container.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });

    items.forEach(item => {
        item.style.order = tempOrder.indexOf(item.dataset.id);

        item.addEventListener('dragstart', (e) => {
            dragSrcEl = item;
            tempOrder = [...State.priorities];
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', item.innerHTML);
            container.classList.add('is-drag-active');
            setTimeout(() => item.classList.add('is-dragging'), 0);
        });

        item.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (dragSrcEl !== item && dragSrcEl !== null) {
                let srcId = dragSrcEl.dataset.id;
                let targetId = item.dataset.id;
                let srcIdx = tempOrder.indexOf(srcId);
                let targetIdx = tempOrder.indexOf(targetId);

                if (srcIdx > -1 && targetIdx > -1 && srcIdx !== targetIdx) {
                    tempOrder.splice(srcIdx, 1);
                    tempOrder.splice(targetIdx, 0, srcId);
                    items.forEach(t => { t.style.order = tempOrder.indexOf(t.dataset.id); });
                }
            }
        });

        item.addEventListener('dragend', (e) => {
            item.classList.remove('is-dragging');
            container.classList.remove('is-drag-active');
            if (dragSrcEl !== null) {
                State.priorities = [...tempOrder];
                fetch('/api/priorities', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: State.accountId, priorities: State.priorities })
                });
                initDashboard();
            }
            dragSrcEl = null;
        });
    });
}