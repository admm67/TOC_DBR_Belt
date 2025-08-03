// js/modules/UIController.js
export class UIController {
    constructor() {
        this.elements = {
            startButton: document.getElementById('start-simulation'),
            pauseButton: document.getElementById('pause-simulation'),
            resumeButton: document.getElementById('resume-simulation'),
            ffButton: document.getElementById('fast-forward-simulation'),
            resetButton: document.getElementById('reset-wip'),
            stationsWrapper: document.getElementById('stations-wrapper'),
            summaryReportEl: document.getElementById('summary-report'),
            summaryContentEl: document.getElementById('summary-content'),
            closeSummaryButton: document.getElementById('close-summary'),
            clockDisplay: document.getElementById('clock-display'),
            statusDisplay: document.getElementById('status-display')
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Listen for simulation events
        document.addEventListener('simulationStep', (event) => {
            this.updateClock(event.detail.simulationTime);
            this.updateStatus(event.detail.onBreak, event.detail.breakName);
        });

        document.addEventListener('simulationComplete', () => {
            this.showCompletionModal();
        });
    }

    updateClock(simulationTime) {
        const hours = Math.floor(simulationTime / (1000 * 3600));
        const minutes = Math.floor((simulationTime % (1000 * 3600)) / (1000 * 60));
        const seconds = Math.floor((simulationTime % (1000 * 60)) / 1000);
        
        this.elements.clockDisplay.textContent = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    updateStatus(onBreak, breakName) {
        if (onBreak) {
            this.elements.statusDisplay.textContent = `Break: ${breakName}`;
            this.elements.statusDisplay.classList.add('on-break');
            this.updateStationContainersBreakStatus(true);
        } else {
            this.elements.statusDisplay.textContent = 'Production Running';
            this.elements.statusDisplay.classList.remove('on-break');
            this.updateStationContainersBreakStatus(false);
        }
    }

    updateStationContainersBreakStatus(onBreak) {
        const containers = document.querySelectorAll('.station-container');
        containers.forEach(container => {
            if (onBreak) {
                container.classList.add('on-break');
            } else {
                container.classList.remove('on-break');
            }
        });
    }

    updateBufferCounts() {
        const buffers = ['backlog-buffer', 'building-wip', 'cutting-wip', 'flipping-wip', 'curing-wip', 'finished-goods'];
        
        buffers.forEach(bufferId => {
            const buffer = document.getElementById(bufferId);
            if (buffer) {
                const count = buffer.children.length;
                let countDisplay = buffer.querySelector('.buffer-count');
                if (!countDisplay) {
                    countDisplay = document.createElement('div');
                    countDisplay.className = 'buffer-count';
                    countDisplay.style.cssText = `
                        position: absolute;
                        top: -15px;
                        right: 5px;
                        background: #2186eb;
                        color: white;
                        border-radius: 10px;
                        padding: 2px 6px;
                        font-size: 0.7em;
                        font-weight: bold;
                    `;
                    buffer.style.position = 'relative';
                    buffer.appendChild(countDisplay);
                }
                countDisplay.textContent = count;
            }
        });
    }

    createStationHTML(config, stats) {
        this.elements.stationsWrapper.innerHTML = '';

        Object.keys(config.stations).forEach(id => {
            const station = config.stations[id];
            
            let wipHtml = '';
            if (station.outputBuffer !== 'finished-goods') {
                stats.buffers[station.outputBuffer] = { history: [], avg: 0 };
                wipHtml = `<div class="wip-buffer" id="${station.outputBuffer}"></div>`;
            }

            const stationHtml = `
                <div class="station-container ${station.isDrum ? 'drum-container' : ''}">
                    <h2>${station.name}</h2>
                    <div class="station ${station.isDrum ? 'drum' : ''}" id="${id}"></div>
                    ${wipHtml}
                    <div class="stats-display" id="stats-${id}">
                        <div>Processed: <span>0</span></div>
                        <div>Utilization: <span>0%</span></div>
                        <div>Status: <span>Idle</span></div>
                    </div>
                </div>
            `;

            this.elements.stationsWrapper.insertAdjacentHTML('beforeend', stationHtml);
        });
    }

    updateStationStats(stats) {
        Object.keys(stats.stations).forEach(stationId => {
            const station = stats.stations[stationId];
            const statsElement = document.getElementById(`stats-${stationId}`);
            
            if (statsElement) {
                const spans = statsElement.querySelectorAll('span');
                spans[0].textContent = station.setsProcessed;
                spans[1].textContent = `${station.utilization.toFixed(1)}%`;
                spans[2].textContent = station.workingTime > station.idleTime ? 'Working' : 'Idle';
            }
        });
    }

    generateSummaryHTML(reportData) {
        const totalSimHours = reportData.totalSimHours;
        const lineThroughput = reportData.hourlyOutput.reduce((sum, val) => sum + val, 0) / totalSimHours;
        
        let summaryHTML = `
            <h3>Simulation Parameters</h3>
            <table>
                <tr><th>Parameter</th><th>Value</th></tr>
                <tr><td>Number of Shifts</td><td>${totalSimHours / 8}</td></tr>
                <tr><td>Building Machines</td><td>${reportData.throughput.Building ? reportData.throughput.Building.capacity || 'N/A' : 'N/A'}</td></tr>
                <tr><td>Cutting Machines</td><td>${reportData.throughput.Cutting ? reportData.throughput.Cutting.capacity || 'N/A' : 'N/A'}</td></tr>
                <tr><td>Flipping Machines</td><td>${reportData.throughput.Flipping ? reportData.throughput.Flipping.capacity || 'N/A' : 'N/A'}</td></tr>
                <tr><td>Curing Machines</td><td>${reportData.throughput.Curing ? reportData.throughput.Curing.capacity || 'N/A' : 'N/A'}</td></tr>
                <tr><td>Coding Machines</td><td>${reportData.throughput.Coding ? reportData.throughput.Coding.capacity || 'N/A' : 'N/A'}</td></tr>
            </table>
            
            <h3>Hourly Output</h3>
            <table>
                <tr><th>Hour</th><th>Sets Completed</th></tr>
        `;

        reportData.hourlyOutput.forEach((hourlyCount, i) => {
            summaryHTML += `<tr><td>${i + 1}</td><td>${hourlyCount}</td></tr>`;
        });

        summaryHTML += `
            </table>
            <p><strong>Overall Line Throughput:</strong> ${lineThroughput.toFixed(2)} sets per hour</p>
            
            <h3>Station Performance</h3>
            <table>
                <tr><th>Station</th><th>Throughput (Sets/Hr)</th><th>Avg. Utilization</th><th>Idle Time (min)</th><th>Completed Sets</th></tr>
        `;

        Object.values(reportData.throughput).forEach(station => {
            const throughput = station.throughputPerHour || 0;
            summaryHTML += `
                <tr>
                    <td>${station.name}</td>
                    <td>${throughput.toFixed(2)}</td>
                    <td>${station.utilization.toFixed(1)}%</td>
                    <td>${(station.idleTime / (1000 * 60)).toFixed(1)}</td>
                    <td>${station.setsProcessed}</td>
                </tr>
            `;
        });

        summaryHTML += `
            </table>
            
            <h3>Buffer Analysis</h3>
            <table>
                <tr><th>Buffer</th><th>Actual WIP (End)</th></tr>
        `;

        Object.keys(reportData.bufferStats).forEach(bufferId => {
            const buffer = reportData.bufferStats[bufferId];
            const name = bufferId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
            summaryHTML += `<tr><td>${name}</td><td>${buffer.final}</td></tr>`;
        });

        summaryHTML += `
            </table>
            
            <h3>Bottleneck Analysis</h3>
            <p><strong>Primary Bottleneck:</strong> The simulation identifies <strong>${reportData.bottleneck.name}</strong> as the primary constraint with <strong>${reportData.bottleneck.utilization.toFixed(1)}%</strong> utilization.</p>
        `;

        return summaryHTML;
    }

    showSummaryReport(reportData) {
        const summaryHTML = this.generateSummaryHTML(reportData);
        this.elements.summaryContentEl.innerHTML = summaryHTML;
        this.elements.summaryReportEl.classList.remove('hidden');
    }

    hideSummaryReport() {
        this.elements.summaryReportEl.classList.add('hidden');
    }

    showCompletionModal() {
        document.dispatchEvent(new CustomEvent('showSummaryReport'));
    }

    addInitialBacklog(backlogSize) {
        const backlogBuffer = document.getElementById('backlog-buffer');
        for (let i = 1; i <= backlogSize; i++) {
            const set = document.createElement('div');
            set.className = 'v-belt-set';
            set.textContent = i;
            backlogBuffer.appendChild(set);
        }
    }

    enableButton(buttonName) {
        if (this.elements[buttonName]) {
            this.elements[buttonName].disabled = false;
        }
    }

    disableButton(buttonName) {
        if (this.elements[buttonName]) {
            this.elements[buttonName].disabled = true;
        }
    }

    updateSpeedButton(multiplier) {
        this.elements.ffButton.textContent = `Fast Forward (x${multiplier})`;
    }
}
