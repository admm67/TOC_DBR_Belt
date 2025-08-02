# TOC_DBR_Belt
Theory of constraints Drum Buffer Rope Stimulation in Belt Manufacturing


https://admm67.github.io/TOC_DBR_Belt/

TOC Drum Buffer Rope (TOC DBR) Simulation for Belt Manufacturing
Technical Document & User Guide

Table of Contents
Introduction

Project Overview

Simulation Design and Architecture

3.1 Workstations & Buffers Modeled

3.2 Core Concepts

3.3 User Inputs & Configuration

Simulation Workflow

4.1 Shift and Break Modeling

4.2 Processing Logic

User Interface

5.1 Controls and Status

5.2 Visual Representation

Data Collection and Reporting

Installation and Usage

Extending and Customizing

Known Limitations and Future Enhancements

References

1. Introduction
This document explains the implementation and usage of the Theory of Constraints Drum Buffer Rope (TOC DBR) Simulation tool applied to belt manufacturing. It enables visualization and analysis of production constraints and workflow efficiency based on TOC principles.

2. Project Overview
The simulation models a manufacturing line consisting of multiple stations representing production steps for belt manufacturing:

Stations: Building, Cutting, Flipping, Curing, Coding

Buffers: Work-In-Progress inventory between stations managing flow

Drum: The bottleneck station controlling the pace (Curing station in this model)

Buffers: Act as "Ropes" to prevent starvation/overproduction

Simulation Duration: Configurable for 1 to 3 shifts (each 8 hours)

Output: Interactive visualization plus detailed throughput and utilization reports

The tool is built primarily with HTML, CSS, and JavaScript to simulate processes with configurable parameters, time scaling, and comprehensive reporting.

3. Simulation Design and Architecture
3.1 Workstations & Buffers Modeled
Station Name	Role	Machines (Capacity)	Processing Time (seconds per set)	Input Buffer	Output Buffer
Building	Initial assembly	User-configurable (default 1)	379.2	backlog-buffer	building-wip
Cutting	Cuts the belts	User-configurable (default 1)	240	building-wip	cutting-wip
Flipping	Prepares belts	User-configurable (default 2)	600	cutting-wip	flipping-wip
Curing (Drum)	Bottleneck station	User-configurable (default 4)	1596	flipping-wip	curing-wip
Coding	Final processing	User-configurable (default 1)	496.2	curing-wip	finished-goods
3.2 Core Concepts
Drum: The bottleneck station (Curing) sets the maximum production rate.

Buffer: Work-in-progress inventory between stations, modeled as queues.

Rope: WIP limits to control flow and avoid bottleneck starvation or overproduction.

Shifts: The timeline is segmented to simulate work periods and breaks.

3.3 User Inputs & Configuration
Upon starting the simulation, the user is prompted to enter:

Number of shifts (1 to 3)

Number of machines in each station

Backlog volume (initial sets waiting to be processed)

These inputs initialize simulation parameters such as capacity and backlog levels.

4. Simulation Workflow
4.1 Shift and Break Modeling
Each shift is 8 hours long

Scheduled breaks per shift:

Two 10-minute bio breaks (2 hr & 6 hr marks)

One 30-minute lunch break (4 hr mark)

Machines and stations pause operations during breaks

4.2 Processing Logic
Processing occurs in discrete steps representing belt sets moving from one station to the next.

Each set requires station-specific processing time and machine availability.

Buffers maintain sets waiting between stations.

The Drum (Curing station) output rate controls pacing; upstream buffers prevent starvations or overflows.

Simulation time advances in milliseconds, with real-time UI updates.

User can control simulation speed (1x to 60x), pause, resume or reset.

5. User Interface
5.1 Controls and Status
Start, Pause, Resume, Fast Forward, Reset buttons to manage simulation flow

Real-time clock displaying simulation time

Status indicator showing if the line is running or on break

5.2 Visual Representation
Stations displayed as labeled containers with belts represented by colored circles

Buffers shown with dashed borders between stations

Drum station visually emphasized with red border and background highlight

Belt sets change color when processing vs waiting

Responsive layout adapting to screen size

Summary reports shown in modal with tables and charts

6. Data Collection and Reporting
During simulation, data is collected for:

Total sets processed per station

Idle and working times for each station

Utilization percentages (workload vs availability)

Buffer history and average WIP

Hourly throughput over the entire simulation period

Identification of the primary bottleneck by maximum utilization

At the end, a summary modal displays:

Hourly and total throughput

Station-wise detailed statistics

Buffer WIP levels

Bottleneck identification

7. Installation and Usage
Download / Clone the project files:

index.html

style.css

script.js

README.md

Open index.html in a modern web browser (Chrome, Firefox, Edge).

Configure the simulation:
On start, enter:

Number of shifts (1–3)

Number of machines per station

Backlog sets

Manage simulation via control buttons:

Start to begin

Pause / Resume for control

Fast Forward to speed up (up to 60x)

Reset to restart simulation

View simulation status and visual workflow in real time.

At simulation end, inspect the summary report for detailed analytics.

8. Extending and Customizing
Add new stations: Modify station definitions in script.js

Adjust timings/capacities: Change parameters in setupSimulation() function

Improve UI: Edit style.css for colors, layouts, fonts

Add export features: Extend JS to export data as CSV or Excel

Include charts: Integrate chart libraries (e.g., Chart.js) for enhanced analytics

9. Known Limitations and Future Enhancements
Static processing times without stochastic variation

No user interface for parameter input (relies on prompts)

Limited error handling for invalid user input

Bottleneck identification based on utilization only (could be enhanced with dynamic detection)

No persistent storage or data export at present

10. References
Theory of Constraints (TOC) concepts: Eliyahu Goldratt

Drum Buffer Rope methodology

Project Demo and Code Repository

Appendix: Quick Reference for Code Files
File	Description
index.html	Base HTML structure, UI elements
style.css	Stylesheet for layout and visuals
script.js	Core simulation logic and UI interaction
README.md	Project summary and URL
# DBR Simulation - Scrollable Summary Modal Fix

## Problem Solved
The original summary popup modal could overflow the viewport when displaying extensive simulation results, making some content inaccessible to users. This update makes the modal content scrollable while maintaining a clean, professional appearance.

## Files Modified

### 1. `style_modified.css` (Main Changes)
- **Modal Structure**: Converted to flexbox layout with header, body, and footer sections
- **Scrollable Content**: Added `overflow-y: auto` to the body section with max-height constraints
- **Visual Improvements**: Enhanced spacing, typography, and mobile responsiveness
- **Custom Scrollbar**: Added webkit scrollbar styling for better appearance
- **Responsive Design**: Improved mobile layout with appropriate sizing

### 2. `index_modified.html` (Structure Changes)
- **Modal Restructure**: Split modal into three sections:
  - `.summary-modal-header` - Contains the "Shift Over!" title (fixed)
  - `.summary-modal-body` - Contains scrollable content (scrollable)
  - `.summary-modal-footer` - Contains the close button (fixed)
- **CSS Reference**: Updated to use the modified stylesheet

### 3. `script_modified.js` (No Changes)
- Remains identical to original since content insertion logic is unchanged
- All existing functionality preserved

## Key Features of the Solution

### Scrolling Behavior
- **Max Height**: Modal limited to 90% of viewport height
- **Smooth Scrolling**: Native browser scrolling with custom scrollbar
- **Header/Footer Fixed**: Title and close button remain visible while scrolling
- **Content Scrollable**: Only the report content scrolls

### Visual Enhancements
- **Semi-transparent Overlay**: Better visual separation from background
- **Improved Typography**: Better heading hierarchy and spacing
- **Enhanced Tables**: Better padding and visual structure
- **Custom Scrollbar**: Styled scrollbar for webkit browsers

### Mobile Responsiveness
- **Full Width**: Modal uses full width on mobile devices
- **Touch Friendly**: Optimized for touch scrolling
- **Readable Text**: Appropriate font sizes for mobile screens

## Usage Instructions

1. Replace the original files with the modified versions:
   - `index.html` â†’ `index_modified.html`
   - `style.css` â†’ `style_modified.css`
   - `script.js` â†’ `script_modified.js`

2. Update the HTML file references:
   - CSS: `<link rel="stylesheet" href="style_modified.css"/>`
   - JS: `<script src="script_modified.js"></script>`

3. Test the application:
   - Run a simulation with multiple shifts to generate long reports
   - Verify the modal is scrollable when content exceeds viewport height
   - Test on both desktop and mobile devices

## Browser Compatibility
- **Modern Browsers**: Full support with custom scrollbar styling
- **Older Browsers**: Fallback to default scrollbar appearance
- **Mobile Browsers**: Native touch scrolling supported

## Technical Details

### CSS Changes
```css
/* Main modal container with overlay */
#summary-report {
    background: rgba(0, 0, 0, 0.5) !important;
    padding: 20px;
}

/* Modal content with height constraints */
.summary-modal-content {
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* Scrollable body section */
.summary-modal-body {
    overflow-y: auto;
    flex-grow: 1;
}
```

### HTML Structure
```html
<div id="summary-report" class="hidden">
    <div class="summary-modal-content">
        <div class="summary-modal-header"><!-- Fixed header --></div>
        <div class="summary-modal-body"><!-- Scrollable content --></div>
        <div class="summary-modal-footer"><!-- Fixed footer --></div>
    </div>
</div>
```

## Benefits
1. **Accessibility**: All content is now accessible regardless of screen size
2. **User Experience**: Intuitive scrolling behavior with visual feedback
3. **Professional Appearance**: Clean, modern modal design
4. **Mobile Friendly**: Optimized for touch devices
5. **Maintainable**: Clear separation of concerns in CSS and HTML structure
