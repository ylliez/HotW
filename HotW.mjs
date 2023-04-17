import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io";

import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT;
// if (port == null || port == "") { port = 4200; }
// const port = 4200;
const server = http.createServer(app);
const io = new SocketIO(server);
server.listen(port, () => { console.log('server listening on port ' + port); })

app.use(express.static(`${__dirname}/public`));
app.use(express.static(`${__dirname}/node_modules`));

io.on("connection", (socket) => {
    console.log("CONNECTED...");
    socket.on("buttonPress", () => {
        console.log("PRESSED!");
        launchProcess();
        // io.emit("S2C", "RECEIVED!");
    });
    socket.on("disconnect", () => { console.log("DISCONNECTED..."); });
});

import dotenv from 'dotenv/config'
import replicate from 'replicate'
import fetch from 'node-fetch'
import fs from 'fs'
import pngToJpeg from 'png-to-jpeg'
import escpos from 'escpos';
import USB from 'escpos-usb';
import Printer from 'c410-printer';
import sound from "sound-play";
import five from 'johnny-five';
import NodeWebcam from "node-webcam";
import recognize from 'tesseractocr';
import mic from 'mic';

const modelT2I = await replicate.model("stability-ai/stable-diffusion:f178fa7a1ae43a9a9af01b833b9d2ecf97b1bcb0acfd2dc5dd04895e042863f1")
const modelI2T = await replicate.model("methexis-inc/img2prompt:50adaf2d3ad20a6f911a8a9e3ccf777b263b8596fbd2c8fc26e8888f8a0edbb5");
const modelT2S = await replicate.model("afiaka87/tortoise-tts:e9658de4b325863c4fcdc12d94bb7c9b54cbfe351b7ca1b36860008172b91c71")
const modelS2T = await replicate.model("openai/whisper:e39e354773466b955265e969568deb7da217804d8e771ea8c9cd0cef6591f8bc")
let predictionT2I, outputT2I, predictionI2T, predictionT2S, outputT2S, predictionS2T, outputS2T;
let outputI2T = "an angry hamster eating brie in an impressionist style";
const device = new USB(10473, 649);
const thermalPrinter = new escpos.Printer(device);
let board, button, led;
let unimpressed = true, delighted = true;
let iter = 1, step = 1;
let filepath, fileiter, filestep;

function launchProcess() {
    console.log(`LOADING...`)
    const timestamp = Date.now();
    fs.mkdir(`HotW_test/${timestamp}`, (err) => { if (err) { return console.error(err); } });
    filepath = `HotW_test/${timestamp}/`;
    fileiter = `${filepath}${iter}`;
    filestep = `${fileiter}_${step}`;
    // let filepath = `app/${timestamp}_${i}`
    // console.log(filepath);

    board = new five.Board({ repl: false, debug: false })
    board.on("ready", function () {
        console.log(`STARTING...`)
        button = new five.Button(8);
        led = new five.Led(2);
        led.on();
        button.on("down", function () {
            if (unimpressed) {
                unimpressed = false;
                setTimeout(function () { unimpressed = true; }, 1000);
                if (delighted) {
                    led.off();
                    delighted = false;
                    doTheThing();
                } else {
                    sound.play("buzzer.mp3");
                    console.log("<buzzer.mp3>")
                }
            }
        });
    });
}

function incrementStepAndTurnLedOn() {
    step++;
    filestep = `${fileiter}_${step}`
    led.on();
    delighted = true;
}

function incrementIterAndResetStep() {
    iter++;
    step = 0;
    fileiter = `${filepath}${iter}`;
    incrementStepAndTurnLedOn();
}

async function doTheThing() {
    switch (step) {
        case 1:
            runT2I();
            break;
        case 2:
            runI2T();
            break;
        case 3:
            runT2S();
            break;
        case 4:
            stepS2T();
            break;
    }
}

async function runT2I() {
    console.log("PREDICTING T2I...");
    predictionT2I = await modelT2I.predict({
        prompt: outputI2T,
        width: 768,
        height: 512
    });
    outputT2I = predictionT2I.output[0];
    console.log(outputT2I)
    await getImage(outputT2I)
}

async function getImage(url) {
    console.log(`FETCHING IMAGE...`)
    const response = await fetch(url);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const write = await writeImage(buffer);
}

function writeImage(buffer) {
    return new Promise((resolve, reject) => {
        console.log(`WRITING IMAGE...`)
        fs.writeFile(filestep + `.png`, buffer, function (err, res) {
            resolve(convertImage());
            if (err) reject(err);
        });
    })
}

function convertImage() {
    return new Promise((resolve, reject) => {
        console.log(`CONVERTING IMAGE...`)
        let convertBuffer = fs.readFileSync(filestep + `.png`)
        pngToJpeg({ quality: 90 })(convertBuffer)
            .then(output => fs.writeFile(filestep + `.jpg`, output, function (err, res) {
                resolve(printImageUSB());
                if (err) reject(err);
            }));
    })
}

function printImageUSB() {
    console.log(`PRINTING IMAGE...`)
    var printer = new Printer('HP_Photosmart_5510_series');
    var fileBuffer = fs.readFileSync(filestep + `.jpg`);
    var options = { o: ' media=4x6.Photo.FullBleed' };
    var jobFromBuffer = printer.printBuffer(fileBuffer, options);
    printer.destroy()
    setTimeout(function () { incrementStepAndTurnLedOn(); }, 15000);
}

async function runI2T() {
    console.log("CAPTURING...");
    NodeWebcam.capture(filestep + `.jpg`, { device: 'HD USB Camera', callbackReturn: "base64" }, async function (err, data) {
        console.log("PREDICTING I2T...");
        predictionI2T = await modelI2T.predict({ image: data });
        outputI2T = predictionI2T.output.trim();
        console.log(outputI2T)
        await getPrompt(outputI2T)
    });
}

async function getPrompt(text) {
    console.log(`SAVING...`)
    console.log(`PRINTING...`) // fix this
    fs.writeFile(filestep + `.txt`, text, function (err, res) {
        printPrompt(text);
    });
}

function printPrompt(text) {
    // console.log(`PRINTING...`)
    device.open(function (error) {
        thermalPrinter
            .size(1, 1)
            // .size(0.5, 0.5)
            .text(text)
            .feed()
            .feed()
            // .cut()
            .close();
    });
    setTimeout(function () { incrementStepAndTurnLedOn(); }, 2000);
}

async function runT2S() {
    console.log("CAPTURING...");
    NodeWebcam.capture("webcam_testOCR", { device: 'HD USB Camera', callbackReturn: "buffer" }, function (err, data) {
        recognizeOCR(data)
    })
}

async function recognizeOCR(data) {
    console.log("RECOGNIZING...");
    const resultOCR = await recognize(data)
    let textOCR = resultOCR.replace(/\n/g, "");
    console.log(textOCR)
    saveOCR(textOCR)
}

function saveOCR(text) {
    console.log(`SAVING...`)
    fs.writeFile(filestep + `.txt`, text, function (err, res) {
        predictT2S(text);
    });
}

async function predictT2S(text) {
    console.log("PREDICTING T2S...");
    predictionT2S = await modelT2S.predict({
        'text': text,
        'voice_a': "random",
    })
    outputT2S = predictionT2S.output;
    console.log(outputT2S)
    await getAudio(outputT2S)
}

async function getAudio(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const write = await writeAudio(buffer);
}

function writeAudio(buffer) {
    return new Promise((resolve, reject) => {
        console.log(`SAVING...`)
        fs.writeFile(filestep + `.mp3`, buffer, function (err, res) {
            resolve(playAudio());
            if (err) reject(err);
        });
    })
}

function playAudio() {
    console.log(`PLAYING...`)
    sound.play(filestep + ".mp3");
    setTimeout(function () { incrementStepAndTurnLedOn(); }, 10000);
}

function stepS2T() {
    console.log("RECORDING...");
    var micInstance = mic({
        debug: false,
        fileType: 'wav'
    });
    var micInputStream = micInstance.getAudioStream();
    var outputFileStream = fs.WriteStream(filestep + '.wav');
    micInputStream.pipe(outputFileStream);
    micInputStream.on('startComplete', function () {
        console.log("Started recording");
        setTimeout(function () {
            micInstance.stop();
        }, 15000);
    });
    micInputStream.on('stopComplete', function () {
        console.log("Stopped recording");
        getRecording();
    });
    micInstance.start();
}

function getRecording() {
    console.log("CONVERTING");
    var audioWAV = filestep + '.wav';
    let audioBase64 = fs.readFileSync(audioWAV, { encoding: 'base64' });
    // console.log(audioBase64)
    runS2T(audioBase64)
}


async function runS2T(speech) {
    console.log("PREDICTING S2T...");
    predictionS2T = await modelS2T.predict({
        'audio': `data:audio/mp3;base64,${speech}`,
        'temperature': 0,
    })
    outputS2T = predictionS2T.output.transcription
    console.log(outputS2T)
    await getTranscription(outputS2T);
}

async function getTranscription(text) {
    console.log(`WRITING...`)
    fs.writeFile(filestep + `.txt`, text, function (err, res) { });
    incrementIterAndResetStep();
}
