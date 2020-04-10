import {Color} from "three";

export function colorFn(hex) {
    var c = new Color();
    c.setHex(hex);
    return c;
}

export function scaled(n, max) {
    return parseFloat((Math.sqrt(n) / Math.sqrt(max)).toFixed(3));
}
