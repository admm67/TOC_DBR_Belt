// js/modules/SimulationEngine.js
export class SimulationEngine {
    constructor(config, stats) {
        this.config = config;
        this.stats = stats;
        this.simulationTime = 0;
        this.setCounter = 0;
        this.simulationInterval = null;
        this.dashboardInterval = null;
        this.currentSpeedMultiplier = 1;
    }

    isOnBreak(currentTime) {
        return this.config.shiftDetails.breaks.some(breakPeriod => 
            currentTime >= breakPeriod.start && currentTime <= breakPeriod.end
        );
    }

    getCurrentBreakName(currentTime) {
        const currentBreak = this.config.shiftDetails.breaks.find(breakPeriod => 
            currentTime >= breakPeriod.start && currentTime <= breakPeriod.end
        );
        return currentBreak ? currentBreak.name : null;
    }

    processStation(stationId, station, onBreak) {
        const stationElement = document.getElementById(stationId);
        const inputBuffer = document.getElementById(station.inputBuffer);
        const outputBuffer = station.outputBuffer !== 'finished-goods' ? 
            document.getElementById(station.outputBuffer) : 
            document.getElementById('finished-goods');

        if (!stationElement || !inputBuffer) return;

        // Determine capacity based on break status
        const capacity = onBreak && station.breakCapacity ? 
            station.breakCapacity : station.capacity;

        // STEP 1: Process completed sets FIRST (immediate changeover)
        const completedSets = [];
        Array.from(stationElement.children).forEach(setElement => {
            const startTime = parseInt(setElement.getAttribute('data-start-time'));
            const processingTime = parseInt(setElement.getAttribute('data-processing-time'));
            
            // Check if processing is complete
            if (this.simulationTime >= startTime + processingTime) {
                completedSets.push(setElement);
            }
        });

        // Move completed sets immediately
        completedSets.forEach(setElement => {
            setElement.classList.remove('processing');
            
            if (station.outputBuffer === 'finished-goods') {
                if (outputBuffer) {
                    outputBuffer.appendChild(setElement);
                }
            } else if (outputBuffer) {
                outputBuffer.appendChild(setElement);
            }
            
            // Update statistics
            this.stats.stations[stationId].setsProcessed++;
        });

        // STEP 2: Move new sets from input to processing
        const availableSlots = capacity - stationElement.children.length;
        const inputSets = inputBuffer.children.length;
        const setsToProcess = Math.min(availableSlots, inputSets);

        for (let i = 0; i < setsToProcess; i++) {
            const setElement = inputBuffer.children[0];
            if (setElement) {
                setElement.classList.add('processing');
                setElement.setAttribute('data-start-time', this.simulationTime);
                setElement.setAttribute('data-processing-time', station.time * 1000);
                stationElement.appendChild(setElement);
            }
        }

        // STEP 3: Update working/idle statistics
        const isWorking = stationElement.children.length > 0 && !onBreak;
        if (isWorking) {
            this.stats.stations[stationId].workingTime += 100 * this.currentSpeedMultiplier;
        } else {
            this.stats.stations[stationId].idleTime += 100 * this.currentSpeedMultiplier;
        }
    }

    runSimulationStep() {
        const onBreak = this.isOnBreak(this.simulationTime);
        
        // Process each station
        Object.keys(this.config.stations).forEach(stationId => {
            const station = this.config.stations[stationId];
            this.processStation(stationId, station, onBreak);
        });

        // Proper time advancement that scales with speed multiplier
        this.simulationTime += 100 * this.currentSpeedMultiplier;
        
        return {
            simulationTime: this.simulationTime,
            onBreak,
            breakName: this.getCurrentBreakName(this.simulationTime),
            completed: this.simulationTime >= this.config.shiftDetails.duration
        };
    }

    start() {
        this.simulationInterval = setInterval(() => {
            const result = this.runSimulationStep();
            
            // Emit events for UI updates
            document.dispatchEvent(new CustomEvent('simulationStep', {
                detail: result
            }));

            if (result.completed) {
                this.stop();
                document.dispatchEvent(new CustomEvent('simulationComplete'));
            }
        }, 100); // Keep interval at 100ms, but scale time advancement internally
    }

    pause() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }
    }

    resume() {
        if (!this.simulationInterval) {
            this.start();
        }
    }

    stop() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }
        if (this.dashboardInterval) {
            clearInterval(this.dashboardInterval);
            this.dashboardInterval = null;
        }
    }

    setSpeedMultiplier(multiplier) {
        this.currentSpeedMultiplier = multiplier;
    }

    reset() {
        this.stop();
        this.simulationTime = 0;
        this.setCounter = 0;
        this.currentSpeedMultiplier = 1;
        
        // Reset all stats
        Object.keys(this.stats.stations).forEach(stationId => {
            this.stats.stations[stationId] = {
                ...this.stats.stations[stationId],
                setsProcessed: 0,
                idleTime: 0,
                workingTime: 0,
                utilization: 0
            };
        });
    }
}
