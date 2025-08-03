// js/main.js
import { ConfigManager } from './modules/ConfigManager.js';
import { SimulationEngine } from './modules/SimulationEngine.js';
import { DataAnalytics } from './modules/DataAnalytics.js';
import { UIController } from './modules/UIController.js';

class SimulationApp {
    constructor() {
        this.configManager = new ConfigManager();
        this.uiController = new UIController();
        this.simulationEngine = null;
        this.dataAnalytics = null;
        this.stats = {};
        this.speedMultipliers = [1, 2, 5, 10, 15, 30, 60];
        this.currentSpeedIndex = 0;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Button event listeners
        this.uiController.elements.startButton.addEventListener('click', () => this.startSimulation());
        this.uiController.elements.pauseButton.addEventListener('click', () => this.pauseSimulation());
        this.uiController.elements.resumeButton.addEventListener('click', () => this.resumeSimulation());
        this.uiController.elements.ffButton.addEventListener('click', () => this.toggleFastForward());
        this.uiController.elements.resetButton.addEventListener('click', () => this.resetSimulation());
        this.uiController.elements.closeSummaryButton.addEventListener('click', () => this.uiController.hideSummaryReport());

        // Fixed simulation step handler with all required updates
        document.addEventListener('simulationStep', (event) => {
            this.uiController.updateClock(event.detail.simulationTime);
            this.uiController.updateStatus(event.detail.onBreak, event.detail.breakName);
            this.uiController.updateBufferCounts();
            
            // Update statistics every 5 seconds of simulation time
            if (event.detail.simulationTime % 5000 < 100 * this.currentSpeedIndex) {
                if (this.dataAnalytics) {
                    const updatedStats = this.dataAnalytics.updateRealTimeStats(event.detail.simulationTime);
                    this.uiController.updateStationStats(updatedStats);
                }
            }
        });

        document.addEventListener('showSummaryReport', () => this.showSummaryReport());
    }

    startSimulation() {
        const params = this.configManager.getSimulationParameters();
        const config = this.configManager.setupConfiguration(params);
        
        this.initializeStats(config);
        this.uiController.createStationHTML(config, this.stats);
        this.uiController.addInitialBacklog(this.configManager.getInitialBacklogSize());

        this.simulationEngine = new SimulationEngine(config, this.stats);
        this.dataAnalytics = new DataAnalytics(this.stats, config);

        this.uiController.disableButton('startButton');
        this.uiController.enableButton('pauseButton');
        this.uiController.enableButton('ffButton');
        this.uiController.enableButton('resetButton');

        this.simulationEngine.start();
    }

    pauseSimulation() {
        this.simulationEngine.pause();
        this.uiController.enableButton('resumeButton');
        this.uiController.disableButton('pauseButton');
    }

    resumeSimulation() {
        this.simulationEngine.resume();
        this.uiController.enableButton('pauseButton');
        this.uiController.disableButton('resumeButton');
    }

    toggleFastForward() {
        this.currentSpeedIndex = (this.currentSpeedIndex + 1) % this.speedMultipliers.length;
        const newSpeed = this.speedMultipliers[this.currentSpeedIndex];
        
        this.simulationEngine.setSpeedMultiplier(newSpeed);
        this.uiController.updateSpeedButton(newSpeed);
    }

    resetSimulation() {
        if (this.simulationEngine) {
            this.simulationEngine.reset();
        }
        
        this.currentSpeedIndex = 0;
        this.uiController.updateSpeedButton(1);
        this.uiController.enableButton('startButton');
        this.uiController.disableButton('pauseButton');
        this.uiController.disableButton('resumeButton');
        this.uiController.disableButton('ffButton');
        this.uiController.hideSummaryReport();

        // Clear the display
        const stationsWrapper = document.getElementById('stations-wrapper');
        if (stationsWrapper) {
            stationsWrapper.innerHTML = '';
        }
    }

    showSummaryReport() {
        if (this.dataAnalytics) {
            const reportData = this.dataAnalytics.generateReport();
            this.uiController.showSummaryReport(reportData);
        }
    }

    initializeStats(config) {
        this.stats = {
            totalTime: 0,
            buffers: {},
            stations: {},
            hourlyOutput: Array(Math.floor(config.shiftDetails.duration / (1000 * 3600))).fill(0)
        };

        Object.keys(config.stations).forEach(id => {
            const station = config.stations[id];
            this.stats.stations[id] = {
                id,
                name: station.name,
                setsProcessed: 0,
                idleTime: 0,
                workingTime: 0,
                utilization: 0
            };
        });
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SimulationApp();
});
