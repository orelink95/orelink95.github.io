/* =====================================================================
   CROWN & DAGGER  —  Tavern 21 Card Game
   ---------------------------------------------------------------------
   A fantasy push-your-luck card game played against tavern regulars.
   Players aim for 21 without busting. Aces count as 1 or 11.
   A natural 21 (Ace + Crown/Blade court card) is a "Royal Cut".
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    if (!ATH.games) return;

    const SUITS = [
        { id: 'blades', symbol: '⚔', name: 'Blades', color: 'ink' },
        { id: 'crowns', symbol: '👑', name: 'Crowns', color: 'gold' },
        { id: 'coins', symbol: '🪙', name: 'Coins', color: 'gold' },
        { id: 'skulls', symbol: '💀', name: 'Skulls', color: 'crimson' }
    ];
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    function createDeck() {
        const deck = [];
        for (const s of SUITS) {
            for (const r of RANKS) {
                deck.push({ suit: s, rank: r });
            }
        }
        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    function calcHand(cards) {
        let total = 0;
        let aces = 0;
        for (const c of cards) {
            if (c.rank === 'A') {
                aces++;
                total += 11;
            } else if (['K', 'Q', 'J'].includes(c.rank)) {
                total += 10;
            } else {
                total += parseInt(c.rank, 10);
            }
        }
        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }
        const isNatural = cards.length === 2 && total === 21 &&
            cards.some(c => c.rank === 'A') &&
            cards.some(c => ['K', 'Q', 'J', '10'].includes(c.rank) && ['blades', 'crowns'].includes(c.suit.id));

        return {
            total,
            isBust: total > 21,
            isNatural,
            isFiveCard: cards.length >= 5 && total <= 21
        };
    }

    ATH.games.register({
        id: 'crown-and-dagger',
        kind: 'cards',
        blurb: 'Draw close to 21 without busting. Aces run high or low; face cards cut deep.',
        rules: `
            <p><strong>Goal:</strong> Get closer to 21 than your opponents without going over (busting).</p>
            <ul>
                <li><strong>Values:</strong> Number cards are face value. Court cards (Knave, Lady, Lord) are worth 10. Aces count as 1 or 11.</li>
                <li><strong>The Deal:</strong> Everyone receives two cards. Regulars keep one card hidden until their turn.</li>
                <li><strong>Play:</strong> Choose <em>Hit</em> to draw another card, or <em>Stand</em> to hold your count.</li>
                <li><strong>Special Hands:</strong>
                    <ul>
                        <li><strong>Royal Cut:</strong> An Ace paired with a Blade or Crown court card is a Natural 21.</li>
                        <li><strong>Five-Card Stave:</strong> Holding 5 cards without busting beats any hand except a Royal Cut.</li>
                    </ul>
                </li>
            </ul>`,
        opponents: 2,

        mount(el, ctx) {
            const { you, opponents, onEnd, esc, avatarHtml } = ctx;
            const seats = [
                ...opponents.map(o => ({ ...o, isYou: false })),
                { ...you, isYou: true }
            ];

            let deck = [];
            let state = 'idle'; // 'idle' | 'player-turn' | 'bots-turn' | 'resolved'
            let hands = new Map(); // seat -> [{ card, hidden }]
            let activeBotIndex = 0;
            let roundEnded = false;
            let timers = [];

            function queue(fn, ms) {
                const t = setTimeout(fn, ms);
                timers.push(t);
                return t;
            }

            function clearTimers() {
                timers.forEach(clearTimeout);
                timers = [];
            }

            function renderCard(card, isHidden = false) {
                if (isHidden) {
                    return `<div class="gt-card gt-card--back" aria-label="Hidden card">
                        <span class="gt-card__emblem" aria-hidden="true">⚔</span>
                    </div>`;
                }
                return `<div class="gt-card gt-card--${card.suit.color}" aria-label="${card.rank} of ${card.suit.name}">
                    <span class="gt-card__corner gt-card__corner--top">${card.rank}<small>${card.suit.symbol}</small></span>
                    <span class="gt-card__pip" aria-hidden="true">${card.suit.symbol}</span>
                    <span class="gt-card__corner gt-card__corner--bot">${card.rank}<small>${card.suit.symbol}</small></span>
                </div>`;
            }

            function renderHand(seat) {
                const cards = hands.get(seat) || [];
                const visibleCards = cards.filter(c => !c.hidden).map(c => c.card);
                const info = calcHand(visibleCards);
                const isAllRevealed = !cards.some(c => c.hidden);
                const fullInfo = calcHand(cards.map(c => c.card));

                let badge = '';
                if (isAllRevealed) {
                    if (fullInfo.isBust) badge = '<span class="gt-tag gt-tag--bust">Bust!</span>';
                    else if (fullInfo.isNatural) badge = '<span class="gt-tag gt-tag--gold">Royal Cut!</span>';
                    else if (fullInfo.isFiveCard) badge = '<span class="gt-tag gt-tag--gold">5-Card Hand</span>';
                    else badge = `<span class="gt-tag">${fullInfo.total}</span>`;
                } else {
                    badge = `<span class="gt-tag gt-tag--subtle">${info.total}+?</span>`;
                }

                return `
                    <div class="gt-seat ${seat.isYou ? 'gt-seat--you' : 'gt-seat--opp'} ${seat.isActing ? 'is-active' : ''}">
                        <div class="gt-seat__header">
                            ${avatarHtml(seat)}
                            <div class="gt-seat__meta">
                                <span class="gt-seat__name">${esc(seat.name)}</span>
                                ${badge}
                            </div>
                        </div>
                        <div class="gt-hand">
                            ${cards.map(c => renderCard(c.card, c.hidden)).join('')}
                        </div>
                    </div>`;
            }

            function updateUI(statusMsg = '') {
                const youSeat = seats.find(s => s.isYou);
                const youHand = hands.get(youSeat) || [];
                const youScore = calcHand(youHand.map(c => c.card));

                const canPlay = state === 'player-turn' && !youScore.isBust && !youScore.isNatural && youHand.length < 5;

                el.innerHTML = `
                    <div class="gt-table gt-table--cards">
                        <div class="gt-opponents">
                            ${seats.filter(s => !s.isYou).map(renderHand).join('')}
                        </div>

                        <div class="gt-felt-divider">
                            <span class="gt-status-line">${esc(statusMsg)}</span>
                        </div>

                        <div class="gt-player-area">
                            ${renderHand(youSeat)}
                            <div class="gt-controls">
                                ${canPlay ? `
                                    <button type="button" class="gt-btn gt-btn--hit" data-action="hit">Hit</button>
                                    <button type="button" class="gt-btn gt-btn--stand" data-action="stand">Stand</button>
                                ` : `
                                    <button type="button" class="gt-btn gt-btn--deal" data-action="deal">
                                        ${state === 'idle' ? 'Deal Hand' : 'Next Hand'}
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>`;
            }

            function dealRound() {
                clearTimers();
                deck = createDeck();
                hands = new Map();
                roundEnded = false;
                state = 'player-turn';
                seats.forEach(s => { s.isActing = false; });

                seats.forEach(s => {
                    if (s.isYou) {
                        hands.set(s, [
                            { card: deck.pop(), hidden: false },
                            { card: deck.pop(), hidden: false }
                        ]);
                    } else {
                        hands.set(s, [
                            { card: deck.pop(), hidden: false },
                            { card: deck.pop(), hidden: true }
                        ]);
                    }
                });

                const youSeat = seats.find(s => s.isYou);
                const youScore = calcHand(hands.get(youSeat).map(c => c.card));

                if (youScore.isNatural) {
                    updateUI('Royal Cut! A natural 21 off the deal.');
                    queue(() => playBots(), 900);
                } else {
                    updateUI('Your turn. Hit to draw, or stand.');
                }
            }

            function playerHit() {
                if (state !== 'player-turn') return;
                const youSeat = seats.find(s => s.isYou);
                const hand = hands.get(youSeat);
                hand.push({ card: deck.pop(), hidden: false });

                const score = calcHand(hand.map(c => c.card));
                if (score.isBust) {
                    updateUI('You went bust over 21!');
                    state = 'bots-turn';
                    queue(() => playBots(), 800);
                } else if (score.isFiveCard || score.total === 21) {
                    updateUI(score.total === 21 ? 'Twenty-one!' : 'Five-card stave!');
                    state = 'bots-turn';
                    queue(() => playBots(), 800);
                } else {
                    updateUI('Hit or stand?');
                }
            }

            function playerStand() {
                if (state !== 'player-turn') return;
                state = 'bots-turn';
                updateUI('You stand. The regulars reveal their hands…');
                queue(() => playBots(), 600);
            }

            function playBots() {
                activeBotIndex = 0;
                runNextBot();
            }

            function runNextBot() {
                const opps = seats.filter(s => !s.isYou);
                if (activeBotIndex >= opps.length) {
                    resolveRound();
                    return;
                }

                const bot = opps[activeBotIndex];
                seats.forEach(s => { s.isActing = (s === bot); });
                const hand = hands.get(bot);

                // Reveal hole card
                hand.forEach(c => { c.hidden = false; });
                updateUI(`${bot.name} turns over their card…`);

                queue(() => botDecision(bot), 800);
            }

            function botDecision(bot) {
                const hand = hands.get(bot);
                const score = calcHand(hand.map(c => c.card));
                const youSeat = seats.find(s => s.isYou);
                const youScore = calcHand(hands.get(youSeat).map(c => c.card));

                // Bot AI logic:
                // Hit if under 15, or if player is standing on higher without bust
                const shouldHit = !score.isBust && score.total < 17 && (
                    score.total < 15 || (!youScore.isBust && score.total < youScore.total)
                );

                if (shouldHit && deck.length > 0) {
                    hand.push({ card: deck.pop(), hidden: false });
                    const newScore = calcHand(hand.map(c => c.card));
                    if (newScore.isBust) {
                        updateUI(`${bot.name} hits and goes bust!`);
                    } else {
                        updateUI(`${bot.name} takes a hit.`);
                    }
                    queue(() => botDecision(bot), 850);
                } else {
                    bot.isActing = false;
                    updateUI(`${bot.name} stands on ${score.total > 21 ? 'bust' : score.total}.`);
                    activeBotIndex++;
                    queue(() => runNextBot(), 700);
                }
            }

            function resolveRound() {
                state = 'resolved';
                seats.forEach(s => {
                    s.isActing = false;
                    const h = hands.get(s);
                    if (h) h.forEach(c => { c.hidden = false; });
                });

                const youSeat = seats.find(s => s.isYou);
                const youHand = hands.get(youSeat).map(c => c.card);
                const youScore = calcHand(youHand);

                const botRankings = seats.filter(s => !s.isYou).map(b => ({
                    seat: b,
                    score: calcHand(hands.get(b).map(c => c.card))
                }));

                // Calculate strength: Natural (100) > FiveCard (99) > Score <= 21 > Bust (-1)
                function getPower(score) {
                    if (score.isBust) return -1;
                    if (score.isNatural) return 100;
                    if (score.isFiveCard) return 99;
                    return score.total;
                }

                const youPower = getPower(youScore);
                const maxBotPower = Math.max(...botRankings.map(b => getPower(b.score)));
                const bestBots = botRankings.filter(b => getPower(b.score) === maxBotPower && maxBotPower > 0);

                let outcome = 'loss';
                let message = '';

                if (youPower < 0) {
                    outcome = 'loss';
                    message = 'You went bust. The table takes your stake.';
                } else if (youPower > maxBotPower) {
                    outcome = 'win';
                    message = `You win the pot! (${youScore.isNatural ? 'Royal Cut' : youScore.total})`;
                } else if (youPower === maxBotPower) {
                    outcome = 'draw';
                    message = `A standoff! You and ${bestBots.map(b => b.seat.name).join(', ')} split the coins.`;
                } else {
                    outcome = 'loss';
                    message = `${bestBots[0].seat.name} takes the pot with ${bestBots[0].score.isNatural ? 'a Royal Cut' : bestBots[0].score.total}.`;
                }

                if (!roundEnded) {
                    roundEnded = true;
                    onEnd(outcome);
                }
                updateUI(message);
            }

            el.addEventListener('click', e => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const act = btn.dataset.action;
                if (act === 'deal') dealRound();
                else if (act === 'hit') playerHit();
                else if (act === 'stand') playerStand();
            });

            // Initial view
            updateUI('Shuffle the deck and deal when you are ready.');

            return {
                destroy() {
                    clearTimers();
                    el.innerHTML = '';
                }
            };
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
