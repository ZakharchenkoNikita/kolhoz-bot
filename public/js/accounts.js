import { State } from './state.js';
import { initDashboard } from './ui.js';
import { fetchState } from './api.js';

let currentGroupsCache = [];
let selectedAccountForGroup = null;

export async function initAccountsDropdown() {
    const [resGroups, resAccounts] = await Promise.all([
        fetch('/api/groups'),
        fetch('/api/accounts')
    ]);
    const groups = await resGroups.json();
    const accounts = await resAccounts.json();
    
    const listHtml = document.getElementById('dropdown-accounts-list');
    listHtml.innerHTML = '';

    if (groups.length === 0 && accounts.length === 0) {
        State.accountId = null;
        State.groupId = null;
        listHtml.innerHTML = `<div style="padding: 14px 18px; color: var(--text-muted); font-size: 14px; text-align: center;">Нет данных</div>`;
        document.getElementById('header-nickname').innerText = 'Добавьте аккаунт';
        fetchState();
        return;
    }

    // --- РЕНДЕР КООПЕРАТИВОВ ---
    if (groups.length > 0) {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'kb-dropdown-header';
        groupHeader.innerText = 'Кооперативы';
        listHtml.appendChild(groupHeader);

        groups.forEach(group => {
            let isActiveGroup = (group.id == State.groupId);
            const item = document.createElement('div');
            item.className = `kb-dropdown-item group-item ${isActiveGroup ? 'active-acc' : ''}`;
            item.onclick = () => window.changeGroupCustom(group.id, group.name);
            item.innerHTML = `
                <div style="font-weight:600; font-size:16px; color:var(--apple-green); letter-spacing: -0.2px;">${group.name}</div>
                <button onclick="event.stopPropagation(); window.deleteGroupCustom(${group.id})" style="background:none; border:none; color:#ff453a; cursor:pointer; padding:0; display:flex;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            listHtml.appendChild(item);
        });
    }

    // --- РЕНДЕР АККАУНТОВ ---
    let accountFound = false;
    
    if (accounts.length > 0) {
        const accHeader = document.createElement('div');
        accHeader.className = 'kb-dropdown-header';
        accHeader.innerText = 'Аккаунты';
        listHtml.appendChild(accHeader);

        accounts.forEach(acc => {
            if (acc.id == State.accountId) accountFound = true;
            
            let isActiveAcc = (acc.id == State.accountId && !State.groupId);
            let nameColor = acc.is_active ? 'white' : 'var(--text-muted)';
            
            const item = document.createElement('div');
            item.className = `kb-dropdown-item ${isActiveAcc ? 'active-acc' : ''}`;
            item.onclick = () => window.changeAccountCustom(acc.id);
            item.innerHTML = `
                <div style="font-weight:600; font-size:16px; color:${nameColor}; letter-spacing: -0.2px;">${acc.username}</div>
                <label class="ios-switch" onclick="event.stopPropagation()">
                    <input type="checkbox" onchange="window.toggleAccountStatus(${acc.id}, this.checked)" ${acc.is_active ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            `;
            listHtml.appendChild(item);
        });
    }

    if (!accountFound && !State.groupId) {
        if (accounts.length > 0) {
            State.accountId = accounts[0].id;
            initAccountsDropdown(); 
            return;
        }
    }
    
    fetchState();
}

export async function changeAccountCustom(id) {
    if (State.accountId == id && !State.groupId) return;
    
    State.accountId = id;
    State.groupId = null;
    State.priorities = []; 
    
    document.getElementById('account-dropdown-menu').classList.remove('active');
    document.getElementById('account-chevron').classList.remove('open');
    
    initDashboard(); 
    initAccountsDropdown();
    await fetchState();
}

export async function toggleAccountStatus(id, is_active) {
    await fetch('/api/accounts/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active })
    });
    initAccountsDropdown();
}

export async function loadAccounts() {
    const [resGroups, resAccounts] = await Promise.all([
        fetch('/api/groups'),
        fetch('/api/accounts')
    ]);
    const groups = await resGroups.json();
    const accounts = await resAccounts.json();
    
    currentGroupsCache = groups;

    const listContainer = document.getElementById('accounts-list');
    listContainer.innerHTML = '';

    if (accounts.length === 0) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Нет добавленных аккаунтов</div>';
        return;
    }

    accounts.forEach(acc => {
        let groupNameHtml = '';
        if (acc.group_id) {
            const g = groups.find(x => x.id === acc.group_id);
            if (g) groupNameHtml = `<span style="margin-left: 8px; background: rgba(10, 132, 255, 0.15); color: var(--apple-blue); padding: 2px 6px; border-radius: 6px; font-weight: 600;">${g.name}</span>`;
        }

        const row = document.createElement('div');
        row.className = 'kb-ios-row no-hover';
        row.style.cursor = 'default';
        row.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 600; font-size: 16px;">${acc.username}</span>
                <span style="color: var(--text-muted); font-size: 12px; margin-top: 3px; display: flex; align-items: center;">ID: ${acc.id} ${groupNameHtml}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <label class="ios-switch">
                    <input type="checkbox" onchange="window.toggleAccountStatus(${acc.id}, this.checked)" ${acc.is_active ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <button onclick="event.stopPropagation(); window.openGroupSelector(${acc.id})" style="background: rgba(10, 132, 255, 0.15); color: var(--apple-blue); border: 1px solid rgba(10, 132, 255, 0.3); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" title="Привязать к кооперативу">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                </button>
                <button onclick="window.deleteAccount(${acc.id})" style="background: rgba(255, 69, 58, 0.15); color: var(--apple-red, #ff453a); border: 1px solid rgba(255, 69, 58, 0.3); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
        listContainer.appendChild(row);
    });
    
    initAccountsDropdown();
}

export async function addNewAccount() {
    const loginInput = document.getElementById('acc_login');
    const passInput = document.getElementById('acc_password');
    const username = loginInput.value.trim();
    const password = passInput.value.trim();

    if (!username || !password) {
        alert('Введите логин и пароль!');
        return;
    }

    const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    if (data.success) {
        loginInput.value = '';
        passInput.value = '';
        loadAccounts();
    } else {
        alert('Ошибка добавления! Возможно, аккаунт уже существует.');
    }
}

export async function deleteAccount(id) {
    if (!confirm('Точно удалить этот аккаунт и все его таймеры?')) return;
    await fetch('/api/accounts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    loadAccounts();
}

// ==========================================
// ЛОГИКА КООПЕРАТИВОВ И ACTION SHEET
// ==========================================
export async function deleteGroupCustom(id) {
    if (!confirm('Удалить кооператив? Аккаунты останутся, но будут отвязаны от группы.')) return;
    await fetch('/api/groups/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (State.groupId == id) State.groupId = null;
    initAccountsDropdown();
    if (window.loadAccounts) window.loadAccounts();
}

export function changeGroupCustom(id, name) {
    State.groupId = id;
    State.accountId = null; 
    State.global = null;
    
    document.getElementById('header-nickname').innerText = name;
    document.getElementById('account-dropdown-menu').classList.remove('active');
    document.getElementById('account-chevron').classList.remove('open');
    
    const lvlBadge = document.getElementById('header-level-badge');
    const idBadge = document.getElementById('header-id-badge');
    if (lvlBadge) lvlBadge.style.display = 'none';
    if (idBadge) idBadge.style.display = 'none';
    
    initAccountsDropdown();
    
    const container = document.getElementById('modules-container');
    container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--apple-green); padding: 50px; font-size: 20px; font-weight: 600; border: 1px dashed var(--glass-border); border-radius: 20px;">
            Выбран кооператив: ${name}<br>
            <span style="font-size: 14px; color: var(--text-muted); font-weight: normal;">Штаб кооператива скоро появится здесь...</span>
        </div>
    `;
    
    const houseContainer = document.getElementById('house-container');
    if (houseContainer) houseContainer.style.display = 'none';
}

function ensureActionSheetExists() {
    if (document.getElementById('group-sheet')) return;
    const html = `
        <div class="kb-action-sheet-backdrop" id="group-sheet-backdrop" onclick="window.closeGroupSelector()"></div>
        <div class="kb-action-sheet" id="group-sheet">
            <div class="kb-action-sheet-title">Выберите кооператив</div>
            <div class="kb-action-sheet-options" id="group-sheet-options"></div>
            <div class="kb-action-sheet-cancel" onclick="window.closeGroupSelector()">Отмена</div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

window.openGroupSelector = function(accountId) {
    ensureActionSheetExists();
    selectedAccountForGroup = accountId;
    
    const optionsContainer = document.getElementById('group-sheet-options');
    optionsContainer.innerHTML = '';
    optionsContainer.innerHTML += `<div class="kb-action-sheet-btn danger" onclick="window.bindAccountToGroup(null)">Отвязать от кооператива</div>`;

    currentGroupsCache.forEach(g => {
        optionsContainer.innerHTML += `<div class="kb-action-sheet-btn" onclick="window.bindAccountToGroup(${g.id})">${g.name}</div>`;
    });

    document.getElementById('group-sheet-backdrop').classList.add('active');
    document.getElementById('group-sheet').classList.add('active');
};

window.closeGroupSelector = function() {
    const backdrop = document.getElementById('group-sheet-backdrop');
    const sheet = document.getElementById('group-sheet');
    if (backdrop) backdrop.classList.remove('active');
    if (sheet) sheet.classList.remove('active');
    selectedAccountForGroup = null;
};

window.bindAccountToGroup = async function(groupId) {
    if (!selectedAccountForGroup) return;
    await fetch('/api/accounts/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedAccountForGroup, groupId: groupId })
    });
    window.closeGroupSelector();
    loadAccounts(); 
    initAccountsDropdown(); 
};

window.changeGroupCustom = changeGroupCustom;
window.deleteGroupCustom = deleteGroupCustom;