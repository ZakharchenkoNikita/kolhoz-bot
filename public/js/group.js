export async function renderGroupDashboard(groupId, groupName) {
    const container = document.getElementById('modules-container');
    const houseContainer = document.getElementById('house-container');
    
    // Прячем домик
    if (houseContainer) houseContainer.style.display = 'none';

    // Показываем красивый лоадер, так как парсеру нужно 1-2 секунды на поход в игру
    container.innerHTML = `
        <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; background: rgba(30,30,32,0.4); border-radius: 20px; border: 1px dashed var(--glass-border);">
            <div class="recipe-spinner" style="border-top-color: var(--apple-green);"></div>
            <div style="color: var(--apple-green); font-size: 18px; font-weight: 600;">Установка связи со Штабом...</div>
            <div style="color: var(--text-muted); font-size: 13px; margin-top: 8px;">Разведчик собирает актуальные данные из игры</div>
        </div>
    `;

    try {
        const res = await fetch(`/api/groups/hq-status?groupId=${groupId}`);
        const data = await res.json();

        if (!data.isOnline) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; background: rgba(255, 69, 58, 0.1); border: 1px solid rgba(255, 69, 58, 0.2); border-radius: 20px; padding: 40px 20px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">📡</div>
                    <div style="color: #ff453a; font-size: 18px; font-weight: 600;">Нет связи с кооперативом</div>
                    <div style="color: var(--text-muted); font-size: 14px; margin-top: 8px;">Для работы Штаба включите (зеленый тумблер) хотя бы один аккаунт из этой группы.</div>
                </div>
            `;
            return;
        }

        // ==========================================
        // РЕНДЕР ЛАБОРАТОРИИ
        // ==========================================
        let labHtml = '';
        if (data.lab && data.lab.isSelecting) {
            labHtml = `
                <div class="glass-panel module-card" style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 15px;">
                    <div class="module-header">
                        <div class="module-title"><span>🧪</span> Селекция кооператива</div>
                        <div class="module-controls" style="opacity: 1; pointer-events: all; transform: none;">
                            <span style="font-size: 12px; font-weight: 600; color: var(--apple-green); background: rgba(50, 215, 75, 0.15); padding: 4px 10px; border-radius: 10px;">В ПРОЦЕССЕ</span>
                        </div>
                    </div>
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px;">
                            <div style="font-size: 18px; font-weight: 600; color: white;">${data.lab.currentPlant}</div>
                            <div style="font-size: 16px; color: var(--text-muted); font-weight: 600;">${data.lab.efficiencyPercent}%</div>
                        </div>
                        <div class="progress-track" style="height: 10px; border-radius: 10px; background: rgba(255,255,255,0.05);">
                            <div class="progress-fill" style="width: ${data.lab.efficiencyPercent}%; background: var(--apple-green); border-radius: 10px; transition: width 1s ease-in-out;"></div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            labHtml = `
                <div class="glass-panel module-card" style="grid-column: 1 / -1;">
                    <div class="module-header">
                        <div class="module-title"><span>🧪</span> Селекция кооператива</div>
                    </div>
                    <div style="padding: 20px 0; text-align: center; color: var(--text-muted); font-weight: 500;">
                        Лаборатория простаивает
                    </div>
                </div>
            `;
        }

        // ==========================================
        // РЕНДЕР ГОСЗАКАЗА
        // ==========================================
        let gosHtml = '';
        if (data.goszakaz) {
            let targetsHtml = '';
            if (data.goszakaz.targets && data.goszakaz.targets.length > 0) {
                targetsHtml = data.goszakaz.targets.map(t => `
                    <div style="background: rgba(255,255,255,0.04); border: 1px solid var(--glass-border); border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; font-size: 16px; color: white;">${t.name}</span>
                        <span style="font-size: 12px; color: var(--apple-blue); background: rgba(10, 132, 255, 0.15); font-weight: 600; padding: 4px 10px; border-radius: 8px;">с ${t.minLevel} ур.</span>
                    </div>
                `).join('');
            } else {
                targetsHtml = `<div style="text-align: center; color: var(--text-muted); font-size: 14px; padding: 10px 0;">Нет активных целей</div>`;
            }

            gosHtml = `
                <div class="glass-panel module-card" style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 15px;">
                    <div class="module-header">
                        <div class="module-title"><span>📜</span> Госзаказ</div>
                        ${data.goszakaz.deadline ? `<div style="font-size: 13px; color: #ff9f0a; font-weight: 600; background: rgba(255, 159, 10, 0.15); padding: 4px 10px; border-radius: 10px;">До: ${data.goszakaz.deadline}</div>` : ''}
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${targetsHtml}
                    </div>
                </div>
            `;
        }

        // Отрисовываем всё в контейнер
        container.innerHTML = labHtml + gosHtml;

    } catch (e) {
        console.error("Ошибка загрузки Штаба:", e);
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 50px; color: #ff453a;">Ошибка соединения с сервером.</div>`;
    }
}