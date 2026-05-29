import { State } from './state.js';
import { initDashboard } from './ui.js';
import { renderSettingsList } from './settings.js';
import { modulesConfig } from './utils.js'; 

export async function setLotteryPrio(prio, event) {
    event.stopPropagation();
    if (!State.accountId) return;
    
    let card = event.target.closest('.module-card');
    card.querySelectorAll('.lot-prio').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    if (State.global) State.global.lotPrio = prio;

    await fetch('/api/account-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: State.accountId, key: 'lot_prio', value: prio })
    });
}

// 🚁 ДОБАВЛЕНО: Чистая функция для настройки вертолетов
export async function setHeliTarget(target, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!State.accountId) return;

    // Мгновенный визуальный отклик интерфейса
    let card = event.target.closest('.module-card');
    if (card) {
        card.querySelectorAll('.heli-target').forEach(btn => btn.classList.remove('active'));
        event.currentTarget.classList.add('active');
    }

    if (State.global) State.global.heliTarget = target;

    await fetch('/api/account-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: State.accountId, key: 'heli_target', value: target })
    });
    fetchState();
}

// 🎟️ ДОБАВЛЕНО: Управление тумблером покупки билетов лотереи
export async function setLotteryTickets(buyTickets, event) {
    if (!State.accountId) return;

    if (State.global) State.global.lotBuyTickets = buyTickets;

    await fetch('/api/account-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: State.accountId, key: 'lot_buy_tickets', value: buyTickets ? 'true' : 'false' })
    });
    fetchState();
}

// 🧠 ДОБАВЛЕНО: Управление тумблером умной прокачки кулинарного мастерства в Погребе
export async function toggleCulinarySkill(isSkillOn, event) {
    if (!State.accountId) return;

    // Обновляем локальный стейт, чтобы фронтенд сразу отреагировал
    if (State.global) State.global.culinarySkill = isSkillOn;

    await fetch('/api/account-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: State.accountId, key: 'culinary_skill', value: isSkillOn ? 'true' : 'false' })
    });
    fetchState(); // Опционально: перезапрашиваем стейт сервера для уверенности
}

export async function toggleModule(moduleId, isEnabled) {
    if(!State.accountId) return;
    await fetch('/api/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: State.accountId, moduleName: moduleId, isEnabled }) });
}

export async function toggleMaster(isEnabled) {
    await fetch('/api/master-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isEnabled }) });
    fetchState();
}

export async function resetModule(moduleId) {
    if(!State.accountId) return;
    await fetch('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: State.accountId, moduleName: moduleId }) });
    fetchState();
}

export async function fetchState() {
    const statusText = document.getElementById('status-text');
    const masterToggle = document.getElementById('master-toggle');

    if (!State.accountId) {
        statusText.innerText = "⚪ Добавьте аккаунт в настройках";
        statusText.style.color = "var(--text-muted)";
        return;
    }

    try {
        const response = await fetch(`/api/state?accountId=${State.accountId}`);
        State.global = await response.json();
        
        if (State.global.priorities && State.priorities.length === 0) {
            State.priorities = State.global.priorities;
            initDashboard();
            renderSettingsList();
        }

        if (State.global.profile) {
            document.getElementById('header-nickname').innerText = State.global.profile.nickname || 'Kolhoz Bot';
            
            let lvlBadge = document.getElementById('header-level-badge');
            if (State.global.profile.level > 0) {
                lvlBadge.style.display = 'inline-block';
                lvlBadge.innerText = `Ур. ${State.global.profile.level}`;
            } else {
                lvlBadge.style.display = 'none';
            }

            let idBadge = document.getElementById('header-id-badge');
            if (State.global.profile.game_id && State.global.profile.game_id !== '?') {
                idBadge.style.display = 'inline-block';
                idBadge.innerText = `ID: ${State.global.profile.game_id}`;
            } else {
                idBadge.style.display = 'none';
            }
        }

        if (State.global.useWorkers !== undefined) {
            let workerBtn = document.getElementById('btn-worker');
            if (workerBtn) {
                if (State.global.useWorkers) {
                    workerBtn.style.color = 'var(--text-main)';
                    workerBtn.style.background = 'rgba(255,255,255,0.15)';
                } else {
                    workerBtn.style.color = 'var(--text-muted)';
                    workerBtn.style.background = 'rgba(255,255,255,0.05)';
                }
            }
        }
        
        if (masterToggle.checked !== State.global.masterActive) masterToggle.checked = State.global.masterActive;

        if (!State.global.masterActive) {
            statusText.innerText = "⚪ Бот выключен"; statusText.style.color = "var(--text-muted)";
            document.body.style.filter = "grayscale(60%)";
        } else {
            statusText.innerText = "🟢 Сервер подключен"; statusText.style.color = "var(--apple-green)";
            document.body.style.filter = "none";
        }

        modulesConfig.forEach(mod => {
            const isEnabled = State.global.modules[mod.id];
            const toggleEl = document.getElementById(`toggle-${mod.id}`);
            if (toggleEl && toggleEl.checked !== isEnabled) toggleEl.checked = isEnabled;
        });
    } catch (e) {
        console.error("Ошибка обновления стейта:", e); 
        State.global = null;
        statusText.innerText = "🔴 Сервер недоступен"; statusText.style.color = "var(--apple-blue)";
    }
}