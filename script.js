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

    // --- Simulation State ---
    let simulationInterval = null;
    let dashboardInterval = null;
    let setCounter = 0;
    let simulationTime = 0;
    let stats = {};
    let activeConfig = {};
    let currentParams = {}; // To store the last used configuration
    let currentSpeedMultiplier = 1;

    function getSimulationParameters() {
        const shifts = parseInt(prompt("Enter number of shifts (1, 2, or 3):", "1")) || 1;
        const backlog = parseInt(prompt(`Enter backlog for ${shifts * 8} hours:`, "100")) || 100;
        const building = parseInt(prompt("Enter number of Building machines:", "1")) || 1;
        const cutting = parseInt(prompt("Enter number of Cutting machines:", "1")) || 1;
        const flipping = parseInt(prompt("Enter number of Flipping machines:", "2")) || 2;
        const curing = parseInt(prompt("Enter number of Curing machines:", "4")) || 4;
        const coding = parseInt(prompt("Enter number of Coding machines:", "1")) || 1;

        if (isNaN(shifts) || isNaN(backlog) || isNaN(building) || isNaN(cutting) || isNaN(flipping) || isNaN(curing) || isNaN(coding)) {
            return null;
        }
        // Store the latest parameters
        currentParams = { shifts, backlog, building, cutting, flipping, curing, coding };
        return currentParams;
    }

    function setupSimulation(params) {
        currentParams = params; // Ensure currentParams is always up to date
        currentSpeedMultiplier = 1;
        ffButton.textContent = `Fast Forward (x1)`;

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

    function startVisualSimulation(params) {
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
        
        resumeSimulation();
        updateAllControlStates(true);
    }
    
    function runHeadlessSimulation(params) {
        // This function is for the optimization feature and runs entirely in memory
        const localConfig = JSON.parse(JSON.stringify(activeConfig));
        const stationConfigs = {
            Building: { capacity: params.building, time: 379.2 },
            Cutting:  { capacity: params.cutting, time: 240 },
            Flipping: { capacity: params.flipping, time: 600 },
            Curing:   { capacity: params.curing, time: 1596, breakCapacity: Math.ceil(params.curing / 2) },
            Coding:   { capacity: params.coding, time: 496.2 }
        };

        const buffers = {
            'backlog-buffer': params.backlog, 'building-wip': 0, 'cutting-wip': 0,
            'flipping-wip': 0, 'curing-wip': 0, 'finished-goods': 0
        };
        const stations = {};
        const localStats = { stations: {} };

        Object.keys(localConfig.stations).forEach(id => {
            stations[id] = Array(stationConfigs[id].capacity).fill(0);
            localStats.stations[id] = { id: id, name: localConfig.stations[id].name, setsProcessed: 0, idleTime: 0, workingTime: 0, utilization: 0 };
        });

        const tick = 1000;
        for (let time = 0; time < localConfig.shiftDetails.duration; time += tick) {
            const currentBreak = localConfig.shiftDetails.breaks.find(b => time >= b.start && time < b.end);

            Object.entries(localConfig.stations).forEach(([id, s]) => {
                stations[id].forEach((timer, index) => {
                    if (timer > 0) {
                        stations[id][index] -= tick;
                        if (stations[id][index] <= 0) {
                            buffers[s.outputBuffer]++;
                        }
                    }
                });

                let isPaused = currentBreak && id !== 'Curing';
                let currentCapacity = stationConfigs[id].capacity;
                if (currentBreak && id === 'Curing') currentCapacity = stationConfigs[id].breakCapacity;
                
                stations[id].length = currentCapacity; // Adjust for breaks
                
                if (!isPaused) {
                    for(let i = 0; i < stations[id].length; i++) {
                        if (stations[id][i] <= 0) { // Slot is free
                            if (buffers[s.inputBuffer] > 0) {
                                buffers[s.inputBuffer]--;
                                stations[id][i] = stationConfigs[id].time * 1000;
                                localStats.stations[id].setsProcessed++;
                            } else {
                                localStats.stations[id].idleTime += tick;
                            }
                        }
                    }
                }
            });
        }

        const finalConfig = { ...localConfig, stations: {} };
        Object.keys(localConfig.stations).forEach(id => {
            finalConfig.stations[id] = { ...localConfig.stations[id], ...stationConfigs[id] };
        });

        return { stats: calculateStats(localStats, finalConfig), buffers: buffers };
    }

    function pauseSimulation() {
        clearInterval(simulationInterval);
        clearInterval(dashboardInterval);
        simulationInterval = null;
        dashboardInterval = null;
        if(activeConfig.shiftDetails && simulationTime > 0 && simulationTime < activeConfig.shiftDetails.duration) {
            updateControlButtons(true);
        }
    }
    function resumeSimulation() {
        if(simulationInterval) return;
        simulationInterval = setInterval(simulationTick, 200 / currentSpeedMultiplier);
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
    }
    function updateAllControlStates(isSimRunning) {
        startButton.disabled = isSimRunning;
        optimizeButton.disabled = isSimRunning;
        pauseButton.disabled = !isSimRunning;
        resumeButton.disabled = true;
        ffButton.disabled = !isSimRunning;
        resetButton.disabled = !isSimRunning;
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

    function simulationTick() {
        simulationTime += (200 * activeConfig.timeScale);
        
        Object.values(activeConfig.stations).forEach(stationConfig => {
            const currentBreak = checkForBreak(simulationTime);
            let currentCapacity = stationConfig.capacity;
            const isPaused = currentBreak && (stationConfig.id !== 'Curing');
            if (currentBreak && stationConfig.id === 'Curing') currentCapacity = stationConfig.breakCapacity;

            const stationEl = document.getElementById(stationConfig.id);
            const setsInStation = stationEl.children.length;
            const freeCapacity = currentCapacity - setsInStation;

            if (!isPaused && freeCapacity > 0) {
                const inputBufferEl = document.getElementById(stationConfig.inputBuffer);
                if(inputBufferEl.children.length > 0) {
                    for (let i = 0; i < freeCapacity; i++) {
                        if (inputBufferEl.children.length > 0) {
                            startProcessing(inputBufferEl.firstElementChild, stationConfig.id, stationConfig);
                        }
                    }
                } else {
                    stats.stations[stationConfig.id].idleTime += (200 * activeConfig.timeScale * freeCapacity);
                }
            }
        });
        
        Object.keys(stats.buffers).forEach(bufferId => {
            const bufferEl = document.getElementById(bufferId);
            if(bufferEl) stats.buffers[bufferId].history.push(bufferEl.children.length);
        });

        if (simulationTime >= activeConfig.shiftDetails.duration) {
            endSimulation();
        }
    }

    function startProcessing(set, stationId, stationConfig) {
        const stationEl = document.getElementById(stationId);
        stationEl.appendChild(set);
        set.classList.add('processing');
        stats.stations[stationId].setsProcessed++;
        const processTimeInRealMs = (stationConfig.time * 1000) / activeConfig.timeScale;
        setTimeout(() => {
            const outputBufferEl = document.getElementById(stationConfig.outputBuffer);
            if (outputBufferEl) outputBufferEl.appendChild(set);
            set.classList.remove('processing');
        }, processTimeInRealMs / currentSpeedMultiplier);
    }
    
    function endSimulation() {
        pauseSimulation();
        updateAllControlStates(false);
        calculateStats(stats, activeConfig);
        generateSummaryReport(stats, currentParams);
    }

    function createVbeltSet() {
        setCounter++;
        const set = document.createElement('div');
        set.classList.add('v-belt-set');
        set.innerText = `S${setCounter}`;
        return set;
    }
    
    function calculateStats(finalStats, config) {
        let totalBreakTime = 0;
        config.shiftDetails.breaks.forEach(b => totalBreakTime += (b.end - b.start));
        Object.values(config.stations).forEach(stationConfig => {
            const stationStats = finalStats.stations[stationConfig.id];
            if(!stationStats) return;
            let availableTime = config.shiftDetails.duration;
            if (stationConfig.id !== 'Curing') availableTime -= totalBreakTime;
            const totalPossibleWorkTime = availableTime * stationConfig.capacity;
            stationStats.workingTime = totalPossibleWorkTime - stationStats.idleTime;
            stationStats.utilization = (stationStats.workingTime / totalPossibleWorkTime) * 100 || 0;
        });
        return finalStats;
    }

    function updateDashboard() {
        clockDisplay.textContent = new Date(simulationTime).toISOString().substr(11, 8);
        const currentBreak = checkForBreak(simulationTime);
        statusDisplay.textContent = currentBreak ? currentBreak.name : 'Running';
    }
    
    function checkForBreak(time) {
        return activeConfig.shiftDetails.breaks.find(b => time >= b.start && time < b.end) || null;
    }

    function generateSummaryReport(finalStats, params, optimizationResult = null) {
        const finishedCount = optimizationResult ? optimizationResult.buffers['finished-goods'] : document.getElementById('finished-goods').children.length;
        const totalSimHours = params.shifts * 8;

        let reportHTML = `
            <h3>Configuration Used</h3>
            <table>
                <tr><td>Backlog for Shift:</td><td>${params.backlog} sets</td></tr>
                <tr><td>Flipping Machines:</td><td>${params.flipping}</td></tr>
                <tr><td>Curing Machines:</td><td>${params.curing}</td></tr>
            </table>`;
        
        if (optimizationResult) {
             reportHTML += `<h3>Optimized Configuration</h3>
             <p>Recommended to complete the full backlog of ${params.backlog} sets.</p>
             <table>
                <tr><td>Building: ${optimizationResult.params.building}</td><td>Cutting: ${optimizationResult.params.cutting}</td></tr>
                <tr><td>Flipping: ${optimizationResult.params.flipping}</td><td>Curing: ${optimizationResult.params.curing}</td></tr>
                <tr><td>Coding: ${optimizationResult.params.coding}</td><td></td></tr>
            </table>`;
        }
        
        reportHTML += `<h3>Overall Performance</h3>
                       <p>Total Sets Produced in ${totalSimHours} hours: <strong>${finishedCount}</strong></p>`;

        reportHTML += `
            <h3>Process Analysis</h3>
            <table><tr><th>Station</th><th>Avg. Utilization</th><th>Total Idle Time (sec)</th></tr>`;
        Object.values(finalStats.stations).forEach(station => {
            let utilClass = 'util-low';
            if (station.utilization > 85) utilClass = 'util-high';
            else if (station.utilization > 50) utilClass = 'util-medium';
            reportHTML += `<tr>
                <td>${station.name}</td>
                <td class="${utilClass}">${station.utilization.toFixed(1)}%</td>
                <td>${(station.idleTime / 1000).toFixed(1)}</td>
            </tr>`;
        });
        reportHTML += `</table>`;

        reportHTML += `
            <h3>Buffer Analysis</h3>
            <table><tr><th>Buffer</th><th>Avg. WIP</th></tr>`;
        
        const bufferIds = ['building-wip', 'cutting-wip', 'flipping-wip', 'curing-wip', 'backlog-buffer'];
        bufferIds.forEach(id => {
            const name = id.replace(/-wip|-buffer/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
            let avgWIP = 0;
            if (optimizationResult) {
                // For headless optimization, we can only show final WIP, not average over time
                avgWIP = optimizationResult.buffers[id] || 0;
            } else if (finalStats.buffers[id]) {
                const bufferHistory = finalStats.buffers[id].history;
                const sumWIP = bufferHistory.reduce((a, b) => a + b, 0);
                avgWIP = sumWIP / bufferHistory.length || 0;
            }
            reportHTML += `<tr><td>${name}</td><td>${avgWIP.toFixed(2)}</td></tr>`;
        });
        reportHTML += `</table>`;

        let bottleneck = { utilization: -1, name: 'N/A' };
        Object.values(finalStats.stations).forEach(station => {
            if (station.utilization > bottleneck.utilization) bottleneck = station;
        });
        reportHTML += `<hr><h3>Descriptive Analysis & Suggestions</h3>
            <p><strong>Primary Bottleneck:</strong> The simulation identifies <strong>${bottleneck.name}</strong> as the primary constraint with ${bottleneck.utilization.toFixed(1)}% utilization.</p>`;
        
        summaryTitleEl.textContent = optimizationResult ? "Optimization Complete" : "Shift Over!";
        summaryContentEl.innerHTML = reportHTML;
        summaryReportEl.classList.remove('hidden');
    }
    
    function runOptimization() {
        if (!currentParams || Object.keys(currentParams).length === 0) {
            alert("Please run a simulation first to set a base configuration for optimization.");
            return;
        }

        setupSimulation(currentParams);
        statusDisplay.textContent = "Optimizing...";
        updateAllControlStates(true); 

        let optimizedParams = { ...currentParams };
        let iteration = 0;
        const maxIterations = 25;

        function optimizationStep() {
            if (iteration >= maxIterations) {
                statusDisplay.textContent = "Could not optimize";
                alert("Optimization could not find a solution within a reasonable number of steps.");
                updateAllControlStates(false);
                return;
            }

            let { stats: resultStats, buffers: resultBuffers } = runHeadlessSimulation(optimizedParams);
            
            if (resultBuffers['finished-goods'] >= currentParams.backlog) {
                generateSummaryReport(resultStats, currentParams, { params: optimizedParams, buffers: resultBuffers });
  