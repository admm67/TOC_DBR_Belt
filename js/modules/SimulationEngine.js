export class SimulationEngine {
    constructor(config, stats) {
        this.config = config;
        this.stats = stats;
        this.simulationTime = 0; // ms
        this.setCounter = 0;
        this.simulationInterval = null;
        this.dashboardInterval = null;
        this.currentSpeedMultiplier = 1;

        // Base: 1 real second = 1 simulated minute (60,000 ms)
        this.baseSimMsPerRealSecond = 60000;
        this.stepIntervalRealMs = 100; // loop every 100 ms real time
        this.updateSimStepIncrement();
    }

    updateSimStepIncrement() {
        this.simStepIncrement = (this.baseSimMsPerRealSecond / 1000) * this.stepIntervalRealMs;
    }

    // Check if current time is in a break period
    isOnBreak(currentTime) {
        return this.config.shiftDetails.breaks.some(breakPeriod => {
            const startMs = this.convertBreakTimeToMs(breakPeriod.start);
            const endMs = this.convertBreakTimeToMs(breakPeriod.end);
            return currentTime >= startMs && currentTime <= endMs;
        });
    }

    getCurrentBreakName(currentTime) {
        const currentBreak = this.config.shiftDetails.breaks.find(breakPeriod => {
            const startMs = this.convertBreakTimeToMs(breakPeriod.start);
            const endMs = this.convertBreakTimeToMs(breakPeriod.end);
            return currentTime >= startMs && currentTime <= endMs;
        });
        return currentBreak ? currentBreak.name : null;
    }

    convertBreakTimeToMs(value) {
        // Allow break times in minutes or seconds — config can set `breakTimeUnit: "seconds" | "minutes"`
        const unit = this.config.shiftDetails.breakTimeUnit || "minutes";
        return unit === "seconds" ? value * 1000 : value * 60 * 1000;
    }

    processStation(stationId, station, onBreak) {
        const stationElement = document.getElementById(stationId);
        const inputBuffer = document.getElementById(station.inputBuffer);
        const outputBuffer = station.outputBuffer !== 'finished-goods'
            ? document.getElementById(station.outputBuffer)
            : document.getElementById('finished-goods');

        if (!stationElement || !inputBuffer) return;

        // Skip stations during break unless they are curing (isDrum = true)
        if (onBreak && !station.isDrum) {
            this.stats.stations[stationId].idleTime += this.simStepIncrement * this.currentSpeedMultiplier;
            return;
        }

        // Adjust capacity during break if breakCapacity is set
        const capacity = onBreak && station.breakCapacity ? station.breakCapacity : station.capacity;

        // --- Step 1: Update processing items ---
        const completedSets = [];
        Array.from(stationElement.children).forEach(setElement => {
            let remaining = parseInt(setElement.getAttribute('data-remaining-time'), 10);
            remaining -= this.simStepIncrement * this.currentSpeedMultiplier;
            setElement.setAttribute('data-remaining-time', remaining);

            if (remaining <= 0) {
                completedSets.push(setElement);
            }
        });

        // Move completed items in a batch for performance
        if (completedSets.length > 0) {
            const frag = document.createDocumentFragment(); // Holds items before DOM insert
            completedSets.forEach(setElement => {
                setElement.classList.remove('processing');
                frag.appendChild(setElement);
                this.stats.stations[stationId].setsProcessed++;
            });
            outputBuffer.appendChild(frag);
        }

        // --- Step 2: Start processing new sets ---
        const availableSlots = capacity - stationElement.children.length;
        const setsToProcess = Math.min(availableSlots, inputBuffer.children.length);
        if (setsToProcess > 0) {
            const frag = document.createDocumentFragment();
            for (let i = 0; i < setsToProcess; i++) {
                const setElement = inputBuffer.children[0];
                if (setElement) {
                    setElement.classList.add('processing');
                    // Time scaled by multiplier so speeding up works
                    setElement.setAttribute('data-remaining-time', (station.time * 1000) / this.currentSpeedMultiplier);
                    frag.appendChild(setElement);
                }
            }
            stationElement.appendChild(frag);
        }

        // --- Step 3: Track working/idle ---
        const isWorking = stationElement.children.length > 0;
        if (isWorking) {
            this.stats.stations[stationId].workingTime += this.simStepIncrement * this.currentSpeedMultiplier;
        } else {
            this.stats.stations[stationId].idleTime += this.simStepIncrement * this.currentSpeedMultiplier;
        }
    }

    runSimulationStep() {
        const onBreak = this.isOnBreak(this.simulationTime);

        Object.keys(this.config.stations).forEach(stationId => {
            const station = this.config.stations[stationId];
            this.processStation(stationId, station, onBreak);
        });

        this.simulationTime += this.simStepIncrement * this.currentSpeedMultiplier;

        return {
            simulationTime: this.simulationTime,
            onBreak,
            breakName: this.getCurrentBreakName(this.simulationTime),
            completed: this.simulationTime >= this.convertBreakTimeToMs(this.config.shiftDetails.duration)
        };
    }

    start() {
        this.simulationInterval = setInterval(() => {
            const result = this.runSimulationStep();

            document.dispatchEvent(new CustomEvent('simulationStep', { detail: result }));

            if (result.completed) {
                this.stop();
                document.dispatchEvent(new CustomEvent('simulationComplete'));
            }
        }, this.stepIntervalRealMs);
    }

    pause() {
        clearInterval(this.simulationInterval);
        this.simulationInterval = null;
    }

    resume() {
        if (!this.simulationInterval) this.start();
    }

    stop() {
        clearInterval(this.simulationInterval);
        clearInterval(this.dashboardInterval);
        this.simulationInterval = null;
        this.dashboardInterval = null;
    }

    setSpeedMultiplier(multiplier) {
        this.currentSpeedMultiplier = multiplier;
        this.updateSimStepIncrement();
    }

    reset() {
        this.stop();
        this.simulationTime = 0;
        this.setCounter = 0;
        this.currentSpeedMultiplier = 1;
        this.updateSimStepIncrement();

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