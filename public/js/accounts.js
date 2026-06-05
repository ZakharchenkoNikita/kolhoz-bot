import { State } from './state.js';
import { initDashboard } from './ui.js';
import { fetchState } from './api.js';

export async function initAccountsDropdown() {
    // 1. Запрашиваем параллельно и группы, и аккаунты для скорости
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

    // --- 2. РЕНДЕР КООПЕРАТИВОВ ---
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
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">👥</span>
                    ${group.name}
                </div>
                <button onclick="event.stopPropagation(); window.deleteGroupCustom(${group.id})" style="background:none; border:none; color:#ff453a; cursor:pointer; padding:0; display:flex;" title="Распустить кооператив">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            listHtml.appendChild(item);
        });
    }

    // --- 3. РЕНДЕР АККАУНТОВ ---
    let accountFound = false;
    
    if (accounts.length > 0) {
        const accHeader = document.createElement('div');
        accHeader.className = 'kb-dropdown-header';
        accHeader.innerText = 'Аккаунты';
        listHtml.appendChild(accHeader);

        accounts.forEach(acc => {
            if (acc.id == State.accountId) accountFound = true;
            
            // Аккаунт подсвечивается только если НЕ выбрана группа
            let isActiveAcc = (acc.id == State.accountId && !State.groupId);
            let nameColor = acc.is_active ? 'white' : 'var(--text-muted)';
            
            const item = document.createElement('div');
            item.className = `kb-dropdown-item ${isActiveAcc ? 'active-acc' : ''}`;
            item.onclick = () => window.changeAccountCustom(acc.id);
            item.innerHTML = `
                <div style="font-weight:600; font-size: 15px; color: ${nameColor}; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">👤</span>
                    ${acc.username}
                </div>
                <div style="display:flex; gap:8px;" onclick="event.stopPropagation()">
                    <label class="ios-switch" style="transform: scale(0.7); margin: 0;">
                        <input type="checkbox" ${acc.is_active ? 'checked' : ''} onchange="window.toggleAccountStatus(${acc.id}, this.checked)">
                        <span class="slider"></span>
                    </label>
                    <button onclick="window.deleteAccount(${acc.id})" style="background:none; border:none; color:#ff453a; cursor:pointer; padding:0; display:flex;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            listHtml.appendChild(item);
        });
    }

    // Если ничего не выбрано (или удалили текущий) — берем первого бота
    if (!accountFound && !State.groupId && accounts.length > 0) {
        State.accountId = accounts[0].id;
        document.getElementById('header-nickname').innerText = `👤 ${accounts[0].username}`;
        fetchState();
    } else if (accountFound && !State.groupId) {
        const currAcc = accounts.find(a => a.id == State.accountId);
        if (currAcc) document.getElementById('header-nickname').innerText = `👤 ${currAcc.username}`;
    }
}

export async function changeAccountCustom(id) {
    // ➕ Прерываем только если это тот же аккаунт И мы сейчас не в группе
    if (State.accountId == id && !State.groupId) return;
    
    State.accountId = id;
    State.groupId = null; // ➕ Сбрасываем группу при переключении на бота
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
    const listContainer = document.getElementById('accounts-list');
    listContainer.innerHTML = '<div style="padding: 10px; color: var(--text-muted);">Загрузка...</div>';

    // Запрашиваем параллельно
    const [resGroups, resAccounts] = await Promise.all([
        fetch('/api/groups'),
        fetch('/api/accounts')
    ]);
    const groups = await resGroups.json();
    const accounts = await resAccounts.json();
    
    listContainer.innerHTML = '';

    if (groups.length === 0 && accounts.length === 0) {
        listContainer.innerHTML = `<div style="padding: 14px 18px; color: var(--text-muted); font-size: 14px; text-align: center;">Ничего не найдено</div>`;
        return;
    }

    // 1. Рендер групп
    groups.forEach(group => {
        const row = document.createElement('div');
        row.className = 'kb-ios-row';
        row.innerHTML = `
            <div class="kb-ios-icon-wrap">
                <span style="font-size:20px; margin-right:8px;">👥</span>
                <span style="font-weight:600; color:var(--apple-green);">${group.name}</span>
            </div>
            <button onclick="window.deleteGroupCustom(${group.id}); window.loadAccounts();" style="background:none; border:none; color:#ff453a; cursor:pointer; padding:0; display:flex;" title="Удалить">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;
        listContainer.appendChild(row);
    });

    // Разделитель
    if (groups.length > 0 && accounts.length > 0) {
        const sep = document.createElement('div');
        sep.style.cssText = "height: 1px; background: var(--glass-border); margin: 0 20px;";
        listContainer.appendChild(sep);
    }

    // 2. Рендер аккаунтов
    accounts.forEach(acc => {
        let nameColor = acc.is_active ? 'white' : 'var(--text-muted)';
        const row = document.createElement('div');
        row.className = 'kb-ios-row';
        row.innerHTML = `
            <div class="kb-ios-icon-wrap">
                <span style="font-size:20px; margin-right:8px;">👤</span>
                <span style="font-weight:600; color: ${nameColor};">${acc.username}</span>
            </div>
            <button onclick="window.deleteAccount(${acc.id})" style="background:none; border:none; color:#ff453a; cursor:pointer; padding:0; display:flex;" title="Удалить">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;
        listContainer.appendChild(row);
    });
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

export async function deleteGroupCustom(id) {
    if (!confirm('Удалить кооператив? Аккаунты останутся, но будут отвязаны от группы.')) return;
    
    await fetch('/api/groups/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    
    if (State.groupId == id) State.groupId = null;
    initAccountsDropdown();
}

export function changeGroupCustom(id, name) {
    State.groupId = id;
    State.accountId = null; 
    State.global = null; // 🧹 УБИВАЕМ СТАРЫЕ ДАННЫЕ (чтобы рендер их не вернул)
    
    document.getElementById('header-nickname').innerText = `👥 ${name}`;
    document.getElementById('account-dropdown-menu').classList.remove('active');
    document.getElementById('account-chevron').classList.remove('open');
    
    // 🧹 ЖЕСТКО ПРЯЧЕМ БЕЙДЖИ УРОВНЯ И ID
    const lvlBadge = document.getElementById('header-level-badge');
    const idBadge = document.getElementById('header-id-badge');
    if (lvlBadge) lvlBadge.style.display = 'none';
    if (idBadge) idBadge.style.display = 'none';
    
    initAccountsDropdown();
    
    const container = document.getElementById('modules-container');
    container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--apple-green); padding: 50px; font-size: 20px; font-weight: 600; border: 1px dashed var(--glass-border); border-radius: 20px;">
            Выбран кооператив: ${name}<br>
            <span style="font-size: 14px; color: var(--text-muted); font-weight: normal;">Интерфейс управления группой (Штаб) скоро появится здесь...</span>
        </div>
    `;
    
    // 🧹 ЖЕСТКО ПРЯЧЕМ ДОМИК
    const houseContainer = document.getElementById('house-container');
    if (houseContainer) houseContainer.style.display = 'none';
}