const SeedAnimals = require('./SeedAnimals');

/**
 * Мозг Питомника.
 * Ничего не парсит и не кликает. Принимает сырые данные, возвращает готовые решения.
 */
class NurseryBrain {
    
    // ==========================================
    // 1. ОПРЕДЕЛЕНИЕ ЦЕЛЕВОГО ПУЛА (ДИНАМИЧЕСКИЙ КПД)
    // ==========================================
    static getTargetPool(currentPoints) {
        let available = SeedAnimals.getAvailableAnimals(currentPoints);
        if (available.length === 0) return [];

        if (currentPoints < 10200) {
            return available;
        }

        let bestKpd = available[0].kpd;
        let targetPool = available.filter(a => a.kpd === bestKpd);

        if (targetPool.length < 3) {
            let secondBest = available.find(a => a.kpd < bestKpd);
            if (secondBest) {
                let backupPool = available.filter(a => a.kpd === secondBest.kpd);
                targetPool = targetPool.concat(backupPool);
            }
        }

        return targetPool;
    }

    // ==========================================
    // 2. АНАЛИЗ ЗАДАНИЙ (УМНАЯ ОТМЕНА)
    // ==========================================
    static getTasksToCancel(scannedTasks, currentPoints, volierMax) {
        let toCancel = [];
        let targetPool = this.getTargetPool(currentPoints);
        let minAcceptedKpd = Math.min(...targetPool.map(a => a.kpd));

        for (let task of scannedTasks) {
            // 🛡️ ЖЕЛЕЗОБЕТОННЫЙ ИММУНИТЕТ: Если мы уже сдали хоть 1 животное, квест НЕ отменяем!
            if (task.z > 0) {
                continue;
            }

            if (task.w > volierMax) {
                toCancel.push({ name: task.name, reason: 'impossible', required: task.w, volierMax: volierMax });
                continue;
            }

            let stats = SeedAnimals.get(task.name);
            if (!stats || stats.kpd < minAcceptedKpd) {
                toCancel.push({ name: task.name, reason: 'unprofitable', kpd: stats ? stats.kpd : 0 });
            }
        }
        return toCancel; 
    }

    // ==========================================
    // 3. КАСКАД И ДЕФРАГМЕНТАЦИЯ (ГРУППА А и Б)
    // ==========================================
    static analyzeExecution(scannedTasks, volierCur, volierMax, inventory, cells) {
        let freeSpace = volierMax - volierCur;
        let groupA = [];
        let groupB = [];

        for (let t of scannedTasks) {
            // t.w - сколько всего нужно по квесту
            // t.z - сколько УЖЕ лежит в вольере (засчитано игрой)
            let spaceNeeded = t.w - t.z; 
            
            // Считаем, сколько животных УЖЕ растет в клетках для этого квеста
            let currentlyGrowing = cells.filter(c => c.name === t.name).length;
            
            // Сколько реально ОСТАЛОСЬ ПОСАДИТЬ
            let animalsToPlant = spaceNeeded - currentlyGrowing; 
            
            // Если мы посадили достаточно (или всё готово), сажать для этого квеста больше не нужно!
            if (animalsToPlant <= 0) {
                continue;
            }

            let deficit = spaceNeeded - freeSpace; 
            
            if (deficit <= 0) {
                groupA.push(t);
            } else {
                groupB.push({ ...t, deficit });
            }
        }

        if (groupA.length > 0) {
            groupA.sort((a, b) => {
                if ((b.z > 0) !== (a.z > 0)) return b.z > 0 ? 1 : -1;
                return b.pts - a.pts;
            });
            return { action: 'plant', task: groupA[0] };
        }

        if (groupB.length > 0) {
            groupB.sort((a, b) => a.deficit - b.deficit);
            let targetTask = groupB[0];

            let safeNames = scannedTasks.map(t => t.name);
            let sellable = [];
            let totalSellableCount = 0;

            for (let name in inventory) {
                if (!safeNames.includes(name)) {
                    sellable.push({ name: name, count: inventory[name], pts: SeedAnimals.get(name).points });
                    totalSellableCount += inventory[name];
                }
            }

            if (totalSellableCount < targetTask.deficit) {
                // 🛡️ ФИКС БАГА 1: Если склад забит и некого продать, проверяем прогресс.
                // Если мы уже накопили часть животных (z > 0), запрещаем отмену! Уходим в режим ожидания.
                if (targetTask.z > 0) {
                    return { action: 'wait' };
                }
                return { action: 'cancel_impossible', task: targetTask };
            }

            sellable.sort((a, b) => a.pts - b.pts);
            return { action: 'clean', amountToFree: targetTask.deficit, candidates: sellable, forTask: targetTask.name };
        }

        return { action: 'wait' };
    }

    // ==========================================
    // 4. ПРАВИЛО 50% (УБИЙСТВО В КЛЕТКЕ)
    // ==========================================
    static getCellToClear(cells, activeTasksNames) {
        let victim = null;
        let maxTimeLeft = -1; 

        for (let i = 0; i < cells.length; i++) {
            let cell = cells[i];
            
            if (activeTasksNames.includes(cell.name)) continue;

            let stats = SeedAnimals.get(cell.name);
            if (!stats) continue;

            let totalGrowTimeMs = stats.timeMin * 60 * 1000;
            let halfTimeMs = totalGrowTimeMs / 2;

            if (cell.timeLeftMs > halfTimeMs) {
                if (cell.timeLeftMs > maxTimeLeft) {
                    maxTimeLeft = cell.timeLeftMs;
                    victim = cell; 
                }
            }
        }
        return victim;
    }

    // ==========================================
    // 5. ИДЕАЛЬНЫЙ НОЕВ КОВЧЕГ (Равномерная посадка)
    // ==========================================
    static getBackgroundAnimal(currentPoints, volierMax, inventory, cells, activeTasksNames) {
        let bgBufferLimit = Math.floor(volierMax / 2); // 50% от вольера
        
        let currentBgCount = 0;
        for (let name in inventory) {
            if (!activeTasksNames.includes(name)) currentBgCount += inventory[name];
        }
        for (let cell of cells) {
            if (!activeTasksNames.includes(cell.name)) currentBgCount++;
        }

        if (currentBgCount >= bgBufferLimit) return null;

        let targetPool = this.getTargetPool(currentPoints);

        // Ищем животное, которого у нас МЕНЬШЕ ВСЕГО на складе и в клетках
        let minCount = Infinity;
        let bestCandidate = null;

        for (let animal of targetPool) {
            // Считаем только фоновых (без иммунитета)
            let inInv = (!activeTasksNames.includes(animal.name) && inventory[animal.name]) ? inventory[animal.name] : 0;
            let inCells = cells.filter(c => c.name === animal.name && !activeTasksNames.includes(c.name)).length;
            let total = inInv + inCells;

            if (total < minCount) {
                minCount = total;
                bestCandidate = animal.name;
            }
        }

        return bestCandidate;
    }
}

module.exports = NurseryBrain;