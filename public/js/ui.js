import { State } from './state.js';
import { VectorIcons, MaterialIcons, MaterialNames, modulesConfig, formatTime, getRingPercent, getModuleActionText } from './utils.js';
import { fetchRecipesData } from './api.js';

// ==========================================
// 1. КЭШ DOM-ЭЛЕМЕНТОВ (Для молниеносного рендера)
// ==========================================
const DOM = {};

// ==========================================
// ФАБРИКА ВИДЖЕТОВ: Сборка ультра-компактного окна настроек
// ==========================================
function buildModuleSettingsHtml(modId) {
    let title = '';
    let content = '';

    if (modId === 'cellar') {
        title = 'Настройки Погреба';
        let isSkillOn = (State.global && State.global.culinary_skill === 'true');
        
        content = `
            <div class="settings-row">
                <span class="settings-label">Умная прокачка (1 банка)</span>
                <label class="ios-switch">
                    <input type="checkbox" ${isSkillOn ? 'checked' : ''} onchange="window.toggleCulinarySkill(this.checked, event)">
                    <span class="slider"></span>
                </label>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; line-height: 1.2;">
                Вкл: качает мастерство недокачанных рецептов.<br>
                Выкл: ставит выбранный рецепт на все полки (фарм).
            </div>
        `;
    }

    if (modId === 'lottery') {
        title = 'Настройки Лотереи';
        let currentPrio = (State.global && State.global.lotPrio) ? State.global.lotPrio : 'price';
        let buyTickets = (State.global && State.global.lotBuyTickets !== false); 

        content = `
            <div class="settings-row">
                <span class="settings-label">Покупать билеты</span>
                <label class="ios-switch">
                    <input type="checkbox" ${buyTickets ? 'checked' : ''} onchange="window.setLotteryTickets(this.checked, event)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="settings-row">
                <span class="settings-label">Приоритет</span>
                <div style="display: flex; gap: 4px;">
                    <div class="kb-mini-btn lot-prio ${currentPrio === 'price' ? 'active' : ''}" title="Снижать цену" onclick="window.setLotteryPrio('price', event)">${VectorIcons.moneyBag}</div>
                    <div class="kb-mini-btn lot-prio ${currentPrio === 'exp' ? 'active' : ''}" title="Растить выигрыш" onclick="window.setLotteryPrio('exp', event)">${VectorIcons.star}</div>
                    <div class="kb-mini-btn lot-prio ${currentPrio === 'limit' ? 'active' : ''}" title="Увеличить лимит" onclick="window.setLotteryPrio('limit', event)">${VectorIcons.ticket}</div>
                </div>
            </div>
        `;
    } else if (modId === 'heli') {
        title = 'Настройки Вертолета';
        let currentTarget = (State.global && State.global.heliTarget) ? State.global.heliTarget : 'thunder_or_alt';
        
        content = `
            <div class="settings-row" style="align-items: center;">
                <span class="settings-label">Цель вызова</span>
                <div style="display: flex; gap: 6px;">
                    <div class="kb-mini-btn heli-target ${currentTarget === 'only_hawk' ? 'active' : ''}" style="width: 75px; height: 30px; display: flex; align-items: center; justify-content: center; gap: 4px;" title="Только Ястреб" onclick="window.setHeliTarget('only_hawk', event)">
                        <img src="https://sadovnik.mobi/images/hawk1.png" style="width: 16px; height: 16px; object-fit: contain;">
                        <span style="font-size: 12px; font-weight: 500;">Ястреб</span>
                    </div>
                    <div class="kb-mini-btn heli-target ${currentTarget === 'thunder_or_alt' ? 'active' : ''}" style="width: 75px; height: 30px; display: flex; align-items: center; justify-content: center; gap: 4px;" title="Гром и аналоги" onclick="window.setHeliTarget('thunder_or_alt', event)">
                        <img src="https://sadovnik.mobi/images/grom1.png" style="width: 16px; height: 16px; object-fit: contain;">
                        <span style="font-size: 12px; font-weight: 500;">Гром</span>
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="settings-overlay-header">
            <div class="settings-overlay-title">${title}</div>
            <button class="btn-close-settings" onclick="window.toggleModuleSettings('${modId}', event)">
                ${VectorIcons.close}
            </button>
        </div>
        <div class="settings-overlay-content">
            ${content}
        </div>
    `;
}

// Глобальная функция для открытия/закрытия шторки
window.toggleModuleSettings = function(modId, event) {
    if(event) event.stopPropagation();
    const card = document.getElementById(`card-${modId}`);
    const overlay = document.getElementById(`settings-overlay-${modId}`);
    if(!card || !overlay) return;

    if (!card.classList.contains('show-settings')) {
        overlay.innerHTML = buildModuleSettingsHtml(modId);
        card.classList.add('show-settings');
    } else {
        card.classList.remove('show-settings');
    }
};

export function initDashboard() {
    const container = document.getElementById('modules-container');
    const svgReset = document.getElementById('svg-reset').innerHTML;
    container.innerHTML = ''; 

    let renderOrder = State.priorities.length > 0 ? State.priorities : modulesConfig.map(m => m.id);

    renderOrder.forEach(modId => {
        const mod = modulesConfig.find(m => m.id === modId);
        if (!mod) return;

        const card = document.createElement('div');
        card.className = 'glass-panel module-card';
        card.id = `card-${mod.id}`;
        
        const emoji = mod.name.split(' ')[0];
        const title = mod.name.substring(mod.name.indexOf(' ') + 1);
        
        let gearBtn = '';
        if (mod.id === 'lottery' || mod.id === 'heli' || mod.id === 'cellar') {
            gearBtn = `
                <button class="btn-reset" onclick="window.toggleModuleSettings('${mod.id}', event)" title="Настройки">
                    ${VectorIcons.gear}
                </button>
            `;
        }

        card.innerHTML = `
            <div class="module-header">
                <div class="module-title">
                    <span>${emoji}</span> ${title}
                </div>
                <div class="module-controls">
                    ${gearBtn}
                    <button class="btn-reset" onclick="window.resetModule('${mod.id}')" title="Сбросить таймер">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svgReset}</svg>
                    </button>
                    <label class="ios-switch">
                        <input type="checkbox" id="toggle-${mod.id}" onchange="window.toggleModule('${mod.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            <div class="module-body">
                <div class="timer-details">
                    <div class="timer" id="timer-${mod.id}">--:--</div>
                    <div class="status" id="status-${mod.id}">Загрузка...</div>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" id="prog-${mod.id}"></div>
                </div>
            </div>
            <div class="module-settings-overlay" id="settings-overlay-${mod.id}"></div>
        `;
        container.appendChild(card);

        DOM[mod.id] = {
            card: card,
            timer: card.querySelector(`#timer-${mod.id}`),
            status: card.querySelector(`#status-${mod.id}`),
            prog: card.querySelector(`#prog-${mod.id}`)
        };
    });
}

// ==========================================
// 2. МИКРО-СТРАТЕГИИ ДЛЯ УНИКАЛЬНЫХ МОДУЛЕЙ
// ==========================================

function handleLotteryUI(ui, globalState, timeInfo, percent) {
    let ticketTime = globalState.timers.lotteryTicket || 0;
    let ticketInfo = formatTime(ticketTime);
    let buyTickets = (globalState.lotBuyTickets !== false); 

    if (timeInfo.isMax) {
        ui.timerText = ticketInfo.isReady ? "Билет готов!" : ticketInfo.text;
        ui.timerColor = ticketInfo.isReady ? "var(--apple-green)" : "var(--text-main)";
        
        if (!buyTickets) {
            ui.statusText = "Покупка билетов отключена";
            ui.statusColor = "#ff453a";
        } else {
            ui.statusText = "Полностью прокачана";
            ui.statusColor = "#ffcc00"; 
        }
        
        let ticketPercent = getRingPercent('lottery', ticketTime);
        ui.progWidth = `${ticketPercent}%`;
        ui.progColor = ticketInfo.isReady ? "var(--apple-green)" : "var(--apple-blue)";
    } 
    else if (!timeInfo.isReady) {
        if (!buyTickets) {
            ui.statusText = "Покупка билетов отключена";
            ui.statusColor = "#ff453a";
        } else if (ticketInfo.isReady) {
            ui.statusText = "Билет: Готово!";
            ui.statusColor = "var(--apple-green)";
        } else {
            ui.statusText = `Ожидание билета: ${ticketInfo.text}`;
        }
    }
}

function handleNurseryUI(ui, globalState, timeInfo, percent) {
    if (!timeInfo.isMax && !timeInfo.isReady && globalState.nursery_tasks) {
        let tasksArr = Object.values(globalState.nursery_tasks);
        if (tasksArr.length > 0) {
            tasksArr.sort((a, b) => {
                if ((b.z > 0) !== (a.z > 0)) return b.z > 0 ? 1 : -1;
                return b.pts - a.pts;
            });
            let mainTask = tasksArr[0];
            ui.statusText = `Квест: ${mainTask.name} (${mainTask.z}/${mainTask.w})`;
            if (tasksArr.length > 1) {
                ui.statusText += ` (+${tasksArr.length - 1})`;
            }
        } else {
            ui.statusText = "Ожидание заданий";
        }
    }
}

function handleUpgraderUI(ui, globalState, timeInfo, percent) {
    if (!timeInfo.isMax && !timeInfo.isReady && globalState.upgrade_info) {
        ui.statusText = globalState.upgrade_info;
    }
}

function handleHeliUI(ui, globalState, timeInfo, percent) {
}

const UI_STRATEGIES = {
    'lottery': handleLotteryUI,
    'nursery': handleNurseryUI,
    'upgrader': handleUpgraderUI,
    'heli': handleHeliUI
};

// ==========================================
// 3. КОНВЕЙЕР: Расчет базового состояния интерфейса
// ==========================================
function calculateModuleUI(modId, globalState) {
    // 🔒 Читаем требования к уровню напрямую из конфига
    const modConfig = modulesConfig.find(m => m.id === modId);
    const reqLevel = modConfig ? modConfig.level : 0;
    let currentLevel = (globalState.profile && globalState.profile.level) ? globalState.profile.level : 0;
    
    // Блокируем интерфейс, если уровень меньше нужного
    if (currentLevel > 0 && currentLevel < reqLevel) {
        return {
            isLocked: true,
            opacity: "0.5",
            timerText: "🔒",
            timerColor: "var(--text-muted)",
            statusText: `Откроется на ${reqLevel} уровне`,
            statusColor: "#ff9f0a", 
            progWidth: "0%",
            progColor: "rgba(255,255,255,0.05)"
        };
    }

    const isEnabled = globalState.modules[modId];
    let targetTime = globalState.timers[modId];
    
    if (modId === 'ponds') {
        targetTime = Math.min(globalState.timers.pondsFeed || Infinity, globalState.timers.pondsGrow || Infinity);
        if (targetTime === Infinity) targetTime = 0;
    }

    if (!isEnabled || !globalState.masterActive) {
        return {
            isLocked: false,
            opacity: "0.5",
            timerText: "ВЫКЛ", timerColor: "var(--text-main)",
            statusText: "Остановлен", statusColor: "",
            progWidth: "0%", progColor: "rgba(255,255,255,0.1)"
        };
    }

    const timeInfo = formatTime(targetTime);
    const percent = targetTime === -1 ? 100 : getRingPercent(modId, targetTime);
    
    let ui = {
        isLocked: false,
        opacity: "1",
        timerText: timeInfo.text, timerColor: "",
        statusText: "", statusColor: "",
        progWidth: `${percent}%`, progColor: ""
    };

    if (timeInfo.isMax) {
        ui.timerColor = "#ffcc00"; 
        ui.statusText = "Полностью прокачана"; 
        ui.progColor = "#ffcc00";
    } else if (timeInfo.isReady) {
        ui.timerColor = "var(--apple-green)"; 
        ui.statusText = "Выполняется работа...";
        ui.progWidth = "100%"; 
        ui.progColor = "var(--apple-green)";
    } else {
        ui.timerColor = "var(--text-main)"; 
        ui.statusText = getModuleActionText(modId);
        ui.progColor = percent > 90 ? "#ff9f0a" : "var(--apple-blue)";
    }

    if (UI_STRATEGIES[modId]) {
        UI_STRATEGIES[modId](ui, globalState, timeInfo, percent);
    }

    return ui;
}

// ==========================================
// 4. КИСТОЧКА: Применение стилей к кэшу (Молниеносный цикл)
// ==========================================
export function renderLoop() {
    if (State.global && State.priorities.length > 0) {
        modulesConfig.forEach(mod => {
            const el = DOM[mod.id];
            if (!el) return; 

            const uiConfig = calculateModuleUI(mod.id, State.global);

            el.card.style.opacity = uiConfig.opacity;
            el.timer.innerText = uiConfig.timerText;
            el.timer.style.color = uiConfig.timerColor;
            el.status.innerText = uiConfig.statusText;
            el.status.style.color = uiConfig.statusColor;
            el.prog.style.setProperty('--p', uiConfig.progWidth);
            el.prog.style.setProperty('--prog-color', uiConfig.progColor);

            // 🔒 Скрываем тумблер и кнопки, если модуль заблокирован уровнем
            const controls = el.card.querySelector('.module-controls');
            if (controls) {
                controls.style.display = uiConfig.isLocked ? 'none' : ''; 
            }
        });
    }
    
    if (State.global && State.global.profile) {
        renderHouseCard(State.global.profile);
    }
    
    requestAnimationFrame(renderLoop);
}

export function renderHouseCard(profile) {
    const container = document.getElementById('house-container');
    if (!profile || !profile.materials || Object.keys(profile.materials).length === 0) {
        container.style.display = 'none'; 
        return;
    }
    
    container.style.display = 'block';
    const isBuilding = profile.is_building;
    const matKeys = ['nail', 'board', 'brick', 'voilok', 'paint', 'marble', 'glass'];
    
    let materialsHtml = '';
    matKeys.forEach(key => {
        const mat = profile.materials[key];
        if (!mat) return;
        
        let isDone = !mat.required || (mat.today >= mat.limit) || (mat.have >= mat.need);
        let percent = mat.limit > 0 ? (mat.today / mat.limit) * 100 : 0;
        
        materialsHtml += `
            <div class="mat-item ${isDone && !isBuilding ? 'done' : ''}">
                <div class="mat-top">
                    <div class="mat-icon">${MaterialIcons[key]}</div>
                    <div class="mat-name">${MaterialNames[key]}</div>
                </div>
                <div class="mat-progress-text">${isBuilding ? `${mat.have} шт.` : `${mat.today} / ${mat.limit}`}</div>
                ${!isBuilding ? `<div class="mat-bar-bg"><div class="mat-bar-fill" style="width:${Math.min(percent, 100)}%"></div></div>` : ''}
            </div>`;
    });

    container.innerHTML = `
        <div class="house-card">
            <div class="house-header">
                <div class="house-title">🏠 Домик</div>
                <div class="house-status ${isBuilding ? 'status-building' : 'status-gathering'}">${isBuilding ? 'ИДЕТ СТРОИТЕЛЬСТВО' : 'СБОР СТРОЙМАТЕРИАЛОВ'}</div>
            </div>
            <div class="materials-grid">${materialsHtml}</div>
        </div>`;
}

// ==========================================
// 📖 РЕНДЕР КНИГИ РЕЦЕПТОВ
// ==========================================
export async function renderRecipes() {
    const container = document.getElementById('recipes-modal-body');
    if (!container) return;

    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Загрузка рецептов...</div>';

    const data = await fetchRecipesData();
    if (!data) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff453a;">Ошибка загрузки базы рецептов</div>';
        return;
    }

    // Вспомогательная функция для генерации карточек
    const generateCards = (recipes, isLocked, isMaxed) => {
        if (!recipes || recipes.length === 0) {
            return `<div style="padding: 10px 20px; color: var(--text-muted); font-size: 14px;">В этой категории пока пусто</div>`;
        }
        
        return recipes.map(r => {
            let tagsHtml = '';
            
            if (isMaxed) tagsHtml += `<div class="recipe-tag recipe-tag-max">✨ Идеальный</div>`;

            if (isLocked) {
                r.requirements.forEach(req => {
                    tagsHtml += `<div class="recipe-tag recipe-tag-req">${req}</div>`;
                });
            } else if (r.unlocksNext && r.unlocksNext.length > 0) {
                r.unlocksNext.forEach(un => {
                    tagsHtml += `<div class="recipe-tag recipe-tag-unlocks">Открывает: ${un}</div>`;
                });
            }

            return `
            <div class="kb-ios-card recipe-card-item" style="padding: 14px 20px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; ${isLocked ? 'opacity: 0.6;' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="font-size: 16px; font-weight: 600; ${isLocked ? 'color: var(--text-muted);' : ''}">
                            ${r.name} <span style="font-size:12px; color:var(--text-muted); font-weight:normal;">(Ур. ${r.level})</span>
                        </div>
                        <div class="recipe-copy-btn" onclick="window.copyRecipeLink(this, '${r.copyUrl}', event)" title="Скопировать команду">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </div>
                    </div>
                </div>
                ${tagsHtml ? `<div style="display: flex; flex-wrap: wrap; gap: 6px;">${tagsHtml}</div>` : ''}
            </div>
            `;
        }).join('');
    };

    let html = '';

    // 1. Доступно к изучению
    html += `
        <div class="kb-ios-group-title recipe-group-title" onclick="window.toggleRecipeGroup(this)">
            Доступно к изучению (${data.available.length})
            <svg class="recipe-group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="recipe-group-content">
            ${generateCards(data.available, false, false)}
        </div>
    `;

    // 2. Заблокировано
    html += `
        <div class="kb-ios-group-title recipe-group-title collapsed" onclick="window.toggleRecipeGroup(this)">
            Заблокировано (${data.locked.length})
            <svg class="recipe-group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="recipe-group-content collapsed">
            ${generateCards(data.locked, true, false)}
        </div>
    `;

    // 3. Изучено
    html += `
        <div class="kb-ios-group-title recipe-group-title" onclick="window.toggleRecipeGroup(this)">
            Изучено (${data.maxed.length})
            <svg class="recipe-group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="recipe-group-content">
            ${generateCards(data.maxed, false, true)}
        </div>
    `;

    container.innerHTML = html;
}