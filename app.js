const Discord = require("discord.io");
const logger = require("winston");
const auth = require("./auth.json");
const yt = require("ytdl-core");
const Youtube = require("youtube-node");
const fs = require("fs");

const youTube = new Youtube();

logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});

logger.level = "debug";

let bot = new Discord.Client({
    token: auth.token,
    autorun: true
});

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');

    bot.setPresence({
        game: {
            name: "with my banan"
        }
    });
});

commands = ["play", "help", "queue"]

/* Each server gets its own queue */
let songQueue = {};

bot.on("message", function (user, userId, channelId, message, evt) {
    if (message.substring(0, 1) == "!") {
        let args = message.substring(1).split(" ");

        if (args.length == 0) {
            bot.sendMessage({
                to: channelId,
                message: "type !help to get help"
            });

            return;
        }

        switch (args[0]) {
            case "play": {
                if (args.length < 2) {
                    bot.sendMessage({
                       to: channelId,
                       message: "monkey need url or search term"
                    });
                    return;
                }
    
                args.splice(0, 1);
                bot.sendMessage({
                   to: channelId,
                   message: "monky playing: " + args.join("\n")
                });
    
                let serverId = bot.channels[channelId].guild_id;
                let vcid = bot.servers[serverId].members[userId].voice_channel_id;

                if (!songQueue.hasOwnProperty(serverId)) {
                    songQueue[serverId] = [];
                }

                let url = args[0].trim();
                songQueue[serverId].push(url);
    
                bot.joinVoiceChannel(vcid, function(err, events) {
                    if (err) {
                        return;
                    }
    
                    bot.getAudioContext(vcid, function(err, stream) {
                        if (err) {
                            bot.sendMessage({
                                to: channelId,
                                message: err
                            });
                            return;
                        }
    
                        yt(url).pipe(stream);
                        stream.on("done", () => {
                            bot.leaveVoiceChannel(vcid, function (err, res) {
                            });
                        });
    
                        // fs.createReadStream("Family Feud.mp3").pipe(stream,
                        //     {end: false});
                        // stream.on("done", function() {
                        //     fs.createReadStream("Family Feud.mp3").pipe(stream, {end: false});
                        // })
                    });
                });
            }
            break;
            case "help": {
                let res = "monky see and monky do:\n";
                for (c in commands) {
                    res += "!" + commands[c] + "\n";
                }
                bot.sendMessage({
                    to: channelId,
                    message: res
                });
                break;
            }
            case "queue": {
                let serverId = bot.channels[channelId].guild_id;
                if (songQueue.hasOwnProperty(serverId) && songQueue[serverId].length > 0) {
                    bot.sendMessage({
                        to: channelId,
                        message: songQueue[serverId].join(",")
                    });
                } else {
                    bot.sendMessage({
                        to: channelId,
                        message: "monky have no song"
                    });
                }
                break;
            }
            default:
            bot.sendMessage({
                to: channelId,
                message: "monky don't understand '" + args[0] + "'"
            });
            break;
        }
    }
});