import { State } from './state.js';
import { initDashboard } from './ui.js';
import { fetchState } from './api.js';

export async function initAccountsDropdown() {
    const response = await fetch('/api/accounts');
    const accounts = await response.json();
    const listHtml = document.getElementById('dropdown-accounts-list');
    
    listHtml.innerHTML = '';

    if (accounts.length === 0) {
        State.accountId = null;
        listHtml.innerHTML = `<div style="padding: 14px 18px; color: var(--text-muted); font-size: 14px; text-align: center;">Нет аккаунтов</div>`;
        document.getElementById('header-nickname').innerText = 'Добавьте аккаунт';
        fetchState();
        return;
    }

    let accountFound = false;

    accounts.forEach(acc => {
        if (acc.id == State.accountId) accountFound = true;
        
        let isActiveAcc = (acc.id == State.accountId);
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

    if (!accountFound) {
        State.accountId = accounts[0].id;
        initAccountsDropdown(); 
        return;
    }
    
    fetchState();
}

export async function changeAccountCustom(id) {
    if (State.accountId == id) return;
    
    State.accountId = id;
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
    const response = await fetch('/api/accounts');
    const accounts = await response.json();
    const listContainer = document.getElementById('accounts-list');
    listContainer.innerHTML = '';

    if (accounts.length === 0) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Нет добавленных аккаунтов</div>';
        return;
    }

    accounts.forEach(acc => {
        const row = document.createElement('div');
        row.className = 'kb-ios-row no-hover';
        row.style.cursor = 'default';
        row.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 600; font-size: 16px;">${acc.username}</span>
                <span style="color: var(--text-muted); font-size: 12px; margin-top: 3px;">ID: ${acc.id}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <label class="ios-switch">
                    <input type="checkbox" onchange="window.toggleAccountStatus(${acc.id}, this.checked)" ${acc.is_active ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
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