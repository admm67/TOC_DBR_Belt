// js/modules/SimulationEngine.js
export class SimulationEngine {
    constructor(config, stats) {
        this.config = config;
        this.stats = stats;
        this.simulationTime = 0; // ms
        this.setCounter = 0;
        this.simulationInterval = null;
        this.dashboardInterval = null;
        this.currentSpeedMultiplier = 1;

        // Time scaling: 1 real second = 1 sim minute
        this.baseSimMsPerRealSecond = 60000;
        this.stepIntervalRealMs = 100; // loop every 100 ms real time
        this.simStepIncrement = (this.baseSimMsPerRealSecond / 1000) * this.stepIntervalRealMs;
    }

    // Convert breaks from minutes to ms for comparison
    isOnBreak(currentTime) {
        return this.config.shiftDetails.breaks.some(breakPeriod =>
            currentTime >= breakPeriod.start * 60 * 1000 &&
            currentTime <= breakPeriod.end * 60 * 1000
        );
    }

    getCurrentBreakName(currentTime) {
        const currentBreak = this.config.shiftDetails.breaks.find(breakPeriod =>
            currentTime >= breakPeriod.start * 60 * 1000 &&
            currentTime <= breakPeriod.end * 60 * 1000
        );
        return currentBreak ? currentBreak.name : null;
    }

    processStation(stationId, station, onBreak) {
        const stationElement = document.getElementById(stationId);
        const inputBuffer = document.getElementById(station.inputBuffer);
        const outputBuffer = station.outputBuffer !== 'finished-goods'
            ? document.getElementById(station.outputBuffer)
            : document.getElementById('finished-goods');

        if (!stationElement || !inputBuffer) return;

        // Skip stations during break unless they are curing
        if (onBreak && station.type !== 'curing') {
            // Count idle time during break
            this.stats.stations[stationId].idleTime += this.simStepIncrement * this.currentSpeedMultiplier;
            return;
        }

        // Determine capacity based on break status
        const capacity = onBreak && station.breakCapacity
            ? station.breakCapacity
            : station.capacity;

        // STEP 1: Update ongoing processing
        const completedSets = [];
        Array.from(stationElement.children).forEach(setElement => {
            let remaining = parseInt(setElement.getAttribute('data-remaining-time'), 10);
            remaining -= this.simStepIncrement * this.currentSpeedMultiplier;
            setElement.setAttribute('data-remaining-time', remaining);

            if (remaining <= 0) {
                completedSets.push(setElement);
            }
        });

        // Batch move completed sets
        if (completedSets.length > 0) {
            const frag = document.createDocumentFragment();
            completedSets.forEach(setElement => {
                setElement.classList.remove('processing');
                frag.appendChild(setElement);
                this.stats.stations[stationId].setsProcessed++;
            });
            outputBuffer.appendChild(frag);
        }

        // STEP 2: Move new sets into processing if space available
        const availableSlots = capacity - stationElement.children.length;
        const setsToProcess = Math.min(availableSlots, inputBuffer.children.length);
        if (setsToProcess > 0) {
            const frag = document.createDocumentFragment();
            for (let i = 0; i < setsToProcess; i++) {
                const setElement = inputBuffer.children[0];
                if (setElement) {
                    setElement.classList.add('processing');
                    setElement.setAttribute('data-remaining-time', station.time * 1000); // seconds → ms
                    frag.appendChild(setElement);
                }
            }
            stationElement.appendChild(frag);
        }

        // STEP 3: Update working/idle time
        const isWorking = stationElement.children.length > 0 && !onBreak;
        if (isWorking) {
            this.stats.stations[stationId].workingTime += this.simStepIncrement * this.currentSpeedMultiplier;
        } else {
            this.stats.stations[stationId].idleTime += this.simStepIncrement * this.currentSpeedMultiplier;
        }
    }

    runSimulationStep() {
        const onBreak = this.isOnBreak(this.simulationTime);

        // Process each station
        Object.keys(this.config.stations).forEach(stationId => {
            const station = this.config.stations[stationId];
            this.processStation(stationId, station, onBreak);
        });

        // Advance simulation time scaled by multiplier
        this.simulationTime += this.simStepIncrement * this.currentSpeedMultiplier;

        return {
            simulationTime: this.simulationTime,
            onBreak,
            breakName: this.getCurrentBreakName(this.simulationTime),
            completed: this.simulationTime >= this.config.shiftDetails.duration * 60 * 1000 // minutes → ms
        };
    }

    start() {
        this.simulationInterval = setInterval(() => {
            const result = this.runSimulationStep();

            document.dispatchEvent(new CustomEvent('simulationStep', {
                detail: result
            }));

            if (result.completed) {
                this.stop();
                document.dispatchEvent(new CustomEvent('simulationComplete'));
            }
        }, this.stepIntervalRealMs);
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