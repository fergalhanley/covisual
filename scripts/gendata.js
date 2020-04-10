const fs = require("fs");

const DATA_DIR = "COVID-19/csse_covid_19_data/csse_covid_19_time_series";
const OUT_FILE = "public/covid-data.json";

function clean(fileText) {
    return fileText.replace('"Korea, South"', "South Korea").trim();
}

const confirmedFile = clean(fs.readFileSync(`${DATA_DIR}/time_series_covid19_confirmed_global.csv`, "utf8"));
const deathFile = clean(fs.readFileSync(`${DATA_DIR}/time_series_covid19_deaths_global.csv`, "utf8"));
const recoverFile = clean(fs.readFileSync(`${DATA_DIR}/time_series_covid19_recovered_global.csv`, "utf8"));

let data;
const offset = 4;
let max = 0;

function precise(val) {
    return parseFloat(parseFloat(val).toFixed(1));
}

// first get the max and all the lat/long values
const latLong = [];

confirmedFile.split("\n").forEach((row, i) => {

    const cells = row.split(",");

    if (i === 0 || (cells[2] === undefined && cells[3] === undefined)) return;

    // calc lat/longs
    latLong.push(precise(cells[2]));
    latLong.push(precise(cells[3]));
    const location = [];
    if (cells[0]) {
        location.push(cells[0]);
    }
    if (cells[1]) {
        location.push(cells[1]);
    }
    latLong.push(location.join(", "));

    // calc max
    for (let i = offset; i < cells.length; i++) {
        if (parseInt(cells[i]) > max) {
            max = parseInt(cells[i]);
        }
    }
});

function getRow(rows, cCells) {
    for (let row of rows) {
        if (row.indexOf(`${cCells[2]},${cCells[3]}`) > -1) {
            return row;
        }
    }
    return cCells.slice(0, 4).concat(new Array(cCells.length-4).fill(0)).join(",");
}

const cRows = confirmedFile.split("\n");
const dRows = deathFile.split("\n");
const rRows = recoverFile.split("\n");

for (let i = 0; i < cRows.length; i++) {

    const cRow = cRows[i];
    const cCells = cRow.split(",");

    const dRow = getRow(dRows, cCells);
    const dCells = dRow.split(",");

    const rRow = getRow(rRows, cCells);
    const rCells = rRow.split(",");

    if (i === 0) {
        data = cCells.slice(offset).map((d) => [d, []]);
    } else {
        for (let i = offset; i < cCells.length; i++) {
            if (data[i - offset]) {
                const confirmed = parseInt(cCells[i]);
                const dead = parseInt(dCells[i]);
                const recovered = parseInt(rCells[i]);
                data[i - offset][1].push(confirmed || 0, dead || 0, recovered || 0);
            }
        }
    }
}

// pad out the start of the data based on first the day of the week that the data started getting fulfilled on

const dateFrags = data[0][0].split("/");
const firstDay = new Date(0);
firstDay.setUTCFullYear(
    parseInt(`20${parseInt(dateFrags[2])}`), // year
    parseInt(dateFrags[0] - 1), // month
    parseInt(dateFrags[1]), // date
);

for (let i = firstDay.getDay() - 1; i >= 0; i--) {
    data.unshift(["", []]);
}

data.unshift(max);
data.unshift(latLong);

fs.writeFileSync(OUT_FILE, JSON.stringify(data), "utf8");
console.log("Done");
