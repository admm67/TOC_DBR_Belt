// js/modules/ConfigManager.js
export class ConfigManager {
    constructor() {
        this.activeConfig = {};
        this.initialBacklogSize = 0;
    }

    getSimulationParameters() {
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

    setupConfiguration(params) {
        this.initialBacklogSize = params.backlog;
        
        this.activeConfig = {
            timeScale: 60,
            shiftDetails: {
                duration: params.shifts * 8 * 3600 * 1000,
                breaks: []
            },
            stations: {
                Building: {
                    name: "Building",
                    capacity: params.building,
                    time: 379.2,
                    inputBuffer: 'backlog-buffer',
                    outputBuffer: 'building-wip'
                },
                Cutting: {
                    name: "Cutting",
                    capacity: params.cutting,
                    time: 240,
                    inputBuffer: 'building-wip',
                    outputBuffer: 'cutting-wip'
                },
                Flipping: {
                    name: "Flipping",
                    capacity: params.flipping,
                    time: 600,
                    inputBuffer: 'cutting-wip',
                    outputBuffer: 'flipping-wip'
                },
                Curing: {
                    name: "Curing (DRUM)",
                    capacity: params.curing,
                    breakCapacity: Math.ceil(params.curing / 2),
                    time: 1596,
                    inputBuffer: 'flipping-wip',
                    outputBuffer: 'curing-wip',
                    isDrum: true
                },
                Coding: {
                    name: "Coding",
                    capacity: params.coding,
                    time: 496.2,
                    inputBuffer: 'curing-wip',
                    outputBuffer: 'finished-goods'
                }
            }
        };

        // Setup breaks for each shift
        for (let i = 0; i < params.shifts; i++) {
            const shiftStart = i * 8 * 3600 * 1000;
            this.activeConfig.shiftDetails.breaks.push(
                {
                    name: `S${i+1} Bio 1`,
                    start: shiftStart + (2 * 3600 * 1000),
                    end: shiftStart + (2 * 3600 * 1000) + (10 * 60 * 1000)
                },
                {
                    name: `S${i+1} Lunch`,
                    start: shiftStart + (4 * 3600 * 1000),
                    end: shiftStart + (4 * 3600 * 1000) + (30 * 60 * 1000)
                },
                {
                    name: `S${i+1} Bio 2`,
                    start: shiftStart + (6 * 3600 * 1000),
                    end: shiftStart + (6 * 3600 * 1000) + (10 * 60 * 1000)
                }
            );
        }

        return this.activeConfig;
    }

    getConfig() {
        return this.activeConfig;
    }

    getInitialBacklogSize() {
        return this.initialBacklogSize;
    }
}
