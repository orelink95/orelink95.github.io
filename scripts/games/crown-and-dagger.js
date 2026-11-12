/* =====================================================================
   CROWN & DAGGER  —  Tavern 21 Card Game
   ---------------------------------------------------------------------
   A fantasy push-your-luck card game played against tavern regulars.
   Players aim for 21 without busting. Aces count as 1 or 11.
   A natural 21 (Ace + Crown/Blade court card) is a "Royal Cut".
   Stakes (table.js): every seat antes the blind; once a hand the player can
   Double Down, and each regular then calls or folds on the strength of its
   own two cards (botCalls). If everyone goes bust the pot stays on the table.
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

    /* Does a regular match your Double Down? It knows its own two cards and sees yours.
       It calls with a made hand, with a hand that already matches yours, or with a low
       hand that can't bust on the next card; otherwise it mostly folds. */
    function botCalls(botTotal, youTotal, nerve = Math.random()) {
        if (botTotal >= 18 || botTotal >= youTotal || botTotal <= 11) return true;
        return nerve < 0.25;
    }

    ATH.games.register({
        id: 'crown-and-dagger',
        bet: { raises: 1 },   // one Double Down per hand
        blurb: 'Draw close to 21 without busting. Aces run high or low; face cards cut deep.',
        kind: 'cards',
        rules: `
            <p><strong>Goal:</strong> Get closer to 21 than your opponents without going over (busting).</p>
            <ul>
                <li><strong>Values:</strong> Number cards are face value. Court cards (Knave, Lady, Lord) are worth 10. Aces count as 1 or 11.</li>
                <li><strong>The Deal:</strong> Everyone receives two cards. Regulars keep one card hidden until their turn.</li>
                <li><strong>Play:</strong> Choose <em>Hit</em> to draw another card, or <em>Stand</em> to hold your count.</li>
                <li><strong>The Pot:</strong> Every seat puts the blind in the pot when the hand is dealt. The best hand takes the pot; a tie splits it. Once per hand you can <em>Double Down</em>: you add another blind from your purse, and each regular must match it or <em>fold</em> and leave their blind in the pot. If everyone folds, the pot is yours; if everyone goes bust, it stays on the table for the next hand.</li>
                <li><strong>Special Hands:</strong>
                    <ul>
                        <li><strong>Royal Cut:</strong> An Ace paired with a Blade or Crown court card is a Natural 21.</li>
                        <li><strong>Five-Card Stave:</strong> Holding 5 cards without busting beats any hand except a Royal Cut.</li>
                    </ul>
                </li>
            </ul>`,
        opponents: 2,
        _test: { botCalls, calcHand },

        mount(el, ctx) {
            const { you, opponents, onEnd, esc, avatarHtml } = ctx;
            const bank = ctx.bank || ATH.games.noBank;            // the purse and the pot (table.js)
            const coin = ctx.coin || (n => `${n} cp`);
            const youSeat = { ...you, isYou: true };
            // The regulars are re-read from ctx.opponents every hand: one who is cleaned out leaves the table
            let seats = [];
            const sitDown = () => { seats = [...opponents.map((o, i) => ({ ...o, i, isYou: false, folded: false })), youSeat]; };
            sitDown();

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
                if (seat.folded) badge = '<span class="gt-tag gt-tag--subtle">Folded</span>';
                else if (isAllRevealed) {
                    if (fullInfo.isBust) badge = '<span class="gt-tag gt-tag--bust">Bust!</span>';
                    else if (fullInfo.isNatural) badge = '<span class="gt-tag gt-tag--gold">Royal Cut!</span>';
                    else if (fullInfo.isFiveCard) badge = '<span class="gt-tag gt-tag--gold">5-Card Hand</span>';
                    else badge = `<span class="gt-tag">${fullInfo.total}</span>`;
                } else {
                    badge = `<span class="gt-tag gt-tag--subtle">${info.total}+?</span>`;
                }

                return `
                    <div class="gt-seat ${seat.isYou ? 'gt-seat--you' : 'gt-seat--opp'} ${seat.isActing ? 'is-active' : ''} ${seat.folded ? 'is-folded' : ''}">
                        <div class="gt-seat__header">
                            ${avatarHtml(seat)}
                            <div class="gt-seat__meta">
                                <span class="gt-seat__name">${esc(seat.name)}</span>
                                ${badge}
                                ${seat.isYou || !ctx.purseHtml ? '' : ctx.purseHtml(seat.i)}
                            </div>
                        </div>
                        <div class="gt-hand">
                            ${cards.map(c => renderCard(c.card, c.hidden)).join('')}
                        </div>
                    </div>`;
            }

            function updateUI(statusMsg = '') {
                const youHand = hands.get(youSeat) || [];
                const youScore = calcHand(youHand.map(c => c.card));

                const canPlay = state === 'player-turn' && !youScore.isBust && !youScore.isNatural && youHand.length < 5;
                // Double Down: one more blind from your purse into the pot; each regular calls or folds
                const showRaise = canPlay && bank.enabled && bank.raises < bank.maxRaises;
                const canRaise = showRaise && bank.canRaise();

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
                                    ${showRaise ? `<button type="button" class="gt-btn gt-btn--raise" data-action="raise" ${canRaise ? '' : 'disabled'} title="${esc(canRaise ? 'Add a blind: each regular must match it or fold' : bank.raiseWhy())}">Double Down <small>+${esc(coin(bank.blind))}</small></button>` : ''}
                                ` : `
                                    <button type="button" class="gt-btn gt-btn--deal" data-action="deal" ${state === 'idle' || state === 'resolved' ? '' : 'disabled'}>
                                        ${state === 'idle' ? 'Deal Hand' : 'Next Hand'}
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>`;
            }

            function dealRound() {
                // A hand in progress can't be abandoned for a fresh deal (the Deal button is disabled then too)
                if (state === 'player-turn' || state === 'bots-turn') return;
                // Every seat puts the blind in the pot
                if (!bank.ante()) {
                    updateUI(`You can’t cover the ${coin(bank.blind)} blind. Lower the stakes or play for fun.`);
                    return;
                }
                clearTimers();
                sitDown();
                deck = createDeck();
                hands = new Map();
                roundEnded = false;
                state = 'player-turn';

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

            function playerRaise() {
                if (state !== 'player-turn') return;
                if (!bank.canRaise()) return;
                // Each regular looks at its own two cards and yours, then matches the raise or folds
                const youTotal = calcHand(hands.get(youSeat).map(c => c.card)).total;
                const bots = seats.filter(s => !s.isYou);
                const callers = bots.filter(b => bank.botCan(b.i) && botCalls(calcHand(hands.get(b).map(c => c.card)).total, youTotal));
                const extra = bank.raise(callers.map(b => b.i));
                if (!extra) return;
                bots.forEach(b => { b.folded = !callers.includes(b); });
                const names = list => ATH.games.andList(list.map(b => b.name));
                const folded = bots.filter(b => b.folded);
                if (!callers.length) {
                    // Nobody will pay to see your hand: the pot is yours
                    state = 'resolved';
                    roundEnded = true;
                    onEnd('win', { winners: [] });
                    updateUI(`You double down. ${names(folded)} fold${folded.length === 1 ? 's' : ''}: the pot is yours.`);
                    return;
                }
                updateUI(`You double down: ${coin(extra)} more. ${names(callers)} match${callers.length === 1 ? 'es' : ''} it${folded.length ? `, ${names(folded)} fold${folded.length === 1 ? 's' : ''}` : ''}. The pot is now ${coin(bank.pot)}.`);
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
                const opps = seats.filter(s => !s.isYou && !s.folded);   // a regular who folded is out of the hand
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

                const youHand = hands.get(youSeat).map(c => c.card);
                const youScore = calcHand(youHand);

                const botRankings = seats.filter(s => !s.isYou && !s.folded).map(b => ({
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
                const maxBotPower = Math.max(-1, ...botRankings.map(b => getPower(b.score)));
                const bestBots = botRankings.filter(b => getPower(b.score) === maxBotPower && maxBotPower > 0);

                let outcome = 'loss';
                let message = '';

                if (youPower < 0) {
                    outcome = 'loss';
                    message = !bestBots.length ? 'Everyone went bust. The pot stays on the table for the next hand.'
                        : `You went bust. ${ATH.games.andList(bestBots.map(b => b.seat.name))} take${bestBots.length === 1 ? 's' : ''} the pot.`;
                } else if (youPower > maxBotPower) {
                    outcome = 'win';
                    message = `You win the pot! (${youScore.isNatural ? 'Royal Cut' : youScore.total})`;
                } else if (youPower === maxBotPower) {
                    outcome = 'draw';
                    message = `A standoff! You and ${ATH.games.andList(bestBots.map(b => b.seat.name))} split the coins.`;
                } else {
                    outcome = 'loss';
                    message = `${ATH.games.andList(bestBots.map(b => b.seat.name))} take${bestBots.length === 1 ? 's' : ''} the pot with ${bestBots[0].score.isNatural ? 'a Royal Cut' : bestBots[0].score.total}.`;
                }

                if (!roundEnded) {
                    roundEnded = true;
                    // On a standoff the pot is split between you and everyone you tied with;
                    // on a loss it goes to the best regular(s), or stays on the table if they all went bust
                    onEnd(outcome, { share: bestBots.length + 1, winners: outcome === 'win' ? [] : bestBots.map(b => b.seat.i) });
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
                else if (act === 'raise') playerRaise();
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