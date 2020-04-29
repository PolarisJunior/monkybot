const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const YouTube = require("youtube-node");
const config = require("./config.json");
const fs = require("fs");
const aws = require("aws-sdk");
const StreamBuffers = require("stream-buffers");
const util = require("util");

const client = new Discord.Client();

const youTube = new YouTube();
const ytSearch = util.promisify(youTube.search);
youTube.setKey(config.youtube_token);

const commands = ["play", "search", "help", "queue", "skip", "pick", "stop"];
const numberEmotes = [":one:", ":two:", ":three:", ":four:", ":five:"];

const polly = new aws.Polly({
  signatureVersion: "v4",
  region: "us-west-1",
});

let transcribeService = new aws.TranscribeService({
  transcribeservice: "2017-10-26",
});

// if length is >= 1 then is playing
let playlist = [];
// current youtube search results
let currentSearch = null;

function playSongs(connection, voiceChannel) {
  if (playlist.length > 0) {
    const songUrl = playlist[0];
    const stream = ytdl(songUrl, {
      filter: "audioonly",
      quality: "highestaudio",
    });
    let dispatcher = connection.play(stream);

    dispatcher.on("speaking", (isSpeaking) => {
      if (!isSpeaking) {
        playlist.shift();
        stream.destroy();
        playSongs(connection, voiceChannel);
      }
    });
  } else {
    voiceChannel.leave();
  }
}

function doYtSearch(query) {}

function ytDisplaySearchResults(results, userMessage) {
  let numResults = results.items.length;
  let msg = "";
  for (let i = 0; i < numResults; i++) {
    msg += `${numberEmotes[i]} \`${results.items[i].snippet.title}\`\n\n`;
  }
  msg += "!pick # to choose";
  userMessage.channel.send(msg);
}

function handleHelpRequest(userMessage, args) {
  let res = "monky see and monky do:\n";
  for (c in commands) {
    res += `\`!${commands[c]}\`\n`;
  }
  userMessage.reply(res);
}

function handleQueueRequest(userMessage, args) {
  if (playlist.length > 0) {
    let res = playlist.join("\n");
    userMessage.channel.send(res);
  } else {
    userMessage.reply("monky have no song");
  }
}

function handlePlayRequest(userMessage, args) {
  if (!ensureInVoiceChannel(userMessage)) {
    return;
  }
  if (args.length < 2) {
    userMessage.reply("monky need url or search term");
    return;
  }
  if (args[1].includes("https://www.youtube.com/watch")) {
    let url = args[1];
    voiceChannel.join().then((connection) => {
      playlist.push(url);
      if (playlist.length == 1) {
        playSongs(connection, voiceChannel);
      }
    });
  } else {
    const query = argsToSearchQuery(args);
    ytSearch(query, 1)
      .then((results) => {
        setSearchContext(results);
        pickSongFromSearch(1, userMessage);
      })
      .catch((reason) => {
        console.log(`Could not play from youtube ${reason}`);
      });
  }
}

function handleSearchRequest(userMessage, args) {
  if (!ensureInVoiceChannel(userMessage)) {
    return;
  }
  if (args.length < 2) {
    userMessage.reply("monky need search term");
  } else {
    const query = argsToSearchQuery(args);

    ytSearch(query, 5)
      .then((results) => {
        ytDisplaySearchResults(results, userMessage);
        setSearchContext(results);
      })
      .catch((reason) => {
        console.log(`Could not search youtube ${reason}`);
      });
  }
}

function handlePickRequest(message, args) {
  if (currentSearch == null || args.length > 2) {
    return;
  }
  let value = parseInt(args[1]);
  if (value == NaN) {
    message.reply(`monky don't understand \`${args[1]}\``);
    return;
  }
  value--;
  pickSongFromSearch(value, message);
}

function handleStopRequest(userMessage, args) {
  playlist = [];
  const voiceChannel = userMessage.member.voice.channel;
}

function setCallbacks() {
  client.on("message", onChatMessaged);
}

function onLoggedIn() {
  console.log("Monky ready");
  client.user.setPresence({
    game: {
      name: "with my banan",
    },
  });
}

function onChatMessaged(message) {
  if (messageIsCommand(message)) {
    routeCommand(message);
  }
}

function routeCommand(message) {
  const args = parseMessageArgs(message);
  const command = args[0].toLowerCase();
  switch (command) {
    case "join":
      {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel || voiceChannel.type != "voice") {
          message.reply("monky need voice channel");
        } else {
          args.splice(0, 1);
          let params = {
            Text: "suck my cock ernie keebler a a a",
            Text: args.join(" ") + " a a a",
            OutputFormat: "mp3",
            // 'OutputFormat': 'pcm',
            VoiceId: "Mia",
          };

          voiceChannel.join().then((connection) => {
            polly.synthesizeSpeech(params, (err, data) => {
              if (err) {
                console.log(err.code);
              } else if (data) {
                if (data.AudioStream instanceof Buffer) {
                  fs.writeFile("./speech.mp3", data.AudioStream, function (
                    err
                  ) {
                    if (err) {
                      return console.log(err);
                    }
                    console.log("The file was saved!");
                    let dispatcher = connection.playFile("./speech.mp3");
                    dispatcher.on("end", (reason) => {
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
      handlePlayRequest(message, args);
      break;
    }
    case "pick": {
      handlePickRequest(message, args);
      break;
    }
    case "search":
      handleSearchRequest(message, args);
      break;
    case "queue":
      handleQueueRequest(message, args);
      break;
    case "help":
      handleHelpRequest(message, args);
      break;
    default:
      message.reply(`monky don't understand \`${command}\``);
  }
}

function messageIsCommand(message) {
  return message.content.startsWith(config.prefix);
}

function parseMessageArgs(message) {
  let args = message.content.substring(1).split(" ");
  return args;
}

function setSearchContext(results) {
  currentSearch = results;
}

function ensureInVoiceChannel(userMessage) {
  const voiceChannel = userMessage.member.voice.channel;
  if (!voiceChannel) {
    userMessage.reply("monky need voice channel");
    return false;
  }
  return true;
}

function argsToSearchQuery(args) {
  args.splice(0, 1);
  return args.join(" ");
}

function pickSongFromSearch(songNumber, message) {
  if (songNumber > currentSearch.items.length) {
    message.reply(`monky not have ${songNumber} banan`);
    return;
  }

  // Go from 1-indexed to 0-indexed
  songNumber--;

  let url = `https://www.youtube.com/watch?v=${currentSearch.items[songNumber].id.videoId}`;
  message.channel.send(
    `monky will play \`${currentSearch.items[songNumber].snippet.title}\``
  );
  message.channel.send(`${url}`);
  let voiceChannel = message.member.voice.channel;

  if (voiceChannel) {
    voiceChannel.join().then((connection) => {
      playlist.push(url);
      // If playlist is of size 1 then song was not previously playing.
      if (playlist.length == 1) {
        playSongs(connection, voiceChannel);
      }
    });
  }
  currentSearch = null;
}

function playNextInQueue() {}

setCallbacks();
console.log("Client logging on");
client
  .login(config.discord_token)
  .then(onLoggedIn)
  .catch((reason) => {
    console.log(`Could not login: ${reason}`);
  });
