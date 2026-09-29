# $10,000 Pool — Official Rules

This is the rule set the app implements. It is the source of truth; `docs/PLAN.md` and the code
follow it. Wording below is the league's own, with implementation notes in italics.

1. Every player starts out with 10,000 "dollars" or points.
2. Players bet their money in increments of 1 thousand (1k, 2k, etc., no halves) on each week's
   football games.
   *One pick per game per player, side + wager in whole thousands.*
3. Games are played with spreads determined by the Wednesday morning New York Post. Games ending
   in a tie or "push" are a loss for the bettor.
   *The app pulls consensus lines Wednesday morning (configurable) and a commissioner may edit any
   line to match the Post before it is used. A push settles as a loss.*
4. Each player must bet at least 1 thousand points each week.
5. Players can bet on as many games as they have money for.
6. Each player gets 1 bye week per season, usable in any one week up to and including week 13.
7. Any player who hits 0 is busted out and eliminated.
8. If a player fails to make a bet before the deadline of the week's last game, their bye is used
   automatically. If they have no bye left, they are forced to put 1k on the underdog of the last
   game of the week.
   *Runs as a job at that deadline; the forced pick is recorded in the audit log as system-placed.*
9. The deadline to bet on any game is 11:59 PM the night before the game takes place.
   *11:59 PM America/New_York on the calendar day before kickoff (Eastern).*
10. All bets are paid at the end of the football week, and a player can only bet with as much
    money as they started the week with (no betting Sunday with Thursday winnings).
    *Weekly budget = balance at week open. Results show as pending until the week settles.*
11. The game is played until only one player remains with money. If multiple players make it to
    the end of the season, the player with the most money left is the winner.
    *Season end = end of the regular season (week 18). A league also completes early the moment
    only one non-eliminated player remains after a week settles.*
12. Any game that is abandoned or not completed is null and void, and the bettor is awarded their
    money back.
