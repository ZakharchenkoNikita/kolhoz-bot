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
                <div class="glass-panel module-card" style="display: flex; flex-direction: column; gap: 20px; padding: 20px; height: 100%; box-sizing: border-box;">
                    <div class="module-header" style="margin: 0;">
                        <div class="module-title"><span>🧪</span> Селекция</div>
                        <div class="module-controls" style="opacity: 1; pointer-events: all; transform: none;">
                            <span style="font-size: 11px; font-weight: 700; color: var(--apple-green); background: rgba(50, 215, 75, 0.12); padding: 4px 10px; border-radius: 12px; letter-spacing: 0.5px;">В ПРОЦЕССЕ</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 16px;">
                        ${data.lab.image ? `<img src="https://sadovnik.mobi${data.lab.image}" style="width: 56px; height: 56px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 4px 12px rgba(0,0,0,0.3);">` : ''}
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="font-size: 19px; font-weight: 700; color: white; letter-spacing: -0.3px;">${data.lab.currentPlant}</div>
                                <button onclick="window.startPlanting('${data.lab.currentPlant}', 'lab')" style="background: rgba(50, 215, 75, 0.15); border: 1px solid rgba(50, 215, 75, 0.2); width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--apple-green); cursor: pointer; padding: 0; transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.9)'" onmouseup="this.style.transform='scale(1)'" title="Посадить селекцию">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><path d="M5 3l14 9-14 9V3z"/></svg>
                                </button>
                            </div>
                            <div style="font-size: 13px; color: var(--text-muted); font-weight: 500;">
                                ${data.lab.timeClock ? `⏱ ${data.lab.timeClock}` : ''} ${data.lab.timeSoil ? `&nbsp; 🌱 ${data.lab.timeSoil}` : ''}
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: auto;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                            <span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">Собрано урожая: <span style="color: white;">${data.lab.harvestCount || '0'}</span></span>
                            <span style="font-size: 20px; color: var(--apple-green); font-weight: 700; letter-spacing: -0.5px;">${data.lab.efficiencyPercent}%</span>
                        </div>
                        <div class="progress-track" style="height: 12px; border-radius: 6px; background: rgba(255,255,255,0.06); overflow: hidden;">
                            <div class="progress-fill" style="width: ${data.lab.efficiencyPercent}%; background: var(--apple-green); border-radius: 6px; height: 100%; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            labHtml = `
                <div class="glass-panel module-card" style="display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 40px 20px; height: 100%; box-sizing: border-box;">
                    <div style="font-size: 32px; margin-bottom: 10px;">🧪</div>
                    <div style="font-size: 16px; font-weight: 600; color: white;">Селекция</div>
                    <div style="padding: 5px 0; text-align: center; color: var(--text-muted); font-weight: 500; font-size: 13px;">Лаборатория простаивает</div>
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
                targetsHtml = `
                    <div style="display: flex; flex-direction: column; gap: 20px;">
                        ${data.goszakaz.targets.map((t) => {
                            const levelBadge = t.minLevel > 1 
                                ? `<span style="font-size: 11px; font-weight: 700; color: var(--apple-blue); background: rgba(10, 132, 255, 0.12); padding: 4px 10px; border-radius: 12px; letter-spacing: 0.5px; white-space: nowrap;">с ${t.minLevel} ур.</span>` 
                                : '';
                            
                            return `
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                                    <div style="display: flex; align-items: center; gap: 16px;">
                                        ${t.image ? `<img src="https://sadovnik.mobi${t.image}" style="width: 56px; height: 56px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 4px 12px rgba(0,0,0,0.3);">` : ''}
                                       <div style="display: flex; flex-direction: column; gap: 4px;">
                                            <div style="display: flex; align-items: center; gap: 10px;">
                                                <div style="font-size: 19px; font-weight: 700; color: white; letter-spacing: -0.3px;">${t.name}</div>
                                                <button onclick="window.startPlanting('${t.name}', 'goszakaz')" style="background: rgba(50, 215, 75, 0.15); border: 1px solid rgba(50, 215, 75, 0.2); width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--apple-green); cursor: pointer; padding: 0; transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.9)'" onmouseup="this.style.transform='scale(1)'" title="Посадить госзаказ">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><path d="M5 3l14 9-14 9V3z"/></svg>
                                                </button>
                                            </div>
                                            <div style="font-size: 13px; color: var(--text-muted); font-weight: 500;">
                                                ${t.growTime ? `⏱ ${t.growTime}` : ''} ${t.fertTime ? `&nbsp; 🌱 ${t.fertTime}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    ${levelBadge}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } else {
                targetsHtml = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px 0;">Нет активных целей госзаказа</div>`;
            }

            gosHtml = `
                <div class="glass-panel module-card" style="display: flex; flex-direction: column; gap: 20px; padding: 20px; height: 100%; box-sizing: border-box;">
                    <div class="module-header" style="margin: 0;">
                        <div class="module-title"><span>📜</span> Госзаказ</div>
                        ${data.goszakaz.deadline ? `<div style="font-size: 12px; color: #ff9f0a; font-weight: 700; background: rgba(255, 159, 10, 0.12); padding: 4px 10px; border-radius: 12px; letter-spacing: 0.3px;">ДО: ${data.goszakaz.deadline}</div>` : ''}
                    </div>
                    <div style="display: flex; flex-direction: column; justify-content: center; flex-grow: 1;">
                        ${targetsHtml}
                    </div>
                </div>
            `;
        }

        // Выводим карточки в двухколоночную сетку на всю ширину панели
        container.innerHTML = `
            <div style="grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: 100%;">
                ${labHtml}
                ${gosHtml}
            </div>
        `;

    } catch (e) {
        console.error("Ошибка загрузки Штаба:", e);
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 50px; color: #ff453a;">Ошибка соединения с сервером.</div>`;
    }
}

// ==========================================
// ОТПРАВКА ПРИКАЗА В ШТАБ (Фронтенд -> Бэкенд)
// ==========================================
window.startPlanting = async function(targetName, type) {
    const isConfirmed = confirm(`Отдать приказ всем аккаунтам группы посадить: ${targetName}?`);
    if (!isConfirmed) return;
    
    // Пока просто выводим в консоль. На следующем этапе здесь будет fetch-запрос к нашему API!
    console.log(`[ШТАБ] Команда отправлена: ${targetName} (${type})`);
};