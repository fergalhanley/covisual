import TWEEN from "./Tween";
import {Detector} from "./Detector";
import Globe from "./Globe";

let dates;
let container;
let globe;

const settime = (t) => {
    return function () {
        new TWEEN.Tween(globe)
            .to({time: t / dates.length}, 500)
            .easing(TWEEN.Easing.Cubic.EaseOut)
            .start();
        var y = document.getElementById(dates[t]);
        if (y.getAttribute("class").indexOf("active") > -1) {
            return;
        }
        var yy = document.getElementsByClassName("date");
        for (var i = 0; i < yy.length; i++) {
            yy[i].classList.remove("active");
        }
        y.classList.add("active");
        globe.setDay(t);
    };
};

function init() {

    console.log("initialising...");

    if (!Detector.webgl) {
        Detector.addGetWebGLMessage();
    } else {
        dates = [];
        container = document.getElementById('container');
        globe = new Globe(container);
    }

    var currentInfo = document.getElementById("currentInfo");
    var addDateLink = function (date) {
        if (!date) {
            var dataElem = document.createElement("span");
            dataElem.setAttribute("class", "date-placeholder");
            currentInfo.appendChild(dataElem);
        } else {
            var id = date.replace("/", "-");
            dates.push(id);
            var frag = date.split("/");
            var dataElem = document.createElement("span");
            dataElem.setAttribute("id", id);
            dataElem.setAttribute("class", "date month" + (parseInt(frag[0]) % 2));
            dataElem.innerText = frag[1];
            currentInfo.appendChild(dataElem);
        }
    };

    var xhr;
    TWEEN.start();

    xhr = new XMLHttpRequest();
    xhr.open('GET', "covid-data.json?t=" + Math.floor(Date.now() / 5000), true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                var data = JSON.parse(xhr.responseText);
                window["data"] = data;
                globe.addMeta(data[0], data[1]);
                for (var i = 2; i < data.length; i++) {
                    addDateLink(data[i][0]);
                    if (data[i][1].length) {
                        globe.addData(data[i][1], {format: 'magnitude', name: data[i][0], animated: true});
                    }
                }
                globe.createPoints();
                settime(dates.length - 1)();
                setupDateSelectEvents();
                globe.animate();
                document.body.style.backgroundImage = 'none'; // remove loading
            }
        }
    };
    xhr.send(null);

    function setupDateSelectEvents() {
        for (var i = 0; i < dates.length; i++) {
            var y = document.getElementById(dates[i]);
            y.addEventListener('mouseover', settime(i), false);
            y.addEventListener('touchmove', settime(i), false);
        }
    }

    globe.onLocationSelected(function (loc) {
        $("region-info").style.visibility = "visible";
        $("region-name").innerText = loc.name;
        $("cases").innerText = loc.cases;
        $("deaths").innerText = loc.deaths;
        $("recovered").innerText = loc.recovered;
        $("cases-active").innerText = String(loc.cases - (loc.recovered + loc.deaths));
    });
}

window.onload = init;

function $(id) {
    return document.getElementById(id);
}
