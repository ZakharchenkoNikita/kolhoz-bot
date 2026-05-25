import { State } from './state.js';
// 🚁 ИМПОРТ: Добавили setLotteryTickets
import { fetchState, toggleModule, toggleMaster, resetModule, setLotteryPrio, setHeliTarget, setLotteryTickets } from './api.js';
import { renderLoop, renderHouseCard } from './ui.js';
import { initAccountsDropdown, changeAccountCustom, toggleAccountStatus, loadAccounts, addNewAccount, deleteAccount } from './accounts.js';
import { switchNavView } from './settings.js';

// 1. Делаем функции глобальными, чтобы они работали через атрибут onclick="..." в HTML-коде
window.toggleModule = toggleModule;
window.resetModule = resetModule;
window.setLotteryPrio = setLotteryPrio;
window.toggleMaster = toggleMaster;
window.changeAccountCustom = changeAccountCustom;
window.toggleAccountStatus = toggleAccountStatus;
window.addNewAccount = addNewAccount;
window.deleteAccount = deleteAccount;
window.switchNavView = switchNavView;
// 🚁 ГЛОБАЛИЗАЦИЯ: Связываем функции с окном
window.setHeliTarget = setHeliTarget;
window.setLotteryTickets = setLotteryTickets;

// 2. Навешиваем слушатели на статические кнопки интерфейса
document.getElementById('account-dropdown-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('account-dropdown-menu').classList.toggle('active');
    document.getElementById('account-chevron').classList.toggle('open');
});

document.addEventListener('click', (e) => {
    const menu = document.getElementById('account-dropdown-menu');
    const chevron = document.getElementById('account-chevron');
    if (menu && menu.classList.contains('active') && !e.target.closest('.kb-account-dropdown')) {
        menu.classList.remove('active');
        chevron.classList.remove('open');
    }
});

document.getElementById('dropdown-add-btn').addEventListener('click', () => {
    document.getElementById('account-dropdown-menu').classList.remove('active');
    document.getElementById('account-chevron').classList.remove('open');
    
    document.getElementById('settings-modal').classList.add('active');
    const backdrop = document.getElementById('settings-backdrop');
    if (backdrop) backdrop.classList.add('active');
    switchNavView('view_accounts', 'Аккаунты');
});

document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('active');
    const backdrop = document.getElementById('settings-backdrop');
    if (backdrop) backdrop.classList.add('active');
    switchNavView('view_main', 'Настройки');
    loadAccounts();
});

document.getElementById('settings-close').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('active');
    const backdrop = document.getElementById('settings-backdrop');
    if (backdrop) backdrop.classList.remove('active');
});

const settingsBackdrop = document.getElementById('settings-backdrop');
if (settingsBackdrop) {
    settingsBackdrop.addEventListener('click', () => {
        document.getElementById('settings-modal').classList.remove('active');
        settingsBackdrop.classList.remove('active');
    });
}

document.getElementById('settings-back').addEventListener('click', () => {
    switchNavView('view_main', 'Настройки');
});

document.getElementById('btn-worker').addEventListener('click', async () => {
    if (!State.accountId || !State.global) return;
    let newState = !State.global.useWorkers;
    
    let workerBtn = document.getElementById('btn-worker');
    if (newState) {
        workerBtn.style.color = 'var(--text-main)';
        workerBtn.style.background = 'rgba(255,255,255,0.15)';
    } else {
        workerBtn.style.color = 'var(--text-muted)';
        workerBtn.style.background = 'rgba(255,255,255,0.05)';
    }

    await fetch('/api/account-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: State.accountId, key: 'use_workers', value: newState ? 'true' : 'false' })
    });
    fetchState();
});

// 3. ЗАПУСК БОТА
initAccountsDropdown();
setInterval(fetchState, 1000);
requestAnimationFrame(renderLoop);