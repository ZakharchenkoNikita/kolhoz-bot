import { State } from './state.js';
// 🚁 ИМПОРТ: Добавили setLotteryTickets
import { fetchState, toggleModule, toggleMaster, resetModule, setLotteryPrio, setHeliTarget, setLotteryTickets, toggleCulinarySkill } from './api.js';
import { renderLoop, renderHouseCard, renderRecipes } from './ui.js'; // 📖 Добавили renderRecipes
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
window.toggleCulinarySkill = toggleCulinarySkill;

// 2. Навешиваем слушатели на статические кнопки интерфейса
// 📖 Логика сворачивания групп рецептов
window.toggleRecipeGroup = function(titleElement) {
    titleElement.classList.toggle('collapsed');
    const content = titleElement.nextElementSibling;
    if (content && content.classList.contains('recipe-group-content')) {
        content.classList.toggle('collapsed');
    }
};

// ==========================================
// 🔍 ЖИВОЙ ПОИСК + ЖЕЛТЫЙ ХАЙЛАЙТЕР
// ==========================================
window.filterRecipes = function(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    const groups = document.querySelectorAll('.recipe-group-content');
    const titles = document.querySelectorAll('.recipe-group-title');

    // Экранируем спецсимволы в запросе, чтобы регулярное выражение не сломалось (защита от дурака)
    const safeQuery = lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hlRegex = safeQuery ? new RegExp(`(${safeQuery})`, 'gi') : null;

    groups.forEach((group, index) => {
        let visibleCount = 0;
        const cards = group.querySelectorAll('.recipe-card-item');
        
        cards.forEach(card => {
            // textContent проверяет весь текст в карточке
            const isMatch = card.textContent.toLowerCase().includes(lowerQuery);
            
            if (isMatch) {
                card.style.display = 'flex'; // Показываем
                visibleCount++;
            } else {
                card.style.display = 'none'; // Прячем
            }

            // 💡 ВАЖНО: обновляем подсветку во всех элементах (и в заголовках, и в тэгах)
            const hlElements = card.querySelectorAll('.hl-text');
            hlElements.forEach(el => {
                const origText = el.getAttribute('data-orig'); // Берем чистый оригинальный текст
                
                // Если есть запрос, рецепт подходит и именно в этом тэге есть совпадение
                if (isMatch && safeQuery && origText.toLowerCase().includes(lowerQuery)) {
                    el.innerHTML = origText.replace(hlRegex, '<mark class="highlight-mark">$1</mark>');
                } else {
                    el.innerHTML = origText; // Сбрасываем к оригиналу
                }
            });
        });

        // Обновляем цифры в заголовках категорий
        const titleEl = titles[index];
        if (titleEl) {
            for (let node of titleEl.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.includes('(')) {
                    const baseText = node.nodeValue.split('(')[0].trim();
                    node.nodeValue = `${baseText} (${visibleCount}) `;
                    break;
                }
            }
        }
    });
};

// 📋 Копирование ссылки рецепта
window.copyRecipeLink = function(btnElement, url, event) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

    const onSuccess = () => {
        const originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        btnElement.classList.add('success');
        setTimeout(() => {
            btnElement.innerHTML = originalHtml;
            btnElement.classList.remove('success');
        }, 1500);
    };

    if (navigator.clipboard && window.isSecureContext) {
        // Современный метод (для HTTPS и localhost)
        navigator.clipboard.writeText(url).then(onSuccess).catch(err => console.error('Ошибка копирования: ', err));
    } else {
        // Запасной метод для HTTP (работает по IP-адресам)
        try {
            const textArea = document.createElement("textarea");
            textArea.value = url;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) onSuccess();
        } catch (err) {
            console.error('Ошибка fallback копирования: ', err);
        }
    }
};

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

// Слушатели для Книги Рецептов
document.getElementById('btn-recipes').addEventListener('click', () => {
    document.getElementById('recipes-modal').classList.add('active');
    const backdrop = document.getElementById('recipes-backdrop');
    if (backdrop) backdrop.classList.add('active');
    
    // Запускаем рендер при каждом открытии окна, чтобы данные всегда были актуальными!
    renderRecipes(); 
});

document.getElementById('recipes-close').addEventListener('click', () => {
    document.getElementById('recipes-modal').classList.remove('active');
    const backdrop = document.getElementById('recipes-backdrop');
    if (backdrop) backdrop.classList.remove('active');
});

const recipesBackdrop = document.getElementById('recipes-backdrop');
if (recipesBackdrop) {
    recipesBackdrop.addEventListener('click', () => {
        document.getElementById('recipes-modal').classList.remove('active');
        recipesBackdrop.classList.remove('active');
    });
}

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