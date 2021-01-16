
const INITIAL_STARTING_MONEY = 500;
const BLACKJACK_NUMBER = 21;

function shuffle(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
        const rnd_index = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[rnd_index];
        arr[rnd_index] = temp;
    }
}

function getHandValue(hand) {
    const NUMERICAL_VALUES = {
        "2": 2,
        "3": 3,
        "4": 4,
        "5": 5,
        "6": 6,
        "7": 7,
        "8": 8,
        "9": 9,
        "10": 10,
        "J": 10,
        "Q": 10,
        "K": 10,
        "A": 11
    };

    let total = 0;
    let num_aces = 0;
    for (const card of hand) {
        const value_string = card[0];
        total += NUMERICAL_VALUES[value_string];
        if (value_string == "A") {
            num_aces++;
        }
    }

    while (total > BLACKJACK_NUMBER && num_aces > 0) {
        total -= 10;
        num_aces--;
    }
    return total;
}

module.exports = class Blackjack {
    static Result = { 
        SUCCESS: 0,
        NOT_ENOUGH_MONEY: 1,
        ALREADY_IN_GAME: 2,
        NOT_IN_GAME: 3,
        LOSS: 4,
        WIN: 5,
        TIE: 6
    };

    static suits = ["d", "c", "s", "h"];
    static cardValues = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

    constructor() {
        this.players = {};
    }

    maybeInitPlayer(player_id) {
        if (!(player_id in this.players)) {
            this.players[player_id] = 
            {
                money: INITIAL_STARTING_MONEY,
                in_game: false
            };
        }
    }

    getDeck() {
        const deck = [];
        for (let s of Blackjack.suits) {
            for (let value of Blackjack.cardValues) {
                deck.push([value, s]);
            }
        }
        return deck;
    }

    isInGame(player_id) {
        this.maybeInitPlayer(player_id);
        return this.players[player_id].in_game;
    }

    getBid(player_id) {
        return this.players[player_id].bid;
    }

    getMoney(player_id) {
        this.maybeInitPlayer(player_id);
        return this.players[player_id].money;
    }
    
    playerHand(player_id) {
        return this.players[player_id].player_hand;
    }

    dealerHand(player_id) {
        return this.players[player_id].dealer_hand;
    }

    deck(player_id) {
        return this.players[player_id].deck;
    }
    
    setMoney(player_id, amount) {
        this.maybeInitPlayer(player_id);
        this.players[player_id].money = amount;
    }
    
    hit(player_id) {
        this.maybeInitPlayer(player_id);
        if (!this.isInGame(player_id)) {
            return Blackjack.Result.NOT_IN_GAME;
        }

        const player_hand = this.playerHand(player_id);
        player_hand.push(this.deck(player_id).pop());
        const hand_value = getHandValue(player_hand);
        if (hand_value > BLACKJACK_NUMBER) {
            this.applyLoss(player_id);
            return Blackjack.Result.LOSS;
        }
    }

    stay(player_id) {
        this.maybeInitPlayer(player_id);
        if (!this.isInGame(player_id)) {
            return Blackjack.Result.NOT_IN_GAME;
        }

        const dealer_hand = this.dealerHand(player_id);
        let dealer_value = getHandValue(dealer_hand);
        while (dealer_value < 17) {
            dealer_hand.push(this.deck(player_id).pop());
            dealer_value = getHandValue(dealer_hand);
        }
        
        let player_value = getHandValue(this.playerHand(player_id));
        if (dealer_value < player_value || dealer_value > 21) {
            this.applyWin(player_id);
            return Blackjack.Result.WIN;
        } else if (dealer_value > player_value) {
            this.applyLoss(player_id);
            return Blackjack.Result.LOSS;
        } else {
            this.endGame(player_id);
            return Blackjack.Result.TIE;
        }
    }

    /**
     * Starts a new blackjack round
     * @param {*} player_id 
     * @param {*} amt 
     */
    placeBid(player_id, amt) {
        this.maybeInitPlayer(player_id);
        if (this.isInGame(player_id)) {
            return Blackjack.Result.ALREADY_IN_GAME;
        }

        if (amt > this.getMoney(player_id)) {
            return Blackjack.Result.NOT_ENOUGH_MONEY;
        }
        
        this.players[player_id].deck = this.getDeck();
        this.players[player_id].in_game = true;
        this.players[player_id].player_hand = [];
        this.players[player_id].dealer_hand = [];
        this.players[player_id].bid = amt;

        shuffle(this.players[player_id].deck);
        
        for (let i = 0; i < 2; i++) {
            this.playerHand(player_id).push(this.deck(player_id).pop());
            this.dealerHand(player_id).push(this.deck(player_id).pop());
        }

        if (getHandValue(this.playerHand(player_id)) == BLACKJACK_NUMBER) {
            this.applyWin(player_id, true);
            return Blackjack.Result.WIN;
        }

        if (getHandValue(this.dealerHand(player_id)) == BLACKJACK_NUMBER) {
            this.applyLoss(player_id);
            return Blackjack.Result.LOSS;
        }
        return Blackjack.Result.SUCCESS;
    }

    applyWin(player_id, blackjack = false) {
        let multiplier = blackjack ? 2 : 1;
        this.setMoney(player_id, this.getMoney(player_id) + multiplier * this.getBid(player_id));
        this.endGame(player_id);
    }

    applyLoss(player_id) {
        this.setMoney(player_id, this.getMoney(player_id) - this.getBid(player_id));
        this.endGame(player_id);
    }

    endGame(player_id) {
        this.players[player_id].in_game = false;    
    }
}
