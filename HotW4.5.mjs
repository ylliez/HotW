import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io";

import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT;
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
// import escpos from 'escpos';
// import USB from 'escpos-usb';
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
let predictionT2I, outputT2I, predictionI2T, outputI2T, predictionT2S, outputT2S, predictionS2T, outputS2T;
// const device = new USB(10473, 649);
// const thermalPrinter = new escpos.Printer(device);
let board, button, led;
let unimpressed = true, delighted = true;
let iter = 1, step = 1;
let filepath, fileiter;

function launchProcess() {
    console.log(`LOADING...`)
    const timestamp = Date.now();
    fs.mkdir(`HotW_test/${timestamp}`, (err) => { if (err) { return console.error(err); } });
    filepath = `HotW_test/${timestamp}/`;
    fileiter = `${filepath}${iter}`;

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
                    sound.play("buzzer.mp3", 0.1);
                    console.log("<buzzer.mp3>")
                }
            }
        });
    });
}

function incrementStepAndTurnLedOn() {
    step++;
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
            S2T2I();
            break;
        case 2:
            I2T2S();
            break;
    }
}

function S2T2I() {
    S2TrecordSpeech();
}

function S2TrecordSpeech() {
    var micInstance = mic({
        debug: false,
        fileType: 'mp3'
    });
    var micInputStream = micInstance.getAudioStream();
    var outputFileStream = fs.WriteStream(`${fileiter}-1.mp3`);
    micInputStream.pipe(outputFileStream);
    micInputStream.on('startComplete', function () {
        setTimeout(function () { micInstance.stop(); }, 12000);
    });
    micInputStream.on('stopComplete', function () {
        sound.play("assets/iphone_record_stop.mp3", 1.0)
        S2TconvertSpeech();
    });
    sound.play("assets/iphone_record_start.mp3", 1.0)
    console.log("S2T | RECORDING SPEECH...");
    micInstance.start();
}

function S2TconvertSpeech() {
    console.log("S2T | CONVERTING SPEECH...");
    let audiofile = `${fileiter}-1.mp3`;
    let audioBase64 = fs.readFileSync(audiofile, { encoding: 'base64' });
    S2TpredictText(audioBase64)
}

async function S2TpredictText(speech) {
    console.log("S2T | PREDICTING TEXT...");
    predictionS2T = await modelS2T.predict({
        'audio': `data:audio/mp3;base64,${speech}`,
        'temperature': 0,
    })
    outputS2T = predictionS2T.output.transcription
    console.log(outputS2T)
    await S2TfetchText(outputS2T);
    await T2IpredictImage(outputS2T);
}

async function S2TfetchText(text) {
    console.log(`S2T | FETCHING TEXT...`)
    fs.writeFile(`${fileiter}-2.txt`, text, function (err, res) { });
}

async function T2IpredictImage(text) {
    console.log("T2I | PREDICTING IMAGE...");
    predictionT2I = await modelT2I.predict({
        prompt: text,
        width: 768,
        height: 512
    });
    outputT2I = predictionT2I.output[0];
    console.log(outputT2I)
    await T2IfetchImage(outputT2I)
}

async function T2IfetchImage(url) {
    console.log(`T2I | FETCHING IMAGE...`)
    const response = await fetch(url);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const write = await T2IwriteImage(buffer);
}

function T2IwriteImage(buffer) {
    return new Promise((resolve, reject) => {
        fs.writeFile(`${fileiter}-3.png`, buffer, function (err, res) {
            resolve(T2IconvertImage());
            if (err) reject(err);
        });
    })
}

function T2IconvertImage() {
    return new Promise((resolve, reject) => {
        console.log(`T2I | CONVERTING IMAGE...`)
        let convertBuffer = fs.readFileSync(`${fileiter}-3.png`)
        pngToJpeg({ quality: 90 })(convertBuffer)
            .then(output => fs.writeFile(`${fileiter}-4.jpg`, output, function (err, res) {
                resolve(T2IprintImage());
                if (err) reject(err);
            }));
    })
}

function T2IprintImage() {
    console.log(`T2I | PRINTING IMAGE...`)
    var printer = new Printer('HP_Photosmart_5510_series');
    var fileBuffer = fs.readFileSync(`${fileiter}-4.jpg`);
    var options = { o: ' media=4x6.Photo.FullBleed' };
    var jobFromBuffer = printer.printBuffer(fileBuffer, options);
    printer.destroy()
    setTimeout(function () { incrementStepAndTurnLedOn(); }, 15000);
}

function I2T2S() {
    I2TcaptureImage();
}

async function I2TcaptureImage() {
    console.log("I2T | CAPTURING IMAGE...");
    NodeWebcam.capture(`${fileiter}-5.jpg`, { device: 'HD USB Camera', callbackReturn: "base64" }, async function (err, data) {
        // NodeWebcam.capture(`${fileiter}-5.jpg`, { callbackReturn: "base64" }, async function (err, data) {
        I2TpredictText(data)
    });
}

async function I2TpredictText(imageData) {
    console.log("I2T | PREDICTING TEXT...");
    predictionI2T = await modelI2T.predict({ image: imageData });
    outputI2T = predictionI2T.output.trim();
    console.log(outputI2T)
    await I2TfetchText(outputI2T)
}

async function I2TfetchText(text) {
    console.log(`I2T | FETCHING TEXT...`)
    // console.log(`PRINTING...`) // fix this
    fs.writeFile(`${fileiter}-6.txt`, text, function (err, res) {
        // I2TprintText(text);
        T2SpredictSpeech(text);
    });
}

// function I2TprintText(text) {
//     console.log(`I2T | PRINTING TEXT...`)
//     device.open(function (error) {
//         thermalPrinter
//             .size(1, 1)
//             // .size(0.5, 0.5)
//             .text(text)
//             .feed()
//             .feed()
//             // .cut()
//             .close();
//     });
//     setTimeout(function () { incrementStepAndTurnLedOn(); }, 2000);
// }

// function T2S() {
//     T2ScaptureText();
// }

// async function T2ScaptureText() {
//     console.log("T2S | CAPTURING TEXT...");
//     // NodeWebcam.capture(`${fileiter}-7.jpg`, { device: 'HD USB Camera', callbackReturn: "buffer" }, function (err, data) {
//     // NodeWebcam.capture(`${fileiter}-7.jpg`, { callbackReturn: "buffer" }, function (err, data) {
//     NodeWebcam.capture(`${fileiter}-7.jpg`, { device: 'HD USB Camera', callbackReturn: "buffer" }, function (err, data) {
//         T2SrecognizeText(data)
//     });
// }

// async function T2SrecognizeText(data) {
//     console.log("T2S | RECOGNIZING TEXT...");
//     const resultOCR = await recognize(data)
//     let textOCR = resultOCR.replace(/\n/g, "");
//     console.log(textOCR)
//     T2SsaveText(textOCR)
// }

// function T2SsaveText(text) {
//     console.log(`T2S | FETCHING TEXT...`)
//     fs.writeFile(`${fileiter}-8.txt`, text, function (err, res) {
//         T2SpredictSpeech(text);
//     });
// }

async function T2SpredictSpeech(text) {
    console.log("T2S | PREDICTING SPEECH...");
    predictionT2S = await modelT2S.predict({
        'text': text,
        'voice_a': "random",
    })
    outputT2S = predictionT2S.output;
    console.log(outputT2S)
    await T2SfetchSpeech(outputT2S)
}

async function T2SfetchSpeech(url) {
    console.log(`T2S | FETCHING SPEECH...`)
    const response = await fetch(url);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const write = await T2SsaveSpeech(buffer);
}

function T2SsaveSpeech(buffer) {
    return new Promise((resolve, reject) => {
        fs.writeFile(`${fileiter}-9.mp3`, buffer, function (err, res) {
            resolve(T2SplaySpeech());
            if (err) reject(err);
        });
    })
}

function T2SplaySpeech() {
    console.log(`T2S | PLAYING SPEECH...`)
    sound.play(`${fileiter}-9.mp3`, 0.01);
    setTimeout(function () { incrementIterAndResetStep(); }, 15000);
}