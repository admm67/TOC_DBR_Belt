document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const startButton = document.getElementById('start-simulation');
    const optimizeButton = document.getElementById('optimize-configuration');
    const pauseButton = document.getElementById('pause-simulation');
    const resumeButton = document.getElementById('resume-simulation');
    const ffButton = document.getElementById('fast-forward-simulation');
    const resetButton = document.getElementById('reset-wip');
    const stationsWrapper = document.getElementById('stations-wrapper');
    const summaryReportEl = document.getElementById('summary-report');
    const summaryTitleEl = document.getElementById('summary-title');
    const summaryContentEl = document.getElementById('summary-content');
    const closeSummaryButton = document.getElementById('close-summary');
    const clockDisplay = document.getElementById('clock-display');
    const statusDisplay = document.getElementById('status-display');

    let simulationInterval = null;
    let dashboardInterval = null;
    let setCounter = 0;
    let simulationTime = 0;
    let stats = {};
    let activeConfig = {};
    let currentParams = {};
    let currentSpeedMultiplier = 1;

    function getSimulationParameters() {
        const shifts = parseInt(prompt("Enter number of shifts (1, 2, or 3):", "1")) || 1;
        const backlog = parseInt(prompt(`Enter backlog for ${shifts * 8} hours:`, "100")) || 100;
        const building = parseInt(prompt("Enter number of Building machines:", "1")) || 1;
        const cutting = parseInt(prompt("Enter number of Cutting machines:", "1")) || 1;
        const flipping = parseInt(prompt("Enter number of Flipping machines:", "2")) || 2;
        const curing = parseInt(prompt("Enter number of Curing machines:", "4")) || 4;
        const coding = parseInt(prompt("Enter number of Coding machines:", "1")) || 1;

        return { shifts, backlog, building, cutting, flipping, curing, coding };
    }

    function setupSimulation(params) {
        currentParams = params;
        currentSpeedMultiplier = 1;
        ffButton.textContent = `Fast Forward (x1)`;
        resetButton.disabled = false;

        activeConfig = {
            timeScale: 60,
            shiftDetails: { duration: params.shifts * 8 * 3600 * 1000, breaks: [] },
            stations: {
                Building: { id: 'Building', name: "Building", capacity: params.building, time: 379.2, inputBuffer: 'backlog-buffer', outputBuffer: 'building-wip' },
                Cutting:  { id: 'Cutting', name: "Cutting", capacity: params.cutting, time: 240, inputBuffer: 'building-wip', outputBuffer: 'cutting-wip' },
                Flipping: { id: 'Flipping', name: "Flipping", capacity: params.flipping, time: 600, inputBuffer: 'cutting-wip', outputBuffer: 'flipping-wip' },
                Curing:   { id: 'Curing', name: "Curing (DRUM)", capacity: params.curing, breakCapacity: Math.ceil(params.curing / 2), time: 1596, inputBuffer: 'flipping-wip', outputBuffer: 'curing-wip', isDrum: true },
                Coding:   { id: 'Coding', name: "Coding", capacity: params.coding, time: 496.2, inputBuffer: 'curing-wip', outputBuffer: 'finished-goods' }
            }
        };

        for (let i = 0; i < params.shifts; i++) {
            const shiftStart = i * 8 * 3600 * 1000;
            activeConfig.shiftDetails.breaks.push(
                { name: `S${i+1} Bio 1`, start: shiftStart + (2*3600*1000), end: shiftStart + (2*3600*1000) + (10*60*1000) },
                { name: `S${i+1} Lunch`, start: shiftStart + (4*3600*1000), end: shiftStart + (4*3600*1000) + (30*60*1000) },
                { name: `S${i+1} Bio 2`, start: shiftStart + (6*3600*1000), end: shiftStart + (6*3600*1000) + (10*60*1000) }
            );
        }

        stationsWrapper.innerHTML = '';
        stats = { totalTime: 0, buffers: {}, stations: {}, hourlyOutput: Array(params.shifts * 8).fill(0) };

        Object.values(activeConfig.stations).forEach(station => {
            stats.stations[station.id] = { id: station.id, name: station.name, setsProcessed: 0, idleTime: 0, workingTime: 0, utilization: 0 };
            let wipHtml = '';
            if (station.outputBuffer !== 'finished-goods') {
                stats.buffers[station.outputBuffer] = { history: [], avg: 0 };
                wipHtml = `<div class="wip-buffer" id="${station.outputBuffer}"></div><div class="stats-display" id="${station.outputBuffer}-stats"></div>`;
            }
            stationsWrapper.innerHTML += `<div class="station-container ${station.isDrum ? 'drum-container' : ''}" id="${station.id}-container"><h2>${station.name} (${station.capacity})</h2><div class="station ${station.isDrum ? 'drum' : ''}" id="${station.id}"></div><div class="stats-display" id="${station.id}-stats"></div>${wipHtml}</div>`;
        });
        stats.buffers['backlog-buffer'] = { history: [], avg: 0 };
    }

    function startSimulation(params, isOptimization = false) {
        return new Promise(resolve => {
            pauseSimulation();
            summaryReportEl.classList.add('hidden');
            simulationTime = 0;
            setCounter = 0;

            setupSimulation(params);

            const backlogBuffer = document.getElementById('backlog-buffer');
            backlogBuffer.innerHTML = '';
            for (let i = 0; i < params.backlog; i++) {
                backlogBuffer.appendChild(createVbeltSet());
            }

            if (isOptimization) {
                // Run instantly without visual updates for optimization
                while(simulationTime < activeConfig.shiftDetails.duration) {
                    simulationTick(true);
                }
                endSimulation(true);
                resolve(stats);
            } else {
                resumeSimulation();
                startButton.disabled = true;
                optimizeButton.disabled = true;
            }
        });
    }

    function simulationTick(isOptimization = false) {
        const tickDuration = isOptimization ? (200 * activeConfig.timeScale) : (200 * activeConfig.timeScale);
        simulationTime += tickDuration;

        Object.values(activeConfig.stations).forEach(stationConfig => {
            const setsInStation = document.getElementById(stationConfig.id).children.length;
            if(stationConfig.timeoutIds && stationConfig.timeoutIds.length > setsInStation) {
                 stationConfig.timeoutIds.length = setsInStation;
            }

            const currentBreak = checkForBreak(simulationTime);
            let currentCapacity = stationConfig.capacity;
            const isPaused = currentBreak && (stationConfig.id !== 'Curing');
            if (currentBreak && stationConfig.id === 'Curing') currentCapacity = stationConfig.breakCapacity;

            const freeCapacity = currentCapacity - setsInStation;

            if (!isPaused && freeCapacity > 0) {
                const inputBufferEl = document.getElementById(stationConfig.inputBuffer);
                if(inputBufferEl.children.length > 0) {
                    for(let i=0; i<freeCapacity; ++i) {
                        if(inputBufferEl.children.length > 0) {
                             startProcessing(inputBufferEl.firstElementChild, stationConfig.id, stationConfig, isOptimization);
                        }
                    }
                } else {
                    stats.stations[stationConfig.id].idleTime += (tickDuration * freeCapacity);
                }
            }
        });

        if (!isOptimization) {
            const currentHour = Math.floor(simulationTime / (3600 * 1000));
            if (currentHour < stats.hourlyOutput.length) {
                stats.hourlyOutput[currentHour] = document.getElementById('finished-goods').children.length;
            }
        }

        if (simulationTime >= activeConfig.shiftDetails.duration) {
            endSimulation(isOptimization);
        }
    }

    function startProcessing(set, stationId, stationConfig, isOptimization) {
        const stationEl = document.getElementById(stationId);
        stationEl.appendChild(set);
        stats.stations[stationId].setsProcessed++;

        if (isOptimization) {
            const outputBufferEl = document.getElementById(stationConfig.outputBuffer);
            if (outputBufferEl) outputBufferEl.appendChild(set);
        } else {
            set.classList.add('processing');
            const processTimeInRealMs = (stationConfig.time * 1000) / activeConfig.timeScale;
            setTimeout(() => {
                const outputBufferEl = document.getElementById(stationConfig.outputBuffer);
                if (outputBufferEl) outputBufferEl.appendChild(set);
                set.classList.remove('processing');
            }, processTimeInRealMs / currentSpeedMultiplier);
        }
    }
    
    // --- CONTROLS ---
    function pauseSimulation() {
        clearInterval(simulationInterval);
        clearInterval(dashboardInterval);
        simulationInterval = null;
        dashboardInterval = null;
        if(simulationTime > 0 && simulationTime < activeConfig.shiftDetails.duration) {
            updateControlButtons(true);
        }
    }
    function resumeSimulation() {
        if(simulationInterval) return;
        simulationInterval = setInterval(() => simulationTick(false), 200 / currentSpeedMultiplier);
        dashboardInterval = setInterval(updateDashboard, 1000 / currentSpeedMultiplier);
        updateControlButtons(false);
    }
    function fastForward() {
        currentSpeedMultiplier *= 2;
        ffButton.textContent = `Fast Forward (x${currentSpeedMultiplier})`;
        pauseSimulation();
        resumeSimulation();
    }
    function updateControlButtons(paused) {
        pauseButton.disabled = paused;
        resumeButton.disabled = !paused;
        ffButton.disabled = paused;
        resetButton.disabled = false;
    }
    resetButton.addEventListener('click', () => {
        ['backlog-buffer', 'building-wip', 'cutting-wip', 'flipping-wip', 'curing-wip', 'finished-goods'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        Object.values(activeConfig.stations || {}).forEach(station => {
             const stationEl = document.getElementById(station.id);
             if(stationEl) stationEl.innerHTML = '';
        });
        Object.values(stats.stations || {}).forEach(s => { s.setsProcessed=0; s.idleTime=0; s.workingTime=0; s.utilization=0; });
        Object.values(stats.buffers || {}).forEach(b => { b.history=[]; b.avg=0; });
        if (stats.hourlyOutput) stats.hourlyOutput.fill(0);
        setCounter = 0;
        updateDashboard();
    });

    function endSimulation(isOptimization) {
        pauseSimulation();
        if (!isOptimization) {
            startButton.disabled = false;
            optimizeButton.disabled = false;
            pauseButton.disabled = true;
            resumeButton.disabled = true;
            ffButton.disabled = true;
            resetButton.disabled = false;
            generateSummaryReport(stats, currentParams);
        }
    }

    function createVbeltSet() {
        setCounter++;
        const set = document.createElement('div');
        set.classList.add('v-belt-set');
        set.innerText = `S${setCounter}`;
        return set;
    }

    function calculateStats(currentStats, config) {
        let totalBreakTime = 0;
        config.shiftDetails.breaks.forEach(b => {
             totalBreakTime += (b.end - b.start);
        });

        Object.values(config.stations).forEach(stationConfig => {
            const stationStats = currentStats.stations[stationConfig.id];
            let availableTime = config.shiftDetails.duration;
            if (stationConfig.id !== 'Curing') availableTime -= totalBreakTime;

            const totalPossibleWorkTime = availableTime * stationConfig.capacity;
            stationStats.workingTime = totalPossibleWorkTime - stationStats.idleTime;
            stationStats.utilization = (stationStats.workingTime / totalPossibleWorkTime) * 100 || 0;
        });
        return currentStats;
    }
    
    function updateDashboard() {
        const totalSeconds = Math.floor(simulationTime / 1000);
        clockDisplay.textContent = new Date(totalSeconds * 1000).toISOString().substr(11, 8);
        const currentBreak = checkForBreak(simulationTime);
        statusDisplay.textContent = currentBreak ? currentBreak.name : 'Running';
        statusDisplay.classList.toggle('on-break', !!currentBreak);
        // ... update other dashboard elements as needed
    }

    function checkForBreak(time) {
        return activeConfig.shiftDetails.breaks.find(b => time >= b.start && time < b.end) || null;
    }

    function generateSummaryReport(finalStats, params, optimizationResult = null) {
        finalStats = calculateStats(finalStats, activeConfig); // Use current active config for stats calc
        const finishedCount = finalStats.stations.Coding.setsProcessed;
        const totalSimHours = params.shifts * 8;
        
        let reportHTML = `<h3>Original Configuration</h3>
            <table>
                <tr><td>Shifts</td><td>${params.shifts}</td></tr>
                <tr><td>Backlog</td><td>${params.backlog}</td></tr>
                <tr><td>Building</td><td>${params.building}</td></tr>
                <tr><td>Cutting</td><td>${params.cutting}</td></tr>
                <tr><td>Flipping</td><td>${params.flipping}</td></tr>
                <tr><td>Curing</td><td>${params.curing}</td></tr>
                <tr><td>Coding</td><td>${params.coding}</td></tr>
            </table>`;
        
        if (optimizationResult) {
             reportHTML += `<h3>Optimized Configuration</h3>
             <p>This configuration is recommended to complete the full backlog of ${params.backlog} sets.</p>
             <table>
                <tr><td>Building</td><td>${optimizationResult.params.building}</td></tr>
                <tr><td>Cutting</td><td>${optimizationResult.params.cutting}</td></tr>
                <tr><td>Flipping</td><td>${optimizationResult.params.flipping}</td></tr>
                <tr><td>Curing</td><td>${optimizationResult.params.curing}</td></tr>
                <tr><td>Coding</td><td>${optimizationResult.params.coding}</td></tr>
            </table>`;
        }

        reportHTML += `<h3>Process Analysis</h3>
            <table><tr><th>Station</th><th>Avg. Utilization</th><th>Completed Sets</th></tr>`;
        Object.values(finalStats.stations).forEach(station => {
            let utilClass = 'util-low';
            if (station.utilization > 85) utilClass = 'util-high';
            else if (station.utilization > 50) utilClass = 'util-medium';
            reportHTML += `<tr>
                <td>${station.name}</td>
                <td class="${utilClass}">${station.utilization.toFixed(1)}%</td>
                <td>${station.setsProcessed}</td>
            </tr>`;
        });
        reportHTML += `</table>`;

        let bottleneck = { utilization: -1 };
        Object.values(finalStats.stations).forEach(station => {
            if (station.utilization > bottleneck.utilization) bottleneck = station;
        });
        reportHTML += `<hr><h3>Descriptive Analysis</h3>
        <p><strong>Primary Bottleneck:</strong> The simulation identifies <strong>${bottleneck.name}</strong> as the primary constraint.</p>`;
        
        summaryTitleEl.textContent = optimizationResult ? "Optimization Complete" : "Shift Over!";
        summaryContentEl.innerHTML = reportHTML;
        summaryReportEl.classList.remove('hidden');
    }
    
    async function runOptimization() {
        const params = getSimulationParameters();
        if (!params) return;

        statusDisplay.textContent = "Optimizing...";
        let optimizedParams = { ...params };
        let iteration = 0;
        const maxIterations = 20;

        while(iteration < maxIterations) {
            let tempParams = { ...optimizedParams };
            // Need to recreate the visual elements for stats calculation
            setupSimulation(tempParams);
            const resultStats = await startSimulation(tempParams, true);
            
            const finishedCount = resultStats.stations.Coding.setsProcessed;

            if (finishedCount >= params.backlog) {
                generateSummaryReport(resultStats, params, { params: optimizedParams });
                statusDisplay.textContent = "Optimization Found";
                return;
            }

            let bottleneck = { utilization: -1, id: null };
            Object.values(resultStats.stations).forEach(station => {
                if(station.utilization > bottleneck.utilization) {
                    bottleneck = station;
                }
            });
            
            // Increase capacity of the bottleneck
            const key = bottleneck.id.toLowerCase();
            optimizedParams[key]++;
            iteration++;
        }
        
        statusDisplay.textContent = "Could not optimize in 20 steps.";
        alert("Optimization could not find a solution within a reasonable number of steps. The system may be too constrained.");
    }

    // --- Event Listeners ---
    startButton.addEventListener('click', () => {
        const params = getSimulationParameters();
        if(params) startSimulation(params);
    });
    optimizeButton.addEventListener('click', runOptimization);
    pauseButton.addEventListener('click', pauseSimulation);
    resumeButton.addEventListener('click', resumeSimulation);
    ffButton.addEventListener('click', fastForward);
    closeSummaryButton.addEventListener('click', () => summaryReportEl.classList.add('hidden'));
});
