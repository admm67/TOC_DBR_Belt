document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const startButton = document.getElementById('start-simulation');
    const pauseButton = document.getElementById('pause-simulation');
    const resumeButton = document.getElementById('resume-simulation');
    const ffButton = document.getElementById('fast-forward-simulation');
    const resetButton = document.getElementById('reset-wip');
    const stationsWrapper = document.getElementById('stations-wrapper');
    const summaryReportEl = document.getElementById('summary-report');
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
    let initialBacklogSize = 0;
    let currentSpeedMultiplier = 1;

    function getSimulationParameters() {
        const shifts = parseInt(prompt("Enter number of shifts (1, 2, or 3):", "1")) || 1;
        const building = parseInt(prompt("Enter number of Building machines:", "1")) || 1;
        const cutting = parseInt(prompt("Enter number of Cutting machines:", "1")) || 1;
        const flipping = parseInt(prompt("Enter number of Flipping machines:", "2")) || 2;
        const curing = parseInt(prompt("Enter number of Curing machines:", "4")) || 4;
        const coding = parseInt(prompt("Enter number of Coding machines:", "1")) || 1;
        const backlog = parseInt(prompt(`Enter backlog for ${shifts * 8} hours:`, "100")) || 100;

        return {
            shifts: Math.max(1, Math.min(3, shifts)),
            building, cutting, flipping, curing, coding, backlog
        };
    }

    function setupSimulation(params) {
        initialBacklogSize = params.backlog;
        currentSpeedMultiplier = 1;
        ffButton.textContent = `Fast Forward (x1)`;
        resetButton.disabled = false;

        activeConfig = {
            timeScale: 60,
            shiftDetails: {
                duration: params.shifts * 8 * 3600 * 1000,
                breaks: []
            },
            stations: {
                Building: { name: "Building", capacity: params.building, time: 379.2, inputBuffer: 'backlog-buffer', outputBuffer: 'building-wip' },
                Cutting: { name: "Cutting", capacity: params.cutting, time: 240, inputBuffer: 'building-wip', outputBuffer: 'cutting-wip' },
                Flipping: { name: "Flipping", capacity: params.flipping, time: 600, inputBuffer: 'cutting-wip', outputBuffer: 'flipping-wip' },
                Curing: { name: "Curing (DRUM)", capacity: params.curing,
                         breakCapacity: Math.ceil(params.curing / 2),
                         time: 1596,
                         inputBuffer: 'flipping-wip', outputBuffer: 'curing-wip',
                         isDrum: true },
                Coding: { name: "Coding", capacity: params.coding, time: 496.2, inputBuffer: 'curing-wip', outputBuffer: 'finished-goods' }
            }
        };

        for (let i = 0; i < params.shifts; i++) {
            const shiftStart = i * 8 * 3600 * 1000;
            activeConfig.shiftDetails.breaks.push(
                { name: `S${i+1} Bio 1`, start: shiftStart + (2 * 3600 * 1000), end: shiftStart + (2 * 3600 * 1000) + (10 * 60 * 1000) },
                { name: `S${i+1} Lunch`, start: shiftStart + (4 * 3600 * 1000), end: shiftStart + (4 * 3600 * 1000) + (30 * 60 * 1000) },
                { name: `S${i+1} Bio 2`, start: shiftStart + (6 * 3600 * 1000), end: shiftStart + (6 * 3600 * 1000) + (10 * 60 * 1000) }
            );
        }

        stationsWrapper.innerHTML = '';
        stats = { totalTime: 0, buffers: {}, stations: {}, hourlyOutput: Array(params.shifts * 8).fill(0) };

        Object.keys(activeConfig.stations).forEach(id => {
            const station = activeConfig.stations[id];
            stats.stations[id] = { id, name: station.name, setsProcessed: 0, idleTime: 0, workingTime: 0, utilization: 0 };
            let wipHtml = '';
            if (station.outputBuffer !== 'finished-goods') {
                stats.buffers[station.outputBuffer] = { history: [], avg: 0 };
                wipHtml = `<div class="wip-buffer" id="${station.outputBuffer}"></div>
                           <div class="stats-display" id="${station.outputBuffer}-stats">
                              <div>WIP: <span class="wip-current">0</span></div>
                              <div>Avg WIP: <span class="wip-avg">0.0</span></div>
                           </div>`;
            }
            stationsWrapper.innerHTML += `
              <div class="station-container ${station.isDrum ? 'drum-container' : ''}" id="${id}-container">
                <h2>${station.name} (${station.capacity})</h2>
                <div class="station ${station.isDrum ? 'drum' : ''}" id="${id}"></div>
                <div class="stats-display" id="${id}-stats">
                  <div>Util: <span class="utilization">0.0%</span></div>
                  <div>Idle: <span class="idle-time">0s</span></div>
                </div>
                ${wipHtml}
              </div>`;
        });
        stats.buffers['backlog-buffer'] = { history: [], avg: 0 };
    }

    function startSimulation(params) {
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
        startButton.disabled = true;
    }
    
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
        resetButton.disabled = false;
    }

    // --- RESET WIP, Backlog, Finished, Stats, Hourly Output ---
    resetButton.addEventListener('click', resetWIP);
    function resetWIP() {
        // 1. Clear stations (processing)
        Object.keys(activeConfig.stations || {}).forEach(stationId => {
            const stationEl = document.getElementById(stationId);
            if (stationEl) stationEl.innerHTML = '';
        });
        // 2. Clear ALL buffers: WIP, Backlog, Finished
        ['backlog-buffer', 'building-wip', 'cutting-wip', 'flipping-wip', 'curing-wip', 'finished-goods'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        // 3. Reset stats and hourly output
        Object.values(stats.stations || {}).forEach(st => {
            st.setsProcessed = 0;
            st.idleTime = 0;
            st.workingTime = 0;
            st.utilization = 0;
        });
        Object.values(stats.buffers || {}).forEach(bf => {
            bf.history = [];
            bf.avg = 0;
        });
        if (stats.hourlyOutput) stats.hourlyOutput = stats.hourlyOutput.map(() => 0);
        setCounter = 0;
        updateDashboard();
    }

    function simulationTick() {
        const tickDuration = 200 * activeConfig.timeScale;
        simulationTime += tickDuration;
        const currentBreak = checkForBreak(simulationTime);
        Object.keys(activeConfig.stations).forEach(stationId => {
            const stationConfig = activeConfig.stations[stationId];
            const stationEl = document.getElementById(stationId);
            const inputBufferEl = document.getElementById(stationConfig.inputBuffer);
            let currentCapacity = stationConfig.capacity;
            let isPaused = false;
            if (currentBreak) {
                if (stationId === 'Curing') currentCapacity = stationConfig.breakCapacity;
                else isPaused = true;
            }
            const setsInProcess = stationEl.children.length;
            const freeCapacity = currentCapacity - setsInProcess;
            if (!isPaused && freeCapacity > 0 && inputBufferEl.children.length === 0) {
                stats.stations[stationId].idleTime += (tickDuration * freeCapacity);
            }
            if (!isPaused && freeCapacity > 0 && inputBufferEl.children.length > 0) {
                const setToProcess = inputBufferEl.firstElementChild;
                startProcessing(setToProcess, stationId, stationConfig);
            }
        });
        Object.keys(stats.buffers).forEach(bufferId => {
            const bufferEl = document.getElementById(bufferId);
            if(bufferEl) stats.buffers[bufferId].history.push(bufferEl.children.length);
        });
        const currentHour = Math.floor(simulationTime / (3600 * 1000));
        if(currentHour < stats.hourlyOutput.length) {
            stats.hourlyOutput[currentHour] = document.getElementById('finished-goods').children.length;
        }
        if (simulationTime >= activeConfig.shiftDetails.duration) {
            endSimulation();
        }
    }
    function updateDashboard() {
        const totalSeconds = Math.floor(simulationTime / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        clockDisplay.textContent = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
        const currentBreak = checkForBreak(simulationTime);
        statusDisplay.textContent = currentBreak ? currentBreak.name : 'Running';
        statusDisplay.classList.toggle('on-break', !!currentBreak);
        document.querySelectorAll('.station-container').forEach(el => el.classList.remove('on-break'));
        if(currentBreak) {
             Object.keys(activeConfig.stations).forEach(id => {
                if(id !== 'Curing') document.getElementById(`${id}-container`).classList.add('on-break');
             });
        }
        calculateAndDisplayFinalStats(false); 
    }
    function startProcessing(set, stationId, stationConfig) {
        const stationEl = document.getElementById(stationId);
        stationEl.appendChild(set);
        set.classList.add('processing');
        stats.stations[stationId].setsProcessed++;
        const processTimeInRealMs = (stationConfig.time * 1000) / activeConfig.timeScale;
        setTimeout(() => {
            const outputBufferEl = document.getElementById(stationConfig.outputBuffer);
            if(outputBufferEl) outputBufferEl.appendChild(set);
            set.classList.remove('processing');
        }, processTimeInRealMs / currentSpeedMultiplier);
    }
    function endSimulation() {
        pauseSimulation();
        startButton.disabled = false;
        pauseButton.disabled = true;
        resumeButton.disabled = true;
        ffButton.disabled = true;
        resetButton.disabled = true;
        generateSummaryReport();
    }
    function checkForBreak(time) {
        return activeConfig.shiftDetails.breaks.find(b => time >= b.start && time < b.end) || null;
    }
    function createVbeltSet() {
        setCounter++;
        const set = document.createElement('div');
        set.classList.add('v-belt-set');
        set.innerText = `S${setCounter}`;
        return set;
    }
    function calculateAndDisplayFinalStats(isFinalReport) {
        let totalBreakTime = 0;
        activeConfig.shiftDetails.breaks.forEach(b => {
            if (simulationTime >= b.end) totalBreakTime += (b.end - b.start);
            else if (simulationTime > b.start) totalBreakTime += (simulationTime - b.start);
        });
        Object.keys(stats.stations).forEach(id => {
            const stationStats = stats.stations[id];
            const stationConfig = activeConfig.stations[id];
            let availableTime = simulationTime;
            if (id !== 'Curing') availableTime -= totalBreakTime;
            const totalPossibleWorkTime = availableTime * stationConfig.capacity;
            stationStats.workingTime = totalPossibleWorkTime - stationStats.idleTime;
            stationStats.utilization = (stationStats.workingTime / totalPossibleWorkTime) * 100 || 0;
            if (!isFinalReport) {
                const statsEl = document.getElementById(`${id}-stats`);
                if(statsEl) {
                    statsEl.innerHTML = `<div>Util: <span class="utilization">${stationStats.utilization.toFixed(1)}%</span></div>
                                         <div>Idle: <span class="idle-time">${(stationStats.idleTime / (1000 * 60)).toFixed(1)}m</span></div>`;
                }
            }
        });
        if (!isFinalReport) {
            Object.keys(stats.buffers).forEach(bufferId => {
                const bufferStats = stats.buffers[bufferId];
                const bufferEl = document.getElementById(bufferId);
                const statsEl = document.getElementById(`${bufferId}-stats`);
                if (!bufferEl || !statsEl) return;
                const currentWIP = bufferEl.children.length;
                const sumWIP = bufferStats.history.reduce((a, b) => a + b, 0);
                bufferStats.avg = sumWIP / bufferStats.history.length || 0;
                statsEl.innerHTML = `<div>WIP: <span class="wip-current">${currentWIP}</span></div>
                                     <div>Avg WIP: <span class="wip-avg">${bufferStats.avg.toFixed(1)}</span></div>`;
            });
            const finishedTotalEl = document.querySelector('#finished-goods-stats .finished-total');
            if(finishedTotalEl) finishedTotalEl.textContent = document.getElementById('finished-goods').children.length;
        }
    }
    function generateSummaryReport() {
        calculateAndDisplayFinalStats(true);
        const finishedCount = document.getElementById('finished-goods').children.length;
        const totalSimHours = activeConfig.shiftDetails.duration / (3600 * 1000);
        let reportHTML = `
            <h3>Configuration Used</h3>
            <table>
                <tr><th>Parameter</th><th>Value</th></tr>
                <tr><td>Number of Shifts</td><td>${totalSimHours / 8}</td></tr>
                <tr><td>Building Machines</td><td>${activeConfig.stations.Building.capacity}</td></tr>
                <tr><td>Cutting Machines</td><td>${activeConfig.stations.Cutting.capacity}</td></tr>
                <tr><td>Flipping Machines</td><td>${activeConfig.stations.Flipping.capacity}</td></tr>
                <tr><td>Curing Machines</td><td>${activeConfig.stations.Curing.capacity}</td></tr>
                <tr><td>Coding Machines</td><td>${activeConfig.stations.Coding.capacity}</td></tr>
            </table>`;
        reportHTML += `
            <h3>Hour-wise Production Output</h3>
            <table>
                <tr><th>Hour</th><th>Sets Completed</th></tr>`;
        let lastHourCount = 0;
        stats.hourlyOutput.forEach((cumulativeCount, i) => {
            const hourlyCount = cumulativeCount - lastHourCount;
            reportHTML += `<tr><td>${i + 1}</td><td>${hourlyCount}</td></tr>`;
            lastHourCount = cumulativeCount;
        });
        reportHTML += `</table>`;
        const lineThroughput = finishedCount / totalSimHours;
        reportHTML += `
            <h3>Throughput & Process Analysis</h3>
            <p><strong>Overall Line Throughput:</strong> ${lineThroughput.toFixed(2)} sets per hour</p>
            <table>
                <tr><th>Station</th><th>Throughput (Sets/Hr)</th><th>Avg. Utilization</th><th>Idle Time (min)</th><th>Completed Sets</th></tr>`;
        Object.values(stats.stations).forEach(station => {
            const stationWorkingHours = station.workingTime / (3600 * 1000);
            const throughput = stationWorkingHours > 0 ? station.setsProcessed / stationWorkingHours : 0;
            reportHTML += `
                <tr>
                    <td>${station.name}</td>
                    <td>${throughput.toFixed(2)}</td>
                    <td>${station.utilization.toFixed(1)}%</td>
                    <td>${(station.idleTime / (1000 * 60)).toFixed(1)}</td>
                    <td>${station.setsProcessed}</td>
                </tr>`;
        });
        reportHTML += `</table>`;
        reportHTML += `
            <h3>Buffer Analysis</h3>
            <table>
                <tr><th>Buffer</th><th>Actual WIP (End)</th></tr>`;
        Object.keys(stats.buffers).forEach(id => {
             const bufferEl = document.getElementById(id);
             const name = id.replace('-wip', ' WIP').replace('-buffer', '').replace(/^\w/, c => c.toUpperCase());
             const actualWIP = bufferEl ? bufferEl.children.length : 0;
             reportHTML += `<tr><td>${name}</td><td>${actualWIP}</td></tr>`;
        });
        reportHTML += `</table>`;
        let bottleneck = { utilization: -1 };
        Object.values(stats.stations).forEach(station => {
            if(station.utilization > bottleneck.utilization) bottleneck = station;
        });
        reportHTML += `
            <hr>
            <h3>Descriptive Analysis & Suggestions</h3>
            <p><strong>Primary Bottleneck:</strong> The simulation identifies <strong>${bottleneck.name}</strong>
            as the primary constraint with <strong>${bottleneck.utilization.toFixed(1)}%</strong> utilization.</p>
            <ul>
                <li><strong>Focus Here:</strong> Any improvement to the <strong>${bottleneck.name}</strong> station will directly increase overall throughput.</li>
                <li><strong>Protect this Station:</strong> The buffer before this station is critical. Analyze its Actual WIP to ensure the bottleneck is rarely starved.</li>
            </ul>`;
        summaryContentEl.innerHTML = reportHTML;
        summaryReportEl.classList.remove('hidden');
    }
    startButton.addEventListener('click', () => {
        const userParams = getSimulationParameters();
        startSimulation(userParams);
    });
    pauseButton.addEventListener('click', pauseSimulation);
    resumeButton.addEventListener('click', resumeSimulation);
    ffButton.addEventListener('click', fastForward);
    closeSummaryButton.addEventListener('click', () => summaryReportEl.classList.add('hidden'));
});
