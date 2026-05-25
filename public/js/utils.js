import { State } from './state.js';

export const VectorIcons = {
    moneyBag: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8V6a4 4 0 0 1 8 0v2"></path><rect x="3" y="8" width="18" height="14" rx="2" ry="2"></rect><line x1="12" y1="12" x2="12" y2="18"></line><line x1="10" y1="15" x2="14" y2="15"></line></svg>`,
    star: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    ticket: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2" ry="2"></rect><line x1="8" y1="6" x2="8" y2="18"></line><line x1="18" y1="12" x2="18" y2="12"></line><line x1="14" y1="12" x2="14" y2="12"></line></svg>`,
    gear: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
};

export const MaterialIcons = {
    nail: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="M8 2h8"></path><path d="M12 22l-2-2"></path><path d="M12 22l2-2"></path></svg>`,
    board: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><line x1="6" y1="6" x2="6" y2="18"></line><line x1="18" y1="6" x2="18" y2="18"></line></svg>`,
    brick: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="12" x2="22" y2="12"></line><line x1="10" y1="4" x2="10" y2="12"></line><line x1="14" y1="12" x2="14" y2="20"></line></svg>`,
    voilok: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><path d="M4 12c3 0 5-3 8-3s5 3 8 3"></path></svg>`,
    paint: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"></path><path d="M8 10h8"></path><path d="M12 22a4 4 0 0 0 4-4H8a4 4 0 0 0 4 4z"></path><path d="M5 10a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6z"></path></svg>`,
    marble: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 12 12 22 22 12 12 2"></polygon><path d="M2 12h20"></path><path d="M12 2v20"></path></svg>`,
    glass: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`
};

export const MaterialNames = {
    nail: 'Гвозди', board: 'Доски', brick: 'Кирпичи', 
    voilok: 'Войлок', paint: 'Краска', marble: 'Мрамор', glass: 'Стекло'
};

export const modulesConfig = [
    { id: 'farm', name: '🧑‍🌾 Грядки' }, { id: 'rancho', name: '🌳 Ранчо' },
    { id: 'zagon', name: '🐮 Загоны' }, { id: 'nursery', name: '🐾 Питомник' },
    { id: 'ponds', name: '🐟 Пруды' }, { id: 'cellar', name: '🥫 Погреб' },
    { id: 'treasury', name: '💎 Казна' }, { id: 'heli', name: '🚁 Вертолет' },
    { id: 'upgrader', name: '🛠️ Улучшения' },
    { id: 'designer', name: '🛋️ Дизайнер' },
    { id: 'lottery', name: '🎲 Лотерея' }
];

export function formatTime(targetTimeMs) {
    if (targetTimeMs === -1) return { text: "MAX", isReady: true, isMax: true };
    if (!targetTimeMs || targetTimeMs === 0) return { text: "СБРОС", isReady: true };
    const diff = targetTimeMs - Date.now();
    if (diff <= 0) return { text: "ГОТОВО", isReady: true };
    const totalSecs = Math.floor(diff / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    let res = "";
    if (h > 0) res += `${h}ч `;
    if (m > 0 || h > 0) res += `${m}м `;
    res += `${s}с`;
    return { text: res.trim(), isReady: false };
}

export function getRingPercent(id, targetTimeMs) {
    if (!targetTimeMs || targetTimeMs === 0) return 0;
    const now = Date.now();
    if (targetTimeMs <= now) return 100;
    if (!State.timeCache[id] || State.timeCache[id].target !== targetTimeMs) {
        State.timeCache[id] = { target: targetTimeMs, duration: Math.max(targetTimeMs - now, 60000) };
    }
    const diff = targetTimeMs - now;
    const p = 100 - ((diff / State.timeCache[id].duration) * 100);
    return Math.min(Math.max(p, 0), 100);
}

export function getModuleActionText(moduleId) {
    const actions = {
        'farm': 'Ожидание созревания', 'rancho': 'Рост растений',
        'zagon': 'Сытые животные', 'nursery': 'Рост питомца',
        'ponds': 'Разведение рыб', 'cellar': 'Приготовление рецепта',
        'treasury': 'Накопление рубинов', 'heli': 'Ожидание вызова',
        'designer': 'Анализ интерьера', 'upgrader': 'Ожидание улучшения',
        'lottery': 'Ожидание билета'
    };
    return actions[moduleId] || 'Ожидание';
}