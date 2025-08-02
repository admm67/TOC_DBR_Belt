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
        // This would contain the HTML generation logic from your original showSummaryReport function
        // Return the HTML string to be inserted into the modal
        return `
            <h3>Simulation Parameters</h3>
            <table>
                <tr><th>Parameter</th><th>Value</th></tr>
                <tr><td>Number of Shifts</td><td>${reportData.totalSimHours / 8}</td></tr>
                <!-- Add more parameters -->
            </table>
            
            <h3>Station Performance</h3>
            <table>
                <tr><th>Station</th><th>Throughput</th><th>Utilization</th><th>Sets Processed</th></tr>
                ${Object.values(reportData.throughput).map(station => `
                    <tr>
                        <td>${station.name}</td>
                        <td>${station.throughputPerHour.toFixed(2)}</td>
                        <td>${station.utilization.toFixed(1)}%</td>
                        <td>${station.setsProcessed}</td>
                    </tr>
                `).join('')}
            </table>
            
            <h3>Bottleneck Analysis</h3>
            <p><strong>Primary Bottleneck:</strong> ${reportData.bottleneck.name} with ${reportData.bottleneck.utilization.toFixed(1)}% utilization.</p>
        `;
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
        // Trigger the summary report display
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
        this.elements[buttonName].disabled = false;
    }

    disableButton(buttonName) {
        this.elements[buttonName].disabled = true;
    }

    updateSpeedButton(multiplier) {
        this.elements.ffButton.textContent = `Fast Forward (x${multiplier})`;
    }
}
