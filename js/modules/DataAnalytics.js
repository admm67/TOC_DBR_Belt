// js/modules/DataAnalytics.js
export class DataAnalytics {
    constructor(stats, config) {
        this.stats = stats;
        this.config = config;
    }

    calculateUtilization() {
        Object.keys(this.stats.stations).forEach(stationId => {
            const station = this.stats.stations[stationId];
            const totalTime = station.workingTime + station.idleTime;
            station.utilization = totalTime > 0 ? 
                (station.workingTime / totalTime) * 100 : 0;
        });
    }

    identifyBottleneck() {
        let bottleneck = null;
        let maxUtilization = 0;

        Object.values(this.stats.stations).forEach(station => {
            if (station.utilization > maxUtilization) {
                maxUtilization = station.utilization;
                bottleneck = station;
            }
        });

        return bottleneck;
    }

    calculateThroughput() {
        const totalSimHours = this.config.shiftDetails.duration / (1000 * 3600);
        const results = {};

        Object.keys(this.stats.stations).forEach(stationId => {
            const station = this.stats.stations[stationId];
            results[stationId] = {
                ...station,
                throughputPerHour: station.setsProcessed / totalSimHours
            };
        });

        return results;
    }

    calculateBufferStats() {
        const bufferStats = {};
        Object.keys(this.stats.buffers).forEach(bufferId => {
            const buffer = this.stats.buffers[bufferId];
            if (buffer.history.length > 0) {
                const sum = buffer.history.reduce((a, b) => a + b, 0);
                bufferStats[bufferId] = {
                    average: sum / buffer.history.length,
                    final: buffer.history[buffer.history.length - 1] || 0
                };
            } else {
                bufferStats[bufferId] = { average: 0, final: 0 };
            }
        });
        return bufferStats;
    }

    updateRealTimeStats(simulationTime) {
        this.calculateUtilization();
        
        // Update hourly output tracking
        const currentHour = Math.floor(simulationTime / (1000 * 3600));
        if (currentHour < this.stats.hourlyOutput.length) {
            const finishedGoods = document.getElementById('finished-goods');
            this.stats.hourlyOutput[currentHour] = finishedGoods ? finishedGoods.children.length : 0;
        }
        
        return this.stats;
    }

    generateReport() {
        this.calculateUtilization();
        const bottleneck = this.identifyBottleneck();
        const throughput = this.calculateThroughput();
        const bufferStats = this.calculateBufferStats();
        const totalSimHours = this.config.shiftDetails.duration / (1000 * 3600);

        return {
            bottleneck,
            throughput,
            bufferStats,
            totalSimHours,
            stations: this.stats.stations,
            hourlyOutput: this.stats.hourlyOutput
        };
    }
}
