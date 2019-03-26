
const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const YouTube = require("youtube-node");
const auth = require("./auth.json");
const fs = require('fs');
const aws = require("aws-sdk");
const StreamBuffers = require("stream-buffers");

const client = new Discord.Client;

const youTube = new YouTube();

youTube.setKey(auth.yt_token);

let commands = ["play", "help", "queue", "skip", "pick"];
let numberEmotes = [":one:", ":two:", ":three:", ":four:", ":five:"];

const polly = new aws.Polly({
    signatureVersion: 'v4',
    region: 'us-west-1'
});

let params = {
    'Text': 'I am monky a a a',
    'OutputFormat': 'mp3',
    // 'OutputFormat': 'pcm',
    'VoiceId': 'Joey'
};



client.on("ready", () => {
    console.log("Monky ready");
    client.user.setPresence({
        game: {
            name: "with my banan",
        }
    });
});

// if length is >= 1 then is playing
let playlist = [];
// current youtube search results
let currentSearch = null;

function joinAndQueueUp() {

}

client.on("message", (message) => {
    if (message.content.startsWith("!")) {
        let args = message.content.substring(1).split(" ");

        switch (args[0].toLowerCase()) {
            case "join": {
                let voiceChannel = message.member.voiceChannel;
                if (!voiceChannel || voiceChannel.type != "voice") {
                    message.reply("monky need voice channel");
                } else {
                    voiceChannel.join().then(connection => {

                        polly.synthesizeSpeech(params, (err, data) => {
                            if (err) {
                                console.log(err.code)
                            } else if (data) {
                                if (data.AudioStream instanceof Buffer) {
                                    fs.writeFile("./speech.mp3", data.AudioStream, function (err) {
                                        if (err) {
                                            return console.log(err)
                                        }
                                        console.log("The file was saved!")
                                        let dispatcher = connection.playFile("./speech.mp3");
                                        dispatcher.on("end", reason => {
                                            // console.log(reason);
                                            voiceChannel.leave();
                                        });
                                    });
                                }
                            }
                        });


                        // const receiver = connection.createReceiver();

                        // connection.on("speaking", (user, speaking) => {
                        //     const audioStream = receiver.createOpusStream(user);
                        //     if (speaking) {
                        //         msg.channel.send(`i'm listening to ${user}`);
                        //         audioStream.on("data", (chunk) => {
                        //             console.log("got data");
                        //         });
                        //         audioStream.on("end", () => {
                        //             message.channel.send(`Monkey done listening`);
                        //         });
                        //     }
                        // });
                    });
                }
            }
                break;
            case "play": {
                let voiceChannel = message.member.voiceChannel;
                if (!voiceChannel) {
                    message.reply("monky need voice channel");
                } else if (args.length < 2) {
                    message.reply("monky need url or search term");
                } else {
                    if (args[1].includes("https://www.youtube.com/watch")) {
                        let url = args[1];

                        voiceChannel.join().then(
                            connection => {
                                playlist.push(url);
                                if (playlist.length == 1) {
                                    playSongs(connection, voiceChannel);
                                }
                            }
                        );
                    } else {
                        args.splice(0, 1);
                        let query = args.join(" ");
                        youTube.search(query, 5, (err, res) => {
                            if (err) {
                                return;
                            }
                            let numResults = res.items.length;
                            let msg = "";
                            for (let i = 0; i < numResults; i++) {
                                msg += numberEmotes[i] + res.items[i].snippet.title + "\n\n";
                            }
                            msg += "!pick # to choose";
                            message.channel.send(msg);
                            currentSearch = res;
                        });
                    }
                }
                break;
            }
            case "pick": {
                if (currentSearch == null || args.length > 2) {
                    return;
                }
                let value = parseInt(args[1]);
                if (value == NaN) {
                    message.reply("monky don't understand " + args[1]);
                    return;
                }
                value--;
                if (value >= currentSearch.items.length) {
                    message.reply("monky not have that many banan");
                }
                let url = currentSearch.items[value].id.videoId;
                message.channel.send("monky will play " + currentSearch.items[value].snippet.title);

                let voiceChannel = message.member.voiceChannel;


                if (voiceChannel) {
                    voiceChannel.join().then(
                        connection => {
                            playlist.push("https://www.youtube.com/watch?v=" + url);
                            if (playlist.length == 1) {
                                playSongs(connection, voiceChannel);
                            }
                        }
                    );
                }
                currentSearch = null;
                break;
            }
            case "queue": {
                if (playlist.length > 0) {
                    let res = playlist.join("\n");
                    message.channel.send(res);
                } else {
                    message.reply("monky have no song");
                }
                break;
            }
            case "help": {
                let res = "monky see and monky do:\n";
                for (c in commands) {
                    res += "!" + commands[c] + "\n";
                }
                message.reply(res);
            }
                break;
            default:
                message.reply("monky don't understand '" + args[0] + "'");

        }
    }
});

function playSongs(connection, voiceChannel) {
    if (playlist.length > 0) {
        let songUrl = playlist[0];
        const stream = ytdl(songUrl, {
            filter: "audioonly"
        });
        let dispatcher = connection.playStream(stream);
        dispatcher.on("end", (reason) => {
            playlist.shift();
            stream.destroy();
            playSongs(connection, voiceChannel);
        });
    } else {
        voiceChannel.leave();
    }
}

client.login(auth.token);