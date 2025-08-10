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

        // Duration in MINUTES (8 hrs per shift)
        const totalShiftMinutes = params.shifts * 8 * 60;

        this.activeConfig = {
            shiftDetails: {
                duration: totalShiftMinutes, // minutes (engine converts to ms)
                breaks: [] // minutes
            },
            stations: {
                Building: {
                    type: "normal",
                    name: "Building",
                    capacity: params.building,
                    time: 379.2, // seconds per unit
                    inputBuffer: 'backlog-buffer',
                    outputBuffer: 'building-wip'
                },
                Cutting: {
                    type: "normal",
                    name: "Cutting",
                    capacity: params.cutting,
                    time: 240,
                    inputBuffer: 'building-wip',
                    outputBuffer: 'cutting-wip'
                },
                Flipping: {
                    type: "normal",
                    name: "Flipping",
                    capacity: params.flipping,
                    time: 600,
                    inputBuffer: 'cutting-wip',
                    outputBuffer: 'flipping-wip'
                },
                Curing: {
                    type: "curing", // important for break handling
                    name: "Curing (DRUM)",
                    capacity: params.curing,
                    breakCapacity: Math.ceil(params.curing / 2),
                    time: 1596,
                    inputBuffer: 'flipping-wip',
                    outputBuffer: 'curing-wip',
                    isDrum: true
                },
                Coding: {
                    type: "normal",
                    name: "Coding",
                    capacity: params.coding,
                    time: 496.2,
                    inputBuffer: 'curing-wip',
                    outputBuffer: 'finished-goods'
                }
            }
        };

        // Breaks in minutes (shift start = 0, 8 hrs = 480 mins)
        for (let i = 0; i < params.shifts; i++) {
            const shiftStartMin = i * 8 * 60;

            this.activeConfig.shiftDetails.breaks.push(
                {
                    name: `S${i+1} Bio 1`,
                    start: shiftStartMin + 120, // 2 hrs into shift
                    end: shiftStartMin + 130    // +10 mins
                },
                {
                    name: `S${i+1} Lunch`,
                    start: shiftStartMin + 240, // 4 hrs in
                    end: shiftStartMin + 270    // +30 mins
                },
                {
                    name: `S${i+1} Bio 2`,
                    start: shiftStartMin + 360, // 6 hrs in
                    end: shiftStartMin + 370    // +10 mins
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