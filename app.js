const config = require("./config.json");

const Blackjack = require("./src/Blackjack.js");
const Database = require("./src/Database.js");

const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const YouTube = require("youtube-node");

const fs = require("fs");
const aws = require("aws-sdk");
const util = require("util");

const client = new Discord.Client();
const youtube = new YouTube();

const blackjack = new Blackjack();

const database = new Database();
database.get("ff").then(console.log);

const ytSearch = util.promisify(youtube.search);
youtube.setKey(config.youtube_token);

const commands = [
  "play",
  "search",
  "help",
  "queue",
  "skip",
  "pick",
  "stop",
  "pause",
  "resume",
];

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
let dispatcher = null;
let pauseRequested = false;

function playSongs(connection, voiceChannel) {
  if (playlist.length > 0) {
    const songUrl = playlist[0].url;
    const stream = ytdl(songUrl, {
      filter: "audioonly",
      quality: "highestaudio",
    });
    dispatcher = connection.play(stream);

    dispatcher.on("speaking", (isSpeaking) => {
      if (!isSpeaking) {
        if (!pauseRequested) {
          playlist.shift();
          stream.destroy();
          dispatcher = null;
          playSongs(connection, voiceChannel);
        }

        pauseRequested = false;
      }
    });
  } else {
    voiceChannel.leave();
  }
}

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
    let res = playlist.map((song) => song.url).join("\n");
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
      let song = {};
      song.url = url;
      playlist.push(song);
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
  if (!ensureInVoiceChannel(userMessage)) {
  }
  playlist = [];
  const voiceChannel = userMessage.member.voice.channel;
}

function handlePauseRequest(message, args) {
  if (!ensureInVoiceChannel(message)) {
    return;
  }
  if (dispatcher == null) {
    return;
  }
  pauseRequested = true;
  dispatcher.pause();
}

function handleResumeRequest(message, args) {
  if (!ensureInVoiceChannel(message)) {
    return;
  }
  if (dispatcher == null) {
    return;
  }

  pauseRequested = false;
  dispatcher.resume();
}

function handleSkipRequest(message, args) {
  if (!ensureInVoiceChannel(message)) {
    return;
  }
  if (dispatcher == null) {
    return;
  }

  dispatcher.pause();
}

function handleStopRequest(message, args) {
  if (!ensureInVoiceChannel(message)) {
    return;
  }
  if (dispatcher == null) {
    return;
  }

  playlist = [];
  dispatcher.pause();
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

function prettifyCardHand(hand) {
  const prettySuits = {
    d: "♦",
    c: "♣",
    h: "♥",
    s: "♠",
  };
  return `${hand[0]} ${prettySuits[hand[1]]}`;
}

/**
 *
 * @param {number} player_id
 * @param {Discord.Message} discord_msg
 */
function showCards(
  player_id,
  discord_msg,
  title_msg = "",
  result = Blackjack.Result.SUCCESS
) {
  let msg = "Your cards: \n";
  for (const hand of blackjack.playerHand(player_id)) {
    msg += `${prettifyCardHand(hand)} `;
  }
  msg += `\n(${blackjack.playerHandValue(player_id)})`;

  msg += "\n";
  msg += "Dealer cards: \n";
  for (const hand of blackjack.dealerHand(player_id)) {
    msg += `${prettifyCardHand(hand)} `;
  }
  msg += `\n(${blackjack.dealerHandValue(player_id)})`;

  const embed = new Discord.MessageEmbed();
  embed.color = "#26a69a";
  switch (result) {
    case Blackjack.Result.LOSS:
      embed.color = "#e53935";
      break;
    case Blackjack.Result.WIN:
      embed.color = "#d4e157";
      break;
    case Blackjack.Result.TIE:
      embed.color = "#e0f2f1";
      break;
  }
  embed.title = `${discord_msg.author.username}'s game\n${title_msg}`;
  embed.description = "```" + msg + "```";
  embed.footer = {
    text: `Money: $${blackjack.getMoney(player_id)}, Bet: $${blackjack.getBid(
      player_id
    )}\nType ${config.prefix}hit to hit or ${config.prefix}stay to stand`,
    iconURL: discord_msg.author.avatarURL(),
    proxyIconURL: discord_msg.author.avatarURL(),
  };
  discord_msg.channel.send("", { embed: embed });
}

function routeCommand(message) {
  const args = parseMessageArgs(message);
  const command = args[0].toLowerCase();
  const author_id = message.author.id;
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
                  fs.writeFile(
                    "./speech.mp3",
                    data.AudioStream,
                    function (err) {
                      if (err) {
                        return console.log(err);
                      }
                      console.log("The file was saved!");
                      let dispatcher = connection.playFile("./speech.mp3");
                      dispatcher.on("end", (reason) => {
                        // console.log(reason);
                        voiceChannel.leave();
                      });
                    }
                  );
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
    case "pause":
      handlePauseRequest(message, args);
      break;
    case "resume":
      handleResumeRequest(message, args);
      break;
    case "skip":
      handleSkipRequest(message, args);
      break;
    case "stop":
      handleStopRequest(message, args);
      break;
    case "money":
      message.reply(blackjack.getMoney(message.author.id));
      break;
    case "blackjack":
      {
        if (args.length == 1) {
          message.reply("You need to make a bet");
          break;
        }
        const bid = parseInt(args[1]);
        if (bid == NaN) {
          message.reply("That's not a number dumbass");
          break;
        }

        const result = blackjack.placeBid(message.author.id, bid);
        if (result == Blackjack.Result.NOT_ENOUGH_MONEY) {
          message.reply("You don't have enough money dumbass");
        } else if (result == Blackjack.Result.ALREADY_IN_GAME) {
          message.reply("You are already in a game dumbass");
        } else {
          if (result == Blackjack.Result.WIN) {
            showCards(author_id, message, "Blackjack!", result);
          } else if (result == Blackjack.Result.LOSS) {
            showCards(author_id, message, "おまえはもうしんでいる", result);
          } else {
            showCards(author_id, message, "", result);
          }
        }
      }
      break;
    case "hit":
      {
        const result = blackjack.hit(message.author.id);
        if (result == Blackjack.Result.NOT_IN_GAME) {
          message.reply("You aren't in a game dumbass");
        } else {
          if (result == Blackjack.Result.LOSS) {
            showCards(author_id, message, "You fokin suck dik m8", result);
          } else {
            showCards(author_id, message, "", result);
          }
        }
      }
      break;
    case "stay":
      {
        const result = blackjack.stay(message.author.id);
        if (result == Blackjack.Result.NOT_IN_GAME) {
          message.reply("You aren't in a game dumbass");
        }

        switch (result) {
          case Blackjack.Result.LOSS:
            showCards(author_id, message, "You lose stinky", result);
            break;
          case Blackjack.Result.WIN:
            showCards(author_id, message, "DUB", result);
            break;
          case Blackjack.Result.TIE:
            showCards(author_id, message, "yall see sumthin?", result);
            break;
        }
      }
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
      let song = {};
      song.url = url;
      playlist.push(song);
      // If playlist is of size 1 then song was not previously playing.
      if (playlist.length == 1) {
        playSongs(connection, voiceChannel);
      }
    });
  }
  currentSearch = null;
}

setCallbacks();
console.log("Client logging on");
(async () => {
  try {
    await client.login(config.discord_token);
  } catch (reason) {
    console.log(`Could not login: ${reason}`);
    return;
  }
  onLoggedIn();
})();
